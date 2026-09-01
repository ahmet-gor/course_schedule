import type Database from 'better-sqlite3'

const BASE_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    credits REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS instructors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    max_weekly_hours REAL NOT NULL DEFAULT 12,
    unavailable TEXT NOT NULL DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    building TEXT NOT NULL DEFAULT '',
    capacity INTEGER NOT NULL DEFAULT 0,
    travel_group TEXT NOT NULL DEFAULT 'A'
  )`,
  `CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 0,
    sessions_per_week INTEGER NOT NULL DEFAULT 2,
    duration_minutes INTEGER NOT NULL DEFAULT 75,
    instructor_id INTEGER REFERENCES instructors(id) ON DELETE SET NULL,
    room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    locked INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS meeting_times (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    days TEXT NOT NULL,
    start_minute INTEGER NOT NULL,
    end_minute INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  )`
]

const WEEKS_FEATURE: string[] = [
  `ALTER TABLE terms ADD COLUMN weeks INTEGER NOT NULL DEFAULT 14`,
  `ALTER TABLE terms ADD COLUMN start_date TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE terms ADD COLUMN break_weeks TEXT NOT NULL DEFAULT '[]'`,
  `CREATE TABLE IF NOT EXISTS meeting_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('move', 'cancel', 'extra')),
    from_day INTEGER,
    to_day INTEGER,
    start_minute INTEGER,
    end_minute INTEGER,
    room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    instructor_id INTEGER REFERENCES instructors(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_overrides_section_week ON meeting_overrides (section_id, week)`
]

const MIGRATIONS: { id: number; statements: string[] }[] = [
  { id: 1, statements: BASE_SCHEMA },
  { id: 2, statements: WEEKS_FEATURE }
]

export function runMigrations(sqlite: Database.Database): void {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`)
  const applied = new Set(
    (sqlite.prepare('SELECT id FROM schema_migrations').all() as { id: number }[]).map((r) => r.id)
  )
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue
    sqlite.transaction(() => {
      for (const stmt of m.statements) sqlite.exec(stmt)
      sqlite.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(m.id, Date.now())
    })()
  }
}
