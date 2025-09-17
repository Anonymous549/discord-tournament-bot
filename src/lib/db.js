// src/lib/db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const DB_FILE = process.env.DATABASE_FILE || path.join(__dirname, '..', 'data', 'tournaments.db');

fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new sqlite3.Database(DB_FILE);

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err); else resolve(this);
  }));
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => {
    if (err) reject(err); else resolve(row);
  }));
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => {
    if (err) reject(err); else resolve(rows);
  }));
}

async function init() {
  await run(`CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    channel_id TEXT,
    name TEXT,
    owner_id TEXT,
    max_players INTEGER,
    total_slots INTEGER,
    group_size INTEGER DEFAULT 1,
    mention_role_id TEXT,
    status TEXT DEFAULT 'open',
    players TEXT DEFAULT '[]',
    matches TEXT DEFAULT '[]',
    groups TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )`);
  await run(`CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE,
    rating REAL DEFAULT 1200
  )`);
}

module.exports = { db, run, get, all, init };
