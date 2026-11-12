// ============================================================
// KONFIGURASI — CBT Bahasa (Vercel Serverless & PostgreSQL)
// ============================================================
// Di Vercel, seluruh API serverless berjalan otomatis pada endpoint
// relatif '/api/cbt' tanpa perlu konfigurasi URL eksternal manual.
//
// Jika aplikasi frontend ini di-deploy di GitHub Pages atau domain
// terpisah, isi nilai di bawah dengan URL penuh deployment Vercel Anda, misal:
// const GAS_URL = 'https://nama-project-anda.vercel.app/api/cbt';
// ============================================================
const GAS_URL = window.CBT_API_URL || '/api/cbt';
