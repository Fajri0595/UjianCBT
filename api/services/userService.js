/**
 * ============================================================
 * CBT BAHASA — Layanan Pengguna & Akses (User & Auth Services)
 * ============================================================
 */

const { query, queryOne } = require('../db');
const {
  generateSessionToken,
  generateId,
  generateAccessCode
} = require('../auth');
const { createResponse, logActivity } = require('./common');

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

  // ── PROTEKSI 1: Single-Session Device Lock ──
  // Periksa apakah peserta memiliki sesi ujian yang SEDANG BERJALAN di perangkat lain
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
    finalNama = nama || existingNama;
    await query(
      `UPDATE peserta SET "Nama" = $1, "Kontak" = $2 WHERE "ID_Peserta" = $3`,
      [finalNama, kontak || '', participant.ID_Peserta]
    );
  }

  const sessionToken = generateSessionToken(participant.ID_Peserta, 'peserta', finalNama);
  const userAgentInfo = deviceInfo ? String(deviceInfo).substring(0, 200) : 'Browser Client';

  // Simpan token sesi aktif dan info perangkat
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normalizeAndValidateEmail(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email) return { email: '', error: 'Alamat email wajib diisi.' };
  if (!EMAIL_PATTERN.test(email)) return { email: '', error: 'Format alamat email tidak valid.' };
  return { email, error: null };
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

/**
 * Autentikasi Staf (Administrator / Dosen Penguji) tanpa password:
 * hanya email yang sudah terdaftar (dan aktif untuk Dosen) yang dapat masuk.
 */
async function staffLogin(role, rawEmail) {
  const { email, error } = normalizeAndValidateEmail(rawEmail);
  if (error) return createResponse(false, null, error);

  const isRoleAdmin = String(role || '').toLowerCase() === 'admin';
  const table = isRoleAdmin ? 'admin' : 'dosen';
  const idCol = isRoleAdmin ? 'ID_Admin' : 'ID_Dosen';
  const roleTitle = isRoleAdmin ? 'Administrator' : 'Dosen Penguji';

  const user = await queryOne(
    `SELECT * FROM "${table}" WHERE LOWER(TRIM("Email")) = $1`,
    [email]
  );
  if (!user) {
    return createResponse(false, null, `Email "${email}" tidak terdaftar sebagai ${roleTitle}. Hubungi Administrator.`);
  }

  if (!isRoleAdmin && user.Status !== 'Aktif') {
    return createResponse(false, null, 'Akun dosen tidak aktif. Hubungi Administrator.');
  }

  delete user.Password_Hash;
  user.Email = email;
  user.role = isRoleAdmin ? 'admin' : 'dosen';
  const userId = user[idCol];
  user.token = generateSessionToken(userId, user.role, user.Nama);

  await logActivity(roleTitle, user.Nama, 'Login Staff (Email)', email);
  return createResponse(true, user, 'Login berhasil.');
}


// ────────────────────────────────────────────────────────────
async function getAllLecturers() {
  const { rows } = await query('SELECT "ID_Dosen", "Nama", "Email", "Username", "Status" FROM dosen ORDER BY "Nama" ASC');
  return createResponse(true, rows, 'OK');
}

async function addLecturer(nama, rawEmail, statusAwal) {
  const cleanName = String(nama || '').trim();
  const { email, error } = normalizeAndValidateEmail(rawEmail);
  if (!cleanName) return createResponse(false, null, 'Nama dosen wajib diisi.');
  if (error) return createResponse(false, null, error);

  if (await isEmailRegistered('dosen', 'ID_Dosen', email)) {
    return createResponse(false, null, `Email "${email}" sudah terdaftar pada akun dosen lain.`);
  }

  const idDosen = generateId('DSN');
  await query(
    `INSERT INTO dosen ("ID_Dosen", "Nama", "Email", "Password_Hash", "Status")
     VALUES ($1, $2, $3, $4, $5)`,
    [idDosen, cleanName, email, '', statusAwal || 'Aktif']
  );

  await logActivity('Administrator', 'Admin', 'Tambah Dosen (Email)', `${cleanName} (${email})`);
  return createResponse(true, { idDosen, nama: cleanName, email }, `Dosen "${cleanName}" berhasil didaftarkan dan langsung aktif login via email.`);
}

