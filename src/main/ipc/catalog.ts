import { ipcMain } from 'electron'
import { guardedHandle } from '../licensing'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  classes,
  lessons,
  meetingOverrides,
  subjects,
  settingsTable,
  teachers,
  terms
} from '../db/schema'
import {
  DEFAULT_SETTINGS,
  type LessonFull,
  type MeetingOverride,
  type OverrideInput,
  type Settings,
  type Term,
  type TimeSlot
} from '@shared/types'

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
    .innerJoin(lessons, eq(meetingOverrides.lessonId, lessons.id))
    .innerJoin(classes, eq(lessons.classId, classes.id))
    .where(eq(classes.termId, termId))
    .all()
  return rows.map(({ o }) => ({
    id: o.id,
    lessonId: o.lessonId,
    week: o.week,
    kind: o.kind as MeetingOverride['kind'],
    fromDay: o.fromDay,
    toDay: o.toDay,
    start: o.startMinute,
    end: o.endMinute,
    teacherId: o.teacherId,
    note: o.note
  }))
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

export function parseSubjectIds(json: string): number[] {
  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is number => typeof x === 'number')
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

export function listLessonsFull(termId: number): LessonFull[] {
  const db = getDb()
  const rows = db
    .select({ lesson: lessons, className: classes.name, subjectCode: subjects.code, subjectTitle: subjects.title })
    .from(lessons)
    .innerJoin(classes, eq(lessons.classId, classes.id))
    .innerJoin(subjects, eq(lessons.subjectId, subjects.id))
    .where(eq(classes.termId, termId))
    .orderBy(asc(classes.name), asc(subjects.code))
    .all()
  const teacherRows = db.select().from(teachers).all()
  const teacherById = new Map(teacherRows.map((t) => [t.id, t]))
  return rows.map((r) => {
    const days = strToDays(r.lesson.days)
    const teacher = r.lesson.teacherId !== null ? teacherById.get(r.lesson.teacherId) : undefined
    return {
      id: r.lesson.id,
      classId: r.lesson.classId,
      subjectId: r.lesson.subjectId,
      sessionsPerWeek: r.lesson.sessionsPerWeek,
      durationMinutes: r.lesson.durationMinutes,
      teacherId: r.lesson.teacherId,
      locked: r.lesson.locked === 1,
      meetings:
        days.length > 0 && r.lesson.startMinute !== null && r.lesson.endMinute !== null
          ? [{ days, start: r.lesson.startMinute, end: r.lesson.endMinute }]
          : [],
      className: r.className,
      subjectCode: r.subjectCode,
      subjectTitle: r.subjectTitle,
      teacherName: teacher?.name ?? null
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
            eq(meetingOverrides.lessonId, data.lessonId),
            eq(meetingOverrides.week, data.week),
            eq(meetingOverrides.kind, data.kind),
            eq(meetingOverrides.fromDay, data.fromDay)
          )
        )
        .run()
    }
    db.insert(meetingOverrides)
      .values({
        lessonId: data.lessonId,
        week: data.week,
        kind: data.kind,
        fromDay: data.fromDay,
        toDay: data.toDay,
        startMinute: data.start,
        endMinute: data.end,
        teacherId: data.teacherId,
        note: data.note ?? ''
      })
      .run()
  })

  guardedHandle('overrides:update', (_e, id: number, patch: Partial<OverrideInput>) => {
    const db = getDb()
    const set: Record<string, unknown> = {}
    if (patch.kind !== undefined) set.kind = patch.kind
    if (patch.fromDay !== undefined) set.fromDay = patch.fromDay
    if (patch.toDay !== undefined) set.toDay = patch.toDay
    if (patch.start !== undefined) set.startMinute = patch.start
    if (patch.end !== undefined) set.endMinute = patch.end
    if (patch.teacherId !== undefined) set.teacherId = patch.teacherId
    if (patch.note !== undefined) set.note = patch.note
    if (Object.keys(set).length === 0) return
    db.update(meetingOverrides).set(set).where(eq(meetingOverrides.id, id)).run()
  })

  guardedHandle('overrides:remove', (_e, id: number) => {
    getDb().delete(meetingOverrides).where(eq(meetingOverrides.id, id)).run()
  })

  guardedHandle('overrides:resetWeek', (_e, termId: number, week: number, lessonId: number | null) => {
    const db = getDb()
    const rows = db
      .select({ id: meetingOverrides.id, lessonId: meetingOverrides.lessonId })
      .from(meetingOverrides)
      .innerJoin(lessons, eq(meetingOverrides.lessonId, lessons.id))
      .innerJoin(classes, eq(lessons.classId, classes.id))
      .where(eq(classes.termId, termId))
      .all()
      .filter((r) => r.lessonId !== null)
    const ids = rows.filter((r) => lessonId === null || r.lessonId === lessonId).map((r) => r.id)
    if (ids.length > 0) {
      db.delete(meetingOverrides).where(inArray(meetingOverrides.id, ids)).run()
    }
  })

  ipcMain.handle('classes:list', (_e, termId: number) =>
    getDb().select().from(classes).where(eq(classes.termId, termId)).orderBy(asc(classes.name)).all()
  )

  guardedHandle(
  'classes:create',
    (_e, termId: number, data: { name: string; grade: string; capacity: number; homeroom: string }) =>
      getDb().insert(classes).values({ ...data, termId }).returning().get()
  )

  guardedHandle(
  'classes:update',
    (_e, id: number, data: { name: string; grade: string; capacity: number; homeroom: string }) => {
      getDb().update(classes).set(data).where(eq(classes.id, id)).run()
    }
  )

  guardedHandle('classes:remove', (_e, id: number) => {
    getDb().delete(classes).where(eq(classes.id, id)).run()
  })

  ipcMain.handle('subjects:list', (_e, termId: number) =>
    getDb().select().from(subjects).where(eq(subjects.termId, termId)).orderBy(asc(subjects.code)).all()
  )

  guardedHandle('subjects:create', (_e, termId: number, data: { code: string; title: string }) =>
    getDb().insert(subjects).values({ ...data, termId }).returning().get()
  )

  guardedHandle('subjects:update', (_e, id: number, data: { code: string; title: string }) => {
    getDb().update(subjects).set(data).where(eq(subjects.id, id)).run()
  })

  guardedHandle('subjects:remove', (_e, id: number) => {
    getDb().delete(subjects).where(eq(subjects.id, id)).run()
  })

  ipcMain.handle('teachers:list', () => {
    const rows = getDb().select().from(teachers).orderBy(asc(teachers.name)).all()
    return rows.map((r) => ({
      ...r,
      unavailable: parseUnavailable(r.unavailable),
      subjectIds: parseSubjectIds(r.subjectIds)
    }))
  })

  guardedHandle(
  'teachers:create',
    (
      _e,
      data: {
        name: string
        email: string
        maxWeeklyHours: number
        unavailable: TimeSlot[]
        subjectIds: number[]
      }
    ) =>
      getDb()
        .insert(teachers)
        .values({
          name: data.name,
          email: data.email,
          maxWeeklyHours: data.maxWeeklyHours,
          unavailable: JSON.stringify(data.unavailable),
          subjectIds: JSON.stringify(data.subjectIds)
        })
        .returning()
        .get()
  )

  guardedHandle(
  'teachers:update',
    (
      _e,
      id: number,
      data: {
        name: string
        email: string
        maxWeeklyHours: number
        unavailable: TimeSlot[]
        subjectIds: number[]
      }
    ) => {
      getDb()
        .update(teachers)
        .set({
          name: data.name,
          email: data.email,
          maxWeeklyHours: data.maxWeeklyHours,
          unavailable: JSON.stringify(data.unavailable),
          subjectIds: JSON.stringify(data.subjectIds)
        })
        .where(eq(teachers.id, id))
        .run()
    }
  )

  guardedHandle('teachers:remove', (_e, id: number) => {
    getDb().delete(teachers).where(eq(teachers.id, id)).run()
  })

  ipcMain.handle('lessons:list', (_e, termId: number) => listLessonsFull(termId))

  guardedHandle(
  'lessons:create',
    (
      _e,
      classId: number,
      data: {
        subjectId: number
        sessionsPerWeek: number
        durationMinutes: number
        teacherId: number | null
        locked?: boolean
      }
    ) =>
      getDb()
        .insert(lessons)
        .values({
          classId,
          subjectId: data.subjectId,
          sessionsPerWeek: data.sessionsPerWeek,
          durationMinutes: data.durationMinutes,
          teacherId: data.teacherId,
          locked: data.locked ? 1 : 0
        })
        .returning()
        .get()
  )

  guardedHandle(
  'lessons:update',
    (
      _e,
      id: number,
      patch: Partial<{
        subjectId: number
        sessionsPerWeek: number
        durationMinutes: number
        locked: boolean
      }> & { teacherId?: number | null }
    ) => {
      const set: Record<string, unknown> = { ...patch }
      if (patch.locked !== undefined) set.locked = patch.locked ? 1 : 0
      getDb()
        .update(lessons)
        .set(set)
        .where(eq(lessons.id, id))
        .run()
    }
  )

  guardedHandle(
  'lessons:setSchedule',
    (_e, id: number, days: number[], start: number | null, end: number | null) => {
      getDb()
        .update(lessons)
        .set({
          days: start !== null && end !== null && days.length > 0 ? daysToStr(days) : '',
          startMinute: start,
          endMinute: end
        })
        .where(eq(lessons.id, id))
        .run()
    }
  )

  guardedHandle('lessons:remove', (_e, id: number) => {
    getDb().delete(lessons).where(eq(lessons.id, id)).run()
  })

  ipcMain.handle('settings:get', () => getSettings())

  guardedHandle('settings:update', (_e, patch: Partial<Settings>) => {
    const current = getSettings()
    const next = { ...current, ...patch }
    return saveSettings(next)
  })
}
