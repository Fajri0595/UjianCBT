# CBT Bahasa — Sistem Tes Berbasis Komputer Ujian Kebahasaan

Aplikasi ujian kebahasaan (Listening, Structure & Written Expression, Reading Comprehension) untuk peserta, dilengkapi panel **Dosen** (pembuatan ujian, bank soal terpusat, koreksi otomatis, analisis butir soal) dan panel **Super Admin** (manajemen dosen, peserta, rombel, kode akses massal, dan laporan analitik global).

---

## 🏛️ Arsitektur Sistem

Aplikasi ini menggunakan arsitektur web modern **Serverless REST API + Database Relasional**:

```
┌───────────────────────────────────────┐          ┌─────────────────────────────────────────┐
│  FRONTEND (SPA)                       │          │  BACKEND (Vercel Serverless Function)   │
│  - Single Page Application (HTML5/JS) │  fetch   │  - Node.js (api/cbt.js & services.js)   │
│  - Resilient REST Client (api.js)     │ ───────► │  - HMAC-SHA256 Session Auth (auth.js)   │
│  - UI Dashboard Admin, Dosen, Peserta │   JSON   │  - 42 Whitelisted Actions & Auto-Init   │
└───────────────────────────────────────┘          └────────────────────┬────────────────────┘
                                                                        │ Pool Query (pg)
                                                   ┌────────────────────▼────────────────────┐
                                                   │  DATABASE (PostgreSQL)                  │
                                                   │  - Vercel Postgres / Neon / Supabase    │
                                                   │  - ACID Compliant & Concurrency-Safe    │
                                                   └─────────────────────────────────────────┘
```

### Keunggulan Dibandingkan Google Apps Script (GAS):
1. **Bebas Kuota & Batas Waktu**: Tidak ada batasan kuota eksekusi harian Google atau timeout 6 menit.
2. **Kinerja Konkurensi Tinggi**: PostgreSQL sanggup menangani ratusan peserta yang menyimpan jawaban dan menyelesaikan ujian di waktu yang bersamaan tanpa race condition.
3. **Respon Cepat (Low Latency)**: Waktu respon API 15–80ms (jauh lebih instan dibanding latency 1–3 detik pada Apps Script).
4. **Satu Atap Deployment di Vercel**: Frontend statis, Backend API, dan Database dikelola dalam satu platform gratis dan terintegrasi otomatis dengan repositori GitHub.

---

## 📂 Struktur Folder Proyek

```text
├── index.html            # Antarmuka Single Page Application (SPA)
├── favicon.svg           # Icon CBT
├── css/
│   └── style.css         # Styling kustom antarmuka pengguna
├── js/
│   ├── api.js            # Klien REST Adapter & Auto-Retry (/api/cbt)
│   └── app.js            # Logika UI, timer ujian, pengerjaan soal, & dashboard
├── database/
│   └── schema.sql        # Skema DDL tabel database & indeks PostgreSQL
├── docs/
│   └── PANDUAN-INSTALASI.md # Panduan langkah demi langkah deploy ke Vercel & Neon
├── api/
│   ├── cbt.js            # Router serverless Vercel & penangan CORS (/api/cbt)
│   ├── db.js             # Pool koneksi PostgreSQL & Auto-Initialization skema
│   ├── auth.js           # Kriptografi, HMAC session token, & shuffling algorithm
│   ├── services.js       # Facade Aggregator Layanan Bisnis CBT
│   └── services/         # Modul Layanan Bisnis Terorganisir:
│       ├── common.js        # Utilitas respon, kalkulasi TOEFL, audit log
│       ├── examService.js   # Manajemen ujian, pengerjaan peserta, analisis butir
│       ├── bankService.js   # Manajemen bank soal, topik, upload audio
│       ├── userService.js   # Autentikasi, dosen, peserta, kode akses, device lock
│       └── reportService.js # Laporan global, rombel, kuota database, diagnostik
├── package.json          # Konfigurasi dependensi Node.js & script
├── vercel.json           # Konfigurasi routing rewrite Vercel
├── local-server.js       # Web server lokal untuk pengujian di komputer
├── .env.example          # Panduan variabel lingkungan
└── README.md             # Dokumentasi arsitektur proyek
```

---

## 🚀 Panduan Memulai & Deployment

Untuk panduan lengkap langkah demi langkah menghubungkan ke GitHub, Vercel, dan mengaktifkan database PostgreSQL gratis, silakan baca [PANDUAN-INSTALASI.md](docs/PANDUAN-INSTALASI.md).

### Akun Awal Bawaan (Default):
- **Super Admin**: `admin.pusatbahasa` / `admin123`
- **Dosen Penguji**: `dosen.aris` / `dosen123`
- **Peserta Ujian Demo**: Kode Akses `LANG-DEMO`
