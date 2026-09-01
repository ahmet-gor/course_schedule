import type Database from 'better-sqlite3'

const BASE_SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  )`
]

const WEEKS_FEATURE: string[] = [
  `ALTER TABLE terms ADD COLUMN weeks INTEGER NOT NULL DEFAULT 14`,
  `ALTER TABLE terms ADD COLUMN start_date TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE terms ADD COLUMN break_weeks TEXT NOT NULL DEFAULT '[]'`
]

const LEGACY_TABLES = ['meeting_overrides', 'meeting_times', 'sections', 'courses', 'rooms', 'instructors']

const CLASS_MODEL: string[] = [
  `CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    grade TEXT NOT NULL DEFAULT '',
    capacity INTEGER NOT NULL DEFAULT 0,
    homeroom TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    title TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    max_weekly_hours REAL NOT NULL DEFAULT 12,
    unavailable TEXT NOT NULL DEFAULT '[]',
    subject_ids TEXT NOT NULL DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    sessions_per_week INTEGER NOT NULL DEFAULT 2,
    duration_minutes INTEGER NOT NULL DEFAULT 40,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    locked INTEGER NOT NULL DEFAULT 0,
    days TEXT NOT NULL DEFAULT '',
    start_minute INTEGER,
    end_minute INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_lessons_class ON lessons (class_id)`,
  `CREATE TABLE IF NOT EXISTS meeting_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('move', 'cancel', 'extra')),
    from_day INTEGER,
    to_day INTEGER,
    start_minute INTEGER,
    end_minute INTEGER,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    note TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_overrides_lesson_week ON meeting_overrides (lesson_id, week)`
]

const MIGRATIONS: { id: number; statements: string[] }[] = [
  { id: 1, statements: BASE_SCHEMA },
  { id: 2, statements: WEEKS_FEATURE },
  {
    id: 3,
    statements: [
      ...LEGACY_TABLES.map((t) => `DROP TABLE IF EXISTS ${t}`),
      ...CLASS_MODEL
    ]
  }
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
