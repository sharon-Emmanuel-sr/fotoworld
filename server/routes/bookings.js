/* ============================================================
   FOTO WORLD — Bookings Routes (sql.js version)
   ============================================================ */
'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function genRef() {
  return 'FW-' + new Date().getFullYear() + '-' + uuidv4().slice(0, 4).toUpperCase();
}

// GET /api/bookings/slots?date=YYYY-MM-DD
router.get('/slots', [
  query('date').notEmpty().withMessage('Date required'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { date } = req.query;
  const rows = db.query(
    "SELECT time_slot FROM bookings WHERE date = ? AND status != 'cancelled'",
    [date]
  );
  res.json({ date, booked_slots: rows.map(r => r.time_slot) });
});

// POST /api/bookings
router.post('/', [
  body('service').trim().notEmpty(),
  body('date').notEmpty(),
  body('time_slot').trim().notEmpty(),
  body('name').trim().notEmpty(),
  body('phone').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('occasion').optional().trim(),
  body('notes').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { service, date, time_slot, name, phone, email, occasion = '', notes = '' } = req.body;

  const conflict = db.get(
    "SELECT id FROM bookings WHERE date = ? AND time_slot = ? AND status != 'cancelled'",
    [date, time_slot]
  );
  if (conflict) return res.status(409).json({ error: 'This time slot is already booked. Please choose another.' });

  const ref_code = genRef();
  const result = db.run(
    'INSERT INTO bookings (ref_code,service,date,time_slot,name,phone,email,occasion,notes) VALUES (?,?,?,?,?,?,?,?,?)',
    [ref_code, service, date, time_slot, name, phone, email, occasion, notes]
  );
  const booking = db.get('SELECT * FROM bookings WHERE id = ?', [result.lastInsertRowid]);

  res.status(201).json({
    success: true,
    message: 'Booking created! We will confirm within 24 hours.',
    booking: { id: booking.id, ref_code: booking.ref_code, service: booking.service, date: booking.date, time_slot: booking.time_slot, name: booking.name, status: booking.status, created_at: booking.created_at }
  });
});

// GET /api/bookings (admin)
router.get('/', requireAdmin, (req, res) => {
  const { status, date, search, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = []; let params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (date)   { where.push('date = ?');   params.push(date); }
  if (search) {
    where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR ref_code LIKE ?)');
    const s = `%${search}%`; params.push(s, s, s, s);
  }
  const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = (db.get(`SELECT COUNT(*) as cnt FROM bookings ${wc}`, params) || {}).cnt || 0;
  const rows  = db.query(`SELECT * FROM bookings ${wc} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, parseInt(limit), offset]);

  res.json({ total, page: parseInt(page), limit: parseInt(limit), bookings: rows });
});

// GET /api/bookings/:id (admin)
router.get('/:id', requireAdmin, (req, res) => {
  const booking = db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json({ booking });
});

// PATCH /api/bookings/:id (admin)
router.patch('/:id', requireAdmin, [
  body('status').optional().isIn(['pending','confirmed','cancelled','completed']),
  body('amount').optional().isFloat({ min: 0 }),
  body('notes').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const booking = db.get('SELECT id FROM bookings WHERE id = ?', [req.params.id]);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const { status, amount, notes } = req.body;
  const updates = []; const params = [];
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (amount !== undefined) { updates.push('amount = ?'); params.push(amount); }
  if (notes  !== undefined) { updates.push('notes = ?');  params.push(notes); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);
  db.run(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`, params);

  res.json({ success: true, booking: db.get('SELECT * FROM bookings WHERE id = ?', [req.params.id]) });
});

// DELETE /api/bookings/:id (admin)
router.delete('/:id', requireAdmin, (req, res) => {
  const booking = db.get('SELECT id FROM bookings WHERE id = ?', [req.params.id]);
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  db.run('DELETE FROM bookings WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
