/**
 * ============================================================
 * CBT BAHASA — Vercel Serverless Function Router (/api/cbt)
 * Endpoint REST API utama untuk aplikasi CBT
 * ============================================================
 */

const { ensureSchema } = require('./db');
const { verifySessionToken } = require('./auth');
const services = require('./services');

const ACTION_PERMISSIONS = {
  getAppVersion: 'PUBLIC',
  verifyParticipantAccess: 'PUBLIC',
  staffLogin: 'PUBLIC',

  // Peserta / Ujian
  getAvailableExamsForParticipant: 'PUBLIC',
  startExamSession: 'PUBLIC',
  submitExamAnswers: 'PUBLIC',

  // Dosen — Ujian & Soal
  getExamsByLecturer: 'DOSEN',
  createExam: 'DOSEN',
  updateExam: 'DOSEN',
  importQuestionsBatch: 'DOSEN',
  getQuestionsByExam: 'DOSEN',
  deleteQuestion: 'DOSEN',
  updateQuestion: 'DOSEN',
  addSingleQuestion: 'DOSEN',
  getExamResultsForLecturer: 'DOSEN',
  getItemAnalysis: 'DOSEN',

  // Bank Soal
  getBankSoalList: 'DOSEN',
  getBankSoalTopics: 'DOSEN',
  addBankSoal: 'DOSEN',
  updateBankSoal: 'DOSEN',
  deleteBankSoal: 'DOSEN',
  importBankSoalBatch: 'DOSEN',
  pullFromBankToExam: 'DOSEN',
  pullRandomFromBank: 'DOSEN',
  uploadAudioToDrive: 'DOSEN',
  getParticipantResultDetail: 'DOSEN',

  // Admin — Dosen & Peserta
  getAllLecturers: 'ADMIN',
  addLecturer: 'ADMIN',
  toggleLecturerStatus: 'ADMIN',
  resetLecturerPassword: 'ADMIN',
  getAllParticipants: 'ADMIN',
  generateAccessCodesBatch: 'ADMIN',
  deactivateAccessCode: 'ADMIN',
  reactivateAccessCode: 'ADMIN',
  deleteParticipantAccess: 'ADMIN',
  importParticipantsBatch: 'ADMIN',

  // Admin — Ujian, Laporan & Pengaturan
  getAllExamsAdmin: 'ADMIN',
  reassignExamLecturer: 'ADMIN',
  getAdminDashboardData: 'ADMIN',
  getGlobalReport: 'ADMIN',
  getRombelComparison: 'ADMIN',
  getActivityLog: 'ADMIN',
  getSystemSettings: 'ADMIN',
  saveSystemSettings: 'ADMIN',
  runDiagnostics: 'ADMIN'
};

module.exports = async function handler(req, res) {
  // 1. Setup CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 2. Health check endpoint via GET
  if (req.method === 'GET') {
    try {
      await ensureSchema();
      return res.status(200).json({
        success: true,
        message: 'CBT Bahasa REST API (Vercel Serverless & PostgreSQL) berjalan normal.',
        version: 'v5.0-vercel-pro',
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      return res.status(500).json({
        success: false,
        message: 'Koneksi database belum terhubung: ' + e.message,
        tip: 'Pastikan Environment Variable POSTGRES_URL atau DATABASE_URL telah diisi di Vercel Dashboard.'
      });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Metode HTTP tidak diizinkan. Gunakan POST.' });
  }

  // 3. Parse Request Body (Kompatibel text/plain dari api.js dan application/json)
  let payload = req.body;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Payload JSON tidak valid.' });
    }
  } else if (Buffer.isBuffer(payload)) {
    try {
      payload = JSON.parse(payload.toString('utf-8'));
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Payload buffer JSON tidak valid.' });
    }
  }

  const { action, args = [], token } = payload || {};

  if (!action) {
    return res.status(400).json({ success: false, message: 'Parameter "action" wajib disertakan.' });
  }

  const fn = services[action];
  if (typeof fn !== 'function') {
    return res.status(404).json({ success: false, message: `Action "${action}" tidak terdaftar.` });
  }

  // 4. Role-Based Access Control (RBAC)
  const requiredPermission = ACTION_PERMISSIONS[action] || 'ADMIN';
  if (requiredPermission !== 'PUBLIC') {
    const authUser = verifySessionToken(token, requiredPermission);
    if (!authUser) {
      return res.status(200).json({
        success: false,
        data: null,
        message: 'Akses tidak sah: Sesi login Anda tidak valid atau telah berakhir. Silakan login kembali.'
      });
    }
  }

  // 5. Eksekusi Aksi Bisnis
  try {
    await ensureSchema();
    const result = await fn(...(Array.isArray(args) ? args : [args]));
    return res.status(200).json(result);
  } catch (error) {
    console.error(`[CBT Action Error: ${action}]`, error);
    return res.status(500).json({
      success: false,
      data: null,
      message: error.message || 'Terjadi kesalahan internal pada server.'
    });
  }
};

