import { ipcMain, dialog, BrowserWindow } from 'electron'
import { guardedHandle } from '../licensing'
import { writeFile } from 'fs/promises'
import { asc, eq } from 'drizzle-orm'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { getDb } from '../db/client'
import {
  departments,
  entryLessons,
  lessons,
  scheduleEntries,
  schedules,
  teacherLessons,
  teachers
} from '../db/schema'
import {
  daysToStr,
  getSettings,
  listLessonRefs,
  listTeachersFull,
  saveSettings
} from './catalog'
import { listEntriesFull } from './schedule'
import { seedSampleData } from '../seed'
import { daysToLabel, fromHHMM, parseDays, toHHMM } from '@shared/time'
import type { CsvEntity } from '@shared/api'

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
  ipcMain.handle('io:exportJson', async () => {
    const db = getDb()
    const teacherRows = listTeachersFull()
    const lessonRows = listLessonRefs()
    const payload = {
      version: 6,
      exportedAt: new Date().toISOString(),
      settings: getSettings(),
      departments: db
        .select()
        .from(departments)
        .orderBy(asc(departments.name))
        .all()
        .map((d) => ({ name: d.name, capacity: d.capacity, homeroom: d.homeroom })),
      lessons: lessonRows.map((l) => ({
        departmentName: l.departmentName,
        code: l.code,
        title: l.title,
        sessionsPerWeek: l.sessionsPerWeek,
        durationMinutes: l.durationMinutes
      })),
      teachers: teacherRows.map((t) => ({
        name: t.name,
        email: t.email,
        maxWeeklyHours: t.maxWeeklyHours,
        unavailable: t.unavailable,
        lessons: t.lessonIds.map((lid) => {
          const l = lessonRows.find((x) => x.id === lid)
          return l ? `${l.departmentName}·${l.code}` : ''
        }).filter(Boolean)
      })),
      schedules: db
        .select()
        .from(schedules)
        .orderBy(asc(schedules.id))
        .all()
        .map((s) => ({
          name: s.name,
          entries: listEntriesFull(s.id)
            .filter((e) => e.lessons.length > 0)
            .map((e) => ({
              lessons: e.lessons.map((l) => `${l.departmentName}·${l.code}`),
              days: e.days,
              start: e.start,
              end: e.end,
              teacherEmail: e.teacherId !== null ? teacherRows.find((t) => t.id === e.teacherId)?.email ?? '' : '',
              locked: e.locked
            }))
        }))
    }
    return saveText('course-scheduler-export.json', JSON.stringify(payload, null, 2))
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
    if (!data || !Array.isArray(data.schedules)) {
      throw new Error('Invalid export JSON file')
    }
    const db = getDb()

    const deptIdByName = new Map<string, number>()
    for (const d of data.departments ?? []) {
      const name = String(d.name ?? '')
      if (!name) continue
      const row = db
        .insert(departments)
        .values({ name, capacity: num(d.capacity, 0), homeroom: String(d.homeroom ?? '') })
        .returning()
        .get()
      deptIdByName.set(name, row.id)
    }

    interface LessonAcc {
      departmentName: string
      code: string
      title: string
      sessionsPerWeek: number
      durationMinutes: number
    }
    const lessonAccs: LessonAcc[] = []
    const lessonIdByKey = new Map<string, number>()
    for (const l of data.lessons ?? []) {
      const departmentName = String(l.departmentName ?? '')
      const code = String(l.code ?? '')
      const deptId = deptIdByName.get(departmentName)
      if (!deptId || !code) continue
      const row = db
        .insert(lessons)
        .values({
          departmentId: deptId,
          code,
          title: String(l.title ?? ''),
          sessionsPerWeek: num(l.sessionsPerWeek, 2),
          durationMinutes: num(l.durationMinutes, 40)
        })
        .returning()
        .get()
      lessonAccs.push({ departmentName, code, title: row.title, sessionsPerWeek: row.sessionsPerWeek, durationMinutes: row.durationMinutes })
      lessonIdByKey.set(`${departmentName}·${code}`, row.id)
    }

    const teacherIdByEmailOrName = new Map<string, number>()
    for (const t of data.teachers ?? []) {
      const key = String(t.email || t.name).toLowerCase()
      const lessonIds: number[] = (Array.isArray(t.lessons) ? t.lessons : [])
        .map((ref: unknown) => lessonIdByKey.get(String(ref)))
        .filter((x: number | undefined): x is number => x !== undefined)
      const row = db
        .insert(teachers)
        .values({
          name: String(t.name ?? ''),
          email: String(t.email ?? ''),
          maxWeeklyHours: num(t.maxWeeklyHours, 12),
          unavailable: JSON.stringify(Array.isArray(t.unavailable) ? t.unavailable : [])
        })
        .returning()
        .get()
      if (lessonIds.length > 0) {
        db.insert(teacherLessons).values(lessonIds.map((lessonId) => ({ teacherId: row.id, lessonId }))).run()
      }
      teacherIdByEmailOrName.set(key, row.id)
    }

    for (const s of data.schedules) {
      const row = db
        .insert(schedules)
        .values({ name: String(s.name ?? 'Schedule'), createdAt: Date.now() })
        .returning()
        .get()
      for (const e of s.entries ?? []) {
        const lessonIds: number[] = (Array.isArray(e.lessons) ? e.lessons : [])
          .map((ref: unknown) => lessonIdByKey.get(String(ref)))
          .filter((x: number | undefined): x is number => x !== undefined)
        if (lessonIds.length === 0) continue
        const days = Array.isArray(e.days) ? e.days.map((d: unknown) => num(d, 1)).filter((d: number) => d >= 1 && d <= 7) : []
        const start = e.start !== undefined && e.start !== null ? num(e.start, 510) : null
        const end = e.end !== undefined && e.end !== null ? num(e.end, 550) : null
        const teacherEmail = String(e.teacherEmail ?? '')
        const entry = db
          .insert(scheduleEntries)
          .values({
            scheduleId: row.id,
            days: start !== null && end !== null && days.length > 0 ? daysToStr(days) : '',
            startMinute: start,
            endMinute: end,
            teacherId: teacherEmail ? teacherIdByEmailOrName.get(teacherEmail.toLowerCase()) ?? null : null,
            locked: bool(e.locked) ? 1 : 0
          })
          .returning()
          .get()
        db.insert(entryLessons)
          .values(lessonIds.map((lessonId) => ({ entryId: entry.id, lessonId })))
          .run()
      }
    }

    if (data.settings) saveSettings({ ...getSettings(), ...data.settings })
    return { schedules: (data.schedules ?? []).length }
  })

  ipcMain.handle('io:exportExcel', async (_e, scheduleId: number) => {
    const db = getDb()
    const scheduleRow = db.select().from(schedules).where(eq(schedules.id, scheduleId)).get()
    if (!scheduleRow) throw new Error('Schedule not found')
    const entries = listEntriesFull(scheduleId)
    const teacherRows = listTeachersFull()
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Class Scheduler'

    const styleHeader = (ws: ExcelJS.Worksheet) => {
      const row = ws.getRow(1)
      row.font = { bold: true }
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDF2F7' } }
    }

    interface Row {
      day: number
      start: number
      end: number
      departments: string
      lessonCodes: string
      titles: string
      teacher: string
      homerooms: string
    }

    const rows: Row[] = []
    for (const e of entries) {
      if (e.days.length === 0 || e.start === null || e.end === null) continue
      for (const d of [...e.days].sort((x, y) => x - y)) {
        rows.push({
          day: d,
          start: e.start,
          end: e.end,
          departments: e.lessons.map((l) => l.departmentName).join(' + '),
          lessonCodes: e.lessons.map((l) => l.code).join(' + '),
          titles: e.lessons.map((l) => l.title).join(' + '),
          teacher: e.teacherName ?? '',
          homerooms: [...new Set(e.lessons.map((l) => ''))].join('')
        })
      }
    }
    rows.sort((a, b) => a.day - b.day || a.start - b.start || a.departments.localeCompare(b.departments))

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

    const addSheet = (name: string, rws: Row[]) => {
      const ws = wb.addWorksheet(sheetName(name))
      ws.columns = [
        { header: 'Day', key: 'day', width: 14 },
        { header: 'Start', key: 'start', width: 9 },
        { header: 'End', key: 'end', width: 9 },
        { header: 'Department(s)', key: 'depts', width: 22 },
        { header: 'Lesson(s)', key: 'lessons', width: 14 },
        { header: 'Title', key: 'titles', width: 30 },
        { header: 'Teacher', key: 'teacher', width: 20 }
      ]
      styleHeader(ws)
      for (const r of rws) {
        ws.addRow({
          day: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][r.day] ?? '',
          start: toHHMM(r.start),
          end: toHHMM(r.end),
          depts: r.departments,
          lessons: r.lessonCodes,
          titles: r.titles,
          teacher: r.teacher
        })
      }
    }

    addSheet('Schedule', rows)

    const byDept = new Map<string, Row[]>()
    const byTeacher = new Map<string, Row[]>()
    for (const r of rows) {
      for (const dept of r.departments.split(' + ')) {
        byDept.set(dept, [...(byDept.get(dept) ?? []), r])
      }
      if (r.teacher) byTeacher.set(r.teacher, [...(byTeacher.get(r.teacher) ?? []), r])
    }
    for (const [dept, rws] of byDept) addSheet(dept, rws)
    for (const [teacher, rws] of byTeacher) addSheet(teacher, rws)
    void teacherRows

    const saveWin = parentWindow()
    const saveOpts = {
      defaultPath: `${scheduleRow.name.replace(/[^\w-]+/g, '_')}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    }
    const res = saveWin ? await dialog.showSaveDialog(saveWin, saveOpts) : await dialog.showSaveDialog(saveOpts)
    if (res.canceled || !res.filePath) return null
    const buffer = await wb.xlsx.writeBuffer()
    await writeFile(res.filePath, Buffer.from(buffer))
    return res.filePath
  })

  ipcMain.handle('io:exportCsv', async (_e, entity: CsvEntity) => {
    const db = getDb()
    let rows: Record<string, unknown>[] = []
    if (entity === 'departments') {
      rows = db.select().from(departments).orderBy(asc(departments.name)).all().map((d) => ({
        name: d.name,
        capacity: d.capacity,
        homeroom: d.homeroom
      }))
    } else if (entity === 'lessons') {
      rows = listLessonRefs().map((l) => ({
        departmentName: l.departmentName,
        code: l.code,
        title: l.title,
        sessionsPerWeek: l.sessionsPerWeek,
        durationMinutes: l.durationMinutes
      }))
    } else {
      const lessonRefs = listLessonRefs()
      rows = listTeachersFull().map((t) => ({
        name: t.name,
        email: t.email,
        maxWeeklyHours: t.maxWeeklyHours,
        lessons: t.lessonIds
          .map((lid) => {
            const l = lessonRefs.find((x) => x.id === lid)
            return l ? `${l.departmentName}·${l.code}` : ''
          })
          .filter(Boolean)
          .join('|')
      }))
    }
    return saveText(`${entity}.csv`, Papa.unparse(rows))
  })

  guardedHandle('io:importCsv', (_e, entity: CsvEntity, text: string) => {
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
    const db = getDb()
    const errors: string[] = []
    let imported = 0
    let updated = 0

    if (entity === 'departments') {
      for (const row of parsed.data) {
        const name = (row.name ?? '').trim()
        if (!name) continue
        const values = { name, capacity: num(row.capacity, 0), homeroom: (row.homeroom ?? '').trim() }
        const existing = db.select().from(departments).all().find((d) => d.name === name)
        if (existing) {
          db.update(departments).set(values).where(eq(departments.id, existing.id)).run()
          updated++
        } else {
          db.insert(departments).values(values).run()
          imported++
        }
      }
    } else if (entity === 'lessons') {
      const deptRows = db.select().from(departments).all()
      for (const row of parsed.data) {
        const departmentName = (row.departmentName ?? '').trim()
        const code = (row.code ?? '').trim()
        if (!departmentName || !code) continue
        const dept = deptRows.find((d) => d.name === departmentName)
        if (!dept) {
          errors.push(`Department "${departmentName}" not found (row ${parsed.data.indexOf(row) + 2})`)
          continue
        }
        const values = {
          departmentId: dept.id,
          code,
          title: (row.title ?? '').trim(),
          sessionsPerWeek: num(row.sessionsPerWeek, 2),
          durationMinutes: num(row.durationMinutes, 40)
        }
        const existing = db.select().from(lessons).where(eq(lessons.departmentId, dept.id)).all().find((l) => l.code === code)
        if (existing) {
          db.update(lessons).set(values).where(eq(lessons.id, existing.id)).run()
          updated++
        } else {
          db.insert(lessons).values(values).run()
          imported++
        }
      }
    } else {
      const lessonRefs = listLessonRefs()
      for (const row of parsed.data) {
        const name = (row.name ?? '').trim()
        if (!name) continue
        const email = (row.email ?? '').trim()
        const existing = db.select().from(teachers).all().find((t) => (email && t.email === email) || t.name === name)
        const lessonIds = (row.lessons ?? '')
          .split(/[|,;]/)
          .map((r) => r.trim())
          .filter(Boolean)
          .map((r) => lessonRefs.find((l) => `${l.departmentName}·${l.code}`.toLowerCase() === r.toLowerCase())?.id)
          .filter((x): x is number => x !== undefined)
        const unavailable = (() => {
          const days = parseDays(row.unavailDays ?? '')
          const start = fromHHMM(row.unavailStart ?? '')
          const end = fromHHMM(row.unavailEnd ?? '')
          if (days.length > 0 && start !== null && end !== null && end > start) {
            return JSON.stringify([{ days, start, end }])
          }
          return '[]'
        })()
        const values = {
          name,
          email,
          maxWeeklyHours: num(row.maxWeeklyHours, 12),
          unavailable
        }
        let id: number
        if (existing) {
          db.update(teachers).set(values).where(eq(teachers.id, existing.id)).run()
          id = existing.id
          updated++
        } else {
          id = db.insert(teachers).values(values).returning().get().id
          imported++
        }
        db.delete(teacherLessons).where(eq(teacherLessons.teacherId, id)).run()
        if (lessonIds.length > 0) {
          db.insert(teacherLessons).values(lessonIds.map((lessonId) => ({ teacherId: id, lessonId }))).run()
        }
      }
    }
    return { imported, updated, errors }
  })

  guardedHandle('io:seedSample', async () => seedSampleData())
}
