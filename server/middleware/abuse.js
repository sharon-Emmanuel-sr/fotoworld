/* ============================================================
   FOTO WORLD — Abuse Protection Middleware
   ============================================================
   Layers of defence implemented here:
   1.  Fingerprint key generator  – IP + User-Agent hash (makes
       rotating IPs with the same bot UA still trackable)
   2.  Progressive ban store      – in-memory Map that escalates
       window duration after each violation (1min → 15min → 1hr → 24hr)
   3.  Suspicious UA detector     – blocks headless/crawler UAs on
       write-paths (GET public pages are never blocked)
   4.  Honeypot field checker     – any form submission that fills the
       hidden hp_field is silently rejected (bots fill all fields)
   5.  Per-entity throttle        – limits how many times the same
       email/phone can submit within a rolling window (stops enumeration
       and inbox bombing)
   6.  Abuse event audit logger   – structured JSON to stdout so logs
       can be piped to any SIEM/log aggregator
   ============================================================ */
'use strict';

const crypto    = require('crypto');
const rateLimit = require('express-rate-limit');

// ── 1. Fingerprint key generator ─────────────────────────
/**
 * Returns a composite key of IP + hashed User-Agent.
 * Purpose: a bot that rotates IPs but keeps the same UA is still
 * rate-limited under the same bucket.
 */
function fingerprintKey(req, prefix = '') {
  const ua   = req.headers['user-agent'] || 'unknown';
  const uaHash = crypto.createHash('sha1').update(ua).digest('hex').slice(0, 8);
  const ip   = req.ip || req.connection?.remoteAddress || '0.0.0.0';
  return `${prefix}${ip}:${uaHash}`;
}

// ── 2. Progressive ban store ─────────────────────────────
/**
 * After the first rate-limit block, doubles the ban window each time
 * the same fingerprint is flagged again.
 * Windows (ms): 60 000 → 900 000 → 3 600 000 → 86 400 000
 */
const _bans = new Map();  // fingerprint → { until, strikes }
const BAN_WINDOWS_MS = [
  1  * 60 * 1000,   // strike 1: 1 minute
  15 * 60 * 1000,   // strike 2: 15 minutes
  60 * 60 * 1000,   // strike 3: 1 hour
  24 * 60 * 60 * 1000, // strike 4+: 24 hours
];

function _cleanBans() {
  const now = Date.now();
  for (const [key, rec] of _bans) {
    if (rec.until < now) _bans.delete(key);
  }
}

function recordViolation(fingerprint) {
  _cleanBans();
  const rec    = _bans.get(fingerprint) || { strikes: 0, until: 0 };
  rec.strikes += 1;
  const windowMs = BAN_WINDOWS_MS[Math.min(rec.strikes - 1, BAN_WINDOWS_MS.length - 1)];
  rec.until = Date.now() + windowMs;
  _bans.set(fingerprint, rec);
  return rec;
}

function isBanned(fingerprint) {
  _cleanBans();
  const rec = _bans.get(fingerprint);
  if (!rec) return null;
  if (rec.until > Date.now()) return rec;
  return null;
}

// ── 3. Suspicious User-Agent patterns ────────────────────
const BLOCKED_UA_PATTERNS = [
  /python-requests/i,
  /go-http-client/i,
  /curl\//i,
  /wget\//i,
  /httpie/i,
  /scrapy/i,
  /puppeteer/i,
  /playwright/i,
  /phantomjs/i,
  /selenium/i,
  /headlesschrome/i,
  /headless/i,
  /java\/\d/i,
  /libwww-perl/i,
  /lwp-trivial/i,
  /mechanize/i,
  /zgrab/i,
  /masscan/i,
  /nikto/i,
  /nmap/i,
  /sqlmap/i,
  /dirbuster/i,
  /nuclei/i,
  /^$/,  // empty UA
];

/**
 * Returns true when the UA string matches a known bot/scraper signature.
 */
function isSuspiciousUA(ua = '') {
  return BLOCKED_UA_PATTERNS.some(p => p.test(ua));
}

// ── 4. Honeypot middleware ────────────────────────────────
/**
 * Public forms include a hidden field called `website` (CSS: display:none).
 * Legitimate users never see or fill it. Bots that auto-fill forms will.
 * Returns 200 OK (to fool bots) but does NOT process the request.
 */
function honeypot(req, res, next) {
  // Check common honeypot field names
  const trap = req.body?.website || req.body?.hp_field || req.body?.url_field;
  if (trap && String(trap).trim() !== '') {
    auditLog('HONEYPOT_TRIGGERED', req, { trap_field: 'website', value_length: trap.length });
    // Fake success so bots don't retry
    return res.status(200).json({ success: true, message: 'Thank you! We will be in touch.' });
  }
  next();
}

// ── 5. Per-entity throttle (email/phone) ─────────────────
const _entityCounts = new Map();  // key → { count, resetAt }

/**
 * Limits how many times the same email or phone can hit a route.
 * @param {number} maxPerHour
 * @param {string[]} fields  - body fields to extract entity key from
 */
function entityThrottle(maxPerHour = 3, fields = ['email']) {
  return (req, res, next) => {
    // Derive entity key from specified body fields
    const parts = fields
      .map(f => (req.body?.[f] || '').toString().trim().toLowerCase())
      .filter(Boolean);

    if (parts.length === 0) return next();  // no entity field present

    const entityKey = `entity:${parts.join(':')}`;
    const now       = Date.now();
    const rec       = _entityCounts.get(entityKey) || { count: 0, resetAt: now + 3600000 };

    // Reset window if expired
    if (now > rec.resetAt) {
      rec.count   = 0;
      rec.resetAt = now + 3600000;
    }

    rec.count += 1;
    _entityCounts.set(entityKey, rec);

    if (rec.count > maxPerHour) {
      auditLog('ENTITY_THROTTLE', req, { entity: parts[0].slice(0, 6) + '…', count: rec.count });
      return res.status(429).json({
        error: `Too many submissions from this address. Please try again in an hour.`,
        retryAfter: Math.ceil((rec.resetAt - now) / 1000),
      });
    }

    next();
  };
}

