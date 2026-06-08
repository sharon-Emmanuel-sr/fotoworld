/* ============================================================
   FOTO WORLD — Auth Routes (sql.js version)
   ============================================================ */
'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../database');
const { signAdmin, signGallery, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/admin-login', [
  body('username').trim().notEmpty(),
  body('password').notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { username, password } = req.body;
  const admin = db.get('SELECT * FROM admins WHERE username = ?', [username]);
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, admin.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signAdmin(admin.username);
  res.json({ success: true, token, admin: { id: admin.id, username: admin.username } });
});

router.post('/gallery-login', [
  body('code').trim().notEmpty(),
  body('password').notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const code = String(req.body.code).toUpperCase();
  const { password } = req.body;

  const gallery = db.get('SELECT * FROM galleries WHERE code = ? AND active = 1', [code]);
  if (!gallery) return res.status(401).json({ error: 'Gallery not found or inactive' });

  if (gallery.expires_at && new Date(gallery.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Gallery link has expired' });
  }

  const valid = bcrypt.compareSync(password, gallery.password);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  const token = signGallery(gallery.code, gallery.client_name);
  res.json({
    success: true, token,
    gallery: { code: gallery.code, client_name: gallery.client_name, session_name: gallery.session_name, session_date: gallery.session_date }
  });
});

router.get('/me', requireAdmin, (req, res) => res.json({ admin: req.admin }));

module.exports = router;
