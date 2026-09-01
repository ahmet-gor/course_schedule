import { ipcMain, dialog, BrowserWindow } from 'electron'
import { guardedHandle } from '../licensing'
import { writeFile } from 'fs/promises'
import { asc, eq } from 'drizzle-orm'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { getDb } from '../db/client'
import { classes, lessons, meetingOverrides, subjects, teachers, terms } from '../db/schema'
import {
  daysToStr,
  getSettings,
  listLessonsFull,
  parseSubjectIds,
  parseUnavailable,
  saveSettings,
  mapTerm,
  listOverrides
} from './catalog'
import { seedSampleData } from '../seed'
import { daysToLabel, fromHHMM, parseDays, toHHMM } from '@shared/time'
import { occurrencesForWeek, weekStart, addDays } from '@shared/weeks'
import type { CsvEntity, ExcelScope } from '@shared/api'
import type { Term } from '@shared/types'

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? undefined
}

async function saveText(defaultPath: string, contents: string): Promise<string | null> {
  const win = parentWindow()
  const res = win ? await dialog.showSaveDialog(win, { defaultPath }) : await dialog.showSaveDialog({ defaultPath })
  if (res.canceled || !res.filePath) return null
  await writeFile(res.filePath, contents, 'utf-8')
  return res.filePath
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}

function bool(v: unknown): boolean {
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}

