/**
 * ============================================================
 * CBT BAHASA — Database Connection & Pool Management (PostgreSQL)
 * Kompatibel dengan Vercel Postgres, Neon.tech, Supabase, & PostgreSQL Standar
 * ============================================================
 */

const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;

  const connectionString =
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/cbt_bahasa';

  const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  pool = new Pool({
    connectionString,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    console.error('[DB Pool Error]', err.message);
  });

  return pool;
}

/**
 * Eksekusi query dengan parameter sanitasi SQL injection
 */
async function query(text, params = []) {
  const p = getPool();
  const start = Date.now();
  try {
    const res = await p.query(text, params);
    return res;
  } catch (err) {
    console.error(`[DB Query Error] Query: "${text}"`, err.message);
    throw err;
  }
}

/**
 * Ambil satu baris (atau null)
 */
async function queryOne(text, params = []) {
  const res = await query(text, params);
  return res.rows.length ? res.rows[0] : null;
}

/**
 * Helper Auto-Init: Membuat skema tabel dan data awal jika belum ada.
 * Dipanggil secara otomatis saat serverless cold-start atau dari halaman diagnostik.
 */
let schemaEnsured = false;

async function ensureSchema() {
  if (schemaEnsured) return true;

  try {
    // 1. Buat Tabel-tabel
    await query(`
      CREATE TABLE IF NOT EXISTS peserta (
        "ID_Peserta" VARCHAR(60) PRIMARY KEY,
        "Nama" VARCHAR(200) NOT NULL DEFAULT '',
        "Kontak" VARCHAR(150) DEFAULT '',
        "Kode_Akses" VARCHAR(60) UNIQUE NOT NULL,
        "ID_Ujian_Target" VARCHAR(60) DEFAULT '',
        "Status_Kode" VARCHAR(30) DEFAULT 'Aktif',
        "Tanggal_Daftar" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        "Rombel" VARCHAR(100) DEFAULT 'Umum'
      );

      CREATE TABLE IF NOT EXISTS dosen (
        "ID_Dosen" VARCHAR(60) PRIMARY KEY,
        "Nama" VARCHAR(200) NOT NULL,
        "Username" VARCHAR(100) UNIQUE NOT NULL,
        "Password_Hash" VARCHAR(255) NOT NULL,
        "Status" VARCHAR(30) DEFAULT 'Aktif'
      );

      CREATE TABLE IF NOT EXISTS admin (
        "ID_Admin" VARCHAR(60) PRIMARY KEY,
        "Nama" VARCHAR(200) NOT NULL,
        "Username" VARCHAR(100) UNIQUE NOT NULL,
        "Password_Hash" VARCHAR(255) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ujian (
        "ID_Ujian" VARCHAR(60) PRIMARY KEY,
        "Kode_Ujian" VARCHAR(60) DEFAULT '',
        "Nama_Ujian" VARCHAR(255) NOT NULL,
        "Deskripsi" TEXT DEFAULT '',
        "ID_Dosen_Pembuat" VARCHAR(60) DEFAULT 'ADMIN',
        "Durasi_Menit" INT DEFAULT 115,
        "Passing_Score" INT DEFAULT 500,
        "Tanggal_Buka" TIMESTAMPTZ,
        "Tanggal_Tutup" TIMESTAMPTZ,
        "Status" VARCHAR(30) DEFAULT 'Draft',
        "Acak_Jawaban" BOOLEAN DEFAULT FALSE,
        "Kunci_Setelah_Submit" BOOLEAN DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS soal (
        "ID_Soal" VARCHAR(60) PRIMARY KEY,
        "ID_Ujian" VARCHAR(60) NOT NULL,
        "Sesi" VARCHAR(50) NOT NULL,
        "Nomor" INT DEFAULT 1,
        "Pertanyaan" TEXT NOT NULL,
        "Passage_Teks" TEXT DEFAULT '',
        "Link_Audio" TEXT DEFAULT '',
        "Pilihan_A" TEXT DEFAULT '',
        "Pilihan_B" TEXT DEFAULT '',
        "Pilihan_C" TEXT DEFAULT '',
        "Pilihan_D" TEXT DEFAULT '',
        "Jawaban_Benar" VARCHAR(10) NOT NULL,
        "Poin" INT DEFAULT 1,
        "ID_Bank_Asal" VARCHAR(60) DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS bank_soal (
        "ID_Bank" VARCHAR(60) PRIMARY KEY,
        "Sesi" VARCHAR(50) NOT NULL,
        "Topik" VARCHAR(100) DEFAULT 'Umum',
        "Level_Kesulitan" VARCHAR(50) DEFAULT 'Sedang',
        "Pertanyaan" TEXT NOT NULL,
        "Passage_Teks" TEXT DEFAULT '',
        "Link_Audio" TEXT DEFAULT '',
        "Pilihan_A" TEXT DEFAULT '',
        "Pilihan_B" TEXT DEFAULT '',
        "Pilihan_C" TEXT DEFAULT '',
        "Pilihan_D" TEXT DEFAULT '',
        "Jawaban_Benar" VARCHAR(10) NOT NULL,
        "Poin" INT DEFAULT 1,
        "ID_Dosen_Pembuat" VARCHAR(60) DEFAULT 'ADMIN',
        "Tanggal_Dibuat" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS hasil_ujian (
        "ID_Hasil" VARCHAR(60) PRIMARY KEY,
        "ID_Peserta" VARCHAR(60) NOT NULL,
        "Nama_Peserta" VARCHAR(200) DEFAULT '',
        "ID_Ujian" VARCHAR(60) NOT NULL,
        "Jawaban_JSON" TEXT DEFAULT '{}',
        "Skor_Listening" INT DEFAULT 0,
        "Skor_Grammar" INT DEFAULT 0,
        "Skor_Reading" INT DEFAULT 0,
        "Skor_Total" INT DEFAULT 0,
        "Status_Lulus" VARCHAR(50) DEFAULT 'Sedang Berjalan',
        "Waktu_Mulai" TIMESTAMPTZ,
        "Waktu_Selesai" TIMESTAMPTZ,
        "Status" VARCHAR(50) DEFAULT 'Sedang Berjalan'
      );

      CREATE TABLE IF NOT EXISTS log_aktivitas (
        id SERIAL PRIMARY KEY,
        "Timestamp" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        "Peran" VARCHAR(100) DEFAULT 'Sistem',
        "Nama_User" VARCHAR(200) DEFAULT '',
        "Aksi" VARCHAR(200) DEFAULT '',
        "Detail" TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS pengaturan_sistem (
        "Key" VARCHAR(100) PRIMARY KEY,
        "Value" TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_peserta_kode ON peserta ("Kode_Akses");
      CREATE INDEX IF NOT EXISTS idx_soal_ujian ON soal ("ID_Ujian");
      CREATE INDEX IF NOT EXISTS idx_hasil_peserta_ujian ON hasil_ujian ("ID_Peserta", "ID_Ujian");
      CREATE INDEX IF NOT EXISTS idx_bank_soal_sesi ON bank_soal ("Sesi", "Topik");
    `);

    // 2. Injeksi Akun Admin Awal jika kosong
    const adminCheck = await query('SELECT count(*) FROM admin');
    if (parseInt(adminCheck.rows[0].count, 10) === 0) {
      const crypto = require('crypto');
      const salt = process.env.SALT_KEY || 'CBT_SALT_DEFAULT_VERCEL';
      const adminPassHash = crypto.createHash('sha256').update('admin123:' + salt).digest('hex');
      await query(
        `INSERT INTO admin ("ID_Admin", "Nama", "Username", "Password_Hash")
         VALUES ($1, $2, $3, $4)`,
        ['ADM-001', 'Super Admin CBT', 'admin.pusatbahasa', adminPassHash]
      );
    }

    // 3. Injeksi Akun Dosen Awal jika kosong
    const dosenCheck = await query('SELECT count(*) FROM dosen');
    if (parseInt(dosenCheck.rows[0].count, 10) === 0) {
      const crypto = require('crypto');
      const salt = process.env.SALT_KEY || 'CBT_SALT_DEFAULT_VERCEL';
      const dosenPassHash = crypto.createHash('sha256').update('dosen123:' + salt).digest('hex');
      await query(
        `INSERT INTO dosen ("ID_Dosen", "Nama", "Username", "Password_Hash", "Status")
         VALUES ($1, $2, $3, $4, $5)`,
        ['DSN-001', 'Dr. Aris Munandar, M.Hum.', 'dosen.aris', dosenPassHash, 'Aktif']
      );
    }

    // 4. Injeksi Peserta Contoh jika kosong
    const pesertaCheck = await query('SELECT count(*) FROM peserta');
    if (parseInt(pesertaCheck.rows[0].count, 10) === 0) {
      await query(
        `INSERT INTO peserta ("ID_Peserta", "Nama", "Kontak", "Kode_Akses", "ID_Ujian_Target", "Status_Kode", "Rombel")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['PST-DEMO', 'Contoh Peserta', 'contoh@mail.com', 'LANG-DEMO', '', 'Aktif', 'Umum']
      );
    }

    // 5. Injeksi Pengaturan Sistem Default
    const defaultSettings = [
      ['passingScoreDefault', '500'],
      ['durasiDefault', '115'],
      ['skalaMin', '310'],
      ['skalaMax', '677'],
      ['appName', 'CBT Bahasa']
    ];

    for (const [key, val] of defaultSettings) {
      await query(
        `INSERT INTO pengaturan_sistem ("Key", "Value")
         VALUES ($1, $2)
         ON CONFLICT ("Key") DO NOTHING`,
        [key, val]
      );
    }

    schemaEnsured = true;
    return true;
  } catch (err) {
    console.error('[ensureSchema Error]', err.message);
    throw err;
  }
}

module.exports = {
  getPool,
  query,
  queryOne,
  ensureSchema
};

