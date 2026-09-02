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

const DEPARTMENTS_FEATURE: string[] = [
  `CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 0,
    homeroom TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS department_lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    sessions_per_week INTEGER NOT NULL DEFAULT 2,
    duration_minutes INTEGER NOT NULL DEFAULT 40,
    UNIQUE (department_id, subject_id)
  )`,
  `ALTER TABLE classes ADD COLUMN department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE`,
  `INSERT INTO departments (term_id, name, capacity, homeroom)
   SELECT term_id, name, capacity, homeroom FROM classes`,
  `UPDATE classes SET department_id = (
     SELECT d.id FROM departments d
     WHERE d.term_id = classes.term_id AND d.name = classes.name
     ORDER BY d.id LIMIT 1
   )`,
  `INSERT OR IGNORE INTO department_lessons (department_id, subject_id, sessions_per_week, duration_minutes)
   SELECT DISTINCT c.department_id, l.subject_id, l.sessions_per_week, l.duration_minutes
   FROM lessons l JOIN classes c ON c.id = l.class_id
   WHERE c.department_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_classes_department ON classes (department_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dept_lessons_department ON department_lessons (department_id)`
]

const DEPARTMENT_UNIQUE_MODEL: string[] = [
  `CREATE TABLE lessons_v5 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    sessions_per_week INTEGER NOT NULL DEFAULT 2,
    duration_minutes INTEGER NOT NULL DEFAULT 40,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    locked INTEGER NOT NULL DEFAULT 0,
    days TEXT NOT NULL DEFAULT '',
    start_minute INTEGER,
    end_minute INTEGER
  )`,
  `INSERT INTO lessons_v5 (id, department_id, subject_id, sessions_per_week, duration_minutes, teacher_id, locked, days, start_minute, end_minute)
   SELECT l.id, c.department_id, l.subject_id, l.sessions_per_week, l.duration_minutes, l.teacher_id, l.locked, l.days, l.start_minute, l.end_minute
   FROM lessons l JOIN classes c ON c.id = l.class_id
   WHERE c.department_id IS NOT NULL
     AND c.id = (SELECT MIN(c2.id) FROM classes c2 WHERE c2.department_id = c.department_id)`,
  `INSERT INTO lessons_v5 (department_id, subject_id, sessions_per_week, duration_minutes)
   SELECT dl.department_id, dl.subject_id, dl.sessions_per_week, dl.duration_minutes
   FROM department_lessons dl
   WHERE NOT EXISTS (SELECT 1 FROM lessons_v5 ln WHERE ln.department_id = dl.department_id AND ln.subject_id = dl.subject_id)`,
  `DROP TABLE lessons`,
  `ALTER TABLE lessons_v5 RENAME TO lessons`,
  `CREATE INDEX IF NOT EXISTS idx_lessons_department ON lessons (department_id)`,
  `DROP TABLE classes`,
  `DROP TABLE department_lessons`
]

const SCHEDULES_MODEL: string[] = [
  `CREATE TABLE schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `INSERT INTO schedules (id, name, created_at) SELECT id, name, created_at FROM terms`,
  `CREATE TABLE teacher_lessons (
    teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    PRIMARY KEY (teacher_id, lesson_id)
  )`,
  `INSERT OR IGNORE INTO teacher_lessons (teacher_id, lesson_id)
   SELECT DISTINCT t.id, l.id FROM teachers t, json_each(t.subject_ids) j, lessons l
   WHERE j.value = l.subject_id`,
  `CREATE TABLE lessons_v6 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    sessions_per_week INTEGER NOT NULL DEFAULT 2,
    duration_minutes INTEGER NOT NULL DEFAULT 40
  )`,
  `INSERT INTO lessons_v6 (id, department_id, code, title, sessions_per_week, duration_minutes)
   SELECT l.id, l.department_id, COALESCE(s.code, 'LSN' || l.id), COALESCE(s.title, ''), l.sessions_per_week, l.duration_minutes
   FROM lessons l LEFT JOIN subjects s ON s.id = l.subject_id`,
  `CREATE TABLE schedule_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    days TEXT NOT NULL DEFAULT '',
    start_minute INTEGER,
    end_minute INTEGER,
    teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
    locked INTEGER NOT NULL DEFAULT 0
  )`,
  `INSERT INTO schedule_entries (id, schedule_id, days, start_minute, end_minute, teacher_id, locked)
   SELECT l.id, d.term_id, l.days, l.start_minute, l.end_minute, l.teacher_id, l.locked
   FROM lessons l JOIN departments d ON d.id = l.department_id
   WHERE l.days <> '' AND l.start_minute IS NOT NULL AND l.end_minute IS NOT NULL AND d.term_id IS NOT NULL`,
  `CREATE TABLE entry_lessons (
    entry_id INTEGER NOT NULL REFERENCES schedule_entries(id) ON DELETE CASCADE,
    lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, lesson_id)
  )`,
  `INSERT OR IGNORE INTO entry_lessons (entry_id, lesson_id) SELECT id, id FROM schedule_entries`,
  `DROP TABLE lessons`,
  `ALTER TABLE lessons_v6 RENAME TO lessons`,
  `CREATE INDEX IF NOT EXISTS idx_lessons_department ON lessons (department_id)`,
  `CREATE INDEX IF NOT EXISTS idx_teacher_lessons_teacher ON teacher_lessons (teacher_id)`,
  `CREATE INDEX IF NOT EXISTS idx_teacher_lessons_lesson ON teacher_lessons (lesson_id)`,
  `CREATE INDEX IF NOT EXISTS idx_entries_schedule ON schedule_entries (schedule_id)`,
  `CREATE TABLE teachers_v6 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    max_weekly_hours REAL NOT NULL DEFAULT 12,
    unavailable TEXT NOT NULL DEFAULT '[]'
  )`,
  `INSERT INTO teachers_v6 (id, name, email, max_weekly_hours, unavailable)
   SELECT id, name, email, max_weekly_hours, unavailable FROM teachers`,
  `DROP TABLE teachers`,
  `ALTER TABLE teachers_v6 RENAME TO teachers`,
  `CREATE TABLE departments_v6 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 0,
    homeroom TEXT NOT NULL DEFAULT ''
  )`,
  `INSERT INTO departments_v6 (id, name, capacity, homeroom) SELECT id, name, capacity, homeroom FROM departments`,
  `DROP TABLE departments`,
  `ALTER TABLE departments_v6 RENAME TO departments`,
  `DROP TABLE subjects`,
  `DROP TABLE meeting_overrides`,
  `DROP TABLE terms`
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
  },
  { id: 4, statements: DEPARTMENTS_FEATURE },
  { id: 5, statements: DEPARTMENT_UNIQUE_MODEL },
  { id: 6, statements: SCHEDULES_MODEL }
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
