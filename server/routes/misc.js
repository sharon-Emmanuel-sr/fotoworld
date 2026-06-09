/* ============================================================
   FOTO WORLD — Contact / Newsletter / Reviews Routes
   IDOR protection: All mutating operations verify resource
   existence before acting. Public write endpoints are limited
   by dedicated abuse.js rate limiters + honeypot.
   ============================================================ */
'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');
const {
  contactFormLimiter,
  newsletterLimiter,
  reviewSubmitLimiter,
  entityThrottle,
  honeypot,
} = require('../middleware/abuse');

const router = express.Router();

function safeInt(val, def, min = 1, max = 500) {
  const n = parseInt(val, 10);
  return isNaN(n) ? def : Math.max(min, Math.min(max, n));
}

/* ════════════════════════════════════════════════════════
   CONTACT
════════════════════════════════════════════════════════ */

/* POST /api/contact — public, rate-limited */
router.post('/contact',
  contactFormLimiter,
  honeypot,
  entityThrottle(3, ['email']),  // max 3 messages per email per hour
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name (2–100 chars) required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('phone').optional().trim().isLength({ max: 20 }),
    body('service').optional().trim().isLength({ max: 100 }),
    body('message').trim().isLength({ min: 10, max: 3000 }).withMessage('Message must be 10–3000 characters'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, phone = '', service = '', message } = req.body;
    const result = db.run(
      'INSERT INTO contacts (name,email,phone,service,message) VALUES (?,?,?,?,?)',
      [name, email, phone, service, message]
    );
    res.status(201).json({
      success: true,
      message: 'Thank you! We will respond within 24 hours.',
      id: result.lastInsertRowid,
    });
  }
);

