-- ============================================================
-- CBT BAHASA — Skema Database PostgreSQL (Vercel Postgres / Neon / Supabase)
-- ============================================================

-- 1. Tabel Peserta & Kode Akses
CREATE TABLE IF NOT EXISTS peserta (
  "ID_Peserta" VARCHAR(60) PRIMARY KEY,
  "Nama" VARCHAR(200) NOT NULL DEFAULT '',
  "Kontak" VARCHAR(150) DEFAULT '',
  "Kode_Akses" VARCHAR(60) UNIQUE NOT NULL,
  "ID_Ujian_Target" VARCHAR(60) DEFAULT '',
  "Status_Kode" VARCHAR(30) DEFAULT 'Aktif',
  "Tanggal_Daftar" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "Rombel" VARCHAR(100) DEFAULT 'Umum',
  "Active_Token" TEXT,
  "Device_Info" TEXT
);

-- 2. Tabel Dosen Penguji
CREATE TABLE IF NOT EXISTS dosen (
  "ID_Dosen" VARCHAR(60) PRIMARY KEY,
  "Nama" VARCHAR(200) NOT NULL,
  "Username" VARCHAR(100) UNIQUE NOT NULL,
  "Password_Hash" VARCHAR(255) NOT NULL,
  "Status" VARCHAR(30) DEFAULT 'Aktif'
);

-- 3. Tabel Administrator
CREATE TABLE IF NOT EXISTS admin (
  "ID_Admin" VARCHAR(60) PRIMARY KEY,
  "Nama" VARCHAR(200) NOT NULL,
  "Username" VARCHAR(100) UNIQUE NOT NULL,
  "Password_Hash" VARCHAR(255) NOT NULL
);

-- 4. Tabel Paket Ujian
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
  "Acak_Soal" BOOLEAN DEFAULT TRUE,
  "Kunci_Setelah_Submit" BOOLEAN DEFAULT TRUE
);

-- 5. Tabel Butir Soal Ujian
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

-- 6. Tabel Bank Soal Terpusat
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

-- 7. Tabel Hasil Ujian & Riwayat Peserta
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

-- 8. Tabel Log Aktivitas Audit
CREATE TABLE IF NOT EXISTS log_aktivitas (
  id SERIAL PRIMARY KEY,
  "Timestamp" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "Peran" VARCHAR(100) DEFAULT 'Sistem',
  "Nama_User" VARCHAR(200) DEFAULT '',
  "Aksi" VARCHAR(200) DEFAULT '',
  "Detail" TEXT DEFAULT ''
);

-- 9. Tabel Pengaturan Sistem
CREATE TABLE IF NOT EXISTS pengaturan_sistem (
  "Key" VARCHAR(100) PRIMARY KEY,
  "Value" TEXT NOT NULL
);

-- Indeks Performa
CREATE INDEX IF NOT EXISTS idx_peserta_kode ON peserta ("Kode_Akses");
CREATE INDEX IF NOT EXISTS idx_soal_ujian ON soal ("ID_Ujian");
CREATE INDEX IF NOT EXISTS idx_hasil_peserta_ujian ON hasil_ujian ("ID_Peserta", "ID_Ujian");
CREATE INDEX IF NOT EXISTS idx_bank_soal_sesi ON bank_soal ("Sesi", "Topik");
CREATE INDEX IF NOT EXISTS idx_log_timestamp ON log_aktivitas ("Timestamp" DESC);

