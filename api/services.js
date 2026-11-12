/**
 * ============================================================
 * CBT BAHASA — Layanan Bisnis & Aksi REST API (Node.js & PostgreSQL)
 * Menggantikan seluruh fungsi backend Kode.gs dari Google Apps Script
 * ============================================================
 */

const { query, queryOne, ensureSchema, getPool } = require('./db');
const {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  generateId,
  generateAccessCode,
  getDeterministicOptionPermutation,
  deterministicShuffle
} = require('./auth');

const APP_BUILD_VERSION = 'v5.0-vercel-pro';

function createResponse(success, data, message) {
  return { success: Boolean(success), data: data !== undefined ? data : null, message: message || '' };
}

async function logActivity(peran, namaUser, aksi, detail) {
  try {
    await query(
      `INSERT INTO log_aktivitas ("Timestamp", "Peran", "Nama_User", "Aksi", "Detail")
       VALUES (NOW(), $1, $2, $3, $4)`,
      [peran || 'Sistem', namaUser || '', aksi || '', detail || '']
    );
  } catch (e) {
    console.warn('[LogActivity Failed]', e.message);
  }
}

function calculateToeflSectionScaled(rawScore, maxScore, section) {
  if (maxScore <= 0 || rawScore <= 0) return 31;
  const ratio = Math.min(1, Math.max(0, rawScore / maxScore));
  const minScale = 31;
  const maxScale = section === 'Reading' ? 67 : 68;
  return Math.round(minScale + ratio * (maxScale - minScale));
}

// ────────────────────────────────────────────────────────────
// 1. VERSI & DIAGNOSTIK
// ────────────────────────────────────────────────────────────
async function getAppVersion() {
  return createResponse(true, { version: APP_BUILD_VERSION, serverTime: new Date().toISOString() }, 'OK');
}

async function runDiagnostics() {
  const report = {
    timestamp: new Date().toISOString(),
    databaseConnected: false,
    databaseType: 'PostgreSQL (Vercel / Supabase / Neon)',
    tables: [],
    ujianPreview: [],
    errors: []
  };

  try {
    await ensureSchema();
    report.databaseConnected = true;

    const tables = ['peserta', 'dosen', 'admin', 'ujian', 'soal', 'bank_soal', 'hasil_ujian', 'log_aktivitas', 'pengaturan_sistem'];
    for (const t of tables) {
      try {
        const res = await query(`SELECT count(*) FROM "${t}"`);
        report.tables.push({ name: t, exists: true, rowCount: parseInt(res.rows[0].count, 10) });
      } catch (errTable) {
        report.tables.push({ name: t, exists: false, rowCount: 0 });
        report.errors.push(`Tabel "${t}" gagal dibaca: ` + errTable.message);
      }
    }

    report.sheets = report.tables;
    const preview = await query('SELECT "ID_Ujian", "Nama_Ujian", "ID_Dosen_Pembuat", "Status", "Tanggal_Buka", "Tanggal_Tutup" FROM ujian LIMIT 5');
    report.ujianPreview = preview.rows;
  } catch (err) {
    report.errors.push('Koneksi database gagal: ' + err.message);
  }

  report.ok = report.databaseConnected && report.errors.length === 0;
  return createResponse(true, report, 'Diagnostik database berhasil dijalankan.');
}

// ────────────────────────────────────────────────────────────
// 2. AUTENTIKASI
// ────────────────────────────────────────────────────────────
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
// 3. PESERTA & UJIAN
// ────────────────────────────────────────────────────────────
async function getAvailableExamsForParticipant(idUjianTarget) {
  let sql = 'SELECT * FROM ujian';
  const params = [];

  if (idUjianTarget && String(idUjianTarget).trim() !== '') {
    sql += ' WHERE "ID_Ujian" = $1';
    params.push(idUjianTarget);
  } else {
    sql += ' WHERE "Status" = $1';
    params.push('Aktif');
  }

  const { rows } = await query(sql, params);
  const now = new Date();

  const exams = rows.map((u) => {
    const buka = u.Tanggal_Buka ? new Date(u.Tanggal_Buka) : null;
    const tutup = u.Tanggal_Tutup ? new Date(u.Tanggal_Tutup) : null;
    let displayStatus = u.Status;

    if (u.Status === 'Aktif') {
      if (buka && now < buka) displayStatus = 'Upcoming';
      else if (tutup && now > tutup) displayStatus = 'Closed';
      else displayStatus = 'Open';
    }

    return { ...u, displayStatus };
  });

  return createResponse(true, exams, 'OK');
}

