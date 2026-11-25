/**
 * ============================================================
 * CBT BAHASA — Vercel Serverless Function Router (/api/cbt)
 * Endpoint REST API utama dengan RBAC & Konteks Sesi Ketat
 * ============================================================
 */

const { ensureSchema } = require('./db');
const { verifySessionToken, runWithAuthContext } = require('./auth');
const services = require('./services');

const ACTION_PERMISSIONS = {
  getAppVersion: 'PUBLIC',
  getSystemSettings: 'PUBLIC',
  verifyParticipantAccess: 'PUBLIC',
  staffLogin: 'PUBLIC',
  staffLoginGoogle: 'PUBLIC',

  // Peserta / Ujian (Wajib Token Sesi Peserta Aktif)
  getAvailableExamsForParticipant: 'PESERTA',
  startExamSession: 'PESERTA',
  syncExamProgress: 'PESERTA',
  recordExamViolation: 'PESERTA',
  submitExamAnswers: 'PESERTA',

  // Staf Mandiri (Admin & Dosen)
  changeOwnStaffPin: 'DOSEN',

  // Dosen — Ujian & Soal
  getExamsByLecturer: 'DOSEN',
  createExam: 'DOSEN',
  updateExam: 'DOSEN',
  deleteExam: 'DOSEN',
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

  // Admin — Staf (Admin & Dosen) & Peserta
  getAllLecturers: 'ADMIN',
  addLecturer: 'ADMIN',
  updateLecturer: 'ADMIN',
  toggleLecturerStatus: 'ADMIN',
  getAllAdmins: 'ADMIN',
  addAdmin: 'ADMIN',
  updateAdmin: 'ADMIN',
  deleteAdmin: 'ADMIN',
  getAllParticipants: 'ADMIN',
  generateAccessCodesBatch: 'ADMIN',
  deactivateAccessCode: 'ADMIN',
  reactivateAccessCode: 'ADMIN',
  deleteParticipantAccess: 'ADMIN',
  resetParticipantSession: 'DOSEN',
  importParticipantsBatch: 'ADMIN',

  // Admin — Ujian, Laporan & Pengaturan
  getAllExamsAdmin: 'ADMIN',
  reassignExamLecturer: 'ADMIN',
  getAdminDashboardData: 'ADMIN',
  getGlobalReport: 'ADMIN',
  getRombelComparison: 'ADMIN',
  getActivityLog: 'ADMIN',
  saveSystemSettings: 'ADMIN',
  runDiagnostics: 'ADMIN'
};

module.exports = async function handler(req, res) {
  // 1. Setup CORS Aman (Tanpa kombinasi wildcard + credentials)
  const origin = req.headers && req.headers.origin ? req.headers.origin : '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-Requested-With, Accept, Content-Length, Content-Type, Authorization'
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
        version: 'v5.1-secure-hybrid-auth',
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

  // 3. Parse Request Body
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

  // 4. Role-Based Access Control (RBAC) & Konteks Sesi Terverifikasi
  const requiredPermission = ACTION_PERMISSIONS[action] || 'ADMIN';
  let authUser = null;
  if (requiredPermission !== 'PUBLIC') {
    authUser = verifySessionToken(token, requiredPermission);
    if (!authUser) {
      return res.status(200).json({
        success: false,
        data: null,
        authExpired: true,
        message: 'Akses tidak sah: Sesi login Anda tidak valid atau telah berakhir. Silakan login kembali.'
      });
    }
  } else if (token) {
    authUser = verifySessionToken(token, null);
  }

  // 5. Eksekusi Aksi Bisnis di dalam AsyncLocalStorage Context
  try {
    await ensureSchema();
    const safeArgs = Array.isArray(args) ? args : [args];
    const result = await runWithAuthContext(authUser, () => fn(...safeArgs));
    return res.status(200).json(result);
  } catch (error) {
    console.error(`[CBT Action Error: ${action}]`, error.message);
    return res.status(200).json({
      success: false,
      data: null,
      message: error.message || 'Terjadi kesalahan pada server saat memproses aksi.'
    });
  }
};
