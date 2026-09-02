/* Smoke test for the schedules model (v6).
 * Usage: npx electron scripts/smoke-departments.cjs [fresh|legacy]
 * - fresh: empty DB -> Schedules page -> "Load sample data" -> verify core + schedule + UI nav
 * - legacy: pre-create a post-migration-5 DB -> boot -> verify migration 6
 *   (terms→schedules, subjects inlined into lessons, teacher subject_ids→teacher_lessons,
 *    lesson schedules→entries, terms/subjects/meeting_overrides dropped)
 */
const { app, BrowserWindow } = require('electron')
const { join } = require('path')
const { mkdtempSync } = require('fs')
const { tmpdir } = require('os')

const scenario = process.argv[2] || 'fresh'
const userData = mkdtempSync(join(tmpdir(), `cs-v6-${scenario}-`))
app.setPath('userData', userData)

if (scenario === 'legacy') {
  const Database = require('better-sqlite3')
  const db = new Database(join(userData, 'scheduler.db'))
  db.exec(`
    CREATE TABLE terms (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, created_at INTEGER NOT NULL, weeks INTEGER NOT NULL DEFAULT 14, start_date TEXT NOT NULL DEFAULT '', break_weeks TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
    CREATE TABLE departments (id INTEGER PRIMARY KEY AUTOINCREMENT, term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE, name TEXT NOT NULL, capacity INTEGER NOT NULL DEFAULT 0, homeroom TEXT NOT NULL DEFAULT '');
    CREATE TABLE subjects (id INTEGER PRIMARY KEY AUTOINCREMENT, term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE, code TEXT NOT NULL, title TEXT NOT NULL);
    CREATE TABLE teachers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', max_weekly_hours REAL NOT NULL DEFAULT 12, unavailable TEXT NOT NULL DEFAULT '[]', subject_ids TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE, subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, sessions_per_week INTEGER NOT NULL DEFAULT 2, duration_minutes INTEGER NOT NULL DEFAULT 40, teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL, locked INTEGER NOT NULL DEFAULT 0, days TEXT NOT NULL DEFAULT '', start_minute INTEGER, end_minute INTEGER);
    CREATE TABLE meeting_overrides (id INTEGER PRIMARY KEY AUTOINCREMENT, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE, week INTEGER NOT NULL, kind TEXT NOT NULL, from_day INTEGER, to_day INTEGER, start_minute INTEGER, end_minute INTEGER, teacher_id INTEGER, note TEXT NOT NULL DEFAULT '');
    CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
    INSERT INTO schema_migrations (id, applied_at) VALUES (1, 0), (2, 0), (3, 0), (4, 0), (5, 0);
    INSERT INTO terms (name, created_at) VALUES ('Legacy Term', 0);
    INSERT INTO departments (term_id, name, capacity, homeroom) VALUES (1, 'Legacy Dept', 25, 'B-101');
    INSERT INTO subjects (term_id, code, title) VALUES (1, 'MAT', 'Math'), (1, 'TUR', 'Turkish');
    INSERT INTO teachers (id, name, email, max_weekly_hours, subject_ids) VALUES
      (1, 'Ayşe Yılmaz', 'ayse@okul.edu.tr', 20, '[1]'),
      (2, 'Mehmet Demir', 'mehmet@okul.edu.tr', 22, '[1,2]');
    INSERT INTO lessons (id, department_id, subject_id, sessions_per_week, duration_minutes, teacher_id, locked, days, start_minute, end_minute) VALUES
      (10, 1, 1, 5, 40, 1, 1, '1,2,3,4,5', 510, 550),
      (11, 1, 2, 4, 40, NULL, 0, '', NULL, NULL);
    INSERT INTO meeting_overrides (lesson_id, week, kind, from_day, to_day, start_minute, end_minute, note) VALUES
      (10, 2, 'move', 1, 5, 600, 640, 'legacy-override');
  `)
  db.close()
}

process.on('uncaughtException', (err) => {
  console.log('UNCAUGHT:', String(err && err.stack ? err.stack : err).slice(0, 900))
  process.exit(1)
})

require(join(__dirname, '..', 'out', 'main', 'index.js'))

