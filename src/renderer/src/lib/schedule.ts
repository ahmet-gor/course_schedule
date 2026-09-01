import { computeConflicts, type CtxSection } from '@shared/constraints'
import { occurrencesForWeek } from '@shared/weeks'
import type { Occurrence, ScheduleData, SectionFull } from '@shared/types'
import type { GridMeeting } from '../components/TimetableGrid'
import { conflictText, type Locale } from '../i18n'

export function toCtxSections(data: ScheduleData, override?: Map<number, { meetings: SectionFull['meetings']; roomId: number | null; instructorId: number | null }>): CtxSection[] {
  const roomById = new Map(data.rooms.map((r) => [r.id, r]))
  const instructorById = new Map(data.instructors.map((i) => [i.id, i]))
  return data.sections.map((s) => {
    const o = override?.get(s.id)
    const roomId = o ? o.roomId : s.roomId
    const instructorId = o ? o.instructorId : s.instructorId
    const room = roomId !== null ? roomById.get(roomId) : undefined
    const instructor = instructorId !== null ? instructorById.get(instructorId) : undefined
    return {
      id: s.id,
      courseId: s.courseId,
      code: `${s.code}-${s.number}`,
      capacity: s.capacity,
      meetings: o ? o.meetings : s.meetings,
      room: room ? { id: room.id, name: room.name, capacity: room.capacity, travelGroup: room.travelGroup } : null,
      instructor: instructor
        ? {
            id: instructor.id,
            name: instructor.name,
            maxWeeklyHours: instructor.maxWeeklyHours,
            unavailable: instructor.unavailable
          }
        : null
    }
  })
}

export function conflictsBySection(
  data: ScheduleData,
  locale: Locale,
  override?: Parameters<typeof toCtxSections>[1]
): Record<number, string[]> {
  const conflicts = computeConflicts(toCtxSections(data, override), data.settings)
  const map: Record<number, string[]> = {}
  for (const c of conflicts) {
    const text = conflictText(c, locale)
    const arr = map[c.sectionId] ?? []
    if (!arr.includes(text)) arr.push(text)
    map[c.sectionId] = arr
    if (c.withSectionIds) {
      for (const other of c.withSectionIds) {
        const oarr = map[other] ?? []
        if (!oarr.includes(text)) oarr.push(text)
        map[other] = oarr
      }
    }
  }
  return map
}

export function toGridMeetings(
  sections: SectionFull[],
  fallbacks: { room: string; instructor: string }
): GridMeeting[] {
  return sections.map((s) => ({
    sectionId: s.id,
    label: `${s.code}-${s.number}`,
    title: s.title,
    days: s.meetings.flatMap((m) => m.days),
    start: s.meetings[0]?.start ?? 0,
    end: s.meetings[0]?.end ?? 0,
    roomLabel: s.roomName ?? fallbacks.room,
    instructorLabel: s.instructorName ?? fallbacks.instructor,
    courseCode: s.code
  })).filter((m) => m.days.length > 0)
}

export function weekOccurrences(data: ScheduleData, week: number): { occ: Occurrence; section: SectionFull }[] {
  const sectionById = new Map(data.sections.map((s) => [s.id, s]))
  return occurrencesForWeek(data.sections, data.overrides, week)
    .map((occ) => ({ occ, section: sectionById.get(occ.sectionId) }))
    .filter((x): x is { occ: Occurrence; section: SectionFull } => x.section !== undefined)
}

export function occurrenceCtxSections(
  data: ScheduleData,
  pairs: { occ: Occurrence; section: SectionFull }[]
): CtxSection[] {
  const roomById = new Map(data.rooms.map((r) => [r.id, r]))
  const insById = new Map(data.instructors.map((i) => [i.id, i]))
  return pairs
    .filter((p) => !p.occ.cancelled)
    .map(({ occ, section }) => {
      const room = occ.roomId !== null ? roomById.get(occ.roomId) : undefined
      const ins = occ.instructorId !== null ? insById.get(occ.instructorId) : undefined
      return {
        id: section.id,
        courseId: section.courseId,
        code: `${section.code}-${section.number}`,
        capacity: section.capacity,
        meetings: [{ days: [occ.day], start: occ.start, end: occ.end }],
        room: room ? { id: room.id, name: room.name, capacity: room.capacity, travelGroup: room.travelGroup } : null,
        instructor: ins
          ? { id: ins.id, name: ins.name, maxWeeklyHours: ins.maxWeeklyHours, unavailable: ins.unavailable }
          : null
      }
    })
}

export function occurrenceGridMeetings(
  data: ScheduleData,
  pairs: { occ: Occurrence; section: SectionFull }[],
  fallbacks: { room: string; instructor: string }
): GridMeeting[] {
  const roomById = new Map(data.rooms.map((r) => [r.id, r]))
  const insById = new Map(data.instructors.map((i) => [i.id, i]))
  return pairs.map(({ occ, section }) => {
    const room = occ.roomId !== null ? roomById.get(occ.roomId) : undefined
    const ins = occ.instructorId !== null ? insById.get(occ.instructorId) : undefined
    return {
      sectionId: section.id,
      occKey: occ.key,
      label: `${section.code}-${section.number}`,
      title: section.title,
      days: [occ.day],
      start: occ.start,
      end: occ.end,
      roomLabel: room?.name ?? fallbacks.room,
      instructorLabel: ins?.name ?? fallbacks.instructor,
      courseCode: section.code,
      cancelled: occ.cancelled,
      badge: occ.cancelled ? 'cancelled' : occ.extra ? 'extra' : occ.source.type === 'override' ? 'moved' : undefined
    }
  })
}

export function weekConflicts(
  data: ScheduleData,
  pairs: { occ: Occurrence; section: SectionFull }[],
  locale: Locale
): Record<number, string[]> {
  const conflicts = computeConflicts(occurrenceCtxSections(data, pairs), data.settings)
  const map: Record<number, string[]> = {}
  for (const c of conflicts) {
    const text = conflictText(c, locale)
    const arr = map[c.sectionId] ?? []
    if (!arr.includes(text)) arr.push(text)
    map[c.sectionId] = arr
    if (c.withSectionIds) {
      for (const other of c.withSectionIds) {
        const oarr = map[other] ?? []
        if (!oarr.includes(text)) oarr.push(text)
        map[other] = oarr
      }
    }
  }
  return map
}
