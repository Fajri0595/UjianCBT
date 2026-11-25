/**
 * ============================================================
 * CBT BAHASA — Layanan Pengguna & Akses (Hybrid Google OAuth + PIN)
 * ============================================================
 */

const { query, queryOne } = require('../db');
const {
  DEFAULT_GOOGLE_CLIENT_ID,
  getAuthContext,
  generateSessionToken,
  generateId,
  generateAccessCode,
  hashPin,
  verifyPin
} = require('../auth');
const { createResponse, logActivity } = require('./common');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PIN_PATTERN = /^\d{6}$/;
const MAX_FAILED_PIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function normalizeAndValidateEmail(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) return { email: '', error: 'Alamat email wajib diisi.' };
  if (!EMAIL_PATTERN.test(email)) return { email: '', error: 'Format alamat email tidak valid.' };
  return { email, error: null };
}

function validatePinFormat(rawPin) {
  const pin = String(rawPin || '').trim();
  if (!PIN_PATTERN.test(pin)) {
    return { pin: '', error: 'PIN keamanan harus terdiri dari tepat 6 digit angka (0-9).' };
  }
  return { pin, error: null };
}

function getLockoutErrorMessage(user) {
  if (!user || !user.Locked_Until) return null;
  const untilMs = new Date(user.Locked_Until).getTime();
  const nowMs = Date.now();
  if (untilMs > nowMs) {
    const minsLeft = Math.max(1, Math.ceil((untilMs - nowMs) / 60000));
    return `Akun dikunci sementara demi keamanan karena kesalahan PIN berulang. Silakan coba kembali dalam ${minsLeft} menit atau hubungi Administrator.`;
  }
  return null;
}

async function recordFailedPinAttempt(table, idCol, userId, currentAttempts, roleTitle, email) {
  const nextAttempts = (Number(currentAttempts) || 0) + 1;
  if (nextAttempts >= MAX_FAILED_PIN_ATTEMPTS) {
    await query(
      `UPDATE "${table}"
       SET "Failed_Attempts" = $1, "Locked_Until" = NOW() + INTERVAL '${LOCKOUT_MINUTES} minutes'
       WHERE "${idCol}" = $2`,
      [nextAttempts, userId]
    );
    await logActivity('Keamanan', email, 'Akun Dikunci Sementara', `${roleTitle} salah memasukkan PIN ${nextAttempts}x berturut-turut.`);
    return `PIN salah ${MAX_FAILED_PIN_ATTEMPTS} kali berturut-turut. Akun dikunci sementara selama ${LOCKOUT_MINUTES} menit.`;
  }

  await query(
    `UPDATE "${table}" SET "Failed_Attempts" = $1, "Locked_Until" = NULL WHERE "${idCol}" = $2`,
    [nextAttempts, userId]
  );
  const remaining = MAX_FAILED_PIN_ATTEMPTS - nextAttempts;
  return `PIN keamanan tidak sesuai. Sisa percobaan: ${remaining} kali sebelum akun dikunci sementara.`;
}

async function clearFailedPinAttempts(table, idCol, userId) {
  await query(
    `UPDATE "${table}" SET "Failed_Attempts" = 0, "Locked_Until" = NULL WHERE "${idCol}" = $1`,
    [userId]
  );
}

async function getConfiguredGoogleAuthSettings() {
  const { rows } = await query(
    `SELECT "Key", "Value" FROM pengaturan_sistem WHERE "Key" IN ('googleClientId', 'googleAuthMode')`
  );
  const map = {};
  rows.forEach((r) => (map[r.Key] = r.Value));
  const clientId = String(map.googleClientId || process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID || '').trim();
  const authMode = String(map.googleAuthMode || 'google_plus_pin').trim();
  return { clientId, authMode };
}

