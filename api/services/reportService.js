/**
 * ============================================================
 * CBT BAHASA — Layanan Laporan & Pengaturan (Reports & Settings Services)
 * ============================================================
 */

const { query, queryOne, ensureSchema, getPool } = require('../db');
const { createResponse, logActivity } = require('./common');

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

module.exports = {
  runDiagnostics,
  getAllExamsAdmin,
  reassignExamLecturer,
  getAdminDashboardData,
  getGlobalReport,
  getRombelComparison,
  getActivityLog,
  getSystemSettings,
  saveSystemSettings
};
