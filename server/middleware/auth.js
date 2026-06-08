/* ============================================================
   FOTO WORLD — JWT Auth Middleware (Hardened)
   Security fixes applied:
   - F1:  Token read from httpOnly cookie (not Authorization header) for admin
   - F2:  JWT_SECRET entropy enforced at module load (startup check in server.js)
   - F3:  In-memory JTI blocklist for immediate token revocation on logout
   - F10: jti claim verified on every protected request
   ============================================================ */
'use strict';

const jwt  = require('jsonwebtoken');
const crypto = require('crypto');

// ── Startup: refuse weak/missing secret ──────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32 || JWT_SECRET === 'fotoworld_super_secret_jwt_key_2024_change_me') {
  // This is checked again in server.js before listen(); module-level for belt-and-suspenders
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET is absent, too short, or is the default placeholder. Refusing to start.');
    process.exit(1);
  } else {
    console.warn('[WARN] JWT_SECRET is weak. Set a strong 64-char random secret in .env before production use.');
  }
}

// ── JTI Blocklist (in-memory) ────────────────────────────
// Revoked token IDs; entries expire automatically via TTL map.
const _blocklist = new Map(); // jti → expiresAt (ms)

function _pruneBlocklist() {
  const now = Date.now();
  for (const [jti, exp] of _blocklist) {
    if (exp < now) _blocklist.delete(jti);
  }
}

function revokeToken(decoded) {
  if (!decoded?.jti) return;
  const expiresAt = (decoded.exp || 0) * 1000;
  _blocklist.set(decoded.jti, expiresAt);
  _pruneBlocklist();
}

function isRevoked(jti) {
  _pruneBlocklist();
  return _blocklist.has(jti);
}

// ── Token extractor ─────────────────────────────────────
// Admin tokens come from httpOnly cookie (F1).
// Gallery tokens come from Authorization: Bearer header
// (gallery clients are separate single-page portals, not the admin panel).
function extractToken(req, type) {
  if (type === 'admin') {
    return req.cookies?.fw_admin_session || null;
  }
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// ── Verify Admin ─────────────────────────────────────────
function requireAdmin(req, res, next) {
  const token = extractToken(req, 'admin');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No session token' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    if (!decoded.jti || isRevoked(decoded.jti)) {
      return res.status(401).json({ error: 'Unauthorized: Session has been revoked' });
    }
    req.admin   = decoded;
    req._jwtRaw = token;  // kept for logout
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Session expired. Please log in again.'
      : 'Unauthorized: Invalid session token';
    return res.status(401).json({ error: msg });
  }
}

// ── Verify Gallery Client ────────────────────────────────
function requireGallery(req, res, next) {
  const token = extractToken(req, 'gallery');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No gallery token' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded.gallery_code) {
      return res.status(403).json({ error: 'Forbidden: Gallery access required' });
    }
    if (!decoded.jti || isRevoked(decoded.jti)) {
      return res.status(401).json({ error: 'Unauthorized: Gallery session has been revoked' });
    }
    req.gallery = decoded;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError'
      ? 'Gallery session expired. Please log in again.'
      : 'Unauthorized: Invalid gallery token';
    return res.status(401).json({ error: msg });
  }
}

// ── Token Generators ─────────────────────────────────────
const ADMIN_TTL_S   = parseInt(process.env.JWT_ADMIN_TTL_S)   || 4 * 3600;  // 4 hours
const GALLERY_TTL_S = parseInt(process.env.JWT_GALLERY_TTL_S) || 7 * 86400; // 7 days

function signAdmin(username) {
  return jwt.sign(
    { username, role: 'admin', jti: crypto.randomUUID() },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: ADMIN_TTL_S }
  );
}

function signGallery(code, clientName) {
  return jwt.sign(
    { gallery_code: code, client_name: clientName, jti: crypto.randomUUID() },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: GALLERY_TTL_S }
  );
}

// ── Set / Clear Session Cookie (admin) ──────────────────
const COOKIE_OPTS = {
  httpOnly: true,          // F1: not readable by JS
  sameSite: 'Strict',      // CSRF protection
  secure: process.env.NODE_ENV === 'production',
  maxAge: ADMIN_TTL_S * 1000,
  path: '/',
};

function setSessionCookie(res, token) {
  res.cookie('fw_admin_session', token, COOKIE_OPTS);
}

function clearSessionCookie(res) {
  res.clearCookie('fw_admin_session', { path: '/', sameSite: 'Strict' });
}

module.exports = {
  requireAdmin, requireGallery,
  signAdmin, signGallery,
  setSessionCookie, clearSessionCookie,
  revokeToken,
};
