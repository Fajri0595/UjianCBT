# 📋 PANDUAN DEPLOY & INSTALASI — CBT Bahasa
## Arsitektur: Vercel Serverless + PostgreSQL + SPA Modern

Aplikasi **CBT Bahasa (Computer-Based Test Kebahasaan)** ini telah ditingkatkan menjadi arsitektur web modern standar industri:
- **Frontend**: Single Page Application (HTML5, Tailwind/CSS kustom, Vanilla JS) yang cepat, responsif, dan ringan.
- **Backend API**: Node.js Serverless Function di Vercel (`/api/cbt`), menghilangkan batasan waktu eksekusi dan kuota Google Apps Script.
- **Database**: PostgreSQL Relasional (Vercel Postgres, Neon.tech, atau Supabase) yang tahan beban konkurensi ratusan peserta ujian secara simultan tanpa race condition.
- **Media Audio**: Dukungan streaming langsung dan integrasi Vercel Blob / Object Storage.

---

## 🚀 Tahap 1: Persiapan Repository GitHub

1. Pastikan seluruh file di folder ini sudah rapi. Struktur folder proyek Anda adalah:
   ```text
   ├── index.html            (Frontend Utama)
   ├── favicon.svg           (Icon CBT)
   ├── css/                  (Style & Antarmuka)
   ├── js/
   │   ├── config.js         (Konfigurasi endpoint API)
   │   ├── api.js            (Client REST Proxy)
   │   └── app.js            (Seluruh logika UI & Ujian)
   ├── api/
   │   ├── cbt.js            (Router Serverless Vercel)
   │   ├── db.js             (Koneksi & Auto-Init PostgreSQL)
   │   ├── auth.js           (HMAC Token & Password Hashing)
   │   ├── services.js       (42 Logika Bisnis CBT)
   │   └── schema.sql        (DDL Skema Database)
   ├── package.json          (Dependensi Node.js)
   ├── vercel.json           (Konfigurasi Routing Vercel)
   └── .env.example          (Panduan Environment Variable)
   ```

2. Buat repositori baru di akun [GitHub](https://github.com) Anda (misalnya: `cbt-bahasa`).
3. Push folder proyek ini ke repositori GitHub:
   ```bash
   git add .
   git commit -m "feat: migrate to Vercel Serverless and PostgreSQL"
   git branch -M main
   git remote add origin https://github.com/Fajri0595/UjianCBT.git
   git push -u origin main
   ```

---

## 🗄️ Tahap 2: Menghubungkan ke Vercel & Membuat Database PostgreSQL

### Opsi A: Menggunakan Vercel Postgres (Paling Praktis / 1 Akun untuk Semua)

1. Buka [Vercel Dashboard](https://vercel.com) dan login dengan akun GitHub Anda.
2. Klik tombol **"Add New..."** lalu pilih **Project**.
3. Import repositori GitHub `cbt-bahasa` yang baru saja Anda push.
4. Klik **Deploy** (biarkan pengaturan build default).
5. Setelah selesai deploy pertama kali:
   - Masuk ke dashboard proyek Anda di Vercel.
   - Klik tab **Storage** pada menu navigasi atas.
   - Klik **Create Database** → Pilih **Postgres** (Neon-powered) → Klik **Continue**.
   - Beri nama database (misal: `cbt-db`), pilih Region terdekat (misal: **Singapore - sin1**).
   - Klik **Create**.
6. Hubungkan Database ke Proyek:
   - Di halaman database tersebut, klik tab **Project Connections**.
   - Pilih proyek `cbt-bahasa` Anda dan klik **Connect**.
   - Vercel akan **secara otomatis mengisi variabel `POSTGRES_URL`** ke Environment Variables proyek Anda!
7. Redeploy:
   - Masuk ke tab **Deployments** di proyek Anda → klik titik tiga `...` pada deployment teratas → pilih **Redeploy**.

---

### Opsi B: Menggunakan Neon.tech atau Supabase (Alternatif Gratis)

Jika Anda ingin menggunakan database cloud PostgreSQL gratis dari Neon atau Supabase:
1. Daftar gratis di [neon.tech](https://neon.tech) atau [supabase.com](https://supabase.com).
2. Buat project baru dan salin **Connection String URI** PostgreSQL Anda, contoh:
   ```text
   postgres://username:password@ep-sample-123.ap-southeast-1.neon.tech/neondb?sslmode=require
   ```
3. Di Vercel Dashboard proyek Anda:
   - Buka **Settings** → **Environment Variables**.
   - Tambahkan variabel baru:
     - **Key**: `POSTGRES_URL`
     - **Value**: *(Paste Connection String URI Anda)*
   - Tambahkan juga:
     - **Key**: `CBT_API_SECRET`
     - **Value**: *(Masukkan teks acak 32+ karakter untuk keamanan token)*
   - Klik **Save**, lalu lakukan **Redeploy**.

---

## ⚡ Tahap 3: Inisialisasi Database (Otomatis & Tanpa Pusing)

Backend ini sudah dilengkapi fitur **Self-Healing & Auto-Initialization**:
1. Saat aplikasi pertama kali dijalankan, sistem akan **secara otomatis membuat seluruh tabel** (`peserta`, `dosen`, `admin`, `ujian`, `soal`, `bank_soal`, `hasil_ujian`, `log_aktivitas`, `pengaturan_sistem`) jika belum ada.
2. Akun bawaan (default) yang langsung aktif dan siap digunakan:
   - 🛡️ **Super Admin**:
     - Username: `admin.pusatbahasa`
     - Password: `admin123`
   - 👨‍🏫 **Dosen Penguji**:
     - Username: `dosen.aris`
     - Password: `dosen123`
   - 🎓 **Peserta Ujian Uji Coba**:
     - Kode Akses: `LANG-DEMO`
     - Nama: Contoh Peserta

> 💡 **Tips Keamanan**: Setelah berhasil login pertama kali sebagai Admin atau Dosen, segera ganti password default tersebut melalui menu pengaturan akun!

---

## 🔍 Tahap 4: Verifikasi & Diagnostik Sistem

1. Buka URL deployment Vercel Anda di browser:
   `https://nama-project-anda.vercel.app/api/cbt`
   - Jika berhasil terhubung, halaman akan menampilkan status:
     ```json
     {
       "success": true,
       "message": "CBT Bahasa REST API (Vercel Serverless & PostgreSQL) berjalan normal.",
       "version": "v5.0-vercel-pro"
     }
     ```
2. Buka aplikasi web utama di `https://nama-project-anda.vercel.app`:
   - Login sebagai **Admin** (`admin.pusatbahasa` / `admin123`).
   - Masuk ke menu **Pengaturan & Diagnostik**.
   - Klik **Jalankan Diagnostik** untuk memastikan seluruh tabel database berstatus hijau (OK).

---

## 💻 Menjalankan di Komputer Lokal (Opsional)

Jika Anda ingin menguji atau mengembangkan aplikasi di laptop/komputer:
1. Buat file `.env.local` di folder proyek, isi dengan:
   ```env
   POSTGRES_URL="postgres://username:password@host-db-anda/dbname?sslmode=require"
   CBT_API_SECRET="kunci_rahasia_lokal_12345"
   ```
2. Jalankan perintah di terminal:
   ```bash
   npm start
   ```
3. Buka browser di `http://localhost:3000`. Aplikasi dan API lokal langsung siap digunakan!
