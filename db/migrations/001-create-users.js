import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', '..', 'db', 'themes.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

console.log('Running migration: create users table');

// Create users table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    username         TEXT UNIQUE NOT NULL,
    email            TEXT UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    title            TEXT,                     -- fancy internet title like "Rising Trackmaker", "Palette Master", etc.
    rank_level       INTEGER DEFAULT 1,        -- numeric rank based on contribution
    total_score      INTEGER DEFAULT 0,        -- overall contribution points
    themes_uploaded  INTEGER DEFAULT 0,
    themes_received  INTEGER DEFAULT 0,        -- e.g. downloads/favorites received
    ranks_given      INTEGER DEFAULT 0,        -- ratings given to other themes
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Safe column additions (in case table exists but missing columns)
const columns = [
  ['title', 'TEXT'],
  ['rank_level', 'INTEGER DEFAULT 1'],
  ['total_score', 'INTEGER DEFAULT 0'],
  ['themes_uploaded', 'INTEGER DEFAULT 0'],
  ['themes_received', 'INTEGER DEFAULT 0'],
  ['ranks_given', 'INTEGER DEFAULT 0'],
  ['created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP']
];

for (const [colName, colType] of columns) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${colName} ${colType}`);
    console.log(`Added column ${colName}`);
  } catch(e) {
    // Column already exists, ignore
  }
}

console.log('Migration completed');
db.close();