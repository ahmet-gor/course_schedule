import { ipcMain, dialog, BrowserWindow } from 'electron'
import { guardedHandle } from '../licensing'
import { writeFile } from 'fs/promises'
import { asc, eq } from 'drizzle-orm'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { getDb } from '../db/client'
import { courses, instructors, meetingOverrides, meetingTimes, rooms, sections, terms } from '../db/schema'
import { daysToStr, getSettings, listSectionsFull, parseUnavailable, saveSettings, mapTerm, listOverrides } from './catalog'
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
    const sectionRows = listSectionsFull(termId)
    const overrideRows = listOverrides(termId)
    const insRows = db.select().from(instructors).all()
    const roomRows = db.select().from(rooms).all()
    const insById = new Map(insRows.map((i) => [i.id, i]))
    const roomById = new Map(roomRows.map((r) => [r.id, r]))
    const sectionById = new Map(sectionRows.map((s) => [s.id, s]))
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      term: { name: term.name, weeks: term.weeks, startDate: term.startDate, breakWeeks: term.breakWeeks },
      settings: getSettings(),
      instructors: insRows,
      rooms: roomRows,
      courses: db
        .select()
        .from(courses)
        .where(eq(courses.termId, termId))
        .orderBy(asc(courses.code))
        .all()
        .map((c) => ({
          code: c.code,
          title: c.title,
          credits: c.credits,
          sections: db
            .select()
            .from(sections)
            .where(eq(sections.courseId, c.id))
            .orderBy(asc(sections.number))
            .all()
            .map((s) => ({
              number: s.number,
              capacity: s.capacity,
              sessionsPerWeek: s.sessionsPerWeek,
              durationMinutes: s.durationMinutes,
              instructorId: s.instructorId,
              roomId: s.roomId,
              locked: s.locked === 1,
              meetings: db
                .select()
                .from(meetingTimes)
                .where(eq(meetingTimes.sectionId, s.id))
                .all()
                .map((m) => ({ days: m.days.split(',').filter(Boolean).map(Number), start: m.startMinute, end: m.endMinute })),
              overrides: overrideRows
                .filter((o) => o.sectionId === s.id)
                .map((o) => ({
                  week: o.week,
                  kind: o.kind,
                  fromDay: o.fromDay,
                  toDay: o.toDay,
                  start: o.start,
                  end: o.end,
                  instructorEmail:
                    o.instructorId !== null ? insById.get(o.instructorId)?.email ?? '' : '',
                  roomName: o.roomId !== null ? roomById.get(o.roomId)?.name ?? '' : '',
                  note: o.note
                }))
            }))
        }))
    }
    void sectionById
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
    if (!data || !data.term || !Array.isArray(data.courses)) throw new Error('Invalid schedule JSON file')
    const db = getDb()
    const termName = `${String(data.term.name ?? 'Imported')} (Imported ${new Date().toLocaleDateString()})`
    const term = db
      .insert(terms)
      .values({
        name: termName,
        createdAt: Date.now(),
        weeks: num(data.term.weeks, 14),
        startDate: String(data.term.startDate ?? ''),
        breakWeeks: JSON.stringify(Array.isArray(data.term.breakWeeks) ? data.term.breakWeeks : [])
      })
      .returning()
      .get()

    const insByEmailOrName = new Map<string, number>()
    for (const i of data.instructors ?? []) {
      const key = String(i.email || i.name).toLowerCase()
      const existing = db.select().from(instructors).all().find((r) => (r.email || r.name).toLowerCase() === key)
      const id = existing
        ? existing.id
        : db
            .insert(instructors)
            .values({
              name: String(i.name),
              email: String(i.email ?? ''),
              maxWeeklyHours: num(i.maxWeeklyHours, 12),
              unavailable: JSON.stringify(
                Array.isArray(i.unavailable) ? i.unavailable : parseUnavailable(String(i.unavailable ?? '[]'))
              )
            })
            .returning()
            .get().id
      insByEmailOrName.set(key, id)
    }
    const roomByName = new Map<string, number>()
    for (const r of data.rooms ?? []) {
      const name = String(r.name)
      const existing = db.select().from(rooms).all().find((x) => x.name === name)
      const id = existing
        ? existing.id
        : db
            .insert(rooms)
            .values({
              name,
              building: String(r.building ?? ''),
              capacity: num(r.capacity, 0),
              travelGroup: String(r.travelGroup ?? 'A')
            })
            .returning()
            .get().id
      roomByName.set(name, id)
    }

    let sectionCount = 0
    const sectionKeyToId = new Map<string, number>()
    const pendingOverrides: { sectionKey: string; row: Record<string, unknown> }[] = []
    for (const c of data.courses) {
      const course = db
        .insert(courses)
        .values({ termId: term.id, code: String(c.code), title: String(c.title), credits: num(c.credits, 3) })
        .returning()
        .get()
      for (const s of c.sections ?? []) {
        const section = db
          .insert(sections)
          .values({
            courseId: course.id,
            number: String(s.number),
            capacity: num(s.capacity, 0),
            sessionsPerWeek: num(s.sessionsPerWeek, 2),
            durationMinutes: num(s.durationMinutes, 75),
            instructorId:
              s.instructorId !== null && s.instructorId !== undefined
                ? insByEmailOrName.get(String(s.instructorId)) ?? null
                : null,
            roomId: s.roomId !== null && s.roomId !== undefined ? roomByName.get(String(s.roomId)) ?? null : null,
            locked: bool(s.locked) ? 1 : 0
          })
          .returning()
          .get()
        sectionCount++
        const key = `${String(c.code)}-${String(s.number)}`
        sectionKeyToId.set(key, section.id)
        for (const m of s.meetings ?? []) {
          if (!Array.isArray(m.days)) continue
          db.insert(meetingTimes)
            .values({
              sectionId: section.id,
              days: daysToStr(m.days),
              startMinute: num(m.start, 480),
              endMinute: num(m.end, 540)
            })
            .run()
        }
        for (const o of s.overrides ?? []) {
          pendingOverrides.push({ sectionKey: key, row: o })
        }
      }
    }
    for (const { sectionKey, row } of pendingOverrides) {
      const sectionId = sectionKeyToId.get(sectionKey)
      if (!sectionId) continue
      const kind = String(row.kind)
      if (kind !== 'move' && kind !== 'cancel' && kind !== 'extra') continue
      const insEmail = String(row.instructorEmail ?? '')
      const roomName = String(row.roomName ?? '')
      db.insert(meetingOverrides)
        .values({
          sectionId,
          week: num(row.week, 1),
          kind,
          fromDay: row.fromDay !== undefined && row.fromDay !== null ? num(row.fromDay, 1) : null,
          toDay: row.toDay !== undefined && row.toDay !== null ? num(row.toDay, 1) : null,
          startMinute: row.start !== undefined && row.start !== null ? num(row.start, 540) : null,
          endMinute: row.end !== undefined && row.end !== null ? num(row.end, 630) : null,
          roomId: roomName ? roomByName.get(roomName) ?? null : null,
          instructorId: insEmail ? insByEmailOrName.get(insEmail.toLowerCase()) ?? null : null,
          note: String(row.note ?? '')
        })
        .run()
    }
    const importedMaxWeek = pendingOverrides.reduce((m, p) => Math.max(m, num(p.row.week, 1)), 0)
    if (importedMaxWeek > num(data.term.weeks, 14)) {
      db.update(terms).set({ weeks: importedMaxWeek }).where(eq(terms.id, term.id)).run()
    }
    if (data.settings) saveSettings({ ...getSettings(), ...data.settings })
    return { termName, courses: data.courses.length, sections: sectionCount }
  })

  ipcMain.handle('io:exportExcel', async (_e, termId: number, scope: ExcelScope, week?: number) => {
    const db = getDb()
    const termRow = db.select().from(terms).where(eq(terms.id, termId)).get()
    if (!termRow) throw new Error('Term not found')
    const term = mapTerm(termRow)
    const sectionRows = listSectionsFull(termId)
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Course Scheduler'

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
      code: string
      number: string
      title: string
      instructor: string
      room: string
      capacity: number
    }

    const patternRows: Row[] = []
    for (const s of [...sectionRows].sort((a, b) => a.code.localeCompare(b.code) || a.number.localeCompare(b.number))) {
      for (const m of s.meetings) {
        for (const d of [...m.days].sort((x, y) => x - y)) {
          patternRows.push({
            day: d,
            dayLabel: ['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d] ?? '',
            start: m.start,
            end: m.end,
            code: s.code,
            number: s.number,
            title: s.title,
            instructor: s.instructorName ?? '',
            room: s.roomName ?? '',
            capacity: s.capacity
          })
        }
      }
    }

    const weekRowsFor = (week: number): Row[] => {
      const insById = new Map(db.select().from(instructors).all().map((i) => [i.id, i.name]))
      const roomById = new Map(db.select().from(rooms).all().map((r) => [r.id, r]))
      const sectionById = new Map(sectionRows.map((s) => [s.id, s]))
      const rows: Row[] = []
      for (const occ of occurrencesForWeek(sectionRows, listOverrides(termId), week)) {
        if (occ.cancelled) continue
        const s = sectionById.get(occ.sectionId)
        if (!s) continue
        const room = occ.roomId !== null ? roomById.get(occ.roomId) : undefined
        rows.push({
          day: occ.day,
          dayLabel: dayLabelWithDate(term, week, occ.day),
          start: occ.start,
          end: occ.end,
          code: s.code,
          number: s.number,
          title: s.title,
          instructor: occ.instructorId !== null ? insById.get(occ.instructorId) ?? '' : '',
          room: room?.name ?? '',
          capacity: s.capacity
        })
      }
      return rows.sort((a, b) => a.day - b.day || a.start - b.start || a.code.localeCompare(b.code))
    }

    const deptColumns = [
      { header: 'Day', key: 'day', width: 14 },
      { header: 'Start', key: 'start', width: 9 },
      { header: 'End', key: 'end', width: 9 },
      { header: 'Course', key: 'course', width: 14 },
      { header: 'Section', key: 'sec', width: 8 },
      { header: 'Title', key: 'title', width: 32 },
      { header: 'Instructor', key: 'instr', width: 20 },
      { header: 'Room', key: 'room', width: 12 },
      { header: 'Capacity', key: 'cap', width: 10 }
    ]
    const addDeptSheet = (name: string, rows: Row[]) => {
      const ws = wb.addWorksheet(sheetName(name))
      ws.columns = deptColumns
      styleHeader(ws)
      for (const r of rows) {
        ws.addRow({
          day: r.dayLabel,
          start: toHHMM(r.start),
          end: toHHMM(r.end),
          course: r.code,
          sec: r.number,
          title: r.title,
          instr: r.instructor,
          room: r.room,
          cap: r.capacity
        })
      }
    }

    const addGroupSheets = (rows: Row[]) => {
      const byInstructor = new Map<string, Row[]>()
      const byRoom = new Map<string, Row[]>()
      for (const r of rows) {
        if (r.instructor) byInstructor.set(r.instructor, [...(byInstructor.get(r.instructor) ?? []), r])
        if (r.room) byRoom.set(r.room, [...(byRoom.get(r.room) ?? []), r])
      }
      for (const [name, rws] of byInstructor) {
        const ws = wb.addWorksheet(sheetName(name))
        ws.columns = [
          { header: 'Day', key: 'day', width: 14 },
          { header: 'Start', key: 'start', width: 9 },
          { header: 'End', key: 'end', width: 9 },
          { header: 'Course', key: 'course', width: 14 },
          { header: 'Section', key: 'sec', width: 8 },
          { header: 'Room', key: 'room', width: 12 }
        ]
        styleHeader(ws)
        rws.forEach((r) =>
          ws.addRow({ day: r.dayLabel, start: toHHMM(r.start), end: toHHMM(r.end), course: r.code, sec: r.number, room: r.room })
        )
      }
      for (const [name, rws] of byRoom) {
        const ws = wb.addWorksheet(sheetName(name))
        ws.columns = [
          { header: 'Day', key: 'day', width: 14 },
          { header: 'Start', key: 'start', width: 9 },
          { header: 'End', key: 'end', width: 9 },
          { header: 'Course', key: 'course', width: 14 },
          { header: 'Section', key: 'sec', width: 8 },
          { header: 'Instructor', key: 'instr', width: 20 }
        ]
        styleHeader(ws)
        rws.forEach((r) =>
          ws.addRow({ day: r.dayLabel, start: toHHMM(r.start), end: toHHMM(r.end), course: r.code, sec: r.number, instr: r.instructor })
        )
      }
    }

    if (scope === 'pattern') {
      addDeptSheet('Department', patternRows)
      addGroupSheets(patternRows)
    } else if (scope === 'week' && typeof week === 'number') {
      const rows = weekRowsFor(week)
      addDeptSheet(`W${String(week).padStart(2, '0')}`, rows)
      addGroupSheets(rows)
    } else {
      addDeptSheet('Department', patternRows)
      for (let w = 1; w <= term.weeks; w++) {
        if (term.breakWeeks.includes(w)) continue
        addDeptSheet(`W${String(w).padStart(2, '0')}`, weekRowsFor(w))
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
    if (entity === 'courses') {
      rows = db.select().from(courses).where(eq(courses.termId, termId)).all().map((c) => ({
        code: c.code,
        title: c.title,
        credits: c.credits
      }))
    } else if (entity === 'instructors') {
      rows = db.select().from(instructors).all().map((i) => ({
        name: i.name,
        email: i.email,
        maxWeeklyHours: i.maxWeeklyHours
      }))
    } else if (entity === 'rooms') {
      rows = db.select().from(rooms).all().map((r) => ({
        name: r.name,
        building: r.building,
        capacity: r.capacity,
        travelGroup: r.travelGroup
      }))
    } else {
      rows = listSectionsFull(termId).map((s) => {
        const m = s.meetings[0]
        return {
          courseCode: s.code,
          number: s.number,
          capacity: s.capacity,
          sessionsPerWeek: s.sessionsPerWeek,
          durationMinutes: s.durationMinutes,
          instructorEmail: db.select().from(instructors).all().find((i) => i.id === s.instructorId)?.email ?? '',
          roomName: s.roomName ?? '',
          days: m ? daysToLabel(m.days) : '',
          start: m ? toHHMM(m.start) : '',
          end: m ? toHHMM(m.end) : '',
          locked: s.locked ? 'true' : 'false'
        }
      })
    }
    return saveText(`${entity}.csv`, Papa.unparse(rows))
  })

  guardedHandle('io:importCsv', (_e, entity: CsvEntity, text: string, termId: number) => {
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
    const db = getDb()
    const errors: string[] = []
    let imported = 0
    let updated = 0

    if (entity === 'courses') {
      for (const row of parsed.data) {
        const code = (row.code ?? '').trim()
        if (!code) continue
        const existing = db.select().from(courses).where(eq(courses.termId, termId)).all().find((c) => c.code === code)
        const values = { code, title: (row.title ?? '').trim(), credits: num(row.credits, 3) }
        if (existing) {
          db.update(courses).set(values).where(eq(courses.id, existing.id)).run()
          updated++
        } else {
          db.insert(courses).values({ ...values, termId }).run()
          imported++
        }
      }
    } else if (entity === 'instructors') {
      for (const row of parsed.data) {
        const name = (row.name ?? '').trim()
        if (!name) continue
        const email = (row.email ?? '').trim()
        const existing = db.select().from(instructors).all().find((i) => (email && i.email === email) || i.name === name)
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
          unavailable: JSON.stringify(unavailable)
        }
        if (existing) {
          db.update(instructors).set(values).where(eq(instructors.id, existing.id)).run()
          updated++
        } else {
          db.insert(instructors).values(values).run()
          imported++
        }
      }
    } else if (entity === 'rooms') {
      for (const row of parsed.data) {
        const name = (row.name ?? '').trim()
        if (!name) continue
        const existing = db.select().from(rooms).all().find((r) => r.name === name)
        const values = {
          name,
          building: (row.building ?? '').trim(),
          capacity: num(row.capacity, 0),
          travelGroup: (row.travelGroup ?? 'A').trim() || 'A'
        }
        if (existing) {
          db.update(rooms).set(values).where(eq(rooms.id, existing.id)).run()
          updated++
        } else {
          db.insert(rooms).values(values).run()
          imported++
        }
      }
    } else {
      const courseRows = db.select().from(courses).where(eq(courses.termId, termId)).all()
      const instructorRows = db.select().from(instructors).all()
      const roomRows = db.select().from(rooms).all()
      for (const row of parsed.data) {
        const courseCode = (row.courseCode ?? '').trim()
        const number = (row.number ?? '').trim()
        const course = courseRows.find((c) => c.code === courseCode)
        if (!course) {
          errors.push(`Course "${courseCode}" not found (row ${parsed.data.indexOf(row) + 2})`)
          continue
        }
        const instructorEmail = (row.instructorEmail ?? '').trim()
        const instructor = instructorEmail
          ? instructorRows.find((i) => i.email === instructorEmail || i.name === instructorEmail)
          : undefined
        const roomName = (row.roomName ?? '').trim()
        const room = roomName ? roomRows.find((r) => r.name === roomName) : undefined
        const existing = db.select().from(sections).where(eq(sections.courseId, course.id)).all().find((s) => s.number === number)
        const values = {
          number,
          capacity: num(row.capacity, 0),
          sessionsPerWeek: num(row.sessionsPerWeek, 2),
          durationMinutes: num(row.durationMinutes, 75),
          instructorId: instructor?.id ?? null,
          roomId: room?.id ?? null,
          locked: bool(row.locked) ? 1 : 0
        }
        let sectionId: number
        if (existing) {
          db.update(sections).set(values).where(eq(sections.id, existing.id)).run()
          sectionId = existing.id
          updated++
        } else {
          sectionId = db.insert(sections).values({ ...values, courseId: course.id }).returning().get().id
          imported++
        }
        const days = parseDays(row.days ?? '')
        const start = fromHHMM(row.start ?? '')
        const end = fromHHMM(row.end ?? '')
        if (days.length > 0 && start !== null && end !== null && end > start) {
          db.delete(meetingTimes).where(eq(meetingTimes.sectionId, sectionId)).run()
          db.insert(meetingTimes)
            .values({ sectionId, days: daysToStr(days), startMinute: start, endMinute: end })
            .run()
        }
      }
    }
    return { imported, updated, errors }
  })

  guardedHandle('io:seedSample', async () => seedSampleData())
}

function dayLabelWithDate(term: Term, week: number, day: number): string {
  const base = ['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'][day] ?? ''
  const start = weekStart(term, week)
  if (!start) return base
  const d = addDays(start, day - 1)
  return `${base} ${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`
}
