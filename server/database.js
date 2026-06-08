/* ============================================================
   FOTO WORLD — Database (sql.js — Pure JS/WASM SQLite)
   No native compilation required.
   Persists to disk as data/fotoworld.db binary.
   ============================================================ */
'use strict';

const initSqlJs = require('sql.js');
const path = require('path');
const fs   = require('fs');

const DB_DIR  = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DB_DIR, 'fotoworld.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let _db = null;

// ── Initialise (async) ──────────────────────────────────
async function initDB() {
  if (_db) return _db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    const buf = fs.readFileSync(DB_FILE);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }

  // Enable WAL-like mode (sql.js doesn't support it but we keep the call for compat)
  _db.run("PRAGMA foreign_keys = ON;");

  // ── Schema ──────────────────────────────────────────────
  _db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_code    TEXT    UNIQUE NOT NULL,
      service     TEXT    NOT NULL,
      date        TEXT    NOT NULL,
      time_slot   TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      phone       TEXT    NOT NULL,
      email       TEXT    NOT NULL,
      occasion    TEXT    DEFAULT '',
      notes       TEXT    DEFAULT '',
      status      TEXT    DEFAULT 'pending',
      amount      REAL    DEFAULT 0,
      advance_paid INTEGER DEFAULT 0,
      created_at  TEXT    DEFAULT (datetime('now')),
      updated_at  TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS contacts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      email       TEXT    NOT NULL,
      phone       TEXT    DEFAULT '',
      service     TEXT    DEFAULT '',
      message     TEXT    NOT NULL,
      status      TEXT    DEFAULT 'new',
      created_at  TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS newsletter (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      email       TEXT    UNIQUE NOT NULL,
      subscribed  INTEGER DEFAULT 1,
      created_at  TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT    NOT NULL,
      service      TEXT    NOT NULL,
      rating       INTEGER NOT NULL,
      review_text  TEXT    NOT NULL,
      verified     INTEGER DEFAULT 0,
      approved     INTEGER DEFAULT 0,
      created_at   TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS galleries (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT    UNIQUE NOT NULL,
      password     TEXT    NOT NULL,
      client_name  TEXT    NOT NULL,
      session_name TEXT    NOT NULL,
      session_date TEXT    NOT NULL,
      expires_at   TEXT,
      active       INTEGER DEFAULT 1,
      created_at   TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS gallery_photos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      gallery_id   INTEGER NOT NULL,
      filename     TEXT    NOT NULL,
      label        TEXT    DEFAULT '',
      category     TEXT    DEFAULT 'General',
      sort_order   INTEGER DEFAULT 0,
      created_at   TEXT    DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS admins (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT    UNIQUE NOT NULL,
      password   TEXT    NOT NULL,
      created_at TEXT    DEFAULT (datetime('now'))
    );
  `);

  persist();
  return _db;
}

// ── Save DB to disk after every write ───────────────────
function persist() {
  if (!_db) return;
  const data = _db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

// ── Synchronous-style helpers (mimic better-sqlite3 API) ─
// These wrap sql.js's exec/prepare to feel synchronous for route code.

function query(sql, params = []) {
  const stmt = _db.prepare(sql);
  stmt.bind(bindParams(params));
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] || null;
}

function run(sql, params = []) {
  _db.run(sql, bindParams(params));
  const lastId = get('SELECT last_insert_rowid() as id').id;
  persist();
  return { lastInsertRowid: lastId, changes: _db.getRowsModified() };
}

function bindParams(params) {
  if (!params || params.length === 0) return undefined;
  return params;
}

// Export db-like facade
module.exports = { initDB, get, run, query, persist };
