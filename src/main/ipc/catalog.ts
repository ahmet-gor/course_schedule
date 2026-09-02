import { ipcMain } from 'electron'
import { guardedHandle } from '../licensing'
import { asc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  departments,
  lessons,
  schedules,
  settingsTable,
  teacherLessons,
  teachers
} from '../db/schema'
import {
  DEFAULT_SETTINGS,
  type LessonRef,
  type Settings,
  type TimeSlot
} from '@shared/types'

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

export function teacherLessonMap(): Map<number, number[]> {
  const rows = getDb().select().from(teacherLessons).all()
  const map = new Map<number, number[]>()
  for (const r of rows) {
    const arr = map.get(r.teacherId) ?? []
    arr.push(r.lessonId)
    map.set(r.teacherId, arr)
  }
  return map
}

export function lessonTeacherMap(): Map<number, number[]> {
  const rows = getDb().select().from(teacherLessons).all()
  const map = new Map<number, number[]>()
  for (const r of rows) {
    const arr = map.get(r.lessonId) ?? []
    arr.push(r.teacherId)
    map.set(r.lessonId, arr)
  }
  return map
}

export function listLessonRefs(): LessonRef[] {
  const db = getDb()
  const rows = db
    .select({ lesson: lessons, departmentName: departments.name })
    .from(lessons)
    .innerJoin(departments, eq(lessons.departmentId, departments.id))
    .orderBy(asc(departments.name), asc(lessons.code))
    .all()
  const byLesson = lessonTeacherMap()
  return rows.map((r) => ({
    ...r.lesson,
    departmentName: r.departmentName,
    teacherIds: byLesson.get(r.lesson.id) ?? []
  }))
}

export function listTeachersFull() {
  const rows = getDb().select().from(teachers).orderBy(asc(teachers.name)).all()
  const byTeacher = teacherLessonMap()
  return rows.map((r) => ({
    ...r,
    unavailable: parseUnavailable(r.unavailable),
    lessonIds: byTeacher.get(r.id) ?? []
  }))
}

export function registerCatalogIpc(): void {
  ipcMain.handle('departments:list', () =>
    getDb().select().from(departments).orderBy(asc(departments.name)).all()
  )

  guardedHandle('departments:create', (_e, data: { name: string; capacity: number; homeroom: string }) =>
    getDb().insert(departments).values(data).returning().get()
  )

  guardedHandle(
    'departments:update',
    (_e, id: number, patch: { name?: string; capacity?: number; homeroom?: string }) => {
      const set: Record<string, unknown> = {}
      if (patch.name !== undefined) set.name = patch.name
      if (patch.capacity !== undefined) set.capacity = patch.capacity
      if (patch.homeroom !== undefined) set.homeroom = patch.homeroom
      if (Object.keys(set).length === 0) return
      getDb().update(departments).set(set).where(eq(departments.id, id)).run()
    }
  )

  guardedHandle('departments:remove', (_e, id: number) => {
    getDb().delete(departments).where(eq(departments.id, id)).run()
  })

  ipcMain.handle('lessons:list', () => listLessonRefs())

  guardedHandle(
    'lessons:create',
    (_e, data: { departmentId: number; code: string; title: string; sessionsPerWeek: number; durationMinutes: number }) =>
      getDb().insert(lessons).values(data).returning().get()
  )

  guardedHandle(
    'lessons:update',
    (
      _e,
      id: number,
      patch: Partial<{ departmentId: number; code: string; title: string; sessionsPerWeek: number; durationMinutes: number }>
    ) => {
      const set: Record<string, unknown> = {}
      if (patch.departmentId !== undefined) set.departmentId = patch.departmentId
      if (patch.code !== undefined) set.code = patch.code
      if (patch.title !== undefined) set.title = patch.title
      if (patch.sessionsPerWeek !== undefined) set.sessionsPerWeek = patch.sessionsPerWeek
      if (patch.durationMinutes !== undefined) set.durationMinutes = patch.durationMinutes
      if (Object.keys(set).length === 0) return
      getDb().update(lessons).set(set).where(eq(lessons.id, id)).run()
    }
  )

  guardedHandle('lessons:remove', (_e, id: number) => {
    getDb().delete(lessons).where(eq(lessons.id, id)).run()
  })

  ipcMain.handle('teachers:list', () => listTeachersFull())

  guardedHandle(
    'teachers:create',
    (_e, data: { name: string; email: string; maxWeeklyHours: number; unavailable: TimeSlot[]; lessonIds: number[] }) => {
      const row = getDb()
        .insert(teachers)
        .values({
          name: data.name,
          email: data.email,
          maxWeeklyHours: data.maxWeeklyHours,
          unavailable: JSON.stringify(data.unavailable)
        })
        .returning()
        .get()
      if (data.lessonIds.length > 0) {
        getDb()
          .insert(teacherLessons)
          .values(data.lessonIds.map((lessonId) => ({ teacherId: row.id, lessonId })))
          .run()
      }
      return row
    }
  )

  guardedHandle(
    'teachers:update',
    (_e, id: number, data: { name: string; email: string; maxWeeklyHours: number; unavailable: TimeSlot[]; lessonIds: number[] }) => {
      const db = getDb()
      db.update(teachers)
        .set({
          name: data.name,
          email: data.email,
          maxWeeklyHours: data.maxWeeklyHours,
          unavailable: JSON.stringify(data.unavailable)
        })
        .where(eq(teachers.id, id))
        .run()
      db.delete(teacherLessons).where(eq(teacherLessons.teacherId, id)).run()
      if (data.lessonIds.length > 0) {
        db.insert(teacherLessons)
          .values(data.lessonIds.map((lessonId) => ({ teacherId: id, lessonId })))
          .run()
      }
    }
  )

  guardedHandle('teachers:remove', (_e, id: number) => {
    getDb().delete(teachers).where(eq(teachers.id, id)).run()
  })

  ipcMain.handle('schedules:list', () =>
    getDb().select().from(schedules).orderBy(asc(schedules.id)).all()
  )

  guardedHandle('schedules:create', (_e, name: string) =>
    getDb()
      .insert(schedules)
      .values({ name, createdAt: Date.now() })
      .returning()
      .get()
  )

  guardedHandle('schedules:rename', (_e, id: number, name: string) => {
    getDb().update(schedules).set({ name }).where(eq(schedules.id, id)).run()
  })

  guardedHandle('schedules:remove', (_e, id: number) => {
    getDb().delete(schedules).where(eq(schedules.id, id)).run()
  })

  ipcMain.handle('settings:get', () => getSettings())

  guardedHandle('settings:update', (_e, patch: Partial<Settings>) => {
    const current = getSettings()
    const next = { ...current, ...patch }
    return saveSettings(next)
  })
}

export function lessonsByIds(ids: number[]) {
  if (ids.length === 0) return []
  return getDb().select().from(lessons).where(inArray(lessons.id, ids)).all()
}
