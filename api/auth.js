/**
 * ============================================================
 * CBT BAHASA — Autentikasi, Token HMAC, Kriptografi & Helper
 * ============================================================
 */

const crypto = require('crypto');

function getApiSecret() {
  return process.env.CBT_API_SECRET || process.env.AUTH_SECRET || 'cbt_super_secret_jwt_key_2026';
}

function getSaltKey() {
  return process.env.SALT_KEY || 'CBT_SALT_DEFAULT_VERCEL';
}

function hashPassword(pw) {
  const digest = crypto.createHash('sha256').update(pw + ':' + getSaltKey()).digest('hex');
  return digest;
}

function verifyPassword(inputPassword, storedHash) {
  if (!inputPassword || !storedHash) return false;
  // Cek salted hash saat ini
  if (hashPassword(inputPassword) === storedHash) return true;
  // Fallback hash unsalted lama jika ada data impor
  const legacyHash = crypto.createHash('sha256').update(inputPassword).digest('hex');
  if (legacyHash === storedHash) return true;
  // Fallback plain text jika baru di-seed manual
  if (inputPassword === storedHash) return true;
  return false;
}

function generateSessionToken(userId, role, name) {
  const expiry = Date.now() + 12 * 3600 * 1000; // 12 jam
  const payload = `${userId}|${role}|${encodeURIComponent(name || '')}|${expiry}`;
  const sig = crypto.createHmac('sha256', getApiSecret()).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64');
}

function verifySessionToken(tokenString, requiredRole) {
  if (!tokenString) return null;
  try {
    const raw = JSON.parse(Buffer.from(tokenString, 'base64').toString('utf-8'));
    const [userId, role, encodedName, expiry] = raw.p.split('|');
    if (Date.now() > Number(expiry)) return null;

    const expectedSig = crypto.createHmac('sha256', getApiSecret()).update(raw.p).digest('hex');
    if (expectedSig !== raw.s) return null;

    if (requiredRole) {
      const userRole = (role || '').toLowerCase();
      const reqRole = requiredRole.toLowerCase();

      // Admin berhak mengakses semua fitur dosen
      if (reqRole === 'dosen' && userRole === 'admin') {
        // Diizinkan
      } else if (reqRole !== userRole) {
        return null;
      }
    }

    return {
      userId,
      role,
      name: decodeURIComponent(encodedName || ''),
      expiry: Number(expiry)
    };
  } catch (e) {
    return null;
  }
}

function generateId(prefix) {
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${String(now.getFullYear()).slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}-${ts}-${rand}`;
}

function generateAccessCode(prefix) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix || 'LANG'}-${rand}`;
}

/**
 * Pengacakan opsi deterministik berbasis LCG (Linear Congruential Generator)
 * Memastikan hasil acak identik untuk kombinasi Peserta + ID_Soal yang sama
 */
function getDeterministicOptionPermutation(seedStr) {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed << 5) - seed + seedStr.charCodeAt(i);
    seed |= 0;
  }
  const letters = ['A', 'B', 'C', 'D'];
  for (let i = letters.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    const temp = letters[i];
    letters[i] = letters[j];
    letters[j] = temp;
  }
  return letters;
}

module.exports = {
  getApiSecret,
  getSaltKey,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  verifySessionToken,
  generateId,
  generateAccessCode,
  getDeterministicOptionPermutation
};

