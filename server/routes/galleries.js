/* ============================================================
   FOTO WORLD — Galleries Routes (sql.js version)
   ============================================================ */
'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../database');
const { requireAdmin, requireGallery } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'galleries');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, String(req.params.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ['.jpg','.jpeg','.png','.webp'].includes(ext) ? cb(null, true) : cb(new Error('Images only'));
  },
  limits: { fileSize: (parseInt(process.env.UPLOAD_MAX_MB) || 10) * 1024 * 1024 }
});

// POST /api/galleries (admin)
router.post('/', requireAdmin, [
  body('code').trim().notEmpty(),
  body('password').notEmpty(),
  body('client_name').trim().notEmpty(),
  body('session_name').trim().notEmpty(),
  body('session_date').notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { code, password, client_name, session_name, session_date, expires_at } = req.body;
  const upperCode = String(code).toUpperCase();

  const existing = db.get('SELECT id FROM galleries WHERE code = ?', [upperCode]);
  if (existing) return res.status(409).json({ error: 'Gallery code already exists' });

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.run(
    'INSERT INTO galleries (code,password,client_name,session_name,session_date,expires_at) VALUES (?,?,?,?,?,?)',
    [upperCode, hashed, client_name, session_name, session_date, expires_at || null]
  );
  const gallery = db.get('SELECT * FROM galleries WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({ success: true, gallery: { ...gallery, password: undefined } });
});

// GET /api/galleries (admin)
router.get('/', requireAdmin, (req, res) => {
  const galleries = db.query(`
    SELECT g.id, g.code, g.client_name, g.session_name, g.session_date, g.expires_at, g.active, g.created_at,
           COUNT(p.id) as photo_count
    FROM galleries g LEFT JOIN gallery_photos p ON p.gallery_id = g.id
    GROUP BY g.id ORDER BY g.created_at DESC
  `);
  res.json({ galleries: galleries.map(g => ({ ...g, password: undefined })) });
});

// GET /api/galleries/:code (client with JWT)
router.get('/:code', requireGallery, (req, res) => {
  const code = req.params.code.toUpperCase();
  if (req.gallery.gallery_code !== code) return res.status(403).json({ error: 'Access denied' });

  const gallery = db.get('SELECT * FROM galleries WHERE code = ? AND active = 1', [code]);
  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

  const photos = db.query('SELECT * FROM gallery_photos WHERE gallery_id = ? ORDER BY sort_order, created_at', [gallery.id]);

  res.json({
    gallery: { code: gallery.code, client_name: gallery.client_name, session_name: gallery.session_name, session_date: gallery.session_date },
    photos: photos.map(p => ({
      id: p.id, url: `/uploads/galleries/${gallery.id}/${p.filename}`,
      label: p.label, category: p.category,
    }))
  });
});

// POST /api/galleries/:id/photos (admin)
router.post('/:id/photos', requireAdmin, upload.array('photos', 100), (req, res) => {
  const gallery = db.get('SELECT * FROM galleries WHERE id = ?', [req.params.id]);
  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  req.files.forEach(file => {
    db.run('INSERT INTO gallery_photos (gallery_id,filename,label,category) VALUES (?,?,?,?)',
      [gallery.id, file.filename, req.body.label || file.originalname, req.body.category || 'General']);
  });

  const photos = db.query('SELECT * FROM gallery_photos WHERE gallery_id = ? ORDER BY created_at DESC', [gallery.id]);
  res.status(201).json({ success: true, uploaded: req.files.length, photos });
});

// DELETE /api/galleries/:id/photos/:photoId (admin)
router.delete('/:id/photos/:photoId', requireAdmin, (req, res) => {
  const photo = db.get('SELECT * FROM gallery_photos WHERE id = ? AND gallery_id = ?', [req.params.photoId, req.params.id]);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const filePath = path.join(UPLOAD_DIR, req.params.id, photo.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.run('DELETE FROM gallery_photos WHERE id = ?', [photo.id]);
  res.json({ success: true });
});

// DELETE /api/galleries/:id (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  const gallery = db.get('SELECT * FROM galleries WHERE id = ?', [req.params.id]);
  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

  const dir = path.join(UPLOAD_DIR, req.params.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  db.run('DELETE FROM gallery_photos WHERE gallery_id = ?', [req.params.id]);
  db.run('DELETE FROM galleries WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
