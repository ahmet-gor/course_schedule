import { computeConflicts, type CtxLesson } from '@shared/constraints'
import { occurrencesForWeek } from '@shared/weeks'
import type { LessonFull, Occurrence, ScheduleData } from '@shared/types'
import type { GridMeeting } from '../components/TimetableGrid'
import { conflictText, type Locale } from '../i18n'

export function lessonCode(l: LessonFull): string {
  return `${l.className}·${l.subjectCode}`
}

export function toCtxLessons(
  data: ScheduleData,
  override?: Map<number, { meetings: LessonFull['meetings']; teacherId: number | null }>
): CtxLesson[] {
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]))
  return data.lessons.map((l) => {
    const o = override?.get(l.id)
    const teacherId = o ? o.teacherId : l.teacherId
    const teacher = teacherId !== null ? teacherById.get(teacherId) : undefined
    return {
      id: l.id,
      classId: l.classId,
      subjectId: l.subjectId,
      code: lessonCode(l),
      meetings: o ? o.meetings : l.meetings,
      teacher: teacher
        ? {
            id: teacher.id,
            name: teacher.name,
            maxWeeklyHours: teacher.maxWeeklyHours,
            unavailable: teacher.unavailable,
            subjectIds: teacher.subjectIds
          }
        : null
    }
  })
}

export function conflictsByLesson(
  data: ScheduleData,
  locale: Locale,
  override?: Parameters<typeof toCtxLessons>[1]
): Record<number, string[]> {
  const conflicts = computeConflicts(toCtxLessons(data, override), data.settings)
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

export function toGridMeetings(lessons: LessonFull[], fallbackTeacher: string): GridMeeting[] {
  return lessons.map((l) => ({
    lessonId: l.id,
    label: `${l.className}·${l.subjectCode}`,
    title: l.subjectTitle,
    days: l.meetings.flatMap((m) => m.days),
    start: l.meetings[0]?.start ?? 0,
    end: l.meetings[0]?.end ?? 0,
    teacherLabel: l.teacherName ?? fallbackTeacher,
    classLabel: l.className,
    subjectCode: l.subjectCode
  })).filter((m) => m.days.length > 0)
}

export function weekOccurrences(data: ScheduleData, week: number): { occ: Occurrence; lesson: LessonFull }[] {
  const lessonById = new Map(data.lessons.map((l) => [l.id, l]))
  return occurrencesForWeek(data.lessons, data.overrides, week)
    .map((occ) => ({ occ, lesson: lessonById.get(occ.lessonId) }))
    .filter((x): x is { occ: Occurrence; lesson: LessonFull } => x.lesson !== undefined)
}

export function occurrenceCtxLessons(
  data: ScheduleData,
  pairs: { occ: Occurrence; lesson: LessonFull }[]
): CtxLesson[] {
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]))
  return pairs
    .filter((p) => !p.occ.cancelled)
    .map(({ occ, lesson }) => {
      const teacher = occ.teacherId !== null ? teacherById.get(occ.teacherId) : undefined
      return {
        id: lesson.id,
        classId: lesson.classId,
        subjectId: lesson.subjectId,
        code: lessonCode(lesson),
        meetings: [{ days: [occ.day], start: occ.start, end: occ.end }],
        teacher: teacher
          ? {
              id: teacher.id,
              name: teacher.name,
              maxWeeklyHours: teacher.maxWeeklyHours,
              unavailable: teacher.unavailable,
              subjectIds: teacher.subjectIds
            }
          : null
      }
    })
}

export function occurrenceGridMeetings(
  data: ScheduleData,
  pairs: { occ: Occurrence; lesson: LessonFull }[],
  fallbackTeacher: string
): GridMeeting[] {
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]))
  return pairs.map(({ occ, lesson }) => {
    const teacher = occ.teacherId !== null ? teacherById.get(occ.teacherId) : undefined
    return {
      lessonId: lesson.id,
      occKey: occ.key,
      label: `${lesson.className}·${lesson.subjectCode}`,
      title: lesson.subjectTitle,
      days: [occ.day],
      start: occ.start,
      end: occ.end,
      teacherLabel: teacher?.name ?? fallbackTeacher,
      classLabel: lesson.className,
      subjectCode: lesson.subjectCode,
      cancelled: occ.cancelled,
      badge: occ.cancelled ? 'cancelled' : occ.extra ? 'extra' : occ.source.type === 'override' ? 'moved' : undefined
    }
  })
}

export function weekConflicts(
  data: ScheduleData,
  pairs: { occ: Occurrence; lesson: LessonFull }[],
  locale: Locale
): Record<number, string[]> {
  const conflicts = computeConflicts(occurrenceCtxLessons(data, pairs), data.settings)
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
