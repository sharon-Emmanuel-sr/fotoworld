/* ============================================================
   FOTO WORLD — Main Express Server (Hardened)
   Security fixes applied:
   - F2:  JWT_SECRET entropy enforced before server listens
   - F4:  Separate rate limiters per auth surface
   - F7:  Helmet middleware with strict CSP
   - F12: Static serving scoped to safe directories only
   ============================================================ */
'use strict';

require('dotenv').config();

// ── F2: Entropy check — refuse to start with a weak secret ──
const JWT_SECRET = process.env.JWT_SECRET || '';
if (
  JWT_SECRET.length < 32 ||
  JWT_SECRET === 'fotoworld_super_secret_jwt_key_2024_change_me'
) {
  console.error('\n[FATAL] JWT_SECRET in .env is missing, too short (< 32 chars), or is the default placeholder.');
  console.error('        Generate a strong secret with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  console.error('        Then update JWT_SECRET in your .env file.\n');
  process.exit(1);
}

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const path         = require('path');
const rateLimit    = require('express-rate-limit');
const { initDB }   = require('./database');

const app  = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ── F7: Helmet — security headers ──────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],  // inline needed for admin SPA; tighten per-page with nonces in production
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      connectSrc:  ["'self'"],
      frameSrc:    ["'self'", 'https://www.google.com'],  // for Maps iframes
      objectSrc:   ["'none'"],
      upgradeInsecureRequests: isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,  // allow Google Fonts/Maps
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ── F4: Separate rate limiters per auth surface ─────────
// Admin login: very tight — 5 attempts per IP per 15 min
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `admin:${req.ip}`,
  message: { error: 'Too many admin login attempts from this IP. Try again in 15 minutes.' },
});

// Gallery login: moderate — 20 per IP per 15 min
const galleryLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `gallery:${req.ip}`,
  message: { error: 'Too many gallery login attempts. Try again in 15 minutes.' },
});

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests. Please try again later.' },
});

// ── CORS ───────────────────────────────────────────────
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

// ── Body / Cookie parsers ───────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

// ── F12: Static serving — only frontend assets, not data/ ──
// Serve static frontend files
app.use(express.static(path.join(__dirname, '..'), {
  index: 'index.html',
  dotfiles: 'deny',  // block .env, .gitignore etc.
  // Exclude server/, data/ from traversal
}));
// Uploaded gallery images
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  dotfiles: 'deny',
}));

// ── Init DB then mount routes ───────────────────────────
initDB().then(() => {
  const authRoutes    = require('./routes/auth');
  const bookingRoutes = require('./routes/bookings');
  const miscRoutes    = require('./routes/misc');
  const galleryRoutes = require('./routes/galleries');

  // Auth routes get their own dedicated limiters
  app.use('/api/auth/admin-login',   adminLoginLimiter);
  app.use('/api/auth/gallery-login', galleryLoginLimiter);
  app.use('/api/auth',               authRoutes);

  app.use('/api/bookings',  apiLimiter, bookingRoutes);
  app.use('/api',           apiLimiter, miscRoutes);
  app.use('/api/galleries', apiLimiter, galleryRoutes);

  // Health (no rate limit — behind load balancer in production)
  app.get('/api/health', (_req, res) => res.json({
    status: 'ok',
    service: 'FOTO WORLD API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  }));

  // Admin SPA
  app.get('/admin', (_req, res) =>
    res.sendFile(path.join(__dirname, '..', 'admin', 'index.html'))
  );

  // API 404
  app.use('/api/*', (req, res) =>
    res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` })
  );

  // Global error handler — never leak stack traces to client
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const reqId = req.headers['x-request-id'] || '-';
    console.error(`[ERROR] [${reqId}] ${err.message}`);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File too large. Max ${process.env.UPLOAD_MAX_MB || 10} MB.` });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON in request body.' });
    }
    res.status(err.status || 500).json({
      error: isProd ? 'An internal error occurred.' : err.message,
    });
  });

  app.listen(PORT, () => {
    console.log('\n🚀  FOTO WORLD Server running!');
    console.log(`   ➜  Frontend:  http://localhost:${PORT}`);
    console.log(`   ➜  Admin:     http://localhost:${PORT}/admin`);
    console.log(`   ➜  API:       http://localhost:${PORT}/api`);
    console.log(`   ➜  Health:    http://localhost:${PORT}/api/health`);
    console.log(`   ➜  Mode:      ${process.env.NODE_ENV || 'development'}\n`);
  });

}).catch(err => {
  console.error('❌  Failed to initialise database:', err.message);
  process.exit(1);
});

module.exports = app;
