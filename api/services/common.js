/**
 * ============================================================
 * CBT BAHASA — Layanan Bersama (Common Utilities & Helpers)
 * ============================================================
 */

const { query } = require('../db');

const APP_BUILD_VERSION = 'v5.0-vercel-pro';

function createResponse(success, data, message) {
  return { success: Boolean(success), data: data !== undefined ? data : null, message: message || '' };
}

async function logActivity(peran, namaUser, aksi, detail) {
  try {
    await query(
      `INSERT INTO log_aktivitas ("Timestamp", "Peran", "Nama_User", "Aksi", "Detail")
       VALUES (NOW(), $1, $2, $3, $4)`,
      [peran || 'Sistem', namaUser || '', aksi || '', detail || '']
    );
  } catch (e) {
    console.warn('[LogActivity Failed]', e.message);
  }
}

function calculateToeflSectionScaled(rawScore, maxScore, section) {
  if (maxScore <= 0 || rawScore <= 0) return 31;
  const ratio = Math.min(1, Math.max(0, rawScore / maxScore));
  const minScale = 31;
  const maxScale = section === 'Reading' ? 67 : 68;
  return Math.round(minScale + ratio * (maxScale - minScale));
}

async function getAppVersion() {
  return createResponse(true, { version: APP_BUILD_VERSION, serverTime: new Date().toISOString() }, 'OK');
}

module.exports = {
  APP_BUILD_VERSION,
  createResponse,
  logActivity,
  calculateToeflSectionScaled,
  getAppVersion
};

