/* ============================================================
   FOTO WORLD — Bookings Routes
   IDOR protection: Every mutating operation (PATCH/DELETE)
   verifies the booking exists before acting. Only admin-
   authenticated requests can read or modify any booking.
   Public endpoints (POST /bookings, GET /slots) are limited
   by abuse.js limiters applied in server.js.
   ============================================================ */
'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { requireAdmin } = require('../middleware/auth');
const {
  bookingCreationLimiter,
  slotCheckLimiter,
  entityThrottle,
  honeypot,
} = require('../middleware/abuse');

const router = express.Router();

/* ── Helpers ── */
function genRef() {
  return 'FW-' + new Date().getFullYear() + '-' + uuidv4().slice(0, 6).toUpperCase();
}

function safeInt(val, def, min = 1, max = 100) {
  const n = parseInt(val, 10);
  return isNaN(n) ? def : Math.max(min, Math.min(max, n));
}

/* ── GET /api/bookings/slots?date=YYYY-MM-DD ── (public, rate-limited) */
router.get('/slots',
  slotCheckLimiter,
  [query('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { date } = req.query;
    const rows = db.query(
      "SELECT time_slot FROM bookings WHERE date = ? AND status != 'cancelled'",
      [date]
    );
    res.json({ date, booked_slots: rows.map(r => r.time_slot) });
  }
);

/* ── POST /api/bookings ── (public, rate-limited + honeypot + entity throttle) */
router.post('/',
  bookingCreationLimiter,
  honeypot,
  entityThrottle(3, ['email']),  // max 3 bookings per email per hour
  [
    body('service').trim().notEmpty().withMessage('Service is required'),
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Valid date (YYYY-MM-DD) required'),
    body('time_slot').trim().notEmpty().withMessage('Time slot is required'),
    body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name (2–100 chars) required'),
    body('phone').trim().matches(/^[0-9+\-\s()]{7,20}$/).withMessage('Valid phone number required'),
    body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
    body('occasion').optional().trim().isLength({ max: 200 }),
    body('notes').optional().trim().isLength({ max: 1000 }),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { service, date, time_slot, name, phone, email, occasion = '', notes = '' } = req.body;

    // Prevent booking dates in the past
    if (new Date(date) < new Date(new Date().toDateString())) {
      return res.status(400).json({ error: 'Cannot book a date in the past.' });
    }

    // Check slot conflict
    const conflict = db.get(
      "SELECT id FROM bookings WHERE date = ? AND time_slot = ? AND status != 'cancelled'",
      [date, time_slot]
    );
    if (conflict) {
      return res.status(409).json({ error: 'This time slot is already booked. Please choose another.' });
    }

    const ref_code = genRef();
    const result = db.run(
      'INSERT INTO bookings (ref_code,service,date,time_slot,name,phone,email,occasion,notes) VALUES (?,?,?,?,?,?,?,?,?)',
      [ref_code, service, date, time_slot, name, phone, email, occasion, notes]
    );
    const booking = db.get('SELECT * FROM bookings WHERE id = ?', [result.lastInsertRowid]);

    res.status(201).json({
      success: true,
      message: 'Booking received! We will confirm within 24 hours.',
      booking: {
        id: booking.id, ref_code: booking.ref_code,
        service: booking.service, date: booking.date,
        time_slot: booking.time_slot, name: booking.name,
        status: booking.status, created_at: booking.created_at,
      },
    });
  }
);

/* ── GET /api/bookings ── (admin only) */
router.get('/', requireAdmin, (req, res) => {
  const page   = safeInt(req.query.page, 1);
  const limit  = safeInt(req.query.limit, 20, 1, 100);
  const offset = (page - 1) * limit;
  const { status, date, search } = req.query;

  const where = []; const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (date)   { where.push('date = ?');   params.push(date); }
  if (search) {
    where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR ref_code LIKE ?)');
    const s = `%${search}%`; params.push(s, s, s, s);
  }
  const wc = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = (db.get(`SELECT COUNT(*) as cnt FROM bookings ${wc}`, params) || {}).cnt || 0;
  const rows  = db.query(
    `SELECT id,ref_code,service,date,time_slot,name,phone,email,occasion,notes,amount,status,created_at,updated_at
     FROM bookings ${wc} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ total, page, limit, bookings: rows });
});

/* ── GET /api/bookings/:id ── (admin only, IDOR: id verified in DB) */
router.get('/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const booking = db.get(
    `SELECT id,ref_code,service,date,time_slot,name,phone,email,occasion,notes,amount,status,created_at,updated_at
     FROM bookings WHERE id = ?`,
    [id]
  );
  if (!booking) return res.status(404).json({ error: 'Booking not found' });
  res.json({ booking });
});

/* ── PATCH /api/bookings/:id ── (admin only, IDOR: existence verified) */
router.patch('/:id', requireAdmin, [
  body('status').optional().isIn(['pending', 'confirmed', 'cancelled', 'completed']).withMessage('Invalid status'),
  body('amount').optional().isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('notes').optional().trim().isLength({ max: 2000 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  // IDOR check — confirm booking exists before any update
  const existing = db.get('SELECT id FROM bookings WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  const { status, amount, notes } = req.body;
  const updates = []; const params = [];
  if (status !== undefined) { updates.push('status = ?'); params.push(status); }
  if (amount !== undefined) { updates.push('amount = ?'); params.push(parseFloat(amount)); }
  if (notes  !== undefined) { updates.push('notes = ?');  params.push(notes); }
  if (!updates.length)       return res.status(400).json({ error: 'Nothing to update' });

  updates.push("updated_at = datetime('now')");
  params.push(id);
  db.run(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`, params);

  const updated = db.get(
    'SELECT id,ref_code,service,date,time_slot,name,phone,email,amount,status,created_at,updated_at FROM bookings WHERE id = ?',
    [id]
  );
  res.json({ success: true, booking: updated });
});

/* ── DELETE /api/bookings/:id ── (admin only, IDOR: existence verified) */
router.delete('/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  // IDOR check
  const existing = db.get('SELECT id FROM bookings WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  db.run('DELETE FROM bookings WHERE id = ?', [id]);
  res.json({ success: true });
});

module.exports = router;
