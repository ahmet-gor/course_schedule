import { ipcMain } from 'electron'
import { guardedHandle } from '../licensing'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { courses, instructors, meetingOverrides, meetingTimes, rooms, sections, terms } from '../db/schema'
import { getSettings, listSectionsFull, daysToStr, parseUnavailable, mapTerm, listOverrides } from './catalog'
import { assignmentsToOverrides } from '@shared/weeks'
import type { ScheduleData } from '@shared/types'

interface ApplyAssignment {
  days: number[]
  start: number
  end: number
  roomId: number
  instructorId: number
}

export function registerScheduleIpc(): void {
  ipcMain.handle('schedule:getData', (_e, termId: number): ScheduleData => {
    const db = getDb()
    const termRow = db.select().from(terms).where(eq(terms.id, termId)).get()
    if (!termRow) throw new Error('Term not found')
    const instructorRows = db
      .select()
      .from(instructors)
      .all()
      .map((r) => ({ ...r, unavailable: parseUnavailable(r.unavailable) }))
    const overrides = listOverrides(termId)
    let term = mapTerm(termRow)
    const maxWeek = overrides.reduce((m, o) => Math.max(m, o.week), 0)
    if (maxWeek > term.weeks) {
      db.update(terms).set({ weeks: maxWeek }).where(eq(terms.id, termId)).run()
      term = { ...term, weeks: maxWeek }
    }
    return {
      settings: getSettings(),
      term,
      rooms: db.select().from(rooms).all(),
      instructors: instructorRows,
      sections: listSectionsFull(termId),
      overrides
    }
  })

  guardedHandle('schedule:apply', (_e, termId: number, assignments: Record<string, ApplyAssignment>) => {
    const db = getDb()
    const valid = db
      .select({ id: sections.id, locked: sections.locked })
      .from(sections)
      .innerJoin(courses, eq(sections.courseId, courses.id))
      .where(eq(courses.termId, termId))
      .all()
    const validIds = new Set(valid.map((v) => v.id))
    const lockedIds = new Set(valid.filter((v) => v.locked === 1).map((v) => v.id))
    let clearedOverrides = 0
    db.transaction((tx) => {
      for (const [key, a] of Object.entries(assignments)) {
        const sectionId = parseInt(key, 10)
        if (!validIds.has(sectionId) || lockedIds.has(sectionId)) continue
        tx.update(sections)
          .set({ roomId: a.roomId, instructorId: a.instructorId })
          .where(eq(sections.id, sectionId))
          .run()
        tx.delete(meetingTimes).where(eq(meetingTimes.sectionId, sectionId)).run()
        tx.insert(meetingTimes)
          .values({ sectionId, days: daysToStr(a.days), startMinute: a.start, endMinute: a.end })
          .run()
        const res = tx.delete(meetingOverrides).where(eq(meetingOverrides.sectionId, sectionId)).run()
        clearedOverrides += res.changes
      }
    })
    return clearedOverrides
  })

  guardedHandle('schedule:unschedule', (_e, sectionIds: number[]) => {
    const db = getDb()
    db.transaction((tx) => {
      for (const id of sectionIds) {
        tx.delete(meetingTimes).where(eq(meetingTimes.sectionId, id)).run()
        tx.delete(meetingOverrides).where(eq(meetingOverrides.sectionId, id)).run()
        tx.update(sections).set({ roomId: null }).where(eq(sections.id, id)).run()
      }
    })
  })

  guardedHandle(
  'schedule:resolveWeek',
    (_e, termId: number, week: number, assignments: Record<string, ApplyAssignment>) => {
      const db = getDb()
      const valid = db
        .select({
          id: sections.id,
          patternDays: meetingTimes.days
        })
        .from(sections)
        .innerJoin(courses, eq(sections.courseId, courses.id))
        .leftJoin(meetingTimes, eq(meetingTimes.sectionId, sections.id))
        .where(eq(courses.termId, termId))
        .all()
      const patternBySection = new Map<number, number[]>()
      for (const v of valid) {
        const arr = patternBySection.get(v.id) ?? []
        for (const d of (v.patternDays ?? '').split(',').filter(Boolean)) arr.push(parseInt(d, 10))
        patternBySection.set(v.id, arr)
      }
      db.transaction((tx) => {
        for (const [key, a] of Object.entries(assignments)) {
          const sectionId = parseInt(key, 10)
          if (!patternBySection.has(sectionId)) continue
          tx.delete(meetingOverrides)
            .where(and(eq(meetingOverrides.sectionId, sectionId), eq(meetingOverrides.week, week)))
            .run()
          const patternDays = (patternBySection.get(sectionId) ?? []).sort((x, y) => x - y)
          for (const row of assignmentsToOverrides(patternDays, a)) {
            tx.insert(meetingOverrides)
              .values({
                sectionId,
                week,
                kind: row.kind,
                fromDay: row.fromDay,
                toDay: row.toDay,
                startMinute: row.start,
                endMinute: row.end,
                roomId: row.roomId,
                instructorId: row.instructorId,
                note: row.note
              })
              .run()
          }
        }
      })
    }
  )
}