async function updateLecturer(idDosen, nama, rawEmail) {
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

  await query('UPDATE dosen SET "Nama" = $1, "Email" = $2 WHERE "ID_Dosen" = $3', [cleanName, email, idDosen]);
  await logActivity('Administrator', 'Admin', 'Ubah Data Dosen', `${cleanName} (${email})`);
  return createResponse(true, { idDosen, nama: cleanName, email }, 'Data email dosen berhasil diperbarui.');
}

async function toggleLecturerStatus(idDosen, statusBaru) {
  await query(`UPDATE dosen SET "Status" = $1 WHERE "ID_Dosen" = $2`, [statusBaru, idDosen]);
  return createResponse(true, null, 'Status dosen diperbarui.');
}

async function getAllAdmins() {
  const { rows } = await query('SELECT "ID_Admin", "Nama", "Email", "Username" FROM admin ORDER BY "Nama" ASC');
  return createResponse(true, rows, 'OK');
}

async function addAdmin(nama, rawEmail) {
  const cleanName = String(nama || '').trim();
  const { email, error } = normalizeAndValidateEmail(rawEmail);
  if (!cleanName) return createResponse(false, null, 'Nama administrator wajib diisi.');
  if (error) return createResponse(false, null, error);

  if (await isEmailRegistered('admin', 'ID_Admin', email)) {
    return createResponse(false, null, `Email "${email}" sudah terdaftar sebagai Administrator.`);
  }

  const idAdmin = generateId('ADM');
  await query(
    `INSERT INTO admin ("ID_Admin", "Nama", "Email", "Password_Hash")
     VALUES ($1, $2, $3, $4)`,
    [idAdmin, cleanName, email, '']
  );

  await logActivity('Administrator', 'Admin', 'Tambah Admin (Email)', `${cleanName} (${email})`);
  return createResponse(true, { idAdmin, nama: cleanName, email }, `Administrator "${cleanName}" berhasil didaftarkan.`);
}

async function updateAdmin(idAdmin, nama, rawEmail) {
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

  await query('UPDATE admin SET "Nama" = $1, "Email" = $2 WHERE "ID_Admin" = $3', [cleanName, email, idAdmin]);
  await logActivity('Administrator', 'Admin', 'Ubah Data Admin', `${cleanName} (${email})`);
  return createResponse(true, { idAdmin, nama: cleanName, email }, 'Data administrator berhasil diperbarui.');
}

async function deleteAdmin(idAdmin, currentAdminId) {
  if (!idAdmin) return createResponse(false, null, 'ID Admin wajib diisi.');
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
  await logActivity('Administrator', 'Admin', 'Hapus Admin', `${target.Nama} (${target.Email || '-'})`);
  return createResponse(true, null, 'Akses email Administrator berhasil dihapus.');
}

// ────────────────────────────────────────────────────────────
// 7. ADMIN — MANAJEMEN PESERTA & KODE AKSES
// ────────────────────────────────────────────────────────────
async function getAllParticipants() {
  const { rows } = await query('SELECT * FROM peserta ORDER BY "Tanggal_Daftar" DESC');
  return createResponse(true, rows, 'OK');
}

async function generateAccessCodesBatch(idUjian, jumlah, prefix, rombel) {
  const count = Number(jumlah) || 1;
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
  await query(`UPDATE peserta SET "Status_Kode" = 'Aktif' WHERE "ID_Peserta" = $1`, [idPeserta]);
  await logActivity('Administrator', 'Admin', 'Aktifkan Kembali Kode Akses', idPeserta);
  return createResponse(true, null, 'Kode akses berhasil diaktifkan kembali.');
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
  await logActivity('Pengawas', 'Proctor/Admin', 'Reset Sesi Perangkat', `ID Peserta: ${idPeserta} (${p.Nama || 'Tanpa Nama'})`);
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

// ────────────────────────────────────────────────────────────
// 8. ADMIN — LAPORAN, DASHBOARD & KATALOG
// ────────────────────────────────────────────────────────────
module.exports = {
  verifyParticipantAccess,
  staffLogin,
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