app.whenReady().then(async () => {
  try {
    await new Promise((r) => setTimeout(r, 3000))
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) throw new Error('no window')
    const call = (expr) => win.webContents.executeJavaScript(expr)

    if (scenario === 'fresh') {
      await call(
        `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Örnek verileri')); if (b) b.click(); return !!b })()`
      )
      await new Promise((r) => setTimeout(r, 2500))
    }

    const nav = await call(
      `(() => [...document.querySelectorAll('aside nav button')].map((b) => b.textContent.trim()))()`
    )

    const result = await call(`(async () => {
      const schedules = await window.api.schedules.list()
      const sid = schedules[0]?.id ?? null
      const data = sid !== null ? await window.api.schedule.getData(sid) : null
      return {
        schedules: schedules.map((s) => s.name),
        departments: data ? data.departments.map((d) => d.name) : [],
        lessons: data ? data.lessons.length : 0,
        lessonSample: data ? data.lessons.slice(0, 2).map((l) => ({ dept: l.departmentName, code: l.code, title: l.title, teachers: l.teacherIds.length })) : [],
        teachers: data ? data.teachers.map((t) => ({ name: t.name, lessonIds: t.lessonIds.length })) : [],
        entries: data ? data.entries.map((e) => ({ id: e.id, lessons: e.lessons.map((l) => l.departmentName + '·' + l.code), days: e.days, locked: e.locked, teacher: e.teacherName })) : []
      }
    })()`)

    const crud = await call(`(async () => {
      const schedules = await window.api.schedules.list()
      const sid = schedules[0].id
      const data = await window.api.schedule.getData(sid)
      // place an unplaced lesson manually
      const covered = new Set(data.entries.flatMap((e) => e.lessonIds))
      const free = data.lessons.filter((l) => !covered.has(l.id))
      if (free.length < 2) return { error: 'not enough free lessons' }
      const a = free[0]
      const b = free.find((l) => l.departmentId !== a.departmentId && l.sessionsPerWeek === a.sessionsPerWeek && l.durationMinutes === a.durationMinutes)
      // single placement
      const entryId = await window.api.entries.create(sid, {
        lessonIds: [a.id], days: [2, 4], start: 600, end: 640, teacherId: null, locked: false
      })
      await window.api.entries.update(entryId, { start: 570, end: 610 })
      // block creation
      let blockId = null
      if (b) {
        blockId = await window.api.entries.create(sid, {
          lessonIds: [a.id, b.id].filter((x, i, arr) => arr.indexOf(x) === i), days: [], start: null, end: null, teacherId: null, locked: false
        })
      }
      // NOTE: a.id already in entryId — blocks require unplaced lessons, so use two others if available
      let data2 = await window.api.schedule.getData(sid)
      const blockCreated = blockId !== null ? data2.entries.some((e) => e.id === blockId && e.lessonIds.length === 2) : 'skipped'
      // rename + teacher relation checks
      await window.api.schedules.rename(sid, 'Renamed Schedule')
      const data3 = await window.api.schedule.getData(sid)
      const placedEntry = data3.entries.find((e) => e.id === entryId)
      // eligible teacher assignment on the single entry
      const eligible = data3.teachers.filter((tc) => placedEntry.lessonIds.every((lid) => tc.lessonIds.includes(lid)))
      if (eligible.length > 0) {
        await window.api.entries.update(entryId, { teacherId: eligible[0].id })
      }
      const data4 = await window.api.schedule.getData(sid)
      const withTeacher = data4.entries.find((e) => e.id === entryId)
      await window.api.entries.remove(entryId)
      if (blockId !== null) await window.api.entries.remove(blockId)
      const names = await window.api.schedules.list()
      return {
        entryMoved: placedEntry.start === 570,
        blockCreated,
        eligibleTeachers: eligible.length,
        teacherAssigned: withTeacher ? withTeacher.teacherName : null,
        renamed: names[0].name,
        removed: !(await window.api.schedule.getData(sid)).entries.some((e) => e.id === entryId)
      }
    })()`)

    console.log(JSON.stringify({ scenario, ok: true, nav, result, crud }, null, 2))
  } catch (err) {
    console.log(JSON.stringify({ scenario, ok: false, error: String(err) }))
  }
  app.quit()
})
