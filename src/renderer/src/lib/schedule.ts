import { computeConflicts, scoreSoft, type CtxEntry, type CtxTeacher } from '@shared/constraints'
import type { EntryFull, ScheduleData } from '@shared/types'
import type { GridMeeting } from '../components/TimetableGrid'
import { conflictText, type Locale } from '../i18n'

export function entryCode(e: EntryFull): string {
  return e.lessons.map((l) => `${l.departmentName}·${l.code}`).join('+')
}

export function toCtxEntries(data: ScheduleData, scheduleId: number): CtxEntry[] {
  void scheduleId
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]))
  return data.entries.map((e) => {
    const teacher = e.teacherId !== null ? teacherById.get(e.teacherId) : undefined
    const ctxTeacher: CtxTeacher | null = teacher
      ? {
          id: teacher.id,
          name: teacher.name,
          maxWeeklyHours: teacher.maxWeeklyHours,
          unavailable: teacher.unavailable,
          lessonIds: teacher.lessonIds
        }
      : null
    return {
      id: e.id,
      departmentIds: e.lessons.map((l) => l.departmentId),
      lessonIds: e.lessonIds,
      code: entryCode(e),
      meetings: e.days.length > 0 && e.start !== null && e.end !== null ? [{ days: e.days, start: e.start, end: e.end }] : [],
      teacher: ctxTeacher,
      dangling: e.lessons.length === 0
    }
  })
}

export function conflictsByEntry(data: ScheduleData, locale: Locale, scheduleId: number): Record<number, string[]> {
  const conflicts = computeConflicts(toCtxEntries(data, scheduleId), data.settings)
  const map: Record<number, string[]> = {}
  for (const c of conflicts) {
    const text = conflictText(c, locale)
    const arr = map[c.lessonId] ?? []
    if (!arr.includes(text)) arr.push(text)
    map[c.lessonId] = arr
    if (c.withLessonIds) {
      for (const other of c.withLessonIds) {
        const oarr = map[other] ?? []
        if (!oarr.includes(text)) oarr.push(text)
        map[other] = oarr
      }
    }
  }
  return map
}

export function softScore(data: ScheduleData): number | null {
  if (data.entries.length === 0) return null
  return scoreSoft(toCtxEntries(data, 0), data.settings).total
}

export function toGridMeetings(entries: EntryFull[], fallbackTeacher: string): GridMeeting[] {
  return entries
    .filter((e) => e.days.length > 0 && e.start !== null && e.end !== null && e.lessons.length > 0)
    .map((e) => ({
      lessonId: e.id,
      label: entryCode(e),
      title: e.lessons.map((l) => l.title).join(' + '),
      days: [...e.days],
      start: e.start as number,
      end: e.end as number,
      teacherLabel: e.teacherName ?? fallbackTeacher,
      classLabel: e.lessons.map((l) => l.departmentName).join(' + '),
      subjectCode: e.lessons.map((l) => l.code).join('+')
    }))
}