/* GET /api/contact — admin only */
router.get('/contact', requireAdmin, (req, res) => {
  const page   = safeInt(req.query.page, 1);
  const limit  = safeInt(req.query.limit, 25, 1, 200);
  const offset = (page - 1) * limit;
  const { status } = req.query;

  const wc     = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];
  const total  = (db.get(`SELECT COUNT(*) as cnt FROM contacts ${wc}`, params) || {}).cnt || 0;
  const rows   = db.query(
    `SELECT id,name,email,phone,service,message,status,created_at
     FROM contacts ${wc} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ total, page, contacts: rows });
});

/* PATCH /api/contact/:id — admin only, IDOR verified */
router.patch('/contact/:id', requireAdmin, [
  body('status').isIn(['new', 'read', 'replied', 'archived']).withMessage('Invalid status'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  // IDOR: verify resource exists before updating
  const existing = db.get('SELECT id FROM contacts WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  db.run('UPDATE contacts SET status = ? WHERE id = ?', [req.body.status, id]);
  res.json({ success: true });
});

/* DELETE /api/contact/:id — admin only, IDOR verified */
router.delete('/contact/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const existing = db.get('SELECT id FROM contacts WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });

  db.run('DELETE FROM contacts WHERE id = ?', [id]);
  res.json({ success: true });
});

/* ════════════════════════════════════════════════════════
   NEWSLETTER
════════════════════════════════════════════════════════ */

/* POST /api/newsletter — public, rate-limited */
router.post('/newsletter',
  newsletterLimiter,
  honeypot,
  entityThrottle(5, ['email']),
  [body('email').isEmail().normalizeEmail().withMessage('Valid email required')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email } = req.body;
    const existing = db.get('SELECT id, subscribed FROM newsletter WHERE email = ?', [email]);
    if (existing) {
      if (existing.subscribed) {
        return res.json({ success: true, message: 'You are already subscribed!' });
      }
      db.run('UPDATE newsletter SET subscribed = 1 WHERE email = ?', [email]);
      return res.json({ success: true, message: 'Welcome back! You have been re-subscribed.' });
    }
    db.run('INSERT INTO newsletter (email) VALUES (?)', [email]);
    res.status(201).json({ success: true, message: 'Subscribed! Welcome to the FOTO WORLD family.' });
  }
);

/* GET /api/newsletter — admin only */
router.get('/newsletter', requireAdmin, (req, res) => {
  const page   = safeInt(req.query.page, 1);
  const limit  = safeInt(req.query.limit, 200, 1, 500);
  const offset = (page - 1) * limit;
  const total  = (db.get('SELECT COUNT(*) as cnt FROM newsletter WHERE subscribed = 1') || {}).cnt || 0;
  const rows   = db.query(
    'SELECT id,email,created_at FROM newsletter WHERE subscribed = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );
  res.json({ total, subscribers: rows });
});

/* DELETE /api/newsletter/:id — admin only, IDOR verified */
router.delete('/newsletter/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const existing = db.get('SELECT id FROM newsletter WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Subscriber not found' });

  db.run('UPDATE newsletter SET subscribed = 0 WHERE id = ?', [id]);
  res.json({ success: true });
});

/* ════════════════════════════════════════════════════════
   REVIEWS
════════════════════════════════════════════════════════ */

/* POST /api/reviews — public, rate-limited */
router.post('/reviews',
  reviewSubmitLimiter,
  honeypot,
  entityThrottle(2, ['name', 'service']),  // 2 reviews per name+service per hour
  [
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name required (2–100 chars)'),
    body('service').trim().notEmpty().withMessage('Service required'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1–5'),
    body('review_text').trim().isLength({ min: 20, max: 2000 }).withMessage('Review must be 20–2000 characters'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, service, rating, review_text } = req.body;
    const result = db.run(
      'INSERT INTO reviews (name,service,rating,review_text) VALUES (?,?,?,?)',
      [name, service, parseInt(rating, 10), review_text]
    );
    res.status(201).json({
      success: true,
      message: 'Thank you! Your review will appear after approval.',
      id: result.lastInsertRowid,
    });
  }
);

/* GET /api/reviews — public (approved only) */
router.get('/reviews', (req, res) => {
  const { service } = req.query;
  const limit = safeInt(req.query.limit, 20, 1, 100);

  let wc = 'WHERE approved = 1'; let params = [];
  if (service) { wc += ' AND service = ?'; params.push(service); }

  const rows  = db.query(
    `SELECT id,name,service,rating,review_text,verified,created_at FROM reviews ${wc} ORDER BY created_at DESC LIMIT ?`,
    [...params, limit]
  );
  const stats = db.get('SELECT AVG(rating) as avg, COUNT(*) as total FROM reviews WHERE approved = 1');
  res.json({
    average: stats?.avg ? parseFloat(Number(stats.avg).toFixed(1)) : 0,
    total:   stats?.total || 0,
    reviews: rows,
  });
});

/* GET /api/reviews/all — admin only */
router.get('/reviews/all', requireAdmin, (req, res) => {
  const rows = db.query(
    'SELECT id,name,service,rating,review_text,approved,verified,created_at FROM reviews ORDER BY created_at DESC'
  );
  res.json({ reviews: rows });
});

/* PATCH /api/reviews/:id — admin only, IDOR verified */
router.patch('/reviews/:id', requireAdmin, [
  body('approved').optional().isInt({ min: 0, max: 1 }),
  body('verified').optional().isInt({ min: 0, max: 1 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  // IDOR: verify resource exists
  const existing = db.get('SELECT id FROM reviews WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Review not found' });

  const { approved, verified } = req.body;
  const updates = []; const params = [];
  if (approved !== undefined) { updates.push('approved = ?'); params.push(Number(approved)); }
  if (verified !== undefined) { updates.push('verified = ?'); params.push(Number(verified)); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  params.push(id);
  db.run(`UPDATE reviews SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ success: true });
});

/* DELETE /api/reviews/:id — admin only, IDOR verified */
router.delete('/reviews/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const existing = db.get('SELECT id FROM reviews WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Review not found' });

  db.run('DELETE FROM reviews WHERE id = ?', [id]);
  res.json({ success: true });
});

module.exports = router;
