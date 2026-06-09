/* ============================================================
   FOTO WORLD — Auth Routes
   Security:
   · Async bcrypt.compare (non-blocking)
   · Admin JWT stored in httpOnly SameSite=Strict cookie
   · Gallery JWT returned as Bearer token (separate portal)
   · Logout endpoint revokes JTI + clears cookie
   · /me returns scoped claims only — no DB round-trip leakage
   · Timing-safe: same error message for bad user vs bad pass
   IDOR: No user-supplied IDs are ever trusted without verification
   ============================================================ */
'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../database');
const {
  signAdmin, signGallery,
  setSessionCookie, clearSessionCookie,
  requireAdmin, requireGallery,
  revokeToken,
} = require('../middleware/auth');
const { auditLog } = require('../middleware/abuse');

const router = express.Router();

// ── POST /api/auth/admin-login ───────────────────────────
router.post('/admin-login', [
  body('username').trim().notEmpty().withMessage('Username required'),
  body('password').notEmpty().withMessage('Password required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, password } = req.body;

  // Always look up; always compare (constant-time path to avoid timing oracle)
  const admin = db.get('SELECT id, username, password FROM admins WHERE username = ?', [username]);
  const DUMMY_HASH = '$2a$12$abcdefghijklmnopqrstuvuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu';

  const valid = await bcrypt.compare(password, admin ? admin.password : DUMMY_HASH);

  if (!admin || !valid) {
    auditLog('ADMIN_LOGIN_FAIL', req, { username });
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signAdmin(admin.username);
  setSessionCookie(res, token);

  auditLog('ADMIN_LOGIN_OK', req, { username: admin.username });

  // Do NOT return the token in the body — it lives in the httpOnly cookie only
  res.json({
    success: true,
    admin: { id: admin.id, username: admin.username },
  });
});

// ── POST /api/auth/gallery-login ─────────────────────────
router.post('/gallery-login', [
  body('code').trim().notEmpty().withMessage('Gallery code required'),
  body('password').notEmpty().withMessage('Password required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const code = String(req.body.code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const { password } = req.body;

  const DUMMY_HASH = '$2a$10$abcdefghijklmnopqrstuvuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu';
  const gallery = db.get(
    'SELECT id, code, password, client_name, session_name, session_date, expires_at, active FROM galleries WHERE code = ?',
    [code]
  );

  const valid = await bcrypt.compare(password, gallery ? gallery.password : DUMMY_HASH);

  if (!gallery || !gallery.active || !valid) {
    auditLog('GALLERY_LOGIN_FAIL', req, { code });
    return res.status(401).json({ error: 'Gallery not found or incorrect password' });
  }

  if (gallery.expires_at && new Date(gallery.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Gallery access has expired' });
  }

  const token = signGallery(gallery.code, gallery.client_name);
  auditLog('GALLERY_LOGIN_OK', req, { code: gallery.code });

  res.json({
    success: true,
    token,   // gallery token returned as Bearer (separate client portal)
    gallery: {
      code:         gallery.code,
      client_name:  gallery.client_name,
      session_name: gallery.session_name,
      session_date: gallery.session_date,
    },
  });
});

// ── POST /api/auth/logout ────────────────────────────────
// Works for admin sessions (cookie-based). Gallery clients just discard the token client-side.
router.post('/logout', requireAdmin, (req, res) => {
  revokeToken(req.admin);        // add jti to server-side blocklist
  clearSessionCookie(res);       // clear the httpOnly cookie
  auditLog('ADMIN_LOGOUT', req, { username: req.admin?.username });
  res.json({ success: true });
});

// ── GET /api/auth/me ─────────────────────────────────────
// Returns scoped claims from the verified JWT — no DB query, no IDOR risk.
router.get('/me', requireAdmin, (req, res) => {
  res.json({
    admin: {
      username: req.admin.username,
      role:     req.admin.role,
      iat:      req.admin.iat,
      exp:      req.admin.exp,
    },
  });
});

// ── GET /api/auth/gallery-me ─────────────────────────────
router.get('/gallery-me', requireGallery, (req, res) => {
  res.json({
    gallery: {
      gallery_code: req.gallery.gallery_code,
      client_name:  req.gallery.client_name,
      exp:          req.gallery.exp,
    },
  });
});

module.exports = router;
