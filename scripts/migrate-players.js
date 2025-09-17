// scripts/migrate_players.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = process.env.DATABASE_FILE || path.join(__dirname, '..', 'data', 'tournaments.db');
if (!fs.existsSync(DB_FILE)) {
  console.error('DB file not found at', DB_FILE);
  process.exit(1);
}

const db = new sqlite3.Database(DB_FILE);
function all(sql, params = []) {
  return new Promise((res, rej) => db.all(sql, params, (e, rows) => e ? rej(e) : res(rows)));
}
function run(sql, params = []) {
  return new Promise((res, rej) => db.run(sql, params, function (err) { if (err) rej(err); else res(this); }));
}

(async () => {
  try {
    const rows = await all('SELECT id, players FROM tournaments');
    console.log(`Found ${rows.length} tournaments. Scanning players column...`);
    for (const r of rows) {
      let parsed = [];
      try { parsed = JSON.parse(r.players || '[]'); } catch (e) { parsed = []; }
      let changed = false;
      if (Array.isArray(parsed) && parsed.length > 0 && (typeof parsed[0] === 'string' || typeof parsed[0] === 'number')) {
        const converted = parsed.map(pid => ({ id: String(pid), confirmed: false, joined_at: Date.now() }));
        await run('UPDATE tournaments SET players = ? WHERE id = ?', [JSON.stringify(converted), r.id]);
        console.log(`Migrated tournament id=${r.id}: ${parsed.length} players -> objects.`);
        changed = true;
      } else {
        if (Array.isArray(parsed)) {
          const cleaned = parsed.map(p => {
            if (!p || !p.id) return null;
            return { id: String(p.id), confirmed: !!p.confirmed, joined_at: p.joined_at || Date.now() };
          }).filter(Boolean);
          const needFix = cleaned.some((c, i) => JSON.stringify(c) !== JSON.stringify(parsed[i]));
          if (needFix) {
            await run('UPDATE tournaments SET players = ? WHERE id = ?', [JSON.stringify(cleaned), r.id]);
            console.log(`Normalized tournament id=${r.id} player objects`);
            changed = true;
          }
        }
      }
      if (!changed) console.log(`No change for tournament id=${r.id}`);
    }
    console.log('Migration complete.');
    db.close();
  } catch (err) {
    console.error('Migration error', err);
    db.close();
    process.exit(1);
  }
})();