export function registerIoIpc(): void {
  ipcMain.handle('io:exportJson', async (_e, termId: number) => {
    const db = getDb()
    const termRow = db.select().from(terms).where(eq(terms.id, termId)).get()
    if (!termRow) throw new Error('Term not found')
    const term = mapTerm(termRow)
    const lessonRows = listLessonsFull(termId)
    const teacherRows = db.select().from(teachers).all()
    const teacherById = new Map(teacherRows.map((t) => [t.id, t]))
    const payload = {
      version: 3,
      exportedAt: new Date().toISOString(),
      term: { name: term.name, weeks: term.weeks, startDate: term.startDate, breakWeeks: term.breakWeeks },
      settings: getSettings(),
      teachers: teacherRows.map((t) => ({
        name: t.name,
        email: t.email,
        maxWeeklyHours: t.maxWeeklyHours,
        unavailable: parseUnavailable(t.unavailable),
        subjectCodes: parseSubjectIds(t.subjectIds).map((sid) => lessonRows.find((l) => l.subjectId === sid)?.subjectCode ?? '')
      })),
      subjects: db
        .select()
        .from(subjects)
        .where(eq(subjects.termId, termId))
        .orderBy(asc(subjects.code))
        .all()
        .map((s) => ({ code: s.code, title: s.title })),
      classes: db
        .select()
        .from(classes)
        .where(eq(classes.termId, termId))
        .orderBy(asc(classes.name))
        .all()
        .map((c) => ({
          name: c.name,
          grade: c.grade,
          capacity: c.capacity,
          homeroom: c.homeroom,
          lessons: lessonRows
            .filter((l) => l.classId === c.id)
            .map((l) => ({
              subjectCode: l.subjectCode,
              sessionsPerWeek: l.sessionsPerWeek,
              durationMinutes: l.durationMinutes,
              teacherEmail: l.teacherId !== null ? teacherById.get(l.teacherId)?.email ?? '' : '',
              locked: l.locked,
              days: l.meetings[0]?.days ?? [],
              start: l.meetings[0]?.start ?? null,
              end: l.meetings[0]?.end ?? null,
              overrides: listOverrides(termId)
                .filter((o) => o.lessonId === l.id)
                .map((o) => ({
                  week: o.week,
                  kind: o.kind,
                  fromDay: o.fromDay,
                  toDay: o.toDay,
                  start: o.start,
                  end: o.end,
                  teacherEmail: o.teacherId !== null ? teacherById.get(o.teacherId)?.email ?? '' : '',
                  note: o.note
                }))
            }))
        }))
    }
    return saveText(`${term.name.replace(/[^\w-]+/g, '_')}.json`, JSON.stringify(payload, null, 2))
  })

  guardedHandle('io:importJson', async () => {
    const win = parentWindow()
    const res = win
      ? await dialog.showOpenDialog(win, {
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile']
        })
      : await dialog.showOpenDialog({
          filters: [{ name: 'JSON', extensions: ['json'] }],
          properties: ['openFile']
        })
    if (res.canceled || res.filePaths.length === 0) return null
    const { readFile } = await import('fs/promises')
    const text = await readFile(res.filePaths[0], 'utf-8')
    const data = JSON.parse(text)
    if (!data || !data.term || !Array.isArray(data.classes) || !Array.isArray(data.subjects)) {
      throw new Error('Invalid schedule JSON file')
    }
    const db = getDb()
    const termName = `${String(data.term.name ?? 'Imported')} (Imported ${new Date().toLocaleDateString()})`
    const term = db
      .insert(terms)
      .values({
        name: termName,
        createdAt: Date.now(),
        weeks: num(data.term.weeks, 18),
        startDate: String(data.term.startDate ?? ''),
        breakWeeks: JSON.stringify(Array.isArray(data.term.breakWeeks) ? data.term.breakWeeks : [])
      })
      .returning()
      .get()

    const subjectByCode = new Map<string, number>()
    for (const s of data.subjects) {
      const code = String(s.code)
      const row = db.insert(subjects).values({ termId: term.id, code, title: String(s.title ?? '') }).returning().get()
      subjectByCode.set(code, row.id)
    }

    const teacherByEmailOrName = new Map<string, number>()
    const teacherSubjectIds = new Map<number, number[]>()
    for (const tRaw of data.teachers ?? []) {
      const key = String(tRaw.email || tRaw.name).toLowerCase()
      const existing = db.select().from(teachers).all().find((r) => (r.email || r.name).toLowerCase() === key)
      const subjectIds = (Array.isArray(tRaw.subjectCodes) ? tRaw.subjectCodes : [])
        .map((c: unknown) => subjectByCode.get(String(c)))
        .filter((x: number | undefined): x is number => x !== undefined)
      let id: number
      if (existing) {
        id = existing.id
        const merged = [...new Set([...parseSubjectIds(existing.subjectIds), ...subjectIds])]
        teacherSubjectIds.set(id, merged)
        db.update(teachers)
          .set({
            name: String(tRaw.name),
            email: String(tRaw.email ?? ''),
            maxWeeklyHours: num(tRaw.maxWeeklyHours, 12),
            unavailable: JSON.stringify(Array.isArray(tRaw.unavailable) ? tRaw.unavailable : []),
            subjectIds: JSON.stringify(merged)
          })
          .where(eq(teachers.id, id))
          .run()
      } else {
        const row = db
          .insert(teachers)
          .values({
            name: String(tRaw.name),
            email: String(tRaw.email ?? ''),
            maxWeeklyHours: num(tRaw.maxWeeklyHours, 12),
            unavailable: JSON.stringify(Array.isArray(tRaw.unavailable) ? tRaw.unavailable : []),
            subjectIds: JSON.stringify(subjectIds)
          })
          .returning()
          .get()
        id = row.id
        teacherSubjectIds.set(id, subjectIds)
      }
      teacherByEmailOrName.set(key, id)
    }

    let lessonCount = 0
    const lessonKeyToId = new Map<string, number>()
    const pendingOverrides: { lessonKey: string; row: Record<string, unknown> }[] = []
    for (const c of data.classes) {
      const cls = db
        .insert(classes)
        .values({
          termId: term.id,
          name: String(c.name),
          grade: String(c.grade ?? ''),
          capacity: num(c.capacity, 0),
          homeroom: String(c.homeroom ?? '')
        })
        .returning()
        .get()
      for (const l of c.lessons ?? []) {
        const subjectId = subjectByCode.get(String(l.subjectCode))
        if (!subjectId) continue
        const days = Array.isArray(l.days) ? l.days.map((d: unknown) => num(d, 1)).filter((d: number) => d >= 1 && d <= 7) : []
        const start = l.start !== undefined && l.start !== null ? num(l.start, 510) : null
        const end = l.end !== undefined && l.end !== null ? num(l.end, 550) : null
        const teacherEmail = String(l.teacherEmail ?? '')
        const lesson = db
          .insert(lessons)
          .values({
            classId: cls.id,
            subjectId,
            sessionsPerWeek: num(l.sessionsPerWeek, 2),
            durationMinutes: num(l.durationMinutes, 40),
            teacherId: teacherEmail ? teacherByEmailOrName.get(teacherEmail.toLowerCase()) ?? null : null,
            locked: bool(l.locked) ? 1 : 0,
            days: start !== null && end !== null && days.length > 0 ? daysToStr(days) : '',
            startMinute: start,
            endMinute: end
          })
          .returning()
          .get()
        lessonCount++
        const key = `${String(c.name)}-${String(l.subjectCode)}`
        lessonKeyToId.set(key, lesson.id)
        for (const o of l.overrides ?? []) {
          pendingOverrides.push({ lessonKey: key, row: o })
        }
      }
    }
    for (const { lessonKey, row } of pendingOverrides) {
      const lessonId = lessonKeyToId.get(lessonKey)
      if (!lessonId) continue
      const kind = String(row.kind)
      if (kind !== 'move' && kind !== 'cancel' && kind !== 'extra') continue
      const teacherEmail = String(row.teacherEmail ?? '')
      db.insert(meetingOverrides)
        .values({
          lessonId,
          week: num(row.week, 1),
          kind,
          fromDay: row.fromDay !== undefined && row.fromDay !== null ? num(row.fromDay, 1) : null,
          toDay: row.toDay !== undefined && row.toDay !== null ? num(row.toDay, 1) : null,
          startMinute: row.start !== undefined && row.start !== null ? num(row.start, 510) : null,
          endMinute: row.end !== undefined && row.end !== null ? num(row.end, 550) : null,
          teacherId: teacherEmail ? teacherByEmailOrName.get(teacherEmail.toLowerCase()) ?? null : null,
          note: String(row.note ?? '')
        })
        .run()
    }
    const importedMaxWeek = pendingOverrides.reduce((m, p) => Math.max(m, num(p.row.week, 1)), 0)
    if (importedMaxWeek > num(data.term.weeks, 18)) {
      db.update(terms).set({ weeks: importedMaxWeek }).where(eq(terms.id, term.id)).run()
    }
    if (data.settings) saveSettings({ ...getSettings(), ...data.settings })
    return { termName, classes: data.classes.length, lessons: lessonCount }
  })

  ipcMain.handle('io:exportExcel', async (_e, termId: number, scope: ExcelScope, week?: number) => {
    const db = getDb()
    const termRow = db.select().from(terms).where(eq(terms.id, termId)).get()
    if (!termRow) throw new Error('Term not found')
    const term = mapTerm(termRow)
    const lessonRows = listLessonsFull(termId)
    const teacherRows = db.select().from(teachers).all()
    const teacherById = new Map(teacherRows.map((t) => [t.id, t.name]))
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Class Scheduler'

    const styleHeader = (ws: ExcelJS.Worksheet) => {
      const row = ws.getRow(1)
      row.font = { bold: true }
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF2F7' } }
    }

    const usedNames = new Set<string>()
    const sheetName = (raw: string): string => {
      let name = raw.replace(/[*?:\\/[\]]/g, ' ').trim().slice(0, 28) || 'Sheet'
      let i = 2
      while (usedNames.has(name)) {
        name = `${name.slice(0, 26)} ${i++}`
      }
      usedNames.add(name)
      return name
    }

    interface Row {
      day: number
      dayLabel: string
      start: number
      end: number
      className: string
      subjectCode: string
      subjectTitle: string
      teacher: string
      homeroom: string
    }

    const patternRows: Row[] = []
    for (const l of [...lessonRows].sort((a, b) => a.className.localeCompare(b.className) || a.subjectCode.localeCompare(b.subjectCode))) {
      const cls = db.select().from(classes).where(eq(classes.id, l.classId)).get()
      for (const m of l.meetings) {
        for (const d of [...m.days].sort((x, y) => x - y)) {
          patternRows.push({
            day: d,
            dayLabel: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d] ?? '',
            start: m.start,
            end: m.end,
            className: l.className,
            subjectCode: l.subjectCode,
            subjectTitle: l.subjectTitle,
            teacher: l.teacherName ?? '',
            homeroom: cls?.homeroom ?? ''
          })
        }
      }
    }

    const weekRowsFor = (week: number): Row[] => {
      const clsById = new Map(db.select().from(classes).all().map((c) => [c.id, c]))
      const lessonById = new Map(lessonRows.map((l) => [l.id, l]))
      const rows: Row[] = []
      for (const occ of occurrencesForWeek(lessonRows, listOverrides(termId), week)) {
        if (occ.cancelled) continue
        const l = lessonById.get(occ.lessonId)
        if (!l) continue
        rows.push({
          day: occ.day,
          dayLabel: dayLabelWithDate(term, week, occ.day),
          start: occ.start,
          end: occ.end,
          className: l.className,
          subjectCode: l.subjectCode,
          subjectTitle: l.subjectTitle,
          teacher: occ.teacherId !== null ? teacherById.get(occ.teacherId) ?? '' : '',
          homeroom: clsById.get(l.classId)?.homeroom ?? ''
        })
      }
      return rows.sort((a, b) => a.day - b.day || a.start - b.start || a.className.localeCompare(b.className))
    }

    const schoolColumns = [
      { header: 'Day', key: 'day', width: 14 },
      { header: 'Start', key: 'start', width: 9 },
      { header: 'End', key: 'end', width: 9 },
      { header: 'Class', key: 'cls', width: 10 },
      { header: 'Subject', key: 'subject', width: 12 },
      { header: 'Title', key: 'title', width: 28 },
      { header: 'Teacher', key: 'teacher', width: 20 },
      { header: 'Homeroom', key: 'homeroom', width: 12 }
    ]
    const addSchoolSheet = (name: string, rows: Row[]) => {
      const ws = wb.addWorksheet(sheetName(name))
      ws.columns = schoolColumns
      styleHeader(ws)
      for (const r of rows) {
        ws.addRow({
          day: r.dayLabel,
          start: toHHMM(r.start),
          end: toHHMM(r.end),
          cls: r.className,
          subject: r.subjectCode,
          title: r.subjectTitle,
          teacher: r.teacher,
          homeroom: r.homeroom
        })
      }
    }

    const addGroupSheets = (rows: Row[]) => {
      const byClass = new Map<string, Row[]>()
      const byTeacher = new Map<string, Row[]>()
      for (const r of rows) {
        byClass.set(r.className, [...(byClass.get(r.className) ?? []), r])
        if (r.teacher) byTeacher.set(r.teacher, [...(byTeacher.get(r.teacher) ?? []), r])
      }
      const groupColumns = [
        { header: 'Day', key: 'day', width: 14 },
        { header: 'Start', key: 'start', width: 9 },
        { header: 'End', key: 'end', width: 9 },
        { header: 'Class', key: 'cls', width: 10 },
        { header: 'Subject', key: 'subject', width: 12 },
        { header: 'Teacher', key: 'teacher', width: 20 }
      ]
      for (const [name, rws] of byClass) {
        const ws = wb.addWorksheet(sheetName(name))
        ws.columns = groupColumns
        styleHeader(ws)
        rws.forEach((r) =>
          ws.addRow({ day: r.dayLabel, start: toHHMM(r.start), end: toHHMM(r.end), cls: r.className, subject: r.subjectCode, teacher: r.teacher })
        )
      }
      for (const [name, rws] of byTeacher) {
        const ws = wb.addWorksheet(sheetName(name))
        ws.columns = groupColumns
        styleHeader(ws)
        rws.forEach((r) =>
          ws.addRow({ day: r.dayLabel, start: toHHMM(r.start), end: toHHMM(r.end), cls: r.className, subject: r.subjectCode, teacher: r.teacher })
        )
      }
    }

    if (scope === 'pattern') {
      addSchoolSheet('School', patternRows)
      addGroupSheets(patternRows)
    } else if (scope === 'week' && typeof week === 'number') {
      const rows = weekRowsFor(week)
      addSchoolSheet(`W${String(week).padStart(2, '0')}`, rows)
      addGroupSheets(rows)
    } else {
      addSchoolSheet('School', patternRows)
      for (let w = 1; w <= term.weeks; w++) {
        if (term.breakWeeks.includes(w)) continue
        addSchoolSheet(`W${String(w).padStart(2, '0')}`, weekRowsFor(w))
      }
    }

    const saveWin = parentWindow()
    const saveOpts = {
      defaultPath: `${term.name.replace(/[^\w-]+/g, '_')}${scope !== 'pattern' ? `_W${String(week ?? scope).padStart(2, '0')}` : ''}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    }
    const res = saveWin ? await dialog.showSaveDialog(saveWin, saveOpts) : await dialog.showSaveDialog(saveOpts)
    if (res.canceled || !res.filePath) return null
    const buffer = await wb.xlsx.writeBuffer()
    await writeFile(res.filePath, Buffer.from(buffer))
    return res.filePath
  })

  ipcMain.handle('io:exportCsv', async (_e, entity: CsvEntity, termId: number) => {
    const db = getDb()
    let rows: Record<string, unknown>[] = []
    if (entity === 'subjects') {
      rows = db.select().from(subjects).where(eq(subjects.termId, termId)).all().map((s) => ({
        code: s.code,
        title: s.title
      }))
    } else if (entity === 'teachers') {
      const subjectById = new Map(db.select().from(subjects).where(eq(subjects.termId, termId)).all().map((s) => [s.id, s.code]))
      rows = db.select().from(teachers).all().map((t) => ({
        name: t.name,
        email: t.email,
        maxWeeklyHours: t.maxWeeklyHours,
        subjectCodes: parseSubjectIds(t.subjectIds)
          .map((sid) => subjectById.get(sid) ?? '')
          .filter(Boolean)
          .join('|')
      }))
    } else if (entity === 'classes') {
      rows = db.select().from(classes).where(eq(classes.termId, termId)).all().map((c) => ({
        name: c.name,
        grade: c.grade,
        capacity: c.capacity,
        homeroom: c.homeroom
      }))
    } else {
      rows = listLessonsFull(termId).map((l) => ({
        className: l.className,
        subjectCode: l.subjectCode,
        sessionsPerWeek: l.sessionsPerWeek,
        durationMinutes: l.durationMinutes,
        teacherEmail: db.select().from(teachers).all().find((t) => t.id === l.teacherId)?.email ?? '',
        days: l.meetings[0] ? daysToLabel(l.meetings[0].days) : '',
        start: l.meetings[0] ? toHHMM(l.meetings[0].start) : '',
        end: l.meetings[0] ? toHHMM(l.meetings[0].end) : '',
        locked: l.locked ? 'true' : 'false'
      }))
    }
    return saveText(`${entity}.csv`, Papa.unparse(rows))
  })

  guardedHandle('io:importCsv', (_e, entity: CsvEntity, text: string, termId: number) => {
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
    const db = getDb()
    const errors: string[] = []
    let imported = 0
    let updated = 0

    if (entity === 'subjects') {
      for (const row of parsed.data) {
        const code = (row.code ?? '').trim()
        if (!code) continue
        const existing = db.select().from(subjects).where(eq(subjects.termId, termId)).all().find((s) => s.code === code)
        const values = { code, title: (row.title ?? '').trim() }
        if (existing) {
          db.update(subjects).set(values).where(eq(subjects.id, existing.id)).run()
          updated++
        } else {
          db.insert(subjects).values({ ...values, termId }).run()
          imported++
        }
      }
    } else if (entity === 'teachers') {
      const subjectRows = db.select().from(subjects).where(eq(subjects.termId, termId)).all()
      for (const row of parsed.data) {
        const name = (row.name ?? '').trim()
        if (!name) continue
        const email = (row.email ?? '').trim()
        const existing = db.select().from(teachers).all().find((t) => (email && t.email === email) || t.name === name)
        const subjectIds = (row.subjectCodes ?? '')
          .split(/[|,;]/)
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => subjectRows.find((s) => s.code.toLowerCase() === c.toLowerCase())?.id)
          .filter((x): x is number => x !== undefined)
        const unavailable: { days: number[]; start: number; end: number }[] = []
        const uDays = parseDays(row.unavailDays ?? '')
        const uStart = fromHHMM(row.unavailStart ?? '')
        const uEnd = fromHHMM(row.unavailEnd ?? '')
        if (uDays.length > 0 && uStart !== null && uEnd !== null && uEnd > uStart) {
          unavailable.push({ days: uDays, start: uStart, end: uEnd })
        }
        const values = {
          name,
          email,
          maxWeeklyHours: num(row.maxWeeklyHours, 12),
          unavailable: JSON.stringify(unavailable),
          subjectIds: JSON.stringify(subjectIds)
        }
        if (existing) {
          db.update(teachers).set(values).where(eq(teachers.id, existing.id)).run()
          updated++
        } else {
          db.insert(teachers).values(values).run()
          imported++
        }
      }
    } else if (entity === 'classes') {
      for (const row of parsed.data) {
        const name = (row.name ?? '').trim()
        if (!name) continue
        const existing = db.select().from(classes).where(eq(classes.termId, termId)).all().find((c) => c.name === name)
        const values = {
          name,
          grade: (row.grade ?? '').trim(),
          capacity: num(row.capacity, 0),
          homeroom: (row.homeroom ?? '').trim()
        }
        if (existing) {
          db.update(classes).set(values).where(eq(classes.id, existing.id)).run()
          updated++
        } else {
          db.insert(classes).values({ ...values, termId }).run()
          imported++
        }
      }
    } else {
      const classRows = db.select().from(classes).where(eq(classes.termId, termId)).all()
      const subjectRows = db.select().from(subjects).where(eq(subjects.termId, termId)).all()
      const teacherRows = db.select().from(teachers).all()
      for (const row of parsed.data) {
        const className = (row.className ?? '').trim()
        const subjectCode = (row.subjectCode ?? '').trim()
        const cls = classRows.find((c) => c.name === className)
        const subject = subjectRows.find((s) => s.code === subjectCode)
        if (!cls || !subject) {
          errors.push(`Class "${className}" or subject "${subjectCode}" not found (row ${parsed.data.indexOf(row) + 2})`)
          continue
        }
        const teacherEmail = (row.teacherEmail ?? '').trim()
        const teacher = teacherEmail ? teacherRows.find((t) => t.email === teacherEmail || t.name === teacherEmail) : undefined
        const existing = db.select().from(lessons).where(eq(lessons.classId, cls.id)).all().find((l) => l.subjectId === subject.id)
        const values = {
          sessionsPerWeek: num(row.sessionsPerWeek, 2),
          durationMinutes: num(row.durationMinutes, 40),
          teacherId: teacher?.id ?? null,
          locked: bool(row.locked) ? 1 : 0
        }
        let lessonId: number
        if (existing) {
          db.update(lessons).set(values).where(eq(lessons.id, existing.id)).run()
          lessonId = existing.id
          updated++
        } else {
          lessonId = db.insert(lessons).values({ ...values, classId: cls.id, subjectId: subject.id }).returning().get().id
          imported++
        }
        const days = parseDays(row.days ?? '')
        const start = fromHHMM(row.start ?? '')
        const end = fromHHMM(row.end ?? '')
        if (days.length > 0 && start !== null && end !== null && end > start) {
          db.update(lessons)
            .set({ days: daysToStr(days), startMinute: start, endMinute: end })
            .where(eq(lessons.id, lessonId))
            .run()
        }
      }
    }
    return { imported, updated, errors }
  })

  guardedHandle('io:seedSample', async () => seedSampleData())
}

function dayLabelWithDate(term: Term, week: number, day: number): string {
  const base = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day] ?? ''
  const start = weekStart(term, week)
  if (!start) return base
  const d = addDays(start, day - 1)
  return `${base} ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
}
