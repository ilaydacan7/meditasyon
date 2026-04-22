import fs from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";

let db = null;
let rawDb = null;
let sqliteFile = null;

function resolveSqliteFile() {
  const raw = process.env.DATABASE_URL || "file:./data/app.sqlite";
  const file = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function migrate(sqliteDb) {
  sqliteDb.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

    CREATE TABLE IF NOT EXISTS mood_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      mood_value REAL NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, entry_date)
    );
    CREATE INDEX IF NOT EXISTS idx_moods_user_date ON mood_entries(user_id, entry_date);

    CREATE TABLE IF NOT EXISTS sleep_routines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sleep_routines_user ON sleep_routines(user_id);

    CREATE TABLE IF NOT EXISTS sleep_routine_items (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (routine_id) REFERENCES sleep_routines(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sleep_items_routine ON sleep_routine_items(routine_id);

    CREATE TABLE IF NOT EXISTS sleep_item_checkins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      routine_item_id TEXT NOT NULL,
      checkin_date TEXT NOT NULL,
      is_done INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (routine_item_id) REFERENCES sleep_routine_items(id) ON DELETE CASCADE,
      UNIQUE (user_id, routine_item_id, checkin_date)
    );
    CREATE INDEX IF NOT EXISTS idx_sleep_checkins_user_date ON sleep_item_checkins(user_id, checkin_date);

    CREATE TABLE IF NOT EXISTS sleep_settings (
      user_id TEXT PRIMARY KEY,
      time_hhmm TEXT NOT NULL,
      message TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}

function persist() {
  if (!rawDb || !sqliteFile) return;
  const data = rawDb.export();
  fs.writeFileSync(sqliteFile, Buffer.from(data));
}

function bindParams(stmt, params) {
  if (!params || params.length === 0) return;
  // sql.js supports binding array or object. We'll pass array.
  stmt.bind(params);
}

function makeWrapper(sqliteDb) {
  const wrap = {
    exec(sql) {
      sqliteDb.exec(sql);
      persist();
    },
    prepare(sql) {
      const stmt = sqliteDb.prepare(sql);
      return {
        run(...params) {
          bindParams(stmt, params);
          stmt.step();
          stmt.reset();
          persist();
          return { changes: sqliteDb.getRowsModified() };
        },
        get(...params) {
          bindParams(stmt, params);
          const has = stmt.step();
          const row = has ? stmt.getAsObject() : undefined;
          stmt.reset();
          return has ? row : undefined;
        },
        all(...params) {
          bindParams(stmt, params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.reset();
          return rows;
        },
      };
    },
  };
  return wrap;
}

export async function initDb() {
  if (db) return db;
  sqliteFile = resolveSqliteFile();
  ensureParentDir(sqliteFile);

  const SQL = await initSqlJs();
  const exists = fs.existsSync(sqliteFile);
  const fileBuffer = exists ? fs.readFileSync(sqliteFile) : null;
  const sqliteDb = new SQL.Database(fileBuffer ? new Uint8Array(fileBuffer) : undefined);

  migrate(sqliteDb);
  rawDb = sqliteDb;
  db = makeWrapper(sqliteDb);
  persist();
  return db;
}

export function getDb() {
  if (!db) throw new Error("db_not_initialized");
  return db;
}