async function startExamSession(idPeserta, idUjian, clientToken) {
  const peserta = await queryOne('SELECT * FROM peserta WHERE "ID_Peserta" = $1', [idPeserta]);
  if (!peserta) return createResponse(false, null, 'Data peserta tidak valid.');

  const pStatus = String(peserta.Status_Kode || '').toLowerCase();
  if (pStatus === 'expired' || pStatus === 'used') {
    return createResponse(false, null, 'Kode akses Anda sudah tidak aktif atau telah digunakan.');
  }
  if (peserta.ID_Ujian_Target && String(peserta.ID_Ujian_Target).trim() !== '' && peserta.ID_Ujian_Target !== idUjian) {
    return createResponse(false, null, 'Kode akses Anda tidak terdaftar untuk paket ujian ini.');
  }

  // ── PROTEKSI 1: Validasi Kunci Sesi Perangkat ──
  if (peserta.Active_Token && clientToken && peserta.Active_Token !== clientToken) {
    return createResponse(
      false,
      null,
      '⚠️ AKSES DITOLAK: Sesi ujian ini terdaftar aktif pada perangkat/browser lain. Hubungi Pengawas Ujian untuk mereset sesi perangkat jika perangkat Anda mengalami kendala.'
    );
  }

  const ujian = await queryOne('SELECT * FROM ujian WHERE "ID_Ujian" = $1', [idUjian]);
  if (!ujian) return createResponse(false, null, 'Ujian tidak ditemukan.');

  const now = new Date();
  if (ujian.Tanggal_Buka && now < new Date(ujian.Tanggal_Buka)) return createResponse(false, null, 'Ujian belum dibuka.');
  if (ujian.Tanggal_Tutup && now > new Date(ujian.Tanggal_Tutup)) return createResponse(false, null, 'Ujian sudah ditutup.');

  const existingFinal = await queryOne(
    `SELECT * FROM hasil_ujian WHERE "ID_Peserta" = $1 AND "ID_Ujian" = $2 AND "Status" = 'Selesai'`,
    [idPeserta, idUjian]
  );
  if (existingFinal) return createResponse(false, null, 'Anda sudah menyelesaikan ujian ini sebelumnya.');

  const soalRes = await query('SELECT * FROM soal WHERE "ID_Ujian" = $1 ORDER BY "Nomor" ASC', [idUjian]);
  const isShuffleOption = ujian.Acak_Jawaban === true || ujian.Acak_Jawaban === 'true' || ujian.Acak_Jawaban === 1;
  const isShuffleQuestion = ujian.Acak_Soal === true || ujian.Acak_Soal === 'true' || ujian.Acak_Soal === 1 || ujian.Acak_Soal === undefined;

  let soalUntukPeserta = soalRes.rows.map((s) => {
    const clone = { ...s };
    delete clone.Jawaban_Benar;
    if (isShuffleOption) {
      const perm = getDeterministicOptionPermutation(idPeserta + '_' + s.ID_Soal);
      clone.Pilihan_A = s['Pilihan_' + perm[0]] || '';
      clone.Pilihan_B = s['Pilihan_' + perm[1]] || '';
      clone.Pilihan_C = s['Pilihan_' + perm[2]] || '';
      clone.Pilihan_D = s['Pilihan_' + perm[3]] || '';
    }
    return clone;
  });

  // ── PROTEKSI 2: Deterministic Question Shuffling with Passage & Section Cohesion ──
  if (isShuffleQuestion && soalUntukPeserta.length > 1) {
    const sections = {};
    for (const q of soalUntukPeserta) {
      const s = q.Sesi || 'Umum';
      if (!sections[s]) sections[s] = [];
      sections[s].push(q);
    }

    // Seksi canonical TOEFL: Listening -> Grammar/Structure -> Reading
    const sectionCanonicalOrder = [
      'Listening',
      'Listening Comprehension',
      'Grammar',
      'Structure',
      'Grammar-Structure',
      'Structure & Written Expression',
      'Reading',
      'Reading Comprehension'
    ];

    const sortedSectionKeys = Object.keys(sections).sort((a, b) => {
      const ia = sectionCanonicalOrder.indexOf(a);
      const ib = sectionCanonicalOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    const orderedAndShuffled = [];
    for (const sKey of sortedSectionKeys) {
      const list = sections[sKey];
      const clusters = [];
      let currentPassageCluster = null;

      for (const q of list) {
        const pText = (q.Passage_Teks || '').trim();
        if (pText) {
          if (currentPassageCluster && currentPassageCluster.key === pText) {
            currentPassageCluster.items.push(q);
          } else {
            currentPassageCluster = { key: pText, items: [q] };
            clusters.push(currentPassageCluster);
          }
        } else {
          currentPassageCluster = null;
          clusters.push({ key: q.ID_Soal, items: [q] });
        }
      }

      // Pengacakan cluster secara deterministik per peserta dan per seksi
      const shuffledClusters = deterministicShuffle(clusters, `${idPeserta}_${idUjian}_${sKey}`);
      shuffledClusters.forEach((c) => {
        c.items.forEach((item) => orderedAndShuffled.push(item));
      });
    }

    // Re-assign nomor urut 1..N agar bersih bagi peserta di layar
    soalUntukPeserta = orderedAndShuffled.map((item, idx) => ({
      ...item,
      Nomor: idx + 1
    }));
  }

  const existingInProgress = await queryOne(
    `SELECT * FROM hasil_ujian WHERE "ID_Peserta" = $1 AND "ID_Ujian" = $2 AND "Status" = 'Sedang Berjalan'`,
    [idPeserta, idUjian]
  );

  let sessionStartISO;
  let isResumed = false;

  if (existingInProgress && existingInProgress.Waktu_Mulai) {
    sessionStartISO = new Date(existingInProgress.Waktu_Mulai).toISOString();
    isResumed = true;
  } else {
    sessionStartISO = now.toISOString();
    const idHasilTemp = generateId('HSL');
    await query(
      `INSERT INTO hasil_ujian ("ID_Hasil", "ID_Peserta", "Nama_Peserta", "ID_Ujian", "Jawaban_JSON", "Skor_Listening", "Skor_Grammar", "Skor_Reading", "Skor_Total", "Status_Lulus", "Waktu_Mulai", "Status")
       VALUES ($1, $2, $3, $4, '{}', 0, 0, 0, 0, 'Sedang Berjalan', $5, 'Sedang Berjalan')`,
      [idHasilTemp, idPeserta, peserta.Nama || '', idUjian, sessionStartISO]
    );
  }

  await logActivity('Peserta', peserta.Nama || idPeserta, isResumed ? 'Lanjutkan Ujian (Resume)' : 'Mulai Ujian', idUjian);
  return createResponse(true, { ujian, soal: soalUntukPeserta, waktuMulaiServer: sessionStartISO, isResumed }, 'OK');
}

async function submitExamAnswers(idPeserta, namaPeserta, idUjian, jawabanObj, waktuMulaiISO) {
  const existingFinal = await queryOne(
    `SELECT * FROM hasil_ujian WHERE "ID_Peserta" = $1 AND "ID_Ujian" = $2 AND "Status" = 'Selesai'`,
    [idPeserta, idUjian]
  );
  if (existingFinal) return createResponse(false, null, 'Ujian ini sudah pernah dikirim sebelumnya.');

  const ujian = await queryOne('SELECT * FROM ujian WHERE "ID_Ujian" = $1', [idUjian]);
  if (!ujian) return createResponse(false, null, 'Ujian tidak ditemukan.');

  const inProgress = await queryOne(
    `SELECT * FROM hasil_ujian WHERE "ID_Peserta" = $1 AND "ID_Ujian" = $2 AND "Status" = 'Sedang Berjalan'`,
    [idPeserta, idUjian]
  );

  const waktuMulaiOtentik = inProgress?.Waktu_Mulai ? inProgress.Waktu_Mulai : (waktuMulaiISO || new Date());
  const now = new Date();
  const durasiMenit = Number(ujian.Durasi_Menit) || 60;
  const durasiMs = durasiMenit * 60 * 1000;
  const bufferMs = 3 * 60 * 1000; // Toleransi latensi jaringan 3 menit
  const elapsedMs = now.getTime() - new Date(waktuMulaiOtentik).getTime();
  const melebihiBatasToleransi = elapsedMs > durasiMs + bufferMs;

  // ── PROTEKSI 3: Strict Server-Side Hard Cutoff ──
  if (melebihiBatasToleransi) {
    const elapsedMenit = Math.round(elapsedMs / 60000);
    // Catat diskualifikasi ke database hasil_ujian
    if (inProgress) {
      await query(
        `UPDATE hasil_ujian
         SET "Nama_Peserta" = $1, "Jawaban_JSON" = $2, "Skor_Listening" = 0, "Skor_Grammar" = 0, "Skor_Reading" = 0,
             "Skor_Total" = 0, "Status_Lulus" = 'Didiskualifikasi (Waktu Kedaluwarsa)', "Waktu_Selesai" = NOW(), "Status" = 'Selesai'
         WHERE "ID_Hasil" = $3`,
        [namaPeserta, JSON.stringify(jawabanObj || {}), inProgress.ID_Hasil]
      );
    } else {
      const idHasilDis = generateId('HSL');
      await query(
        `INSERT INTO hasil_ujian ("ID_Hasil", "ID_Peserta", "Nama_Peserta", "ID_Ujian", "Jawaban_JSON", "Skor_Listening", "Skor_Grammar", "Skor_Reading", "Skor_Total", "Status_Lulus", "Waktu_Mulai", "Waktu_Selesai", "Status")
         VALUES ($1, $2, $3, $4, $5, 0, 0, 0, 0, 'Didiskualifikasi (Waktu Kedaluwarsa)', $6, NOW(), 'Selesai')`,
        [idHasilDis, idPeserta, namaPeserta, idUjian, JSON.stringify(jawabanObj || {}), waktuMulaiOtentik]
      );
    }

    // Kunci kode akses & bersihkan token perangkat aktif
    await query(`UPDATE peserta SET "Status_Kode" = 'Used', "Active_Token" = NULL WHERE "ID_Peserta" = $1`, [idPeserta]);

    await logActivity(
      'Sistem',
      namaPeserta,
      'Didiskualifikasi (Waktu Kedaluwarsa)',
      `Ujian: ${idUjian} — Pengerjaan melampaui batas: ${elapsedMenit} menit dari alokasi ${durasiMenit} menit`
    );

    return createResponse(
      false,
      {
        disqualified: true,
        durasiMenit,
        elapsedMenit,
        statusLulus: 'Didiskualifikasi (Waktu Kedaluwarsa)'
      },
      `⚠️ Batas waktu pengerjaan telah berakhir dan melampaui toleransi server (${elapsedMenit} menit dari alokasi ${durasiMenit} menit). Ujian otomatis didiskualifikasi.`
    );
  }

  const soalRes = await query('SELECT * FROM soal WHERE "ID_Ujian" = $1', [idUjian]);
  const isShuffleOption = ujian.Acak_Jawaban === true || ujian.Acak_Jawaban === 'true' || ujian.Acak_Jawaban === 1;

  const skorSesi = { Listening: 0, Grammar: 0, Reading: 0 };
  const maxSesi = { Listening: 0, Grammar: 0, Reading: 0 };

  soalRes.rows.forEach((s) => {
    const poin = Number(s.Poin) || 1;
    const sesiRaw = String(s.Sesi || '').trim();
    const sesiKey = ['Grammar-Structure', 'Grammar', 'Structure'].includes(sesiRaw)
      ? 'Grammar'
      : sesiRaw === 'Reading'
      ? 'Reading'
      : 'Listening';
    maxSesi[sesiKey] += poin;

    let jwb = jawabanObj ? jawabanObj[s.ID_Soal] : null;
    if (jwb && isShuffleOption) {
      const perm = getDeterministicOptionPermutation(idPeserta + '_' + s.ID_Soal);
      const chosenIdx = ['A', 'B', 'C', 'D'].indexOf(String(jwb).toUpperCase());
      if (chosenIdx > -1) {
        jwb = perm[chosenIdx];
      }
    }

    if (jwb && String(jwb).toUpperCase() === String(s.Jawaban_Benar).toUpperCase()) {
      skorSesi[sesiKey] += poin;
    }
  });

  const scaledListening = calculateToeflSectionScaled(skorSesi.Listening, maxSesi.Listening, 'Listening');
  const scaledGrammar = calculateToeflSectionScaled(skorSesi.Grammar, maxSesi.Grammar, 'Grammar');
  const scaledReading = calculateToeflSectionScaled(skorSesi.Reading, maxSesi.Reading, 'Reading');
  let skorTotal = Math.round(((scaledListening + scaledGrammar + scaledReading) * 10) / 3);

  const settingsRows = await query('SELECT * FROM pengaturan_sistem');
  const settingsMap = {};
  settingsRows.rows.forEach((r) => (settingsMap[r.Key] = r.Value));
  const skalaMin = Number(settingsMap.skalaMin) || 310;
  const skalaMax = Number(settingsMap.skalaMax) || 677;

  if (skalaMin !== 310 || skalaMax !== 677) {
    const norm = (skorTotal - 310) / (677 - 310);
    skorTotal = Math.round(skalaMin + norm * (skalaMax - skalaMin));
  }

  const passingScore = Number(ujian.Passing_Score) || 500;
  const statusLulus = skorTotal >= passingScore ? 'Lulus' : 'Tidak Lulus';

  if (inProgress) {
    await query(
      `UPDATE hasil_ujian
       SET "Nama_Peserta" = $1, "Jawaban_JSON" = $2, "Skor_Listening" = $3, "Skor_Grammar" = $4, "Skor_Reading" = $5,
           "Skor_Total" = $6, "Status_Lulus" = $7, "Waktu_Selesai" = NOW(), "Status" = 'Selesai'
       WHERE "ID_Hasil" = $8`,
      [namaPeserta, JSON.stringify(jawabanObj || {}), skorSesi.Listening, skorSesi.Grammar, skorSesi.Reading, skorTotal, statusLulus, inProgress.ID_Hasil]
    );
  } else {
    const idHasil = generateId('HSL');
    await query(
      `INSERT INTO hasil_ujian ("ID_Hasil", "ID_Peserta", "Nama_Peserta", "ID_Ujian", "Jawaban_JSON", "Skor_Listening", "Skor_Grammar", "Skor_Reading", "Skor_Total", "Status_Lulus", "Waktu_Mulai", "Waktu_Selesai", "Status")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), 'Selesai')`,
      [idHasil, idPeserta, namaPeserta, idUjian, JSON.stringify(jawabanObj || {}), skorSesi.Listening, skorSesi.Grammar, skorSesi.Reading, skorTotal, statusLulus, waktuMulaiOtentik]
    );
  }

  // Tandai kode akses terpakai & bebaskan kunci perangkat
  await query(`UPDATE peserta SET "Status_Kode" = 'Used', "Active_Token" = NULL WHERE "ID_Peserta" = $1`, [idPeserta]);

  await logActivity(
    'Peserta',
    namaPeserta,
    'Submit Final',
    `${idUjian} — Skor Total: ${skorTotal} (L:${scaledListening}, G:${scaledGrammar}, R:${scaledReading})${
      elapsedMs > durasiMs ? ' — (Diterima dalam grace period toleransi)' : ''
    }`
  );

  return createResponse(
    true,
    {
      skorTotal,
      statusLulus,
      skorListening: skorSesi.Listening,
      skorGrammar: skorSesi.Grammar,
      skorReading: skorSesi.Reading,
      scaledListening,
      scaledGrammar,
      scaledReading,
      maxListening: maxSesi.Listening,
      maxGrammar: maxSesi.Grammar,
      maxReading: maxSesi.Reading,
      passingScore,
      skalaMax
    },
    'Ujian berhasil dikirim.'
  );
}

// ────────────────────────────────────────────────────────────
// 4. DOSEN — UJIAN & BANK SOAL
// ────────────────────────────────────────────────────────────
async function getExamsByLecturer(idDosen) {
  let sql = 'SELECT * FROM ujian';
  const params = [];
  if (idDosen && idDosen !== 'ADMIN') {
    sql += ' WHERE "ID_Dosen_Pembuat" = $1';
    params.push(idDosen);
  }
  sql += ' ORDER BY "Tanggal_Buka" DESC NULLS LAST';

  const examsRes = await query(sql, params);
  const soalRes = await query('SELECT "ID_Ujian", "Sesi" FROM soal');
  const hasilRes = await query(`SELECT "ID_Ujian" FROM hasil_ujian WHERE "Status" = 'Selesai'`);

  const enriched = examsRes.rows.map((u) => {
    const soalUjian = soalRes.rows.filter((s) => s.ID_Ujian === u.ID_Ujian);
    const sesiSet = new Set(soalUjian.map((s) => s.Sesi));
    const selesai = hasilRes.rows.filter((h) => h.ID_Ujian === u.ID_Ujian).length;
    return {
      ...u,
      jumlahSoal: soalUjian.length,
      jumlahSesi: sesiSet.size,
      pesertaSelesai: selesai
    };
  });

  return createResponse(true, enriched, 'OK');
}

async function createExam(examObj) {
  examObj.ID_Ujian = generateId('UJN');
  examObj.Kode_Ujian = examObj.ID_Ujian;
  examObj.Status = examObj.Status || 'Draft';

  await query(
    `INSERT INTO ujian ("ID_Ujian", "Kode_Ujian", "Nama_Ujian", "Deskripsi", "ID_Dosen_Pembuat", "Durasi_Menit", "Passing_Score", "Tanggal_Buka", "Tanggal_Tutup", "Status", "Acak_Jawaban", "Kunci_Setelah_Submit", "Acak_Soal")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      examObj.ID_Ujian,
      examObj.Kode_Ujian,
      examObj.Nama_Ujian,
      examObj.Deskripsi || '',
      examObj.ID_Dosen_Pembuat || 'ADMIN',
      Number(examObj.Durasi_Menit) || 115,
      Number(examObj.Passing_Score) || 500,
      examObj.Tanggal_Buka || null,
      examObj.Tanggal_Tutup || null,
      examObj.Status,
      Boolean(examObj.Acak_Jawaban),
      examObj.Kunci_Setelah_Submit !== undefined ? Boolean(examObj.Kunci_Setelah_Submit) : true,
      examObj.Acak_Soal !== undefined ? Boolean(examObj.Acak_Soal) : true
    ]
  );

  await logActivity('Dosen Penguji', examObj.ID_Dosen_Pembuat || 'ADMIN', 'Buat Ujian Baru', examObj.Nama_Ujian);
  return createResponse(true, examObj, 'Ujian berhasil dibuat.');
}

async function updateExam(examObj) {
  if (!examObj || !examObj.ID_Ujian) return createResponse(false, null, 'ID_Ujian wajib disertakan.');

  await query(
    `UPDATE ujian
     SET "Nama_Ujian" = COALESCE($1, "Nama_Ujian"),
         "Deskripsi" = COALESCE($2, "Deskripsi"),
         "Durasi_Menit" = COALESCE($3, "Durasi_Menit"),
         "Passing_Score" = COALESCE($4, "Passing_Score"),
         "Tanggal_Buka" = COALESCE($5, "Tanggal_Buka"),
         "Tanggal_Tutup" = COALESCE($6, "Tanggal_Tutup"),
         "Status" = COALESCE($7, "Status"),
         "Acak_Jawaban" = COALESCE($8, "Acak_Jawaban"),
         "Kunci_Setelah_Submit" = COALESCE($9, "Kunci_Setelah_Submit"),
         "Acak_Soal" = COALESCE($10, "Acak_Soal")
     WHERE "ID_Ujian" = $11`,
    [
      examObj.Nama_Ujian,
      examObj.Deskripsi,
      examObj.Durasi_Menit !== undefined ? Number(examObj.Durasi_Menit) : null,
      examObj.Passing_Score !== undefined ? Number(examObj.Passing_Score) : null,
      examObj.Tanggal_Buka,
      examObj.Tanggal_Tutup,
      examObj.Status,
      examObj.Acak_Jawaban !== undefined ? Boolean(examObj.Acak_Jawaban) : null,
      examObj.Kunci_Setelah_Submit !== undefined ? Boolean(examObj.Kunci_Setelah_Submit) : null,
      examObj.Acak_Soal !== undefined ? Boolean(examObj.Acak_Soal) : null,
      examObj.ID_Ujian
    ]
  );

  return createResponse(true, examObj, 'Ujian berhasil diperbarui.');
}

async function importQuestionsBatch(idUjian, questionsArray) {
  const results = { success: 0, errors: [] };
  if (!Array.isArray(questionsArray)) return createResponse(false, results, 'Data soal tidak valid.');

  const existingRes = await query('SELECT "Nomor" FROM soal WHERE "ID_Ujian" = $1', [idUjian]);
  const existingNumbers = existingRes.rows.map((r) => Number(r.Nomor) || 0);
  let nextNomor = existingNumbers.length ? Math.max(...existingNumbers) + 1 : 1;

  for (let idx = 0; idx < questionsArray.length; idx++) {
    const q = questionsArray[idx];
    const rowNum = idx + 1;
    if (!q.Sesi || !q.Pertanyaan || !q.Jawaban_Benar) {
      results.errors.push({ row: rowNum, message: 'Kolom Sesi/Pertanyaan/Jawaban_Benar wajib diisi.' });
      continue;
    }
    const answerKey = String(q.Jawaban_Benar).toUpperCase().trim();
    if (!['A', 'B', 'C', 'D'].includes(answerKey)) {
      results.errors.push({ row: rowNum, message: 'Jawaban_Benar harus A, B, C, atau D.' });
      continue;
    }

    const idSoal = generateId('SOL');
    await query(
      `INSERT INTO soal ("ID_Soal", "ID_Ujian", "Sesi", "Nomor", "Pertanyaan", "Passage_Teks", "Link_Audio", "Pilihan_A", "Pilihan_B", "Pilihan_C", "Pilihan_D", "Jawaban_Benar", "Poin")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        idSoal,
        idUjian,
        q.Sesi,
        q.Nomor !== undefined ? Number(q.Nomor) : nextNomor++,
        q.Pertanyaan,
        q.Passage_Teks || '',
        q.Link_Audio || '',
        q.Pilihan_A || '',
        q.Pilihan_B || '',
        q.Pilihan_C || '',
        q.Pilihan_D || '',
        answerKey,
        Number(q.Poin) || 1
      ]
    );
    results.success++;
  }

  await logActivity('Dosen Penguji', idUjian, 'Import Soal CSV', `${results.success} soal berhasil, ${results.errors.length} error`);
  return createResponse(true, results, 'Import selesai.');
}

