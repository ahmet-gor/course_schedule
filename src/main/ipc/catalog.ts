import { ipcMain } from 'electron'
import { guardedHandle } from '../licensing'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  courses,
  instructors,
  meetingOverrides,
  meetingTimes,
  rooms,
  sections,
  settingsTable,
  terms
} from '../db/schema'
import {
  DEFAULT_SETTINGS,
  type Meeting,
  type MeetingOverride,
  type OverrideInput,
  type SectionFull,
  type Settings,
  type Term,
  type TimeSlot
} from '@shared/types'
import { assignmentsToOverrides } from '@shared/weeks'

export function mapTerm(row: { id: number; name: string; weeks: number; startDate: string; breakWeeks: string }): Term {
  let breaks: number[] = []
  try {
    const parsed = JSON.parse(row.breakWeeks)
    if (Array.isArray(parsed)) breaks = parsed.filter((x) => typeof x === 'number')
  } catch {
    breaks = []
  }
  return { id: row.id, name: row.name, weeks: row.weeks, startDate: row.startDate, breakWeeks: breaks }
}

export function listOverrides(termId: number): MeetingOverride[] {
  const db = getDb()
  const rows = db
    .select({ o: meetingOverrides })
    .from(meetingOverrides)
    .innerJoin(sections, eq(meetingOverrides.sectionId, sections.id))
    .innerJoin(courses, eq(sections.courseId, courses.id))
    .where(eq(courses.termId, termId))
    .all()
  return rows.map(({ o }) => ({
    id: o.id,
    sectionId: o.sectionId,
    week: o.week,
    kind: o.kind as MeetingOverride['kind'],
    fromDay: o.fromDay,
    toDay: o.toDay,
    start: o.startMinute,
    end: o.endMinute,
    roomId: o.roomId,
    instructorId: o.instructorId,
    note: o.note
  }))
}

function insertOverride(sectionId: number, week: number, data: OverrideInput): void {
  const db = getDb()
  db.insert(meetingOverrides)
    .values({
      sectionId,
      week,
      kind: data.kind,
      fromDay: data.fromDay,
      toDay: data.toDay,
      startMinute: data.start,
      endMinute: data.end,
      roomId: data.roomId,
      instructorId: data.instructorId,
      note: data.note ?? ''
    })
    .run()
}

export function daysToStr(days: number[]): string {
  return days.join(',')
}

export function strToDays(s: string): number[] {
  return s
    .split(',')
    .filter(Boolean)
    .map((x) => parseInt(x, 10))
    .filter((d) => d >= 1 && d <= 7)
}

export function parseUnavailable(json: string): TimeSlot[] {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (x): x is TimeSlot =>
        x &&
        typeof x.start === 'number' &&
        typeof x.end === 'number' &&
        Array.isArray(x.days)
    )
  } catch {
    return []
  }
}

