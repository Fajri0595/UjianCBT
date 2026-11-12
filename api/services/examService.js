/**
 * ============================================================
 * CBT BAHASA — Layanan Ujian & Soal (Exam & Question Services)
 * ============================================================
 */

const { query, queryOne } = require('../db');
const {
  generateId,
  getDeterministicOptionPermutation,
  deterministicShuffle
} = require('../auth');
const {
  createResponse,
  logActivity,
  calculateToeflSectionScaled
} = require('./common');

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
module.exports = {
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
  getItemAnalysis
};