async function getQuestionsByExam(idUjian) {
  const { rows } = await query('SELECT * FROM soal WHERE "ID_Ujian" = $1 ORDER BY "Nomor" ASC', [idUjian]);
  return createResponse(true, rows, 'OK');
}

async function deleteQuestion(idSoal) {
  await query('DELETE FROM soal WHERE "ID_Soal" = $1', [idSoal]);
  return createResponse(true, null, 'Soal berhasil dihapus.');
}

async function updateQuestion(soalObj) {
  if (!soalObj || !soalObj.ID_Soal) return createResponse(false, null, 'ID_Soal wajib disertakan.');
  const answerKey = String(soalObj.Jawaban_Benar || '').toUpperCase().trim();
  if (!['A', 'B', 'C', 'D'].includes(answerKey)) {
    return createResponse(false, null, 'Jawaban_Benar harus A, B, C, atau D.');
  }

  await query(
    `UPDATE soal
     SET "Sesi" = $1, "Pertanyaan" = $2, "Passage_Teks" = $3, "Link_Audio" = $4,
         "Pilihan_A" = $5, "Pilihan_B" = $6, "Pilihan_C" = $7, "Pilihan_D" = $8,
         "Jawaban_Benar" = $9, "Poin" = $10
     WHERE "ID_Soal" = $11`,
    [
      soalObj.Sesi,
      soalObj.Pertanyaan,
      soalObj.Passage_Teks || '',
      soalObj.Link_Audio || '',
      soalObj.Pilihan_A || '',
      soalObj.Pilihan_B || '',
      soalObj.Pilihan_C || '',
      soalObj.Pilihan_D || '',
      answerKey,
      Number(soalObj.Poin) || 1,
      soalObj.ID_Soal
    ]
  );

  return createResponse(true, soalObj, 'Soal berhasil diperbarui.');
}

