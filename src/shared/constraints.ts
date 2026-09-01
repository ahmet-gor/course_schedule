import type { Conflict, Settings, SoftScore, TimeSlot } from './types'
import { daysToLabel, overlap, toHHMM } from './time'

export interface CtxTeacher {
  id: number
  name: string
  maxWeeklyHours: number
  unavailable: TimeSlot[]
  subjectIds: number[]
}

export interface CtxLesson {
  id: number
  classId: number
  subjectId: number
  code: string
  meetings: TimeSlot[]
  teacher: CtxTeacher | null
}

export function computeConflicts(lessons: CtxLesson[], settings: Settings): Conflict[] {
  void settings
  const conflicts: Conflict[] = []
  const flat: {
    lessonId: number
    classId: number
    subjectId: number
    code: string
    day: number
    interval: { start: number; end: number }
    teacherId: number | null
  }[] = []

  for (const l of lessons) {
    if (l.teacher && !l.teacher.subjectIds.includes(l.subjectId)) {
      conflicts.push({
        lessonId: l.id,
        type: 'teacher-unqualified',
        message: `${l.teacher.name} is not qualified to teach ${l.code.split('·').pop() ?? l.code}`,
        params: { name: l.teacher.name, code: l.code },
        withLessonIds: []
      })
    }
    if (l.teacher) {
      for (const m of l.meetings) {
        for (const d of m.days) {
          for (const u of l.teacher.unavailable) {
            if (u.days.includes(d) && overlap(m, u)) {
              conflicts.push({
                lessonId: l.id,
                type: 'teacher-unavailable',
                message: `${l.code} meets ${daysToLabel([d])} ${toHHMM(m.start)}-${toHHMM(m.end)} during ${l.teacher.name}'s unavailable time`,
                params: { code: l.code, dayIndex: d, start: toHHMM(m.start), end: toHHMM(m.end), name: l.teacher.name }
              })
            }
          }
        }
      }
    }
    for (const m of l.meetings) {
      for (const d of m.days) {
        flat.push({
          lessonId: l.id,
          classId: l.classId,
          subjectId: l.subjectId,
          code: l.code,
          day: d,
          interval: m,
          teacherId: l.teacher?.id ?? null
        })
      }
    }
  }

  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i]
      const b = flat[j]
      if (a.day !== b.day || !overlap(a.interval, b.interval)) continue
      if (a.classId === b.classId) {
        conflicts.push({
          lessonId: a.lessonId,
          type: 'class-overlap',
          message: `Class clash: ${a.code} and ${b.code} overlap`,
          params: { a: a.code, b: b.code },
          withLessonIds: [b.lessonId]
        })
      }
      if (a.teacherId !== null && a.teacherId === b.teacherId) {
        conflicts.push({
          lessonId: a.lessonId,
          type: 'teacher-overlap',
          message: `Teacher teaches ${a.code} and ${b.code} at the same time`,
          params: { a: a.code, b: b.code },
          withLessonIds: [b.lessonId]
        })
      }
    }
  }

  const minutesByTeacher = new Map<number, { name: string; minutes: number; max: number; lessonId: number }>()
  for (const l of lessons) {
    if (!l.teacher) continue
    const cur = minutesByTeacher.get(l.teacher.id) ?? {
      name: l.teacher.name,
      minutes: 0,
      max: l.teacher.maxWeeklyHours,
      lessonId: l.id
    }
    for (const m of l.meetings) {
      for (const _d of m.days) {
        cur.minutes += m.end - m.start
      }
    }
    minutesByTeacher.set(l.teacher.id, cur)
  }
  for (const [, t] of minutesByTeacher) {
    const excess = t.minutes / 60 - t.max
    if (excess > 0.001) {
      conflicts.push({
        lessonId: t.lessonId,
        type: 'teacher-overhours',
        message: `${t.name} is over the weekly limit by ${excess.toFixed(1)} h`,
        params: { name: t.name, hours: excess.toFixed(1) },
        withLessonIds: []
      })
    }
  }

  return conflicts
}

export function scoreSoft(lessons: CtxLesson[], settings: Settings): SoftScore {
  let windowPenalty = 0
  const minutesByTeacher = new Map<number, number>()

  for (const l of lessons) {
    for (const m of l.meetings) {
      const before = Math.max(0, settings.preferredStart - m.start)
      const after = Math.max(0, m.end - settings.preferredEnd)
      windowPenalty += before + after
      if (l.teacher) {
        for (const _d of m.days) {
          minutesByTeacher.set(l.teacher.id, (minutesByTeacher.get(l.teacher.id) ?? 0) + (m.end - m.start))
        }
      }
    }
  }

  let loadPenaltyHours = 0
  if (minutesByTeacher.size > 0) {
    const loads = [...minutesByTeacher.values()].map((m) => m / 60)
    const avg = loads.reduce((a, b) => a + b, 0) / loads.length
    for (const h of loads) loadPenaltyHours += Math.max(0, h - avg)
  }

  let overHours = 0
  const seen = new Set<number>()
  for (const l of lessons) {
    if (!l.teacher || seen.has(l.teacher.id)) continue
    seen.add(l.teacher.id)
    const minutes = minutesByTeacher.get(l.teacher.id) ?? 0
    const excess = minutes / 60 - l.teacher.maxWeeklyHours
    if (excess > 0) overHours += excess
  }

  const w = settings.weights
  const parts = {
    window: windowPenalty * w.window,
    load: loadPenaltyHours * w.load,
    overHours: overHours * w.overHours
  }
  return { total: parts.window + parts.load + parts.overHours, ...parts }
}