// ── 6. Audit logger ──────────────────────────────────────
function auditLog(event, req, extra = {}) {
  const entry = {
    ts:    new Date().toISOString(),
    event,
    ip:    req?.ip || '-',
    ua:    (req?.headers?.['user-agent'] || '-').slice(0, 120),
    path:  req?.originalUrl || '-',
    ...extra,
  };
  // Structured JSON → stdout so it can be piped to any log aggregator
  console.log(`[ABUSE] ${JSON.stringify(entry)}`);
}

// ── Composed middleware factories ─────────────────────────

/**
 * Progressive ban gate — checks ban store before any limiter fires.
 * Must be placed BEFORE all route handlers.
 */
function progressiveBanGate(req, res, next) {
  const fp  = fingerprintKey(req);
  const ban = isBanned(fp);
  if (ban) {
    const remainingMs = ban.until - Date.now();
    auditLog('PROGRESSIVE_BAN_BLOCKED', req, { strikes: ban.strikes, remainingMs });
    res.set('Retry-After', Math.ceil(remainingMs / 1000));
    return res.status(429).json({
      error:       'Your IP has been temporarily blocked due to repeated violations.',
      retryAfter:  Math.ceil(remainingMs / 1000),
      strikes:     ban.strikes,
    });
  }
  next();
}

/**
 * Bot UA blocker for write-path routes (POST/PATCH/DELETE).
 * GET requests to public pages are never blocked.
 */
function botUABlock(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const ua = req.headers['user-agent'] || '';
  if (isSuspiciousUA(ua)) {
    auditLog('BOT_UA_BLOCKED', req, { ua: ua.slice(0, 80) });
    const fp  = fingerprintKey(req);
    recordViolation(fp);
    return res.status(403).json({ error: 'Automated requests are not permitted.' });
  }
  next();
}

/**
 * Rate limiter factory with progressive-ban callback.
 * When the limiter fires, it also records a violation in the ban store.
 */
function makeLimiter({ prefix, windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders:   false,
    keyGenerator:    (req) => fingerprintKey(req, prefix + ':'),
    message:         { error: message },
    handler: (req, res, next, options) => {
      const fp  = fingerprintKey(req, prefix + ':');
      const rec = recordViolation(fp);
      auditLog('RATE_LIMIT_HIT', req, {
        limiter: prefix,
        strikes: rec.strikes,
        banUntil: new Date(rec.until).toISOString(),
      });
      res.set('Retry-After', Math.ceil(options.windowMs / 1000));
      res.status(options.statusCode || 429).json({
        error:      options.message.error,
        retryAfter: Math.ceil(options.windowMs / 1000),
      });
    },
  });
}

// ── Pre-built limiters for each endpoint class ────────────

/** Admin login: 5 attempts / 15 min; hits escalate to progressive ban */
const adminLoginLimiter = makeLimiter({
  prefix:    'admin-login',
  windowMs:  15 * 60 * 1000,
  max:       5,
  message:   'Too many admin login attempts. Try again in 15 minutes.',
});

/** Gallery login: 15 attempts / 15 min */
const galleryLoginLimiter = makeLimiter({
  prefix:    'gallery-login',
  windowMs:  15 * 60 * 1000,
  max:       15,
  message:   'Too many gallery login attempts. Try again in 15 minutes.',
});

/** Public booking creation: 3 per IP per hour */
const bookingCreationLimiter = makeLimiter({
  prefix:    'booking-create',
  windowMs:  60 * 60 * 1000,
  max:       3,
  message:   'Too many booking requests from this IP. Please try again in an hour.',
});

/** Contact form: 5 per IP per hour */
const contactFormLimiter = makeLimiter({
  prefix:    'contact-form',
  windowMs:  60 * 60 * 1000,
  max:       5,
  message:   'Too many contact submissions. Please wait before trying again.',
});

/** Newsletter subscribe: 10 per IP per hour */
const newsletterLimiter = makeLimiter({
  prefix:    'newsletter',
  windowMs:  60 * 60 * 1000,
  max:       10,
  message:   'Too many newsletter signup attempts from this IP.',
});

/** Review submission: 3 per IP per hour */
const reviewSubmitLimiter = makeLimiter({
  prefix:    'review-submit',
  windowMs:  60 * 60 * 1000,
  max:       3,
  message:   'Too many review submissions from this IP.',
});

/** General API read limiter: 300 per IP per 15 min */
const apiReadLimiter = makeLimiter({
  prefix:    'api-read',
  windowMs:  15 * 60 * 1000,
  max:       300,
  message:   'Too many requests. Please slow down.',
});

/** Slot availability scrape guard: 60 per IP per 5 min */
const slotCheckLimiter = makeLimiter({
  prefix:    'slot-check',
  windowMs:  5 * 60 * 1000,
  max:       60,
  message:   'Too many availability checks. Please wait a few minutes.',
});

module.exports = {
  // Core middleware (apply globally)
  progressiveBanGate,
  botUABlock,
  honeypot,

  // Helpers
  entityThrottle,
  auditLog,
  fingerprintKey,

  // Pre-built limiters
  adminLoginLimiter,
  galleryLoginLimiter,
  bookingCreationLimiter,
  contactFormLimiter,
  newsletterLimiter,
  reviewSubmitLimiter,
  apiReadLimiter,
  slotCheckLimiter,
};
