import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, 'collection.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS sets (
    id            TEXT PRIMARY KEY,
    name          TEXT,
    series        TEXT,
    printed_total INTEGER,
    total         INTEGER,
    release_date  TEXT,
    symbol_image  TEXT,
    logo_image    TEXT,
    ptcgo_code    TEXT,
    synced_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cards (
    id          TEXT PRIMARY KEY,
    set_id      TEXT,
    name        TEXT,
    number      TEXT,
    rarity      TEXT,
    subtypes    TEXT,
    variants    TEXT,
    small_image TEXT,
    large_image TEXT,
    synced_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_cards_set_id ON cards(set_id);

  CREATE TABLE IF NOT EXISTS sync_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS collection (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id     TEXT NOT NULL,
    set_id      TEXT NOT NULL,
    card_name   TEXT NOT NULL,
    set_name    TEXT NOT NULL,
    card_number TEXT,
    card_image  TEXT,
    rarity      TEXT,
    finish      TEXT DEFAULT 'normal',
    quantity    INTEGER DEFAULT 1,
    condition   TEXT DEFAULT 'mint',
    wishlist    INTEGER DEFAULT 0,
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations for existing databases
try { db.exec(`ALTER TABLE cards ADD COLUMN subtypes TEXT`); } catch {}
try { db.exec(`ALTER TABLE collection ADD COLUMN finish TEXT DEFAULT 'normal'`); } catch {}
try { db.exec(`ALTER TABLE cards ADD COLUMN variants TEXT`); } catch {}

export default db;
