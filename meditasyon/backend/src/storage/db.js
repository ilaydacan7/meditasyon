import { Pool } from "pg";

let pool = null;
let db = null;

function toPgSql(sql) {
  // ? -> $1, $2, $3...
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function migrate(pg) {
  await pg.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      revoked_at BIGINT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

    CREATE TABLE IF NOT EXISTS mood_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      mood_value DOUBLE PRECISION NOT NULL,
      note TEXT,
      created_at BIGINT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, entry_date)
    );
    CREATE INDEX IF NOT EXISTS idx_moods_user_date ON mood_entries(user_id, entry_date);

    CREATE TABLE IF NOT EXISTS sleep_routines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sleep_routines_user ON sleep_routines(user_id);

    CREATE TABLE IF NOT EXISTS sleep_routine_items (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at BIGINT NOT NULL,
      FOREIGN KEY (routine_id) REFERENCES sleep_routines(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sleep_items_routine ON sleep_routine_items(routine_id);

    CREATE TABLE IF NOT EXISTS sleep_item_checkins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      routine_item_id TEXT NOT NULL,
      checkin_date TEXT NOT NULL,
      is_done INTEGER NOT NULL,
      created_at BIGINT NOT NULL,
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
      updated_at BIGINT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at BIGINT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_user_events_user_created ON user_events(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_user_events_type ON user_events(event_type);
  `);
}

function makeWrapper(pg) {
  return {
    async exec(sql) {
      await pg.query(sql);
    },
    prepare(sql) {
      const pgSql = toPgSql(sql);
      return {
        async run(...params) {
          const res = await pg.query(pgSql, params);
          return { changes: res.rowCount ?? 0 };
        },
        async get(...params) {
          const res = await pg.query(pgSql, params);
          return res.rows[0];
        },
        async all(...params) {
          const res = await pg.query(pgSql, params);
          return res.rows;
        },
      };
    },
  };
}

export async function initDb() {
  if (db) return db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  // bağlantı testi
  await pool.query("SELECT 1");

  await migrate(pool);
  db = makeWrapper(pool);
  return db;
}

export function getDb() {
  if (!db) throw new Error("db_not_initialized");
  return db;
}