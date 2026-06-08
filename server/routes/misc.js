/* ============================================================
   FOTO WORLD — Contact / Newsletter / Reviews (sql.js)
   ============================================================ */
'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

/* ── CONTACT ── */
router.post('/contact', [
  body('name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('phone').optional().trim(),
  body('service').optional().trim(),
  body('message').trim().isLength({ min: 10 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, email, phone = '', service = '', message } = req.body;
  const result = db.run(
    'INSERT INTO contacts (name,email,phone,service,message) VALUES (?,?,?,?,?)',
    [name, email, phone, service, message]
  );
  res.status(201).json({ success: true, message: 'Thank you! We will respond within 24 hours.', id: result.lastInsertRowid });
});

router.get('/contact', requireAdmin, (req, res) => {
  const { status, page = 1, limit = 25 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const wc = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];
  const total = (db.get(`SELECT COUNT(*) as cnt FROM contacts ${wc}`, params) || {}).cnt || 0;
  const rows  = db.query(`SELECT * FROM contacts ${wc} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);
  res.json({ total, page: parseInt(page), contacts: rows });
});

router.patch('/contact/:id', requireAdmin, [body('status').isIn(['new','read','replied','archived'])], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  db.run('UPDATE contacts SET status = ? WHERE id = ?', [req.body.status, req.params.id]);
  res.json({ success: true });
});

router.delete('/contact/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM contacts WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

/* ── NEWSLETTER ── */
router.post('/newsletter', [body('email').isEmail().normalizeEmail()], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email } = req.body;
  const existing = db.get('SELECT id, subscribed FROM newsletter WHERE email = ?', [email]);
  if (existing) {
    if (existing.subscribed) return res.json({ success: true, message: 'You are already subscribed!' });
    db.run('UPDATE newsletter SET subscribed = 1 WHERE email = ?', [email]);
    return res.json({ success: true, message: 'Welcome back! You have been re-subscribed.' });
  }
  db.run('INSERT INTO newsletter (email) VALUES (?)', [email]);
  res.status(201).json({ success: true, message: 'Subscribed! Welcome to the FOTO WORLD family.' });
});

router.get('/newsletter', requireAdmin, (req, res) => {
  const { page = 1, limit = 200 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const total = (db.get('SELECT COUNT(*) as cnt FROM newsletter WHERE subscribed = 1') || {}).cnt || 0;
  const rows  = db.query('SELECT * FROM newsletter WHERE subscribed = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?', [parseInt(limit), offset]);
  res.json({ total, subscribers: rows });
});

router.delete('/newsletter/:id', requireAdmin, (req, res) => {
  db.run('UPDATE newsletter SET subscribed = 0 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

/* ── REVIEWS ── */
router.post('/reviews', [
  body('name').trim().notEmpty(),
  body('service').trim().notEmpty(),
  body('rating').isInt({ min: 1, max: 5 }),
  body('review_text').trim().isLength({ min: 20 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, service, rating, review_text } = req.body;
  const result = db.run(
    'INSERT INTO reviews (name,service,rating,review_text) VALUES (?,?,?,?)',
    [name, service, parseInt(rating), review_text]
  );
  res.status(201).json({ success: true, message: 'Thank you! Your review will appear after approval.', id: result.lastInsertRowid });
});

router.get('/reviews', (req, res) => {
  const { service, limit = 20 } = req.query;
  let wc = 'WHERE approved = 1'; let params = [];
  if (service) { wc += ' AND service = ?'; params.push(service); }
  const rows = db.query(`SELECT * FROM reviews ${wc} ORDER BY created_at DESC LIMIT ?`, [...params, parseInt(limit)]);
  const stats = db.get('SELECT AVG(rating) as avg, COUNT(*) as total FROM reviews WHERE approved = 1');
  res.json({ average: stats && stats.avg ? parseFloat(Number(stats.avg).toFixed(1)) : 0, total: (stats && stats.total) || 0, reviews: rows });
});

router.get('/reviews/all', requireAdmin, (req, res) => {
  res.json({ reviews: db.query('SELECT * FROM reviews ORDER BY created_at DESC') });
});

router.patch('/reviews/:id', requireAdmin, [
  body('approved').optional().isInt({ min: 0, max: 1 }),
  body('verified').optional().isInt({ min: 0, max: 1 }),
], (req, res) => {
  const { approved, verified } = req.body;
  const updates = []; const params = [];
  if (approved !== undefined) { updates.push('approved = ?'); params.push(approved); }
  if (verified !== undefined) { updates.push('verified = ?'); params.push(verified); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  params.push(req.params.id);
  db.run(`UPDATE reviews SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ success: true });
});

router.delete('/reviews/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM reviews WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
