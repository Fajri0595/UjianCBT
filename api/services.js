/**
 * ============================================================
 * CBT BAHASA — Layanan Bisnis & Aksi REST API (Node.js & PostgreSQL)
 * Facade Aggregator yang mengekspor modul-modul domain terorganisir:
 *  - services/common.js: Utilitas respon, kalkulasi TOEFL, audit log
 *  - services/examService.js: Ujian, pengerjaan peserta, analisis butir
 *  - services/bankService.js: Bank soal, topik, upload audio
 *  - services/userService.js: Autentikasi, dosen, peserta, kode akses
 *  - services/reportService.js: Laporan global, rombel, kuota database
 * ============================================================
 */

module.exports = require('./services/index');
