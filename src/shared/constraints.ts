import type { Conflict, Settings, SoftScore, TimeSlot } from './types'
import { daysToLabel, gapBetween, overlap, toHHMM } from './time'

export interface CtxSection {
  id: number
  courseId: number
  code: string
  capacity: number
  meetings: TimeSlot[]
  room: { id: number; name: string; capacity: number; travelGroup: string } | null
  instructor: { id: number; name: string; maxWeeklyHours: number; unavailable: TimeSlot[] } | null
}

export function travelMinutesFor(settings: Settings, g1: string | null, g2: string | null): number {
  if (!g1 || !g2 || g1 === g2) return 0
  const key = [g1, g2].sort().join('|')
  return settings.travelMinutes[key] ?? 0
}

export function computeConflicts(sections: CtxSection[], settings: Settings): Conflict[] {
  const conflicts: Conflict[] = []
  const flat: {
    sectionId: number
    courseId: number
    code: string
    day: number
    interval: { start: number; end: number }
    roomId: number | null
    roomName: string | null
    group: string | null
    instructorId: number | null
  }[] = []

  for (const s of sections) {
    if (s.room && s.room.capacity < s.capacity) {
      conflicts.push({
        sectionId: s.id,
        type: 'capacity',
        message: `Capacity ${s.capacity} exceeds room ${s.room.name} (${s.room.capacity} seats)`,
        params: { capacity: s.capacity, room: s.room.name, seats: s.room.capacity }
      })
    }
    if (s.instructor) {
      for (const m of s.meetings) {
        for (const d of m.days) {
          for (const u of s.instructor.unavailable) {
            if (u.days.includes(d) && overlap(m, u)) {
              conflicts.push({
                sectionId: s.id,
                type: 'instructor-unavailable',
                message: `${s.code} meets ${daysToLabel([d])} ${toHHMM(m.start)}-${toHHMM(m.end)} during ${s.instructor.name}'s unavailable time`,
                params: { code: s.code, dayIndex: d, start: toHHMM(m.start), end: toHHMM(m.end), name: s.instructor.name }
              })
            }
          }
        }
      }
    }
    for (const m of s.meetings) {
      for (const d of m.days) {
        flat.push({
          sectionId: s.id,
          courseId: s.courseId,
          code: s.code,
          day: d,
          interval: m,
          roomId: s.room?.id ?? null,
          roomName: s.room?.name ?? null,
          group: s.room?.travelGroup ?? null,
          instructorId: s.instructor?.id ?? null
        })
      }
    }
  }

  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const a = flat[i]
      const b = flat[j]
      if (a.day !== b.day || !overlap(a.interval, b.interval)) continue
      if (a.roomId !== null && a.roomId === b.roomId) {
        conflicts.push({
          sectionId: a.sectionId,
          type: 'room-overlap',
          message: `Room ${a.roomName} double-booked: ${a.code} and ${b.code} overlap`,
          params: { room: a.roomName ?? '', a: a.code, b: b.code },
          withSectionIds: [b.sectionId]
        })
      }
      if (a.instructorId !== null && a.instructorId === b.instructorId) {
        conflicts.push({
          sectionId: a.sectionId,
          type: 'instructor-overlap',
          message: `Instructor teaches ${a.code} and ${b.code} at the same time`,
          params: { a: a.code, b: b.code },
          withSectionIds: [b.sectionId]
        })
      }
      if (a.courseId === b.courseId) {
        conflicts.push({
          sectionId: a.sectionId,
          type: 'course-overlap',
          message: `Sections of ${a.code.split('-')[0]} overlap (${a.code}, ${b.code})`,
          params: { course: a.code.split('-')[0], a: a.code, b: b.code },
          withSectionIds: [b.sectionId]
        })
      }
    }
  }

  const byInstructor = new Map<number, { code: string; day: number; interval: { start: number; end: number }; group: string | null; sectionId: number }[]>()
  for (const f of flat) {
    if (f.instructorId === null) continue
    const arr = byInstructor.get(f.instructorId) ?? []
    arr.push({ code: f.code, day: f.day, interval: f.interval, group: f.group, sectionId: f.sectionId })
    byInstructor.set(f.instructorId, arr)
  }
  for (const [, arr] of byInstructor) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i]
        const b = arr[j]
        if (a.day !== b.day || overlap(a.interval, b.interval)) continue
        const gap = gapBetween(a.interval, b.interval)
        const needed = travelMinutesFor(settings, a.group, b.group)
        if (gap < needed) {
          conflicts.push({
            sectionId: a.sectionId,
            type: 'travel',
            message: `Only ${gap} min between ${a.code} and ${b.code}, need ${needed} min travel`,
            params: { gap, a: a.code, b: b.code, needed },
            withSectionIds: [b.sectionId]
          })
        }
      }
    }
  }

  return conflicts
}

export function scoreSoft(sections: CtxSection[], settings: Settings): SoftScore {
  let windowPenalty = 0
  const instructorDayMinutes = new Map<string, { instructorId: number; minutes: number }>()
  const instructorMeetings = new Map<number, { day: number; start: number; end: number; group: string | null }[]>()

  for (const s of sections) {
    for (const m of s.meetings) {
      const before = Math.max(0, settings.preferredStart - m.start)
      const after = Math.max(0, m.end - settings.preferredEnd)
      windowPenalty += before + after
      if (s.instructor) {
        const key = `${s.instructor.id}`
        const arr = instructorMeetings.get(s.instructor.id) ?? []
        for (const d of m.days) {
          arr.push({ day: d, start: m.start, end: m.end, group: s.room?.travelGroup ?? null })
          const dk = `${key}:${d}`
          const cur = instructorDayMinutes.get(dk) ?? { instructorId: s.instructor.id, minutes: 0 }
          cur.minutes += m.end - m.start
          instructorDayMinutes.set(dk, cur)
        }
        instructorMeetings.set(s.instructor.id, arr)
      }
    }
  }

  let backToBackCount = 0
  for (const [, arr] of instructorMeetings) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i]
        const b = arr[j]
        if (a.day !== b.day || overlap(a, b)) continue
        const gap = gapBetween(a, b)
        if (gap > 0 && gap <= settings.backToBackGapMin) backToBackCount++
      }
    }
  }

  const maxHours = new Map<number, number>()
  for (const s of sections) {
    if (!s.instructor) continue
    for (const m of s.meetings) {
      for (const d of m.days) {
        const cur = maxHours.get(s.instructor.id) ?? 0
        const minutes = cur + (m.end - m.start)
        maxHours.set(s.instructor.id, minutes)
      }
    }
  }
  let overHours = 0
  const seenInstructors = new Set<number>()
  for (const s of sections) {
    if (!s.instructor || seenInstructors.has(s.instructor.id)) continue
    seenInstructors.add(s.instructor.id)
    const weekly = maxHours.get(s.instructor.id) ?? 0
    const excess = weekly / 60 - s.instructor.maxWeeklyHours
    if (excess > 0) overHours += excess
  }

  const w = settings.weights
  const parts = {
    window: windowPenalty * w.window,
    backToBack: backToBackCount * w.backToBack,
    maxHours: overHours * w.maxHours
  }
  return { total: parts.window + parts.backToBack + parts.maxHours, ...parts }
}
