/* ============================================================
   FOTO WORLD — Galleries Routes (Hardened)
   Security:
   · Async bcrypt.hash for password hashing
   · IDOR protection: id validated and resource existence checked
   · Scoped selects (no wildcard SELECT *)
   · Uploader enforces file size & extensions
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

function safeInt(val) {
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'galleries');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = safeInt(req.params.id);
    if (!id) return cb(new Error('Invalid gallery ID'));
    const dir = path.join(UPLOAD_DIR, String(id));
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
  limits: { fileSize: (parseInt(process.env.UPLOAD_MAX_MB, 10) || 10) * 1024 * 1024 }
});

// POST /api/galleries (admin only)
router.post('/', requireAdmin, [
  body('code').trim().notEmpty().isAlphanumeric().isLength({ min: 4, max: 20 }),
  body('password').notEmpty().isLength({ min: 6, max: 50 }),
  body('client_name').trim().notEmpty().isLength({ max: 100 }),
  body('session_name').trim().notEmpty().isLength({ max: 100 }),
  body('session_date').notEmpty().matches(/^\d{4}-\d{2}-\d{2}$/),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { code, password, client_name, session_name, session_date, expires_at } = req.body;
  const upperCode = String(code).toUpperCase();

  const existing = db.get('SELECT id FROM galleries WHERE code = ?', [upperCode]);
  if (existing) return res.status(409).json({ error: 'Gallery code already exists' });

  // Async bcrypt
  const hashed = await bcrypt.hash(password, 10);
  const result = db.run(
    'INSERT INTO galleries (code,password,client_name,session_name,session_date,expires_at) VALUES (?,?,?,?,?,?)',
    [upperCode, hashed, client_name, session_name, session_date, expires_at || null]
  );
  
  const gallery = db.get(
    'SELECT id, code, client_name, session_name, session_date, expires_at, active, created_at FROM galleries WHERE id = ?',
    [result.lastInsertRowid]
  );
  res.status(201).json({ success: true, gallery });
});

// GET /api/galleries (admin only)
router.get('/', requireAdmin, (req, res) => {
  const galleries = db.query(`
    SELECT g.id, g.code, g.client_name, g.session_name, g.session_date, g.expires_at, g.active, g.created_at,
           COUNT(p.id) as photo_count
    FROM galleries g LEFT JOIN gallery_photos p ON p.gallery_id = g.id
    GROUP BY g.id ORDER BY g.created_at DESC
  `);
  res.json({ galleries });
});

// GET /api/galleries/:code (client with JWT)
router.get('/:code', requireGallery, (req, res) => {
  const code = String(req.params.code).toUpperCase();
  // Authorization check (IDOR-equivalent for client JWT)
  if (req.gallery.gallery_code !== code) return res.status(403).json({ error: 'Access denied' });

  const gallery = db.get(
    'SELECT id, code, client_name, session_name, session_date, active FROM galleries WHERE code = ? AND active = 1',
    [code]
  );
  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

  const photos = db.query(
    'SELECT id, filename, label, category FROM gallery_photos WHERE gallery_id = ? ORDER BY sort_order, created_at',
    [gallery.id]
  );

  res.json({
    gallery: { code: gallery.code, client_name: gallery.client_name, session_name: gallery.session_name, session_date: gallery.session_date },
    photos: photos.map(p => ({
      id: p.id, url: `/uploads/galleries/${gallery.id}/${p.filename}`,
      label: p.label, category: p.category,
    }))
  });
});

// POST /api/galleries/:id/photos (admin only, IDOR checked)
router.post('/:id/photos', requireAdmin, (req, res, next) => {
  const id = safeInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const existing = db.get('SELECT id FROM galleries WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Gallery not found' });

  next();
}, upload.array('photos', 100), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  const id = safeInt(req.params.id);

  req.files.forEach(file => {
    db.run('INSERT INTO gallery_photos (gallery_id,filename,label,category) VALUES (?,?,?,?)',
      [id, file.filename, req.body.label || file.originalname, req.body.category || 'General']);
  });

  const photos = db.query(
    'SELECT id, filename, label, category, sort_order, created_at FROM gallery_photos WHERE gallery_id = ? ORDER BY created_at DESC',
    [id]
  );
  res.status(201).json({ success: true, uploaded: req.files.length, photos });
});

// DELETE /api/galleries/:id/photos/:photoId (admin only, IDOR checked)
router.delete('/:id/photos/:photoId', requireAdmin, (req, res) => {
  const id = safeInt(req.params.id);
  const photoId = safeInt(req.params.photoId);
  if (!id || !photoId) return res.status(400).json({ error: 'Invalid IDs' });

  const photo = db.get('SELECT id, filename FROM gallery_photos WHERE id = ? AND gallery_id = ?', [photoId, id]);
  if (!photo) return res.status(404).json({ error: 'Photo not found in this gallery' });

  const filePath = path.join(UPLOAD_DIR, String(id), photo.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  
  db.run('DELETE FROM gallery_photos WHERE id = ?', [photo.id]);
  res.json({ success: true });
});

// DELETE /api/galleries/:id (admin only, IDOR checked)
router.delete('/:id', requireAdmin, (req, res) => {
  const id = safeInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const gallery = db.get('SELECT id FROM galleries WHERE id = ?', [id]);
  if (!gallery) return res.status(404).json({ error: 'Gallery not found' });

  const dir = path.join(UPLOAD_DIR, String(id));
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  
  db.run('DELETE FROM gallery_photos WHERE gallery_id = ?', [id]);
  db.run('DELETE FROM galleries WHERE id = ?', [id]);
  
  res.json({ success: true });
});

module.exports = router;
