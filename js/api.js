// ============================================================
// API.JS — Klien REST API CBT Bahasa (Client Service Adapter)
// ============================================================
// File ini menghubungkan antarmuka Single Page Application (SPA)
// dengan Serverless API backend (Node.js & PostgreSQL).
// Dilengkapi mekanisme Resilience Auto-Retry (Exponential Backoff & Jitter),
// penanganan sesi otomatis, serta proxy thread-safe.
// ============================================================

// Endpoint API utama (default relatif '/api/cbt' untuk Vercel Serverless).
// Dapat di-override melalui window.CBT_API_URL jika frontend di-host terpisah.
const CBT_API_URL = window.CBT_API_URL || '/api/cbt';
const GAS_URL = CBT_API_URL; // Alias kompatibilitas

/**
 * Ambil token sesi aktif dari localStorage (staf atau peserta) untuk
 * dikirimkan ke backend pada setiap pemanggilan REST API.
 */
function getActiveAuthToken() {
  try {
    const staff = localStorage.getItem('cbt_staff');
    if (staff) {
      const parsed = JSON.parse(staff);
      if (parsed && parsed.token) return parsed.token;
    }
    const participant = localStorage.getItem('cbt_participant');
    if (participant) {
      const parsed = JSON.parse(participant);
      if (parsed && parsed.token) return parsed.token;
    }
  } catch (e) {}
  return null;
}

/**
 * Kirim satu aksi + argumen ke backend REST API dengan mekanisme Resilience Retry
 * (Exponential Backoff + Jitter). Mengatasi konkurensi puncak atau gangguan
 * jaringan sementara tanpa membuat request langsung gagal.
 */
async function callServer(action, args, maxRetries = 3) {
  let attempt = 0;
  let lastError = null;

  const token = getActiveAuthToken();
  const payload = { action: action, args: args || [] };
  if (token) payload.token = token;

  while (attempt < maxRetries) {
    try {
      const res = await fetch(CBT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Jika server mengembalikan status overload atau server error, coba ulang
      if (!res.ok) {
        if ([429, 500, 502, 503, 504].includes(res.status) && attempt < maxRetries - 1) {
          throw new Error('HTTP ' + res.status + ' (server sibuk/sementara overload)');
        }
        throw new Error('HTTP ' + res.status + ' dari server saat memanggil aksi "' + action + '"');
      }

      const json = await res.json();

      // Tangani otomatis jika sesi kedaluwarsa atau tidak valid
      if (json && json.success === false && typeof json.message === 'string' && json.message.includes('Sesi login Anda tidak valid')) {
        console.warn('[CBT Auth]', json.message);
        if (localStorage.getItem('cbt_staff')) {
          localStorage.removeItem('cbt_staff');
          if (typeof showToast === 'function') {
            showToast('Sesi Berakhir', 'Sesi autentikasi Anda telah berakhir. Silakan login kembali.', 'warning');
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
        // Exponential backoff dengan jitter: mis. 1000ms, 2000ms + random jitter
        const delayMs = Math.floor(1000 * Math.pow(1.8, attempt - 1) + Math.random() * 400);
        console.warn(`[CBT API Retry] Aksi "${action}" gagal (percobaan ${attempt}/${maxRetries}): ${err.message}. Mencoba kembali dalam ${delayMs}ms...`);
        if (typeof showToast === 'function' && attempt === 2) {
          showToast('Menghubungkan Ulang', 'Server sedang sibuk, sistem mencoba menghubungkan kembali secara otomatis...', 'warning');
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error(`Gagal memanggil server untuk aksi "${action}" setelah ${maxRetries} percobaan.`);
}

/**
 * Buat adapter API chainable (withSuccessHandler / withFailureHandler).
 * Setiap panggilan menghasilkan runner baru (Thread-Safe) untuk mencegah
 * race-condition saat ada beberapa request berjalan paralel.
 */
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

// Objek API client global yang dipakai seluruh komponen
const cbtApi = createCbtApiAdapter();
const gasRun = cbtApi; // Alias kompatibilitas
window.cbtApi = cbtApi;
window.gasRun = gasRun;