async function addSingleQuestion(idUjian, soalObj) {
  if (!soalObj.Sesi || !soalObj.Pertanyaan || !soalObj.Jawaban_Benar) {
    return createResponse(false, null, 'Kolom Sesi, Pertanyaan, dan Jawaban_Benar wajib diisi.');
  }
  const answerKey = String(soalObj.Jawaban_Benar).toUpperCase().trim();
  if (!['A', 'B', 'C', 'D'].includes(answerKey)) {
    return createResponse(false, null, 'Jawaban_Benar harus A, B, C, atau D.');
  }

  const existingRes = await query('SELECT "Nomor" FROM soal WHERE "ID_Ujian" = $1', [idUjian]);
  const existingNumbers = existingRes.rows.map((r) => Number(r.Nomor) || 0);
  const nextNomor = existingNumbers.length ? Math.max(...existingNumbers) + 1 : 1;

  const idSoal = generateId('SOL');
  const record = {
    ID_Soal: idSoal,
    ID_Ujian: idUjian,
    Sesi: soalObj.Sesi,
    Nomor: nextNomor,
    Pertanyaan: soalObj.Pertanyaan,
    Passage_Teks: soalObj.Passage_Teks || '',
    Link_Audio: soalObj.Link_Audio || '',
    Pilihan_A: soalObj.Pilihan_A || '',
    Pilihan_B: soalObj.Pilihan_B || '',
    Pilihan_C: soalObj.Pilihan_C || '',
    Pilihan_D: soalObj.Pilihan_D || '',
    Jawaban_Benar: answerKey,
    Poin: Number(soalObj.Poin) || 1
  };

  await query(
    `INSERT INTO soal ("ID_Soal", "ID_Ujian", "Sesi", "Nomor", "Pertanyaan", "Passage_Teks", "Link_Audio", "Pilihan_A", "Pilihan_B", "Pilihan_C", "Pilihan_D", "Jawaban_Benar", "Poin")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [record.ID_Soal, record.ID_Ujian, record.Sesi, record.Nomor, record.Pertanyaan, record.Passage_Teks, record.Link_Audio, record.Pilihan_A, record.Pilihan_B, record.Pilihan_C, record.Pilihan_D, record.Jawaban_Benar, record.Poin]
  );

  await logActivity('Dosen Penguji', idUjian, 'Tambah Soal Manual', idSoal);
  return createResponse(true, record, 'Soal berhasil ditambahkan.');
}

async function getExamResultsForLecturer(idUjian) {
  const { rows } = await query(
    `SELECT "ID_Hasil", "ID_Peserta", "Nama_Peserta", "ID_Ujian", "Skor_Listening", "Skor_Grammar", "Skor_Reading", "Skor_Total", "Status_Lulus", "Waktu_Mulai", "Waktu_Selesai", "Status"
     FROM hasil_ujian
     WHERE "ID_Ujian" = $1 AND "Status" = 'Selesai'
     ORDER BY "Skor_Total" DESC`,
    [idUjian]
  );
  return createResponse(true, rows, 'OK');
}

async function getItemAnalysis(idUjian) {
  const soalRes = await query('SELECT * FROM soal WHERE "ID_Ujian" = $1 ORDER BY "Nomor" ASC', [idUjian]);
  const hasilRes = await query(`SELECT * FROM hasil_ujian WHERE "ID_Ujian" = $1 AND "Status" = 'Selesai' ORDER BY "Skor_Total" DESC`, [idUjian]);
  const hasilSelesai = hasilRes.rows;

  if (!hasilSelesai.length) {
    return createResponse(true, { totalPeserta: 0, items: [] }, 'Belum ada peserta yang menyelesaikan ujian ini.');
  }

  const nTotal = hasilSelesai.length;
  const nGroup = Math.max(1, Math.round(nTotal * 0.27));
  const upperGroup = hasilSelesai.slice(0, nGroup);
  const lowerGroup = hasilSelesai.slice(-nGroup);

  const parseAnswers = (list) =>
    list.map((h) => {
      try {
        return typeof h.Jawaban_JSON === 'string' ? JSON.parse(h.Jawaban_JSON || '{}') : h.Jawaban_JSON || {};
      } catch (e) {
        return {};
      }
    });

  const upperAnswers = parseAnswers(upperGroup);
  const lowerAnswers = parseAnswers(lowerGroup);
  const allAnswers = parseAnswers(hasilSelesai);

  const ujian = await queryOne('SELECT * FROM ujian WHERE "ID_Ujian" = $1', [idUjian]);
  const isShuffleOption = ujian && (ujian.Acak_Jawaban === true || ujian.Acak_Jawaban === 'true' || ujian.Acak_Jawaban === 1);

  const items = soalRes.rows.map((s) => {
    const distribusi = { A: 0, B: 0, C: 0, D: 0, Kosong: 0 };
    let jumlahBenar = 0;
    let upperBenar = 0;
    let lowerBenar = 0;

    allAnswers.forEach((jwbMap, idx) => {
      let jwb = jwbMap[s.ID_Soal];
      if (!jwb) {
        distribusi.Kosong++;
        return;
      }
      if (isShuffleOption) {
        const perm = getDeterministicOptionPermutation(hasilSelesai[idx].ID_Peserta + '_' + s.ID_Soal);
        const chosenIdx = ['A', 'B', 'C', 'D'].indexOf(String(jwb).toUpperCase());
        if (chosenIdx > -1) jwb = perm[chosenIdx];
      }
      const letter = String(jwb).toUpperCase();
      if (distribusi[letter] !== undefined) distribusi[letter]++;
      if (letter === String(s.Jawaban_Benar).toUpperCase()) jumlahBenar++;
    });

    upperAnswers.forEach((jwbMap, idx) => {
      let jwb = jwbMap[s.ID_Soal];
      if (!jwb) return;
      if (isShuffleOption) {
        const perm = getDeterministicOptionPermutation(upperGroup[idx].ID_Peserta + '_' + s.ID_Soal);
        const cIdx = ['A', 'B', 'C', 'D'].indexOf(String(jwb).toUpperCase());
        if (cIdx > -1) jwb = perm[cIdx];
      }
      if (String(jwb).toUpperCase() === String(s.Jawaban_Benar).toUpperCase()) upperBenar++;
    });

    lowerAnswers.forEach((jwbMap, idx) => {
      let jwb = jwbMap[s.ID_Soal];
      if (!jwb) return;
      if (isShuffleOption) {
        const perm = getDeterministicOptionPermutation(lowerGroup[idx].ID_Peserta + '_' + s.ID_Soal);
        const cIdx = ['A', 'B', 'C', 'D'].indexOf(String(jwb).toUpperCase());
        if (cIdx > -1) jwb = perm[cIdx];
      }
      if (String(jwb).toUpperCase() === String(s.Jawaban_Benar).toUpperCase()) lowerBenar++;
    });

    const persentaseBenar = nTotal > 0 ? Math.round((jumlahBenar / nTotal) * 100) : 0;
    let tingkatKesulitan = 'Sedang';
    if (persentaseBenar >= 80) tingkatKesulitan = 'Mudah';
    else if (persentaseBenar < 40) tingkatKesulitan = 'Sulit';

    const dayaPembedaVal = nGroup > 0 ? Number(((upperBenar - lowerBenar) / nGroup).toFixed(2)) : 0;
    let dayaPembedaKategori = 'Cukup';
    if (dayaPembedaVal >= 0.4) dayaPembedaKategori = 'Sangat Baik';
    else if (dayaPembedaVal >= 0.3) dayaPembedaKategori = 'Baik';
    else if (dayaPembedaVal < 0.2) dayaPembedaKategori = 'Jelek (Revisi/Dibuang)';

    return {
      ID_Soal: s.ID_Soal,
      Nomor: s.Nomor,
      Sesi: s.Sesi,
      Pertanyaan: s.Pertanyaan,
      Jawaban_Benar: s.Jawaban_Benar,
      jumlahBenar,
      totalJawab: nTotal,
      persentaseBenar,
      tingkatKesulitan,
      dayaPembedaVal,
      dayaPembedaKategori,
      distribusi
    };
  });

  return createResponse(true, { totalPeserta: nTotal, items }, 'OK');
}

// ────────────────────────────────────────────────────────────
// 5. BANK SOAL
// ────────────────────────────────────────────────────────────
async function getBankSoalList(filters) {
  let sql = 'SELECT * FROM bank_soal WHERE 1=1';
  const params = [];

  if (filters?.sesi) {
    params.push(filters.sesi);
    sql += ` AND "Sesi" = $${params.length}`;
  }
  if (filters?.topik) {
    params.push(filters.topik);
    sql += ` AND "Topik" = $${params.length}`;
  }
  if (filters?.level) {
    params.push(filters.level);
    sql += ` AND "Level_Kesulitan" = $${params.length}`;
  }

  sql += ' ORDER BY "Tanggal_Dibuat" DESC';
  const { rows } = await query(sql, params);
  return createResponse(true, rows, 'OK');
}

async function getBankSoalTopics() {
  const { rows } = await query('SELECT DISTINCT "Topik" FROM bank_soal WHERE "Topik" IS NOT NULL AND "Topik" != \'\' ORDER BY "Topik" ASC');
  return createResponse(true, rows.map((r) => r.Topik), 'OK');
}

async function addBankSoal(soalObj, idDosen) {
  if (!soalObj.Sesi || !soalObj.Pertanyaan || !soalObj.Jawaban_Benar) {
    return createResponse(false, null, 'Kolom Sesi, Pertanyaan, dan Jawaban_Benar wajib diisi.');
  }
  const answerKey = String(soalObj.Jawaban_Benar).toUpperCase().trim();
  if (!['A', 'B', 'C', 'D'].includes(answerKey)) {
    return createResponse(false, null, 'Jawaban_Benar harus A, B, C, atau D.');
  }

  const record = {
    ID_Bank: generateId('BNK'),
    Sesi: soalObj.Sesi,
    Topik: soalObj.Topik || 'Umum',
    Level_Kesulitan: soalObj.Level_Kesulitan || 'Sedang',
    Pertanyaan: soalObj.Pertanyaan,
    Passage_Teks: soalObj.Passage_Teks || '',
    Link_Audio: soalObj.Link_Audio || '',
    Pilihan_A: soalObj.Pilihan_A || '',
    Pilihan_B: soalObj.Pilihan_B || '',
    Pilihan_C: soalObj.Pilihan_C || '',
    Pilihan_D: soalObj.Pilihan_D || '',
    Jawaban_Benar: answerKey,
    Poin: Number(soalObj.Poin) || 1,
    ID_Dosen_Pembuat: idDosen || 'ADMIN'
  };

  await query(
    `INSERT INTO bank_soal ("ID_Bank", "Sesi", "Topik", "Level_Kesulitan", "Pertanyaan", "Passage_Teks", "Link_Audio", "Pilihan_A", "Pilihan_B", "Pilihan_C", "Pilihan_D", "Jawaban_Benar", "Poin", "ID_Dosen_Pembuat", "Tanggal_Dibuat")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
    [record.ID_Bank, record.Sesi, record.Topik, record.Level_Kesulitan, record.Pertanyaan, record.Passage_Teks, record.Link_Audio, record.Pilihan_A, record.Pilihan_B, record.Pilihan_C, record.Pilihan_D, record.Jawaban_Benar, record.Poin, record.ID_Dosen_Pembuat]
  );

  await logActivity('Dosen Penguji', idDosen || 'ADMIN', 'Tambah Soal ke Bank Soal', record.ID_Bank);
  return createResponse(true, record, 'Soal berhasil ditambahkan ke Bank Soal.');
}