export function getSettings(): Settings {
  const row = getDb().select().from(settingsTable).where(eq(settingsTable.id, 1)).get()
  if (!row) return { ...DEFAULT_SETTINGS }
  try {
    const parsed = JSON.parse(row.json)
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(next: Settings): Settings {
  getDb()
    .update(settingsTable)
    .set({ json: JSON.stringify(next) })
    .where(eq(settingsTable.id, 1))
    .run()
  return next
}

export function listSectionsFull(termId: number): SectionFull[] {
  const db = getDb()
  const rows = db
    .select({
      section: sections,
      courseCode: courses.code,
      courseTitle: courses.title,
      courseId: courses.id
    })
    .from(sections)
    .innerJoin(courses, eq(sections.courseId, courses.id))
    .where(eq(courses.termId, termId))
    .all()
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.section.id)
  const meetings = db.select().from(meetingTimes).where(inArray(meetingTimes.sectionId, ids)).all()
  const meetingsBySection = new Map<number, Meeting[]>()
  for (const m of meetings) {
    const arr = meetingsBySection.get(m.sectionId) ?? []
    arr.push({ days: strToDays(m.days), start: m.startMinute, end: m.endMinute })
    meetingsBySection.set(m.sectionId, arr)
  }
  const instructorRows = db.select().from(instructors).all()
  const roomRows = db.select().from(rooms).all()
  const insById = new Map(instructorRows.map((i) => [i.id, i]))
  const roomById = new Map(roomRows.map((r) => [r.id, r]))
  return rows.map((r) => {
    const ins = r.section.instructorId !== null ? insById.get(r.section.instructorId) : undefined
    const room = r.section.roomId !== null ? roomById.get(r.section.roomId) : undefined
    return {
      id: r.section.id,
      courseId: r.courseId,
      code: r.courseCode,
      title: r.courseTitle,
      number: r.section.number,
      capacity: r.section.capacity,
      sessionsPerWeek: r.section.sessionsPerWeek,
      durationMinutes: r.section.durationMinutes,
      instructorId: r.section.instructorId,
      roomId: r.section.roomId,
      locked: r.section.locked === 1,
      meetings: meetingsBySection.get(r.section.id) ?? [],
      instructorName: ins?.name ?? null,
      roomName: room?.name ?? null,
      travelGroup: room?.travelGroup ?? null
    }
  })
}

export function registerCatalogIpc(): void {
  ipcMain.handle('terms:list', () =>
    getDb()
      .select()
      .from(terms)
      .orderBy(asc(terms.id))
      .all()
      .map(mapTerm)
  )

  guardedHandle('terms:create', (_e, name: string) => {
    const db = getDb()
    const row = db
      .insert(terms)
      .values({ name, createdAt: Date.now(), weeks: getSettings().defaultWeeks })
      .returning()
      .get()
    return mapTerm(row)
  })

  guardedHandle(
  'terms:update',
    (
      _e,
      id: number,
      patch: { name?: string; weeks?: number; startDate?: string; breakWeeks?: number[] }
    ) => {
      const db = getDb()
      const set: Record<string, unknown> = {}
      if (patch.name !== undefined) set.name = patch.name
      if (patch.weeks !== undefined) set.weeks = Math.max(1, Math.min(53, Math.round(patch.weeks)))
      if (patch.startDate !== undefined) set.startDate = patch.startDate
      if (patch.breakWeeks !== undefined) set.breakWeeks = JSON.stringify(patch.breakWeeks)
      if (Object.keys(set).length === 0) return
      db.update(terms).set(set).where(eq(terms.id, id)).run()
    }
  )

  guardedHandle('terms:remove', (_e, id: number) => {
    getDb().delete(terms).where(eq(terms.id, id)).run()
  })

  guardedHandle('overrides:create', (_e, data: OverrideInput) => {
    const db = getDb()
    if (data.kind !== 'extra' && data.fromDay !== null) {
      db.delete(meetingOverrides)
        .where(
          and(
            eq(meetingOverrides.sectionId, data.sectionId),
            eq(meetingOverrides.week, data.week),
            eq(meetingOverrides.kind, data.kind),
            eq(meetingOverrides.fromDay, data.fromDay)
          )
        )
        .run()
    }
    insertOverride(data.sectionId, data.week, data)
  })

  guardedHandle('overrides:update', (_e, id: number, patch: Partial<OverrideInput>) => {
    const db = getDb()
    const set: Record<string, unknown> = {}
    if (patch.kind !== undefined) set.kind = patch.kind
    if (patch.fromDay !== undefined) set.fromDay = patch.fromDay
    if (patch.toDay !== undefined) set.toDay = patch.toDay
    if (patch.start !== undefined) set.startMinute = patch.start
    if (patch.end !== undefined) set.endMinute = patch.end
    if (patch.roomId !== undefined) set.roomId = patch.roomId
    if (patch.instructorId !== undefined) set.instructorId = patch.instructorId
    if (patch.note !== undefined) set.note = patch.note
    if (Object.keys(set).length === 0) return
    db.update(meetingOverrides).set(set).where(eq(meetingOverrides.id, id)).run()
  })

  guardedHandle('overrides:remove', (_e, id: number) => {
    getDb().delete(meetingOverrides).where(eq(meetingOverrides.id, id)).run()
  })

  guardedHandle('overrides:resetWeek', (_e, termId: number, week: number, sectionId: number | null) => {
    const db = getDb()
    const rows = db
      .select({ id: meetingOverrides.id, sectionId: meetingOverrides.sectionId })
      .from(meetingOverrides)
      .innerJoin(sections, eq(meetingOverrides.sectionId, sections.id))
      .innerJoin(courses, eq(sections.courseId, courses.id))
      .where(eq(courses.termId, termId))
      .all()
      .filter((r) => r.sectionId !== null)
    const ids = rows.filter((r) => sectionId === null || r.sectionId === sectionId).map((r) => r.id)
    if (ids.length > 0) {
      db.delete(meetingOverrides).where(inArray(meetingOverrides.id, ids)).run()
    }
  })

  ipcMain.handle('courses:list', (_e, termId: number) =>
    getDb().select().from(courses).where(eq(courses.termId, termId)).orderBy(asc(courses.code)).all()
  )

  guardedHandle('courses:create', (_e, termId: number, data: { code: string; title: string; credits: number }) =>
    getDb().insert(courses).values({ ...data, termId }).returning().get()
  )

  guardedHandle('courses:update', (_e, id: number, data: { code: string; title: string; credits: number }) => {
    getDb().update(courses).set(data).where(eq(courses.id, id)).run()
  })

  guardedHandle('courses:remove', (_e, id: number) => {
    getDb().delete(courses).where(eq(courses.id, id)).run()
  })

  ipcMain.handle('instructors:list', () => {
    const rows = getDb().select().from(instructors).orderBy(asc(instructors.name)).all()
    return rows.map((r) => ({ ...r, unavailable: parseUnavailable(r.unavailable) }))
  })

  guardedHandle(
  'instructors:create',
    (_e, data: { name: string; email: string; maxWeeklyHours: number; unavailable: TimeSlot[] }) =>
      getDb()
        .insert(instructors)
        .values({ ...data, unavailable: JSON.stringify(data.unavailable) })
        .returning()
        .get()
  )

  guardedHandle(
  'instructors:update',
    (_e, id: number, data: { name: string; email: string; maxWeeklyHours: number; unavailable: TimeSlot[] }) => {
      getDb()
        .update(instructors)
        .set({ ...data, unavailable: JSON.stringify(data.unavailable) })
        .where(eq(instructors.id, id))
        .run()
    }
  )

  guardedHandle('instructors:remove', (_e, id: number) => {
    getDb().delete(instructors).where(eq(instructors.id, id)).run()
  })

  ipcMain.handle('rooms:list', () => getDb().select().from(rooms).orderBy(asc(rooms.name)).all())

  guardedHandle('rooms:create', (_e, data: { name: string; building: string; capacity: number; travelGroup: string }) =>
    getDb().insert(rooms).values(data).returning().get()
  )

  guardedHandle('rooms:update', (_e, id: number, data: { name: string; building: string; capacity: number; travelGroup: string }) => {
    getDb().update(rooms).set(data).where(eq(rooms.id, id)).run()
  })

  guardedHandle('rooms:remove', (_e, id: number) => {
    getDb().delete(rooms).where(eq(rooms.id, id)).run()
  })

  ipcMain.handle('sections:list', (_e, termId: number) => listSectionsFull(termId))

  guardedHandle(
  'sections:create',
    (
      _e,
      courseId: number,
      data: {
        number: string
        capacity: number
        sessionsPerWeek: number
        durationMinutes: number
        instructorId: number | null
        roomId: number | null
      }
    ) =>
      getDb()
        .insert(sections)
        .values({ ...data, courseId, locked: 0 })
        .returning()
        .get()
  )

  guardedHandle(
  'sections:update',
    (
      _e,
      id: number,
      patch: Partial<{
        number: string
        capacity: number
        sessionsPerWeek: number
        durationMinutes: number
        locked: boolean
      }> & { instructorId?: number | null; roomId?: number | null }
    ) => {
      const set: Record<string, unknown> = { ...patch }
      if (patch.locked !== undefined) set.locked = patch.locked ? 1 : 0
      getDb()
        .update(sections)
        .set(set)
        .where(eq(sections.id, id))
        .run()
    }
  )

  guardedHandle('sections:setMeetings', (_e, id: number, meetings: Meeting[]) => {
    const db = getDb()
    db.delete(meetingTimes).where(eq(meetingTimes.sectionId, id)).run()
    for (const m of meetings) {
      db.insert(meetingTimes)
        .values({ sectionId: id, days: daysToStr(m.days), startMinute: m.start, endMinute: m.end })
        .run()
    }
  })

  guardedHandle('sections:remove', (_e, id: number) => {
    getDb().delete(sections).where(eq(sections.id, id)).run()
  })

  ipcMain.handle('settings:get', () => getSettings())

  guardedHandle('settings:update', (_e, patch: Partial<Settings>) => {
    const current = getSettings()
    const next = { ...current, ...patch }
    return saveSettings(next)
  })
}