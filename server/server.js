/* ============================================================
   FOTO WORLD — Main Express Server
   Security layers:
   · Helmet (CSP, HSTS, X-Frame-Options, etc.)
   · Cookie-parser (httpOnly session cookies)
   · CORS (allowlist only)
   · Progressive ban gate (global, before all routes)
   · Bot UA blocker (global, write-paths only)
   · Per-surface rate limiters (from abuse.js)
   · Body size cap (2 MB)
   · dotfiles denied from static serving
   ============================================================ */
'use strict';

require('dotenv').config();

// ── Entropy guard: refuse to start with a weak JWT secret ──
const JWT_SECRET = process.env.JWT_SECRET || '';
if (
  JWT_SECRET.length < 32 ||
  JWT_SECRET === 'fotoworld_super_secret_jwt_key_2024_change_me'
) {
  console.error('\n[FATAL] JWT_SECRET is missing, too short (< 32 chars), or is the default placeholder.');
  console.error('  Fix: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  console.error('  Then paste the output into JWT_SECRET in .env\n');
  process.exit(1);
}

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const path         = require('path');
const { initDB }   = require('./database');

const {
  progressiveBanGate,
  botUABlock,
  adminLoginLimiter,
  galleryLoginLimiter,
  bookingCreationLimiter,
  contactFormLimiter,
  newsletterLimiter,
  reviewSubmitLimiter,
  apiReadLimiter,
  slotCheckLimiter,
} = require('./middleware/abuse');

const app    = express();
const PORT   = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── Security headers ────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      connectSrc:  ["'self'"],
      frameSrc:    ["'self'", 'https://www.google.com'],
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ── CORS ────────────────────────────────────────────────
const allowedOrigins = isProd
  ? [process.env.FRONTEND_URL].filter(Boolean)
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

// ── Parsers ─────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ── Static files (frontend only; dotfiles denied) ───────
app.use(express.static(path.join(__dirname, '..'), {
  index: 'index.html',
  dotfiles: 'deny',
}));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  dotfiles: 'deny',
}));

// ── Global abuse gates (applied to every /api/* request) ─
app.use('/api', progressiveBanGate);
app.use('/api', botUABlock);

// ── Init DB then mount routes ───────────────────────────
initDB().then(() => {
  const authRoutes    = require('./routes/auth');
  const bookingRoutes = require('./routes/bookings');
  const miscRoutes    = require('./routes/misc');
  const galleryRoutes = require('./routes/galleries');

  // Auth — dedicated per-surface limiters
  app.use('/api/auth/admin-login',   adminLoginLimiter);
  app.use('/api/auth/gallery-login', galleryLoginLimiter);
  app.use('/api/auth', authRoutes);

  // Bookings — slot check and creation have tighter limits
  app.use('/api/bookings/slots',   slotCheckLimiter);
  app.use('/api/bookings',         apiReadLimiter, bookingRoutes);

  // Contact / Newsletter / Reviews — each form has its own limiter
  // (applied inside misc routes at the handler level)
  app.use('/api', apiReadLimiter, miscRoutes);

  // Galleries
  app.use('/api/galleries', apiReadLimiter, galleryRoutes);

  // Health endpoint
  app.get('/api/health', (_req, res) => res.json({
    status: 'ok', service: 'FOTO WORLD API', version: '2.0.0',
    timestamp: new Date().toISOString(),
  }));

  // Admin SPA
  app.get('/admin', (_req, res) =>
    res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'))
  );

  // API 404
  app.use('/api/*', (req, res) =>
    res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` })
  );

  // Global error handler — never leak internals
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error(`[ERROR] ${req.method} ${req.originalUrl} — ${err.message}`);
    if (err.code === 'LIMIT_FILE_SIZE')
      return res.status(413).json({ error: `File too large. Max ${process.env.UPLOAD_MAX_MB || 10} MB.` });
    if (err.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON in request body.' });
    res.status(err.status || 500).json({
      error: isProd ? 'An internal error occurred.' : err.message,
    });
  });

  app.listen(PORT, () => {
    console.log('\n🚀  FOTO WORLD Server running!');
    console.log(`   ➜  Frontend : http://localhost:${PORT}`);
    console.log(`   ➜  Admin    : http://localhost:${PORT}/admin`);
    console.log(`   ➜  API      : http://localhost:${PORT}/api`);
    console.log(`   ➜  Health   : http://localhost:${PORT}/api/health`);
    console.log(`   ➜  Mode     : ${process.env.NODE_ENV || 'development'}\n`);
  });

}).catch(err => {
  console.error('❌  Failed to initialise database:', err.message);
  process.exit(1);
});

module.exports = app;
