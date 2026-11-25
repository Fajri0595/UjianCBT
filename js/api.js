// ============================================================
// API.JS — Klien REST API CBT Bahasa (Client Service Adapter)
// ============================================================

const CBT_API_URL = window.CBT_API_URL || '/api/cbt';
const GAS_URL = CBT_API_URL; // Alias kompatibilitas

const PARTICIPANT_ACTIONS = new Set([
  'getAvailableExamsForParticipant',
  'startExamSession',
  'syncExamProgress',
  'recordExamViolation',
  'submitExamAnswers'
]);

const SILENT_BACKGROUND_ACTIONS = new Set([
  'syncExamProgress',
  'recordExamViolation'
]);

/**
 * Ambil token sesi aktif sesuai konteks aksi yang dipanggil agar sesi
 * peserta dan staf tidak saling menimpa pada browser yang sama.
 */
function getActiveAuthToken(action) {
  try {
    const readToken = (storageKey) => {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.token ? parsed.token : null;
    };

    if (PARTICIPANT_ACTIONS.has(action)) {
      return readToken('cbt_participant');
    }
    return readToken('cbt_staff') || readToken('cbt_participant');
  } catch (e) {}
  return null;
}

/**
 * Kirim satu aksi + argumen ke backend REST API dengan mekanisme Resilience Retry
 * (Exponential Backoff + Jitter).
 */
async function callServer(action, args, maxRetries = 3) {
  let attempt = 0;
  let lastError = null;

  const token = getActiveAuthToken(action);
  const payload = { action: action, args: args || [] };
  if (token) payload.token = token;

  while (attempt < maxRetries) {
    try {
      const res = await fetch(CBT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        if ([429, 500, 502, 503, 504].includes(res.status) && attempt < maxRetries - 1) {
          throw new Error('HTTP ' + res.status + ' (server sibuk/sementara overload)');
        }
        throw new Error('HTTP ' + res.status + ' dari server saat memanggil aksi "' + action + '"');
      }

      const json = await res.json();

      // Tangani otomatis jika sesi autentikasi kedaluwarsa atau tidak valid
      if (json && json.success === false && (json.authExpired || (typeof json.message === 'string' && json.message.includes('Sesi login Anda tidak valid')))) {
        console.warn('[CBT Auth]', json.message);
        if (PARTICIPANT_ACTIONS.has(action)) {
          if (!window._isSubmittingExam && localStorage.getItem('cbt_participant')) {
            localStorage.removeItem('cbt_participant');
            if (typeof showToast === 'function') {
              showToast('Sesi Peserta Berakhir', 'Sesi kode akses Anda telah berakhir. Silakan masuk kembali.', 'warning');
            }
            if (typeof showView === 'function') {
              setTimeout(() => showView('view-participant-entry'), 1200);
            }
          }
        } else if (localStorage.getItem('cbt_staff')) {
          localStorage.removeItem('cbt_staff');
          if (typeof showToast === 'function') {
            showToast('Sesi Berakhir', 'Sesi autentikasi staf telah berakhir. Silakan login kembali.', 'warning');
          }
          if (typeof showView === 'function') {
            setTimeout(() => showView('view-staff-login'), 1200);
          }
        }
      }

      return json;
    } catch (err) {
      lastError = err;
      attempt++;
      if (attempt < maxRetries) {
        const delayMs = Math.floor(1000 * Math.pow(1.8, attempt - 1) + Math.random() * 400);
        console.warn(`[CBT API Retry] Aksi "${action}" gagal (percobaan ${attempt}/${maxRetries}): ${err.message}. Mencoba kembali dalam ${delayMs}ms...`);
        if (typeof showToast === 'function' && attempt === 2 && !SILENT_BACKGROUND_ACTIONS.has(action)) {
          showToast('Menghubungkan Ulang', 'Server sedang sibuk, sistem mencoba menghubungkan kembali secara otomatis...', 'warning');
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error(`Gagal memanggil server untuk aksi "${action}" setelah ${maxRetries} percobaan.`);
}

function createCbtApiAdapter() {
  function createRunner() {
    let pendingSuccess = null;
    let pendingFailure = null;
    let runnerProxy;

    const handler = {
      get(_target, prop) {
        if (prop === 'withSuccessHandler') {
          return function (fn) { pendingSuccess = fn; return runnerProxy; };
        }
        if (prop === 'withFailureHandler') {
          return function (fn) { pendingFailure = fn; return runnerProxy; };
        }

        return function (...args) {
          const onSuccess = pendingSuccess;
          const onFailure = pendingFailure;
          pendingSuccess = null;
          pendingFailure = null;

          callServer(prop, args)
            .then(result => { if (onSuccess) onSuccess(result); })
            .catch(err => {
              if (onFailure) onFailure(err);
              else console.error('[CBT API] Aksi "' + prop + '" gagal:', err);
            });

          return runnerProxy;
        };
      }
    };

    runnerProxy = new Proxy({}, handler);
    return runnerProxy;
  }

  return new Proxy({}, {
    get(_target, prop) {
      const runner = createRunner();
      return runner[prop];
    }
  });
}

const cbtApi = createCbtApiAdapter();
const gasRun = cbtApi;
window.cbtApi = cbtApi;
window.gasRun = gasRun;
