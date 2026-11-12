/**
 * ============================================================
 * CBT BAHASA — Layanan Pengguna & Akses (User & Auth Services)
 * ============================================================
 */

const { query, queryOne } = require('../db');
const {
  hashPassword,
  verifyPassword,
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

async function staffLogin(role, username, password) {
  if (!username || !password) return createResponse(false, null, 'Username dan password wajib diisi.');
  const isRoleAdmin = String(role || '').toLowerCase() === 'admin';
  const table = isRoleAdmin ? 'admin' : 'dosen';
  const idCol = isRoleAdmin ? 'ID_Admin' : 'ID_Dosen';

  const user = await queryOne(`SELECT * FROM "${table}" WHERE "Username" = $1`, [username]);
  if (!user || !verifyPassword(password, user.Password_Hash)) {
    return createResponse(false, null, 'Username atau password salah.');
  }

  if (!isRoleAdmin && user.Status !== 'Aktif') {
    return createResponse(false, null, 'Akun dosen tidak aktif.');
  }

  // Auto-upgrade hash jika diperlukan
  const newHash = hashPassword(password);
  if (user.Password_Hash !== newHash) {
    await query(`UPDATE "${table}" SET "Password_Hash" = $1 WHERE "${idCol}" = $2`, [newHash, user[idCol]]);
  }

  delete user.Password_Hash;
  user.role = isRoleAdmin ? 'admin' : 'dosen';
  const userId = user[idCol];
  user.token = generateSessionToken(userId, user.role, user.Nama);

  await logActivity(isRoleAdmin ? 'Administrator' : 'Dosen Penguji', user.Nama, 'Login Staff', username);
  return createResponse(true, user, 'Login berhasil.');
}


// ────────────────────────────────────────────────────────────
async function getAllLecturers() {
  const { rows } = await query('SELECT "ID_Dosen", "Nama", "Username", "Status" FROM dosen ORDER BY "Nama" ASC');
  return createResponse(true, rows, 'OK');
}

async function addLecturer(nama, username, statusAwal) {
  if (!nama || !username) return createResponse(false, null, 'Nama dan username wajib diisi.');
  const idDosen = generateId('DSN');
  const tempPassword = Math.random().toString(36).substring(2, 10);
  const passwordHash = hashPassword(tempPassword);

  await query(
    `INSERT INTO dosen ("ID_Dosen", "Nama", "Username", "Password_Hash", "Status")
     VALUES ($1, $2, $3, $4, $5)`,
    [idDosen, nama, username, passwordHash, statusAwal || 'Aktif']
  );

  await logActivity('Administrator', 'Admin', 'Tambah Dosen', nama);
  return createResponse(true, { idDosen, username, tempPassword }, 'Dosen berhasil ditambahkan. Password sementara: ' + tempPassword);
}

async function toggleLecturerStatus(idDosen, statusBaru) {
  await query(`UPDATE dosen SET "Status" = $1 WHERE "ID_Dosen" = $2`, [statusBaru, idDosen]);
  return createResponse(true, null, 'Status dosen diperbarui.');
}

async function resetLecturerPassword(idDosen) {
  const newPass = Math.random().toString(36).substring(2, 10);
  const passwordHash = hashPassword(newPass);

  await query(`UPDATE dosen SET "Password_Hash" = $1 WHERE "ID_Dosen" = $2`, [passwordHash, idDosen]);
  await logActivity('Administrator', 'Admin', 'Reset Password Dosen', idDosen);
  return createResponse(true, { newPass }, 'Password baru: ' + newPass);
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
  toggleLecturerStatus,
  resetLecturerPassword,
  getAllParticipants,
  generateAccessCodesBatch,
  deactivateAccessCode,
  reactivateAccessCode,
  deleteParticipantAccess,
  resetParticipantSession,
  getParticipantResultDetail,
  importParticipantsBatch
};