async function updateBankSoal(soalObj) {
  if (!soalObj || !soalObj.ID_Bank) return createResponse(false, null, 'ID_Bank wajib disertakan.');
  let answerKey = soalObj.Jawaban_Benar ? String(soalObj.Jawaban_Benar).toUpperCase().trim() : null;
  if (answerKey && !['A', 'B', 'C', 'D'].includes(answerKey)) {
    return createResponse(false, null, 'Jawaban_Benar harus A, B, C, atau D.');
  }

  await query(
    `UPDATE bank_soal
     SET "Sesi" = COALESCE($1, "Sesi"),
         "Topik" = COALESCE($2, "Topik"),
         "Level_Kesulitan" = COALESCE($3, "Level_Kesulitan"),
         "Pertanyaan" = COALESCE($4, "Pertanyaan"),
         "Passage_Teks" = COALESCE($5, "Passage_Teks"),
         "Link_Audio" = COALESCE($6, "Link_Audio"),
         "Pilihan_A" = COALESCE($7, "Pilihan_A"),
         "Pilihan_B" = COALESCE($8, "Pilihan_B"),
         "Pilihan_C" = COALESCE($9, "Pilihan_C"),
         "Pilihan_D" = COALESCE($10, "Pilihan_D"),
         "Jawaban_Benar" = COALESCE($11, "Jawaban_Benar"),
         "Poin" = COALESCE($12, "Poin")
     WHERE "ID_Bank" = $13`,
    [
      soalObj.Sesi,
      soalObj.Topik,
      soalObj.Level_Kesulitan,
      soalObj.Pertanyaan,
      soalObj.Passage_Teks,
      soalObj.Link_Audio,
      soalObj.Pilihan_A,
      soalObj.Pilihan_B,
      soalObj.Pilihan_C,
      soalObj.Pilihan_D,
      answerKey,
      soalObj.Poin !== undefined ? Number(soalObj.Poin) : null,
      soalObj.ID_Bank
    ]
  );

  return createResponse(true, soalObj, 'Soal bank berhasil diperbarui.');
}

