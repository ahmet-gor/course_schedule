import type { Conflict, Settings, SoftScore, TimeSlot } from './types'
import { daysToLabel, overlap, toHHMM } from './time'

export interface CtxTeacher {
  id: number
  name: string
  maxWeeklyHours: number
  unavailable: TimeSlot[]
  lessonIds: number[]
}

export interface CtxEntry {
  id: number
  departmentIds: number[]
  lessonIds: number[]
  code: string
  meetings: TimeSlot[]
  teacher: CtxTeacher | null
  dangling?: boolean
}

export function computeConflicts(entries: CtxEntry[], settings: Settings): Conflict[] {
  void settings
  const conflicts: Conflict[] = []
  const flat: {
    entryId: number
    departmentIds: number[]
    code: string
    day: number
    interval: { start: number; end: number }
    teacherId: number | null
  }[] = []

  for (const e of entries) {
    if (e.dangling) {
      conflicts.push({
        lessonId: e.id,
        type: 'entry-dangling',
        message: `${e.code} references a deleted lesson`,
        params: { code: e.code },
        withLessonIds: []
      })
    }
    if (e.teacher) {
      const missing = e.lessonIds.filter((lid) => !e.teacher!.lessonIds.includes(lid))
      if (missing.length > 0) {
        conflicts.push({
          lessonId: e.id,
          type: 'teacher-unqualified',
          message: `${e.teacher.name} is not related to ${e.code.split('·').pop() ?? e.code}`,
          params: { name: e.teacher.name, code: e.code },
          withLessonIds: []
        })
      }
      for (const m of e.meetings) {
        for (const d of m.days) {
          for (const u of e.teacher.unavailable) {
            if (u.days.includes(d) && overlap(m, u)) {
              conflicts.push({
                lessonId: e.id,
                type: 'teacher-unavailable',
                message: `${e.code} meets ${daysToLabel([d])} ${toHHMM(m.start)}-${toHHMM(m.end)} during ${e.teacher.name}'s unavailable time`,
                params: { code: e.code, dayIndex: d, start: toHHMM(m.start), end: toHHMM(m.end), name: e.teacher.name }
              })
            }
          }
        }
      }
    }
    for (const m of e.meetings) {
      for (const d of m.days) {
        flat.push({
          entryId: e.id,
          departmentIds: e.departmentIds,
          code: e.code,
          day: d,
          interval: m,
          teacherId: e.teacher?.id ?? null
        })
      }
    }
  }

  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i]
      const b = flat[j]
      if (a.day !== b.day || !overlap(a.interval, b.interval)) continue
      if (a.departmentIds.some((d) => b.departmentIds.includes(d))) {
        conflicts.push({
          lessonId: a.entryId,
          type: 'dept-overlap',
          message: `Class clash: ${a.code} and ${b.code} overlap`,
          params: { a: a.code, b: b.code },
          withLessonIds: [b.entryId]
        })
      }
      if (a.teacherId !== null && a.teacherId === b.teacherId) {
        conflicts.push({
          lessonId: a.entryId,
          type: 'teacher-overlap',
          message: `Teacher teaches ${a.code} and ${b.code} at the same time`,
          params: { a: a.code, b: b.code },
          withLessonIds: [b.entryId]
        })
      }
    }
  }

  const minutesByTeacher = new Map<number, { name: string; minutes: number; max: number; entryId: number }>()
  for (const e of entries) {
    if (!e.teacher) continue
    const cur = minutesByTeacher.get(e.teacher.id) ?? {
      name: e.teacher.name,
      minutes: 0,
      max: e.teacher.maxWeeklyHours,
      entryId: e.id
    }
    for (const m of e.meetings) {
      for (const _d of m.days) {
        cur.minutes += m.end - m.start
      }
    }
    minutesByTeacher.set(e.teacher.id, cur)
  }
  for (const [, t] of minutesByTeacher) {
    const excess = t.minutes / 60 - t.max
    if (excess > 0.001) {
      conflicts.push({
        lessonId: t.entryId,
        type: 'teacher-overhours',
        message: `${t.name} is over the weekly limit by ${excess.toFixed(1)} h`,
        params: { name: t.name, hours: excess.toFixed(1) },
        withLessonIds: []
      })
    }
  }

  return conflicts
}

export function scoreSoft(entries: CtxEntry[], settings: Settings): SoftScore {
  let windowPenalty = 0
  const minutesByTeacher = new Map<number, number>()

  for (const e of entries) {
    for (const m of e.meetings) {
      const before = Math.max(0, settings.preferredStart - m.start)
      const after = Math.max(0, m.end - settings.preferredEnd)
      windowPenalty += before + after
      if (e.teacher) {
        for (const _d of m.days) {
          minutesByTeacher.set(e.teacher.id, (minutesByTeacher.get(e.teacher.id) ?? 0) + (m.end - m.start))
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
  for (const e of entries) {
    if (!e.teacher || seen.has(e.teacher.id)) continue
    seen.add(e.teacher.id)
    const minutes = minutesByTeacher.get(e.teacher.id) ?? 0
    const excess = minutes / 60 - e.teacher.maxWeeklyHours
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
