import { ipcMain } from 'electron'
import { guardedHandle } from '../licensing'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import {
  departments,
  entryLessons,
  lessons,
  scheduleEntries,
  schedules,
  teachers
} from '../db/schema'
import {
  daysToStr,
  getSettings,
  listLessonRefs,
  listTeachersFull,
  strToDays
} from './catalog'
import type { EntryFull, ScheduleData } from '@shared/types'

export function listEntriesFull(scheduleId: number): EntryFull[] {
  const db = getDb()
  const entryRows = db
    .select()
    .from(scheduleEntries)
    .where(eq(scheduleEntries.scheduleId, scheduleId))
    .orderBy(asc(scheduleEntries.id))
    .all()
  if (entryRows.length === 0) return []
  const linkRows = db
    .select()
    .from(entryLessons)
    .where(
      inArray(
        entryLessons.entryId,
        entryRows.map((e) => e.id)
      )
    )
    .all()
  const lessonRows = listLessonRefs()
  const lessonById = new Map(lessonRows.map((l) => [l.id, l]))
  const teacherRows = db.select().from(teachers).all()
  const teacherNameById = new Map(teacherRows.map((t) => [t.id, t.name]))
  const linksByEntry = new Map<number, number[]>()
  for (const l of linkRows) {
    const arr = linksByEntry.get(l.entryId) ?? []
    arr.push(l.lessonId)
    linksByEntry.set(l.entryId, arr)
  }
  return entryRows.map((e) => {
    const lessonIds = (linksByEntry.get(e.id) ?? []).filter((id) => lessonById.has(id))
    const days = strToDays(e.days)
    return {
      id: e.id,
      scheduleId: e.scheduleId,
      locked: e.locked === 1,
      teacherId: e.teacherId,
      days,
      start: e.startMinute,
      end: e.endMinute,
      lessonIds,
      lessons: lessonIds.map((id) => lessonById.get(id)!),
      teacherName: e.teacherId !== null ? teacherNameById.get(e.teacherId) ?? null : null
    }
  })
}

export function registerScheduleIpc(): void {
  ipcMain.handle('schedule:getData', (_e, scheduleId: number): ScheduleData => {
    const db = getDb()
    const scheduleRow = db.select().from(schedules).where(eq(schedules.id, scheduleId)).get()
    if (!scheduleRow) throw new Error('Schedule not found')
    return {
      settings: getSettings(),
      departments: db.select().from(departments).orderBy(asc(departments.name)).all(),
      lessons: listLessonRefs(),
      teachers: listTeachersFull(),
      entries: listEntriesFull(scheduleId)
    }
  })

  guardedHandle(
    'entries:create',
    (
      _e,
      scheduleId: number,
      data: { lessonIds: number[]; days: number[]; start: number | null; end: number | null; teacherId: number | null; locked: boolean }
    ) => {
      const db = getDb()
      const placed = data.start !== null && data.end !== null && data.days.length > 0
      const row = db
        .insert(scheduleEntries)
        .values({
          scheduleId,
          days: placed ? daysToStr(data.days) : '',
          startMinute: placed ? data.start : null,
          endMinute: placed ? data.end : null,
          teacherId: data.teacherId,
          locked: data.locked ? 1 : 0
        })
        .returning()
        .get()
      if (data.lessonIds.length > 0) {
        db.insert(entryLessons)
          .values(data.lessonIds.map((lessonId) => ({ entryId: row.id, lessonId })))
          .run()
      }
      return row.id
    }
  )

  guardedHandle(
    'entries:update',
    (
      _e,
      id: number,
      patch: { days?: number[]; start?: number | null; end?: number | null; teacherId?: number | null; locked?: boolean }
    ) => {
      const db = getDb()
      const set: Record<string, unknown> = {}
      if (patch.days !== undefined) {
        const placed = patch.start !== null && patch.start !== undefined && patch.end !== null && patch.end !== undefined && patch.days.length > 0
        set.days = placed ? daysToStr(patch.days) : ''
        set.startMinute = placed ? patch.start : null
        set.endMinute = placed ? patch.end : null
      } else if (patch.start !== undefined || patch.end !== undefined) {
        const row = db.select().from(scheduleEntries).where(eq(scheduleEntries.id, id)).get()
        if (row) {
          const start = patch.start !== undefined ? patch.start : row.startMinute
          const end = patch.end !== undefined ? patch.end : row.endMinute
          const placed = start !== null && end !== null && row.days !== ''
          set.startMinute = placed ? start : null
          set.endMinute = placed ? end : null
          set.days = placed ? row.days : ''
        }
      }
      if (patch.teacherId !== undefined) set.teacherId = patch.teacherId
      if (patch.locked !== undefined) set.locked = patch.locked ? 1 : 0
      if (Object.keys(set).length === 0) return
      db.update(scheduleEntries).set(set).where(eq(scheduleEntries.id, id)).run()
    }
  )

  guardedHandle('entries:remove', (_e, id: number) => {
    getDb().delete(scheduleEntries).where(eq(scheduleEntries.id, id)).run()
  })

  guardedHandle(
    'schedule:applyEntries',
    (
      _e,
      scheduleId: number,
      assignments: Record<string, { lessonIds: number[]; days: number[]; start: number; end: number }>
    ) => {
      const db = getDb()
      const existing = db.select().from(scheduleEntries).where(eq(scheduleEntries.scheduleId, scheduleId)).all()
      const lockedIds = new Set(existing.filter((e) => e.locked === 1).map((e) => e.id))
      db.transaction((tx) => {
        for (const e of existing) {
          if (!lockedIds.has(e.id)) {
            tx.delete(scheduleEntries).where(eq(scheduleEntries.id, e.id)).run()
          }
        }
        for (const [key, a] of Object.entries(assignments)) {
          if (a.lessonIds.length === 0) continue
          const row = tx
            .insert(scheduleEntries)
            .values({
              scheduleId,
              days: daysToStr(a.days),
              startMinute: a.start,
              endMinute: a.end,
              teacherId: null,
              locked: 0
            })
            .returning()
            .get()
          tx.insert(entryLessons)
            .values(a.lessonIds.map((lessonId) => ({ entryId: row.id, lessonId })))
            .run()
        }
      })
    }
  )

  guardedHandle('schedule:assignTeachers', (_e, scheduleId: number, assignments: Record<string, number | null>) => {
    const db = getDb()
    const validIds = new Set(
      db
        .select({ id: scheduleEntries.id })
        .from(scheduleEntries)
        .where(eq(scheduleEntries.scheduleId, scheduleId))
        .all()
        .map((r) => r.id)
    )
    db.transaction((tx) => {
      for (const [key, teacherId] of Object.entries(assignments)) {
        const entryId = parseInt(key, 10)
        if (!validIds.has(entryId)) continue
        tx.update(scheduleEntries)
          .set({ teacherId: teacherId === null ? null : teacherId })
          .where(and(eq(scheduleEntries.id, entryId), eq(scheduleEntries.scheduleId, scheduleId)))
          .run()
      }
    })
  })
}