async function deleteBankSoal(idBank) {
  await query('DELETE FROM bank_soal WHERE "ID_Bank" = $1', [idBank]);
  return createResponse(true, null, 'Soal berhasil dihapus dari Bank Soal.');
}

async function importBankSoalBatch(questionsArray, idDosen) {
  const results = { success: 0, errors: [] };
  if (!Array.isArray(questionsArray)) return createResponse(false, results, 'Data bank soal tidak valid.');

  for (let idx = 0; idx < questionsArray.length; idx++) {
    const q = questionsArray[idx];
    const rowNum = idx + 1;
    if (!q.Sesi || !q.Pertanyaan || !q.Jawaban_Benar) {
      results.errors.push({ row: rowNum, message: 'Kolom Sesi/Pertanyaan/Jawaban_Benar wajib diisi.' });
      continue;
    }
    const answerKey = String(q.Jawaban_Benar).toUpperCase().trim();
    if (!['A', 'B', 'C', 'D'].includes(answerKey)) {
      results.errors.push({ row: rowNum, message: 'Jawaban_Benar harus A, B, C, atau D.' });
      continue;
    }

    const idBank = generateId('BNK');
    await query(
      `INSERT INTO bank_soal ("ID_Bank", "Sesi", "Topik", "Level_Kesulitan", "Pertanyaan", "Passage_Teks", "Link_Audio", "Pilihan_A", "Pilihan_B", "Pilihan_C", "Pilihan_D", "Jawaban_Benar", "Poin", "ID_Dosen_Pembuat", "Tanggal_Dibuat")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
      [
        idBank,
        q.Sesi,
        q.Topik || 'Umum',
        q.Level_Kesulitan || 'Sedang',
        q.Pertanyaan,
        q.Passage_Teks || '',
        q.Link_Audio || '',
        q.Pilihan_A || '',
        q.Pilihan_B || '',
        q.Pilihan_C || '',
        q.Pilihan_D || '',
        answerKey,
        Number(q.Poin) || 1,
        idDosen || 'ADMIN'
      ]
    );
    results.success++;
  }

  await logActivity('Dosen Penguji', idDosen || 'ADMIN', 'Import Bank Soal CSV', `${results.success} soal berhasil, ${results.errors.length} error`);
  return createResponse(true, results, 'Import ke Bank Soal selesai.');
}

async function pullFromBankToExam(idUjian, idBankList) {
  if (!Array.isArray(idBankList) || !idBankList.length) {
    return createResponse(false, null, 'Tidak ada soal bank yang dipilih.');
  }

  const { rows: bankList } = await query(`SELECT * FROM bank_soal WHERE "ID_Bank" = ANY($1)`, [idBankList]);
  if (!bankList.length) return createResponse(false, null, 'Tidak ada soal bank yang ditemukan untuk ditarik.');

  const existingRes = await query('SELECT "Nomor" FROM soal WHERE "ID_Ujian" = $1', [idUjian]);
  const existingNumbers = existingRes.rows.map((r) => Number(r.Nomor) || 0);
  let nextNomor = existingNumbers.length ? Math.max(...existingNumbers) + 1 : 1;

  for (const b of bankList) {
    const idSoal = generateId('SOL');
    await query(
      `INSERT INTO soal ("ID_Soal", "ID_Ujian", "Sesi", "Nomor", "Pertanyaan", "Passage_Teks", "Link_Audio", "Pilihan_A", "Pilihan_B", "Pilihan_C", "Pilihan_D", "Jawaban_Benar", "Poin", "ID_Bank_Asal")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        idSoal,
        idUjian,
        b.Sesi,
        nextNomor++,
        b.Pertanyaan,
        b.Passage_Teks || '',
        b.Link_Audio || '',
        b.Pilihan_A || '',
        b.Pilihan_B || '',
        b.Pilihan_C || '',
        b.Pilihan_D || '',
        b.Jawaban_Benar,
        b.Poin || 1,
        b.ID_Bank
      ]
    );
  }

  await logActivity('Dosen Penguji', idUjian, 'Tarik Soal dari Bank (Manual)', `${bankList.length} soal`);
  return createResponse(true, { jumlah: bankList.length }, `${bankList.length} soal berhasil ditarik dari Bank Soal.`);
}