async function verifyGoogleIdToken(idToken, expectedClientId) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Token kredensial Google tidak ditemukan.');
  }
  if (!expectedClientId) {
    throw new Error('Google Client ID belum dikonfigurasi pada Pengaturan Sistem.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { method: 'GET', signal: controller.signal }
    );
    if (!res.ok) {
      throw new Error('Token Google OAuth tidak sah atau telah kedaluwarsa.');
    }
    const payload = await res.json();
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!validIssuers.includes(payload.iss)) {
      throw new Error('Penerbit token OAuth tidak dikenali.');
    }
    if (payload.aud !== expectedClientId) {
      throw new Error('Google Client ID pada token tidak cocok dengan konfigurasi aplikasi ini.');
    }
    if (String(payload.email_verified) !== 'true') {
      throw new Error('Alamat email pada akun Google Anda belum terverifikasi.');
    }
    if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
      throw new Error('Sesi token Google telah kedaluwarsa. Silakan ulangi Sign-In Google.');
    }
    return {
      email: String(payload.email || '').trim().toLowerCase(),
      name: payload.name || '',
      picture: payload.picture || ''
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyParticipantAccess(nama, kontak, kodeAkses, deviceInfo, existingToken) {
  if (!kodeAkses) return createResponse(false, null, 'Kode akses wajib diisi.');
  const trimmedCode = String(kodeAkses).trim().toUpperCase();

  const participant = await queryOne(
    `SELECT * FROM peserta WHERE UPPER("Kode_Akses") = $1`,
    [trimmedCode]
  );

  if (!participant) {
    return createResponse(false, null, 'Kode akses tidak ditemukan. Periksa kembali kode Anda.');
  }

  const status = String(participant.Status_Kode || '').toLowerCase();
  if (status === 'expired' || status === 'used') {
    return createResponse(false, null, 'Kode akses sudah tidak berlaku (kadaluarsa/terpakai).');
  }

  // Single-Session Device Lock
  const ongoingExam = await queryOne(
    `SELECT * FROM hasil_ujian WHERE "ID_Peserta" = $1 AND "Status" = 'Sedang Berjalan' LIMIT 1`,
    [participant.ID_Peserta]
  );

  if (ongoingExam && participant.Active_Token) {
    const isSameToken = existingToken && participant.Active_Token === existingToken;
    if (!isSameToken) {
      return createResponse(
        false,
        null,
        '⚠️ AKSES DITOLAK: Sesi ujian ini sedang aktif di perangkat lain. Untuk mencegah kecurangan joki/multi-login, satu kode akses hanya diizinkan di 1 perangkat. Jika perangkat Anda sebelumnya mati/crash, silakan minta Pengawas untuk melakukan "Reset Sesi Perangkat".'
      );
    }
  }

  const existingNama = String(participant.Nama || '').trim();
  let finalNama = existingNama;
  if (!existingNama || existingNama === 'Contoh Peserta') {
    finalNama = String(nama || existingNama).trim();
    await query(
      `UPDATE peserta SET "Nama" = $1, "Kontak" = $2 WHERE "ID_Peserta" = $3`,
      [finalNama, String(kontak || '').trim(), participant.ID_Peserta]
    );
  }

  const sessionToken = generateSessionToken(participant.ID_Peserta, 'peserta', finalNama);
  const userAgentInfo = deviceInfo ? String(deviceInfo).substring(0, 200) : 'Browser Client';

  await query(
    `UPDATE peserta SET "Active_Token" = $1, "Device_Info" = $2 WHERE "ID_Peserta" = $3`,
    [sessionToken, userAgentInfo, participant.ID_Peserta]
  );

  participant.Nama = finalNama;
  participant.Kontak = kontak || participant.Kontak;
  participant.Active_Token = sessionToken;
  participant.Device_Info = userAgentInfo;
  participant.token = sessionToken;

  await logActivity('Peserta', participant.Nama, 'Login/Verifikasi Kode', `${trimmedCode} (${userAgentInfo})`);
  return createResponse(true, participant, 'Kode akses terverifikasi.');
}

async function isEmailRegistered(table, idCol, email, excludeId = null) {
  if (excludeId) {
    const existing = await queryOne(
      `SELECT "${idCol}" FROM "${table}" WHERE LOWER(TRIM("Email")) = $1 AND "${idCol}" <> $2`,
      [email, excludeId]
    );
    return Boolean(existing);
  }
  const existing = await queryOne(
    `SELECT "${idCol}" FROM "${table}" WHERE LOWER(TRIM("Email")) = $1`,
    [email]
  );
  return Boolean(existing);
}

function sanitizeStaffOutput(user, idCol, isRoleAdmin, email) {
  const safeUser = { ...user };
  delete safeUser.Password_Hash;
  delete safeUser.Failed_Attempts;
  delete safeUser.Locked_Until;
  safeUser.Email = email;
  safeUser.role = isRoleAdmin ? 'admin' : 'dosen';
  safeUser.mustChangePin = Boolean(user.Must_Change_Pin);
  safeUser.token = generateSessionToken(user[idCol], safeUser.role, user.Nama);
  return safeUser;
}

/**
 * Login Staf via Email Terdaftar + PIN 6 Digit
 */
async function staffLogin(role, rawEmail, rawPin) {
  const { email, error } = normalizeAndValidateEmail(rawEmail);
  if (error) return createResponse(false, null, error);

  const pinStr = String(rawPin || '').trim();
  if (!pinStr) {
    return createResponse(false, null, 'Masukkan PIN keamanan 6 digit Anda.');
  }

  const isRoleAdmin = String(role || '').toLowerCase() === 'admin';
  const table = isRoleAdmin ? 'admin' : 'dosen';
  const idCol = isRoleAdmin ? 'ID_Admin' : 'ID_Dosen';
  const roleTitle = isRoleAdmin ? 'Administrator' : 'Dosen Penguji';

  const user = await queryOne(
    `SELECT * FROM "${table}" WHERE LOWER(TRIM("Email")) = $1`,
    [email]
  );
  if (!user) {
    if (isRoleAdmin) {
      const onlyBootstrap = await queryOne(
        `SELECT COUNT(*)::int AS total, MAX(LOWER(TRIM("Email"))) AS single_email FROM admin`
      );
      if (onlyBootstrap && onlyBootstrap.total === 1 && onlyBootstrap.single_email === 'admin@cbtbahasa.id') {
        return createResponse(
          false,
          null,
          `Email "${email}" belum terdaftar. Untuk login pertama pada sistem baru, masuk terlebih dahulu menggunakan email bawaan "admin@cbtbahasa.id" dan PIN awal 123456, lalu ubah ke email Google Anda di menu Staf & Akses Email.`
        );
      }
    }
    return createResponse(false, null, `Email "${email}" tidak terdaftar sebagai ${roleTitle}. Pastikan tab peran (Administrator / Dosen) sudah sesuai.`);
  }

  if (!isRoleAdmin && user.Status !== 'Aktif') {
    return createResponse(false, null, 'Akun dosen sedang dinonaktifkan. Hubungi Administrator.');
  }

  const lockMsg = getLockoutErrorMessage(user);
  if (lockMsg) return createResponse(false, null, lockMsg);

  // Pastikan bila akun lama belum memiliki hash scrypt, anggap PIN awalnya '123456'
  const hasScryptPin = user.Password_Hash && String(user.Password_Hash).startsWith('scrypt$');
  const isFirstTimeAccount = Boolean(user.Must_Change_Pin) || !hasScryptPin;
  const isPinValid = hasScryptPin
    ? verifyPin(pinStr, user.Password_Hash)
    : pinStr === '123456';

  if (!isPinValid) {
    if (isFirstTimeAccount) {
      return createResponse(
        false,
        null,
        'Akun ini belum mengatur PIN pribadi. Masukkan PIN awal 123456 untuk masuk pertama kali, atau klik tombol "Masuk dengan Akun Google" di bawah untuk langsung membuat PIN baru Anda.'
      );
    }
    const failMsg = await recordFailedPinAttempt(table, idCol, user[idCol], user.Failed_Attempts, roleTitle, email);
    return createResponse(false, null, failMsg);
  }

  if (!hasScryptPin) {
    await query(
      `UPDATE "${table}" SET "Password_Hash" = $1, "Must_Change_Pin" = TRUE, "Failed_Attempts" = 0, "Locked_Until" = NULL WHERE "${idCol}" = $2`,
      [hashPin('123456'), user[idCol]]
    );
    user.Must_Change_Pin = true;
  } else {
    await clearFailedPinAttempts(table, idCol, user[idCol]);
  }

  const safeUser = sanitizeStaffOutput(user, idCol, isRoleAdmin, email);

  await logActivity(roleTitle, user.Nama, 'Login Staff (Email + PIN)', email);
  return createResponse(true, safeUser, 'Login berhasil.');
}

/**
 * Login Staf via Google Sign-In (OAuth 2.0 ID Token + PIN 6 Digit Berlapis)
 * Mendukung pembuatan PIN baru secara langsung pada login pertama (Must_Change_Pin = true).
 */
async function staffLoginGoogle(role, idToken, rawPinOptional) {
  const { clientId, authMode } = await getConfiguredGoogleAuthSettings();
  let googleProfile;
  try {
    googleProfile = await verifyGoogleIdToken(idToken, clientId);
  } catch (err) {
    return createResponse(false, null, err.message || 'Verifikasi Google Sign-In gagal.');
  }

  const email = googleProfile.email;
  const isRoleAdmin = String(role || '').toLowerCase() === 'admin';
  const table = isRoleAdmin ? 'admin' : 'dosen';
  const idCol = isRoleAdmin ? 'ID_Admin' : 'ID_Dosen';
  const roleTitle = isRoleAdmin ? 'Administrator' : 'Dosen Penguji';

  const user = await queryOne(
    `SELECT * FROM "${table}" WHERE LOWER(TRIM("Email")) = $1`,
    [email]
  );
  if (!user) {
    if (isRoleAdmin) {
      const onlyBootstrap = await queryOne(
        `SELECT COUNT(*)::int AS total, MAX(LOWER(TRIM("Email"))) AS single_email FROM admin`
      );
      if (onlyBootstrap && onlyBootstrap.total === 1 && onlyBootstrap.single_email === 'admin@cbtbahasa.id') {
        return createResponse(
          false,
          null,
          `Akun Google "${email}" belum terdaftar. Masuk terlebih dahulu menggunakan email bawaan "admin@cbtbahasa.id" dan PIN awal 123456, lalu ganti ke email Google Anda di menu Staf & Akses Email.`
        );
      }
    }
    return createResponse(
      false,
      null,
      `Akun Google "${email}" belum terdaftar sebagai ${roleTitle} pada sistem CBT ini. Pastikan pilihan peran (Administrator / Dosen) sudah sesuai.`
    );
  }

  if (!isRoleAdmin && user.Status !== 'Aktif') {
    return createResponse(false, null, 'Akun dosen sedang dinonaktifkan. Hubungi Administrator.');
  }

  const lockMsg = getLockoutErrorMessage(user);
  if (lockMsg) return createResponse(false, null, lockMsg);

  const hasScryptPin = user.Password_Hash && String(user.Password_Hash).startsWith('scrypt$');
  const isFirstPinSetup = Boolean(user.Must_Change_Pin) || !hasScryptPin;
  const requirePinLayer = authMode !== 'google_direct';

  if (requirePinLayer) {
    const pinStr = String(rawPinOptional || '').trim();
    if (!pinStr) {
      return createResponse(
        true,
        {
          requirePinStep: true,
          isFirstPinSetup,
          email,
          nama: user.Nama,
          role: isRoleAdmin ? 'admin' : 'dosen'
        },
        isFirstPinSetup
          ? `Akun Google (${email}) terverifikasi! Silakan ketik 6 angka PIN keamanan baru Anda pada kolom PIN lalu klik Simpan PIN & Masuk.`
          : `Akun Google (${email}) terverifikasi. Masukkan PIN 6 digit Anda untuk menyelesaikan otorisasi.`
      );
    }

    const { pin: cleanPin, error: pinFmtErr } = validatePinFormat(pinStr);
    if (pinFmtErr) return createResponse(false, null, pinFmtErr);

    if (isFirstPinSetup) {
      // Identitas pemilik email sudah terverifikasi oleh Google OAuth — simpan langsung PIN baru pilihan staf!
      const stillDefault = cleanPin === '123456';
      await query(
        `UPDATE "${table}"
         SET "Password_Hash" = $1, "Must_Change_Pin" = $2, "Failed_Attempts" = 0, "Locked_Until" = NULL
         WHERE "${idCol}" = $3`,
        [hashPin(cleanPin), stillDefault, user[idCol]]
      );
      user.Must_Change_Pin = stillDefault;
    } else {
      const isPinValid = verifyPin(cleanPin, user.Password_Hash);
      if (!isPinValid) {
        const failMsg = await recordFailedPinAttempt(table, idCol, user[idCol], user.Failed_Attempts, roleTitle, email);
        return createResponse(false, null, failMsg);
      }
      await clearFailedPinAttempts(table, idCol, user[idCol]);
    }
  } else {
    await clearFailedPinAttempts(table, idCol, user[idCol]);
  }

  const safeUser = sanitizeStaffOutput(user, idCol, isRoleAdmin, email);

  await logActivity(
    roleTitle,
    user.Nama,
    requirePinLayer ? 'Login Staff (Google OAuth + PIN)' : 'Login Staff (Google OAuth)',
    email
  );
  return createResponse(true, safeUser, 'Otorisasi Google berhasil.');
}

/**
 * Ubah PIN Mandiri oleh Staf (Admin / Dosen yang sedang login)
 */
async function changeOwnStaffPin(oldPin, newPin) {
  const auth = getAuthContext();
  if (!auth || !['admin', 'dosen'].includes(auth.role)) {
    return createResponse(false, null, 'Sesi autentikasi tidak valid.');
  }

  const oldPinStr = String(oldPin || '').trim();
  if (!oldPinStr) return createResponse(false, null, 'PIN saat ini wajib diisi.');

  const { pin: cleanNewPin, error: pinErr } = validatePinFormat(newPin);
  if (pinErr) return createResponse(false, null, pinErr);

  if (cleanNewPin === '123456' || cleanNewPin === '000000') {
    return createResponse(false, null, 'Demi keamanan, jangan gunakan PIN standar (123456 atau 000000). Pilih kombinasi 6 angka lain.');
  }

  const isRoleAdmin = auth.role === 'admin';
  const table = isRoleAdmin ? 'admin' : 'dosen';
  const idCol = isRoleAdmin ? 'ID_Admin' : 'ID_Dosen';

  const user = await queryOne(`SELECT * FROM "${table}" WHERE "${idCol}" = $1`, [auth.userId]);
  if (!user) return createResponse(false, null, 'Data akun tidak ditemukan.');

  const hasScryptPin = user.Password_Hash && String(user.Password_Hash).startsWith('scrypt$');
  const isOldValid = hasScryptPin ? verifyPin(oldPinStr, user.Password_Hash) : oldPinStr === '123456';
  if (!isOldValid) {
    return createResponse(false, null, 'PIN lama yang Anda masukkan tidak sesuai.');
  }

  const newHash = hashPin(cleanNewPin);
  await query(
    `UPDATE "${table}"
     SET "Password_Hash" = $1, "Must_Change_Pin" = FALSE, "Failed_Attempts" = 0, "Locked_Until" = NULL
     WHERE "${idCol}" = $2`,
    [newHash, auth.userId]
  );

  await logActivity(isRoleAdmin ? 'Administrator' : 'Dosen Penguji', user.Nama, 'Ubah PIN Keamanan Mandiri', user.Email || auth.userId);
  return createResponse(true, { mustChangePin: false }, 'PIN keamanan 6 digit Anda berhasil diperbarui.');
}

// ────────────────────────────────────────────────────────────
async function getAllLecturers() {
  const { rows } = await query(
    `SELECT "ID_Dosen", "Nama", "Email", "Username", "Status", "Must_Change_Pin", "Locked_Until"
     FROM dosen ORDER BY "Nama" ASC`
  );
  return createResponse(true, rows, 'OK');
}

async function addLecturer(nama, rawEmail, statusAwal, rawPin) {
  const cleanName = String(nama || '').trim();
  const { email, error } = normalizeAndValidateEmail(rawEmail);
  if (!cleanName) return createResponse(false, null, 'Nama dosen wajib diisi.');
  if (error) return createResponse(false, null, error);

  if (await isEmailRegistered('dosen', 'ID_Dosen', email)) {
    return createResponse(false, null, `Email "${email}" sudah terdaftar pada akun dosen lain.`);
  }

  let pinToHash = '123456';
  let mustChange = true;
  if (rawPin && String(rawPin).trim() !== '') {
    const { pin, error: pErr } = validatePinFormat(rawPin);
    if (pErr) return createResponse(false, null, pErr);
    pinToHash = pin;
    mustChange = pin === '123456';
  }

  const idDosen = generateId('DSN');
  await query(
    `INSERT INTO dosen ("ID_Dosen", "Nama", "Email", "Password_Hash", "Status", "Must_Change_Pin")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [idDosen, cleanName, email, hashPin(pinToHash), statusAwal || 'Aktif', mustChange]
  );

  await logActivity('Administrator', 'Admin', 'Tambah Dosen', `${cleanName} (${email})`);
  return createResponse(
    true,
    { idDosen, nama: cleanName, email },
    `Dosen "${cleanName}" berhasil didaftarkan (Email + PIN & Google OAuth siap digunakan).`
  );
}

async function updateLecturer(idDosen, nama, rawEmail, rawPin) {
  if (!idDosen) return createResponse(false, null, 'ID Dosen wajib diisi.');
  const cleanName = String(nama || '').trim();
  const { email, error } = normalizeAndValidateEmail(rawEmail);
  if (!cleanName) return createResponse(false, null, 'Nama dosen wajib diisi.');
  if (error) return createResponse(false, null, error);

  const target = await queryOne('SELECT "ID_Dosen" FROM dosen WHERE "ID_Dosen" = $1', [idDosen]);
  if (!target) return createResponse(false, null, 'Data dosen tidak ditemukan.');

  if (await isEmailRegistered('dosen', 'ID_Dosen', email, idDosen)) {
    return createResponse(false, null, `Email "${email}" sudah digunakan oleh dosen lain.`);
  }

  if (rawPin && String(rawPin).trim() !== '') {
    const { pin, error: pErr } = validatePinFormat(rawPin);
    if (pErr) return createResponse(false, null, pErr);
    await query(
      `UPDATE dosen
       SET "Nama" = $1, "Email" = $2, "Password_Hash" = $3, "Must_Change_Pin" = $4, "Failed_Attempts" = 0, "Locked_Until" = NULL
       WHERE "ID_Dosen" = $5`,
      [cleanName, email, hashPin(pin), pin === '123456', idDosen]
    );
    await logActivity('Administrator', 'Admin', 'Ubah Data & Reset PIN Dosen', `${cleanName} (${email})`);
    return createResponse(true, { idDosen, nama: cleanName, email }, 'Data dosen dan PIN 6 digit berhasil diperbarui.');
  }

  await query('UPDATE dosen SET "Nama" = $1, "Email" = $2 WHERE "ID_Dosen" = $3', [cleanName, email, idDosen]);
  await logActivity('Administrator', 'Admin', 'Ubah Data Dosen', `${cleanName} (${email})`);
  return createResponse(true, { idDosen, nama: cleanName, email }, 'Data dosen berhasil diperbarui.');
}

async function toggleLecturerStatus(idDosen, statusBaru) {
  await query(`UPDATE dosen SET "Status" = $1 WHERE "ID_Dosen" = $2`, [statusBaru, idDosen]);
  return createResponse(true, null, 'Status dosen diperbarui.');
}

async function getAllAdmins() {
  const { rows } = await query(
    `SELECT "ID_Admin", "Nama", "Email", "Username", "Must_Change_Pin", "Locked_Until"
     FROM admin ORDER BY "Nama" ASC`
  );
  return createResponse(true, rows, 'OK');
}

async function addAdmin(nama, rawEmail, rawPin) {
  const cleanName = String(nama || '').trim();
  const { email, error } = normalizeAndValidateEmail(rawEmail);
  if (!cleanName) return createResponse(false, null, 'Nama administrator wajib diisi.');
  if (error) return createResponse(false, null, error);

  if (await isEmailRegistered('admin', 'ID_Admin', email)) {
    return createResponse(false, null, `Email "${email}" sudah terdaftar sebagai Administrator.`);
  }

  let pinToHash = '123456';
  let mustChange = true;
  if (rawPin && String(rawPin).trim() !== '') {
    const { pin, error: pErr } = validatePinFormat(rawPin);
    if (pErr) return createResponse(false, null, pErr);
    pinToHash = pin;
    mustChange = pin === '123456';
  }

  const idAdmin = generateId('ADM');
  await query(
    `INSERT INTO admin ("ID_Admin", "Nama", "Email", "Password_Hash", "Must_Change_Pin")
     VALUES ($1, $2, $3, $4, $5)`,
    [idAdmin, cleanName, email, hashPin(pinToHash), mustChange]
  );

  await logActivity('Administrator', 'Admin', 'Tambah Admin', `${cleanName} (${email})`);
  return createResponse(true, { idAdmin, nama: cleanName, email }, `Administrator "${cleanName}" berhasil didaftarkan.`);
}

async function updateAdmin(idAdmin, nama, rawEmail, rawPin) {
  if (!idAdmin) return createResponse(false, null, 'ID Admin wajib diisi.');
  const cleanName = String(nama || '').trim();
  const { email, error } = normalizeAndValidateEmail(rawEmail);
  if (!cleanName) return createResponse(false, null, 'Nama administrator wajib diisi.');
  if (error) return createResponse(false, null, error);

  const target = await queryOne('SELECT "ID_Admin" FROM admin WHERE "ID_Admin" = $1', [idAdmin]);
  if (!target) return createResponse(false, null, 'Data administrator tidak ditemukan.');

  if (await isEmailRegistered('admin', 'ID_Admin', email, idAdmin)) {
    return createResponse(false, null, `Email "${email}" sudah digunakan oleh administrator lain.`);
  }

  if (rawPin && String(rawPin).trim() !== '') {
    const { pin, error: pErr } = validatePinFormat(rawPin);
    if (pErr) return createResponse(false, null, pErr);
    await query(
      `UPDATE admin
       SET "Nama" = $1, "Email" = $2, "Password_Hash" = $3, "Must_Change_Pin" = $4, "Failed_Attempts" = 0, "Locked_Until" = NULL
       WHERE "ID_Admin" = $5`,
      [cleanName, email, hashPin(pin), pin === '123456', idAdmin]
    );
    await logActivity('Administrator', 'Admin', 'Ubah Data & Reset PIN Admin', `${cleanName} (${email})`);
    return createResponse(true, { idAdmin, nama: cleanName, email }, 'Data administrator dan PIN 6 digit berhasil diperbarui.');
  }

  await query('UPDATE admin SET "Nama" = $1, "Email" = $2 WHERE "ID_Admin" = $3', [cleanName, email, idAdmin]);
  await logActivity('Administrator', 'Admin', 'Ubah Data Admin', `${cleanName} (${email})`);
  return createResponse(true, { idAdmin, nama: cleanName, email }, 'Data administrator berhasil diperbarui.');
}

async function deleteAdmin(idAdmin) {
  if (!idAdmin) return createResponse(false, null, 'ID Admin wajib diisi.');
  const auth = getAuthContext();
  const currentAdminId = auth ? auth.userId : null;
  if (currentAdminId && idAdmin === currentAdminId) {
    return createResponse(false, null, 'Anda tidak dapat menghapus akun Administrator yang sedang aktif Anda gunakan.');
  }

  const countRow = await queryOne('SELECT COUNT(*)::int AS total FROM admin');
  if (!countRow || countRow.total <= 1) {
    return createResponse(false, null, 'Minimal harus terdapat 1 akun Administrator terdaftar dalam sistem.');
  }

  const target = await queryOne('SELECT "Nama", "Email" FROM admin WHERE "ID_Admin" = $1', [idAdmin]);
  if (!target) return createResponse(false, null, 'Data administrator tidak ditemukan.');

  await query('DELETE FROM admin WHERE "ID_Admin" = $1', [idAdmin]);
  await logActivity('Administrator', auth?.name || 'Admin', 'Hapus Admin', `${target.Nama} (${target.Email || '-'})`);
  return createResponse(true, null, 'Akses Administrator berhasil dihapus.');
}

// ────────────────────────────────────────────────────────────
// 7. ADMIN — MANAJEMEN PESERTA & KODE AKSES
// ────────────────────────────────────────────────────────────
async function getAllParticipants() {
  const { rows } = await query('SELECT * FROM peserta ORDER BY "Tanggal_Daftar" DESC');
  return createResponse(true, rows, 'OK');
}

async function generateAccessCodesBatch(idUjian, jumlah, prefix, rombel) {
  const count = Math.min(500, Math.max(1, Number(jumlah) || 1));
  const codes = [];

  for (let i = 0; i < count; i++) {
    const code = generateAccessCode(prefix);
    const idPst = generateId('PST');
    codes.push(code);

    await query(
      `INSERT INTO peserta ("ID_Peserta", "Nama", "Kontak", "Kode_Akses", "ID_Ujian_Target", "Status_Kode", "Rombel")
       VALUES ($1, '', '', $2, $3, 'Aktif', $4)`,
      [idPst, code, idUjian || '', rombel || 'Umum']
    );
  }

  await logActivity('Administrator', 'Admin', 'Generate Kode Akses Massal', `${count} kode untuk ${idUjian || 'Umum'}`);
  return createResponse(true, { codes }, `${count} kode akses berhasil dibuat.`);
}

async function deactivateAccessCode(idPeserta) {
  await query(`UPDATE peserta SET "Status_Kode" = 'Expired' WHERE "ID_Peserta" = $1`, [idPeserta]);
  await logActivity('Administrator', 'Admin', 'Nonaktifkan Kode Akses', idPeserta);
  return createResponse(true, null, 'Kode akses dinonaktifkan.');
}

async function reactivateAccessCode(idPeserta) {
  await query(
    `UPDATE peserta SET "Status_Kode" = 'Aktif', "Active_Token" = NULL, "Device_Info" = NULL WHERE "ID_Peserta" = $1`,
    [idPeserta]
  );
  // Arsipkan sesi sebelumnya agar peserta dapat menempuh ujian ulang (retake) tanpa terblokir status 'Selesai' lama
  await query(
    `UPDATE hasil_ujian
     SET "Status" = 'Diarsipkan (Retake)'
     WHERE "ID_Peserta" = $1 AND "Status" IN ('Selesai', 'Sedang Berjalan')`,
    [idPeserta]
  );
  await logActivity('Administrator', 'Admin', 'Aktifkan Kembali Kode Akses (Retake)', idPeserta);
  return createResponse(true, null, 'Kode akses diaktifkan kembali dan sesi sebelumnya telah diarsipkan untuk ujian ulang.');
}

async function deleteParticipantAccess(idPeserta) {
  await query(`DELETE FROM peserta WHERE "ID_Peserta" = $1`, [idPeserta]);
  await logActivity('Administrator', 'Admin', 'Hapus Data Peserta', idPeserta);
  return createResponse(true, null, 'Data peserta berhasil dihapus.');
}

async function resetParticipantSession(idPeserta) {
  if (!idPeserta) return createResponse(false, null, 'ID Peserta wajib disertakan.');
  const p = await queryOne('SELECT * FROM peserta WHERE "ID_Peserta" = $1', [idPeserta]);
  if (!p) return createResponse(false, null, 'Data peserta tidak ditemukan.');

  await query('UPDATE peserta SET "Active_Token" = NULL, "Device_Info" = NULL WHERE "ID_Peserta" = $1', [idPeserta]);
  const auth = getAuthContext();
  await logActivity('Pengawas', auth?.name || 'Proctor/Admin', 'Reset Sesi Perangkat', `ID Peserta: ${idPeserta} (${p.Nama || 'Tanpa Nama'})`);
  return createResponse(
    true,
    { idPeserta, nama: p.Nama },
    `Kunci sesi perangkat untuk peserta "${p.Nama || idPeserta}" berhasil dilepas. Peserta sekarang dapat login kembali di perangkat yang baru.`
  );
}

async function getParticipantResultDetail(idPeserta) {
  const res = await query(
    `SELECT "ID_Hasil", "ID_Peserta", "Nama_Peserta", "ID_Ujian", "Skor_Listening", "Skor_Grammar", "Skor_Reading", "Skor_Total", "Status_Lulus", "Waktu_Mulai", "Waktu_Selesai", "Status"
     FROM hasil_ujian
     WHERE "ID_Peserta" = $1 AND "Status" = 'Selesai'
     ORDER BY "Waktu_Selesai" DESC LIMIT 1`,
    [idPeserta]
  );
  if (!res.rows.length) {
    return createResponse(false, null, 'Belum ada data hasil ujian yang terselesaikan untuk peserta ini.');
  }
  return createResponse(true, res.rows[0], 'OK');
}

async function importParticipantsBatch(idUjian, participantsArray, defaultPrefix) {
  const results = { success: 0, errors: [] };
  if (!Array.isArray(participantsArray)) return createResponse(false, results, 'Data peserta tidak valid.');

  for (let idx = 0; idx < participantsArray.length; idx++) {
    const p = participantsArray[idx];
    const rowNum = idx + 1;
    const nama = (p.Nama || '').trim();
    if (!nama) {
      results.errors.push({ row: rowNum, message: 'Kolom Nama wajib diisi.' });
      continue;
    }

    const kode = (p.Kode_Akses || '').trim().toUpperCase() || generateAccessCode(defaultPrefix);
    const idPst = generateId('PST');

    try {
      await query(
        `INSERT INTO peserta ("ID_Peserta", "Nama", "Kontak", "Kode_Akses", "ID_Ujian_Target", "Status_Kode", "Rombel")
         VALUES ($1, $2, $3, $4, $5, 'Aktif', $6)
         ON CONFLICT ("Kode_Akses") DO UPDATE SET "Nama" = EXCLUDED."Nama", "Kontak" = EXCLUDED."Kontak"`,
        [idPst, nama, (p.Kontak || '').trim(), kode, idUjian || '', (p.Rombel || '').trim() || 'Umum']
      );
      results.success++;
    } catch (errPst) {
      results.errors.push({ row: rowNum, message: errPst.message });
    }
  }

  await logActivity('Administrator', 'Admin', 'Import Peserta CSV', `${results.success} berhasil, ${results.errors.length} error`);
  return createResponse(true, results, 'Import peserta selesai.');
}

module.exports = {
  verifyParticipantAccess,
  staffLogin,
  staffLoginGoogle,
  changeOwnStaffPin,
  getAllLecturers,
  addLecturer,
  updateLecturer,
  toggleLecturerStatus,
  getAllAdmins,
  addAdmin,
  updateAdmin,
  deleteAdmin,
  getAllParticipants,
  generateAccessCodesBatch,
  deactivateAccessCode,
  reactivateAccessCode,
  deleteParticipantAccess,
  resetParticipantSession,
  getParticipantResultDetail,
  importParticipantsBatch
};
