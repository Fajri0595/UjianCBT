/**
 * ============================================================
 * CBT BAHASA — Autentikasi, Token HMAC, Scrypt PIN & Konteks Sesi
 * ============================================================
 */

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const authContextStorage = new AsyncLocalStorage();
const DEFAULT_GOOGLE_CLIENT_ID = '715988750915-qpagfqfi1k90kbt6v1327ccotp1c19rp.apps.googleusercontent.com';

function runWithAuthContext(authUser, callback) {
  return authContextStorage.run(authUser || null, callback);
}

function getAuthContext() {
  return authContextStorage.getStore() || null;
}

function getApiSecret() {
  if (process.env.CBT_API_SECRET && process.env.CBT_API_SECRET.trim()) {
    return process.env.CBT_API_SECRET.trim();
  }
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.trim()) {
    return process.env.AUTH_SECRET.trim();
  }
  // Fallback deterministik berbasis kredensial privat database agar rahasia
  // tidak pernah sama dengan string statis di repositori publik.
  const dbConn =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL ||
    '';
  if (dbConn) {
    return crypto.createHmac('sha256', 'cbt_bahasa_derived_api_secret_v5').update(dbConn).digest('hex');
  }
  return 'cbt_local_dev_only_secret_key_2026';
}

function getSaltKey() {
  return process.env.SALT_KEY || 'CBT_SALT_DEFAULT_VERCEL';
}

/**
 * Hash PIN / Kata Sandi menggunakan scrypt + random salt per akun
 * Format tersimpan: scrypt$<saltHex>$<hashHex>
 */
function hashPin(pin) {
  const clean = String(pin || '').trim();
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(clean, salt, 32).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function hashPassword(pw) {
  return hashPin(pw);
}

function safeTimingEqualHex(hexA, hexB) {
  try {
    const bufA = Buffer.from(String(hexA || ''), 'utf-8');
    const bufB = Buffer.from(String(hexB || ''), 'utf-8');
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (e) {
    return false;
  }
}

function verifyPassword(inputSecret, storedHash) {
  const input = String(inputSecret || '').trim();
  const stored = String(storedHash || '').trim();
  if (!input || !stored) return false;

  // 1. Format modern: scrypt$<saltHex>$<hashHex>
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    try {
      const derivedHex = crypto.scryptSync(input, salt, 32).toString('hex');
      return safeTimingEqualHex(derivedHex, expectedHex);
    } catch (e) {
      return false;
    }
  }

  // 2. Kompatibilitas hash SHA-256 lama (salted / unsalted)
  const saltedSha = crypto.createHash('sha256').update(input + ':' + getSaltKey()).digest('hex');
  if (safeTimingEqualHex(saltedSha, stored)) return true;

  const unsaltedSha = crypto.createHash('sha256').update(input).digest('hex');
  if (safeTimingEqualHex(unsaltedSha, stored)) return true;

  return false;
}

const verifyPin = verifyPassword;

function generateSessionToken(userId, role, name) {
  const expiry = Date.now() + 12 * 3600 * 1000; // 12 jam
  const payload = `${userId}|${role}|${encodeURIComponent(name || '')}|${expiry}`;
  const sig = crypto.createHmac('sha256', getApiSecret()).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ p: payload, s: sig })).toString('base64');
}

function verifySessionToken(tokenString, requiredRole) {
  if (!tokenString || typeof tokenString !== 'string') return null;
  try {
    const cleanToken = tokenString.trim();
    const decodedBuf = Buffer.from(cleanToken, 'base64');
    if (decodedBuf.toString('base64') !== cleanToken) return null;
    const raw = JSON.parse(decodedBuf.toString('utf-8'));
    if (!raw || typeof raw.p !== 'string' || typeof raw.s !== 'string') return null;

    const [userId, role, encodedName, expiry] = raw.p.split('|');
    if (!userId || !role || !expiry || Date.now() > Number(expiry)) return null;

    const expectedSig = crypto.createHmac('sha256', getApiSecret()).update(raw.p).digest('hex');
    if (!safeTimingEqualHex(expectedSig, raw.s)) return null;

    const userRole = (role || '').toLowerCase();
    if (requiredRole) {
      const reqRole = requiredRole.toLowerCase();
      if (reqRole === 'dosen' && userRole === 'admin') {
        // Admin mewarisi seluruh izin Dosen
      } else if (reqRole === 'peserta' && userRole === 'peserta') {
        // Peserta sah
      } else if (reqRole !== userRole) {
        return null;
      }
    }

    return {
      userId,
      role: userRole,
      name: decodeURIComponent(encodedName || ''),
      expiry: Number(expiry),
      rawToken: tokenString
    };
  } catch (e) {
    return null;
  }
}

function generateId(prefix) {
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 5);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${String(now.getFullYear()).slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}-${ts}-${rand}`;
}

function generateAccessCode(prefix) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(6);
  let rand = '';
  for (let i = 0; i < 6; i++) {
    rand += chars.charAt(bytes[i] % chars.length);
  }
  return `${prefix || 'LANG'}-${rand}`;
}

function getDeterministicOptionPermutation(seedStr) {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed << 5) - seed + seedStr.charCodeAt(i);
    seed |= 0;
  }
  const letters = ['A', 'B', 'C', 'D'];
  for (let i = letters.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((Math.abs(seed) / 233280) * (i + 1));
    const temp = letters[i];
    letters[i] = letters[j];
    letters[j] = temp;
  }
  return letters;
}

function deterministicShuffle(array, seedStr) {
  if (!Array.isArray(array) || array.length <= 1) return [...(array || [])];
  let seed = 0;
  const str = String(seedStr || 'cbt_seed');
  for (let i = 0; i < str.length; i++) {
    seed = (seed << 5) - seed + str.charCodeAt(i);
    seed |= 0;
  }
  seed = Math.abs(seed) || 12345;

  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const rnd = Math.abs(seed) / 233280;
    const j = Math.floor(rnd * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

module.exports = {
  DEFAULT_GOOGLE_CLIENT_ID,
  runWithAuthContext,
  getAuthContext,
  getApiSecret,
  getSaltKey,
  hashPin,
  verifyPin,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  verifySessionToken,
  generateId,
  generateAccessCode,
  getDeterministicOptionPermutation,
  deterministicShuffle
};