async function pullRandomFromBank(idUjian, criteria) {
  let sql = 'SELECT "ID_Bank" FROM bank_soal WHERE 1=1';
  const params = [];

  if (criteria?.sesi) {
    params.push(criteria.sesi);
    sql += ` AND "Sesi" = $${params.length}`;
  }
  if (criteria?.topik) {
    params.push(criteria.topik);
    sql += ` AND "Topik" = $${params.length}`;
  }
  if (criteria?.level) {
    params.push(criteria.level);
    sql += ` AND "Level_Kesulitan" = $${params.length}`;
  }

  const jumlah = Number(criteria?.jumlah) || 0;
  sql += ` ORDER BY RANDOM() LIMIT ${jumlah > 0 ? jumlah : 10}`;

  const { rows } = await query(sql, params);
  if (!rows.length) return createResponse(false, null, 'Tidak ada soal yang cocok dengan kriteria di Bank Soal.');

  const idBankList = rows.map((r) => r.ID_Bank);
  return pullFromBankToExam(idUjian, idBankList);
}

// ────────────────────────────────────────────────────────────
// 6. ADMIN — MANAJEMEN DOSEN
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
async function getAllExamsAdmin() {
  const examsRes = await query('SELECT * FROM ujian ORDER BY "Tanggal_Buka" DESC NULLS LAST');
  const dosenRes = await query('SELECT "ID_Dosen", "Nama" FROM dosen');
  const pesertaRes = await query('SELECT "ID_Ujian_Target" FROM peserta');
  const hasilRes = await query(`SELECT "ID_Ujian" FROM hasil_ujian WHERE "Status" = 'Selesai'`);
  const soalRes = await query('SELECT "ID_Ujian", "Sesi" FROM soal');

  const dosenMap = {};
  dosenRes.rows.forEach((d) => (dosenMap[d.ID_Dosen] = d.Nama));

  const enriched = examsRes.rows.map((u) => {
    const namaDosen = dosenMap[u.ID_Dosen_Pembuat] || (u.ID_Dosen_Pembuat === 'ADMIN' ? 'Admin (Dikelola Langsung)' : u.ID_Dosen_Pembuat);
    const totalPeserta = pesertaRes.rows.filter((p) => p.ID_Ujian_Target === u.ID_Ujian).length;
    const selesai = hasilRes.rows.filter((h) => h.ID_Ujian === u.ID_Ujian).length;
    const soalUjian = soalRes.rows.filter((s) => s.ID_Ujian === u.ID_Ujian);
    const sesiSet = new Set(soalUjian.map((s) => s.Sesi));

    return {
      ...u,
      namaDosen,
      totalPeserta,
      pesertaSelesai: selesai,
      jumlahSoal: soalUjian.length,
      jumlahSesi: sesiSet.size
    };
  });

  return createResponse(true, enriched, 'OK');
}

async function reassignExamLecturer(idUjian, idDosenBaru) {
  const finalVal = idDosenBaru && idDosenBaru.trim() !== '' ? idDosenBaru : 'ADMIN';
  await query(`UPDATE ujian SET "ID_Dosen_Pembuat" = $1 WHERE "ID_Ujian" = $2`, [finalVal, idUjian]);
  await logActivity('Administrator', 'Admin', 'Ubah Dosen Pengampu', `${idUjian} → ${finalVal}`);
  return createResponse(true, { ID_Dosen_Pembuat: finalVal }, 'Penugasan dosen berhasil diperbarui.');
}

async function getAdminDashboardData() {
  const pCount = await query('SELECT count(*) FROM peserta');
  const uCount = await query(`SELECT count(*) FROM ujian WHERE "Status" = 'Aktif'`);
  const hasilRes = await query(`SELECT "Skor_Total", "Status_Lulus" FROM hasil_ujian WHERE "Status" = 'Selesai'`);
  const logRes = await query('SELECT * FROM log_aktivitas ORDER BY "Timestamp" DESC LIMIT 8');

  const totalPeserta = parseInt(pCount.rows[0].count, 10);
  const ujianAktif = parseInt(uCount.rows[0].count, 10);
  const hasil = hasilRes.rows;

  const skorList = hasil.map((h) => Number(h.Skor_Total)).filter((n) => !isNaN(n));
  const rataRata = skorList.length ? Math.round(skorList.reduce((a, b) => a + b, 0) / skorList.length) : 0;
  const lulus = hasil.filter((h) => h.Status_Lulus === 'Lulus').length;
  const tingkatKelulusan = hasil.length ? ((lulus / hasil.length) * 100).toFixed(1) : '0.0';

  const bucketLabels = ['<420', '420-460', '461-500', '501-550', '551-600', '>600'];
  const bucketCounts = { '<420': 0, '420-460': 0, '461-500': 0, '501-550': 0, '551-600': 0, '>600': 0 };
  skorList.forEach((s) => {
    if (s < 420) bucketCounts['<420']++;
    else if (s <= 460) bucketCounts['420-460']++;
    else if (s <= 500) bucketCounts['461-500']++;
    else if (s <= 550) bucketCounts['501-550']++;
    else if (s <= 600) bucketCounts['551-600']++;
    else bucketCounts['>600']++;
  });
  const distribusi = bucketLabels.map((label) => ({ label, count: bucketCounts[label] }));

  // Metrik Live Penggunaan Database & Kuota Free Tier (PostgreSQL / Neon / Vercel)
  const dbUsage = {
    usedBytes: 0,
    usedMB: '0.00',
    maxMB: 512, // Standar Free Tier Neon / Vercel Postgres
    percentUsed: 0,
    statusText: 'Aman (<70%)',
    tableStats: []
  };

  try {
    const sizeRes = await query(`SELECT pg_database_size(current_database()) AS db_bytes`);
    if (sizeRes.rows.length) {
      const bytes = parseInt(sizeRes.rows[0].db_bytes, 10) || 0;
      const mb = bytes / (1024 * 1024);
      dbUsage.usedBytes = bytes;
      dbUsage.usedMB = mb.toFixed(2);
      dbUsage.percentUsed = parseFloat(((mb / 512) * 100).toFixed(2));
      dbUsage.statusText = mb > 450 ? 'Kritis (>90%)' : mb > 350 ? 'Peringatan (>70%)' : 'Optimal (<70%)';
    }

    const tStats = await query(`
      SELECT 
        c.relname AS table_name,
        c.reltuples::bigint AS row_estimate,
        pg_total_relation_size(c.oid) AS total_bytes
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY total_bytes DESC LIMIT 6
    `);
    dbUsage.tableStats = tStats.rows.map((r) => ({
      name: r.table_name,
      rows: Math.max(0, parseInt(r.row_estimate, 10) || 0),
      sizeKB: (parseInt(r.total_bytes, 10) / 1024).toFixed(1)
    }));
  } catch (errDbSize) {
    console.warn('[DB Usage Query Non-Fatal]', errDbSize.message);
  }

  return createResponse(
    true,
    {
      totalPeserta,
      ujianAktif,
      rataRata,
      tingkatKelulusan,
      totalHasilSelesai: hasil.length,
      lulus,
      tidakLulus: hasil.length - lulus,
      distribusi,
      recentLogs: logRes.rows,
      dbUsage
    },
    'OK'
  );
}

