import { ipcMain } from 'electron'
import { guardedHandle } from '../licensing'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { classes, lessons, meetingOverrides, subjects, teachers, terms } from '../db/schema'
import {
  getSettings,
  listLessonsFull,
  listOverrides,
  mapTerm,
  parseSubjectIds,
  parseUnavailable
} from './catalog'
import type { ScheduleData } from '@shared/types'

export function registerScheduleIpc(): void {
  ipcMain.handle('schedule:getData', (_e, termId: number): ScheduleData => {
    const db = getDb()
    const termRow = db.select().from(terms).where(eq(terms.id, termId)).get()
    if (!termRow) throw new Error('Term not found')
    let term = mapTerm(termRow)
    const overrides = listOverrides(termId)
    const maxWeek = overrides.reduce((m, o) => Math.max(m, o.week), 0)
    if (maxWeek > term.weeks) {
      db.update(terms).set({ weeks: maxWeek }).where(eq(terms.id, termId)).run()
      term = { ...term, weeks: maxWeek }
    }
    return {
      settings: getSettings(),
      term,
      classes: db.select().from(classes).where(eq(classes.termId, termId)).all(),
      subjects: db.select().from(subjects).where(eq(subjects.termId, termId)).all(),
      teachers: db
        .select()
        .from(teachers)
        .all()
        .map((r) => ({
          ...r,
          unavailable: parseUnavailable(r.unavailable),
          subjectIds: parseSubjectIds(r.subjectIds)
        })),
      lessons: listLessonsFull(termId),
      overrides
    }
  })

  guardedHandle(
    'schedule:applyClasses',
    (_e, termId: number, assignments: Record<string, { days: number[]; start: number; end: number }>) => {
      const db = getDb()
      const rows = db
        .select({ lesson: lessons })
        .from(lessons)
        .innerJoin(classes, eq(lessons.classId, classes.id))
        .where(eq(classes.termId, termId))
        .all()
      const byId = new Map(rows.map((r) => [r.lesson.id, r.lesson]))
      let clearedOverrides = 0
      db.transaction((tx) => {
        for (const [key, a] of Object.entries(assignments)) {
          const lessonId = parseInt(key, 10)
          const lesson = byId.get(lessonId)
          if (!lesson || lesson.locked === 1) continue
          const days = a.days.join(',')
          const changed = lesson.days !== days || lesson.startMinute !== a.start || lesson.endMinute !== a.end
          tx.update(lessons)
            .set({
              days,
              startMinute: a.start,
              endMinute: a.end,
              teacherId: changed ? null : lesson.teacherId
            })
            .where(eq(lessons.id, lessonId))
            .run()
          const res = tx.delete(meetingOverrides).where(eq(meetingOverrides.lessonId, lessonId)).run()
          clearedOverrides += res.changes
        }
      })
      return clearedOverrides
    }
  )

  guardedHandle('schedule:assignTeachers', (_e, termId: number, assignments: Record<string, number | null>) => {
    const db = getDb()
    const rows = db
      .select({ id: lessons.id })
      .from(lessons)
      .innerJoin(classes, eq(lessons.classId, classes.id))
      .where(eq(classes.termId, termId))
      .all()
    const validIds = new Set(rows.map((r) => r.id))
    db.transaction((tx) => {
      for (const [key, teacherId] of Object.entries(assignments)) {
        const lessonId = parseInt(key, 10)
        if (!validIds.has(lessonId)) continue
        tx.update(lessons)
          .set({ teacherId: teacherId === null ? null : teacherId })
          .where(eq(lessons.id, lessonId))
          .run()
      }
    })
  })

  guardedHandle('schedule:unschedule', (_e, lessonIds: number[]) => {
    const db = getDb()
    db.transaction((tx) => {
      for (const id of lessonIds) {
        tx.delete(meetingOverrides).where(eq(meetingOverrides.lessonId, id)).run()
        tx.update(lessons)
          .set({ days: '', startMinute: null, endMinute: null, teacherId: null })
          .where(eq(lessons.id, id))
          .run()
      }
    })
  })
}
