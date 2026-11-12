/**
 * ============================================================
 * CBT BAHASA — Layanan Bank Soal (Question Bank & Media Services)
 * ============================================================
 */

const { query, queryOne } = require('../db');
const { generateId, generateAccessCode } = require('../auth');
const { createResponse, logActivity } = require('./common');

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
  getBankSoalList,
  getBankSoalTopics,
  addBankSoal,
  updateBankSoal,
  deleteBankSoal,
  importBankSoalBatch,
  pullFromBankToExam,
  pullRandomFromBank,
  uploadAudioToDrive
};