async function getGlobalReport(filterUjian) {
  let sql = `SELECT "ID_Hasil", "ID_Peserta", "Nama_Peserta", "ID_Ujian", "Skor_Listening", "Skor_Grammar", "Skor_Reading", "Skor_Total", "Status_Lulus", "Waktu_Mulai", "Waktu_Selesai", "Status"
             FROM hasil_ujian WHERE "Status" = 'Selesai'`;
  const params = [];
  if (filterUjian) {
    sql += ' AND "ID_Ujian" = $1';
    params.push(filterUjian);
  }
  sql += ' ORDER BY "Skor_Total" DESC';

  const { rows } = await query(sql, params);
  return createResponse(true, rows, 'OK');
}

async function getRombelComparison(idUjian) {
  const pRes = await query('SELECT "ID_Peserta", "Rombel" FROM peserta');
  const pesertaMap = {};
  pRes.rows.forEach((p) => (pesertaMap[p.ID_Peserta] = p.Rombel || 'Umum'));

  let sql = `SELECT * FROM hasil_ujian WHERE "Status" = 'Selesai'`;
  const params = [];
  if (idUjian) {
    sql += ' AND "ID_Ujian" = $1';
    params.push(idUjian);
  }

  const { rows: hasil } = await query(sql, params);
  const groups = {};

  hasil.forEach((h) => {
    const rombel = pesertaMap[h.ID_Peserta] || 'Umum';
    if (!groups[rombel]) groups[rombel] = [];
    groups[rombel].push(h);
  });

  const comparison = Object.keys(groups).map((rombel) => {
    const list = groups[rombel];
    const total = list.length;
    const skorList = list.map((h) => Number(h.Skor_Total) || 0);
    const rataRata = total ? Math.round(skorList.reduce((a, b) => a + b, 0) / total) : 0;
    const lulus = list.filter((h) => h.Status_Lulus === 'Lulus').length;
    const tingkatKelulusan = total ? Math.round((lulus / total) * 100) : 0;
    const tertinggi = total ? Math.max(...skorList) : 0;
    const terendah = total ? Math.min(...skorList) : 0;

    return {
      rombel,
      totalPeserta: total,
      rataRata,
      lulus,
      tidakLulus: total - lulus,
      tingkatKelulusan,
      tertinggi,
      terendah
    };
  });

  comparison.sort((a, b) => b.rataRata - a.rataRata);
  return createResponse(true, comparison, 'OK');
}

async function getActivityLog(limit) {
  const lim = Number(limit) || 50;
  const { rows } = await query('SELECT * FROM log_aktivitas ORDER BY "Timestamp" DESC LIMIT $1', [lim]);
  return createResponse(true, rows, 'OK');
}

// ────────────────────────────────────────────────────────────
// 9. PENGATURAN SISTEM & UPLOAD MEDIA
// ────────────────────────────────────────────────────────────
async function getSystemSettings() {
  const { rows } = await query('SELECT * FROM pengaturan_sistem');
  const config = {};
  rows.forEach((r) => (config[r.Key] = r.Value));
  return createResponse(true, config, 'OK');
}

async function saveSystemSettings(settingsObj) {
  if (!settingsObj || typeof settingsObj !== 'object') {
    return createResponse(false, null, 'Data pengaturan tidak valid.');
  }

  for (const [key, val] of Object.entries(settingsObj)) {
    await query(
      `INSERT INTO pengaturan_sistem ("Key", "Value")
       VALUES ($1, $2)
       ON CONFLICT ("Key") DO UPDATE SET "Value" = EXCLUDED."Value"`,
      [key, String(val)]
    );
  }

  await logActivity('Administrator', 'Admin', 'Ubah Pengaturan Sistem', JSON.stringify(settingsObj));
  return createResponse(true, null, 'Pengaturan berhasil disimpan.');
}

async function uploadAudioToDrive(base64Data, fileName, mimeType) {
  if (!base64Data || typeof base64Data !== 'string') {
    return createResponse(false, null, 'Data audio kosong atau format tidak valid.');
  }

  const safeMime = mimeType && mimeType.startsWith('audio/') ? mimeType : 'audio/mpeg';
  const cleanName = fileName || `audio-${Date.now()}.mp3`;

  // Cek apakah Vercel Blob terkonfigurasi
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = require('@vercel/blob');
      const buffer = Buffer.from(base64Data, 'base64');
      const blob = await put(`cbt-audio/${cleanName}`, buffer, {
        access: 'public',
        contentType: safeMime
      });
      return createResponse(true, { fileId: blob.url, fileUrl: blob.url }, 'Audio berhasil diunggah ke Vercel Blob.');
    } catch (eBlob) {
      console.warn('[Vercel Blob Upload Failed, Fallback to Data URI]', eBlob.message);
    }
  }

  // Fallback Data URI jika Vercel Blob belum diaktifkan
  const dataUrl = `data:${safeMime};base64,${base64Data}`;
  return createResponse(true, { fileId: 'data-uri', fileUrl: dataUrl }, 'Audio siap digunakan.');
}

module.exports = {
  getAppVersion,
  runDiagnostics,
  verifyParticipantAccess,
  staffLogin,
  getAvailableExamsForParticipant,
  startExamSession,
  submitExamAnswers,
  getExamsByLecturer,
  createExam,
  updateExam,
  importQuestionsBatch,
  getQuestionsByExam,
  deleteQuestion,
  updateQuestion,
  addSingleQuestion,
  getExamResultsForLecturer,
  getItemAnalysis,
  getBankSoalList,
  getBankSoalTopics,
  addBankSoal,
  updateBankSoal,
  deleteBankSoal,
  importBankSoalBatch,
  pullFromBankToExam,
  pullRandomFromBank,
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
  importParticipantsBatch,
  getAllExamsAdmin,
  reassignExamLecturer,
  getAdminDashboardData,
  getGlobalReport,
  getRombelComparison,
  getActivityLog,
  getSystemSettings,
  saveSystemSettings,
  uploadAudioToDrive
};

