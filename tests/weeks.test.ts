import { describe, expect, it } from 'vitest'
import {
  addDays,
  assignmentsToOverrides,
  isBreakWeek,
  occurrencesForWeek,
  overrideCountByWeek,
  weekLabel,
  weekStart
} from '@shared/weeks'
import type { MeetingOverride, SectionFull, Term } from '@shared/types'

const term: Term = { id: 1, name: 'Fall 2026', weeks: 14, startDate: '2026-09-28', breakWeeks: [8] }

function section(id: number, meetings: { days: number[]; start: number; end: number }[]): SectionFull {
  return {
    id,
    courseId: id,
    code: 'CSE101',
    title: 'Test',
    number: 'A',
    capacity: 30,
    sessionsPerWeek: meetings.length,
    durationMinutes: 75,
    instructorId: 1,
    roomId: 2,
    locked: false,
    meetings,
    instructorName: 'Ada',
    roomName: 'CS-101',
    travelGroup: 'A'
  }
}

function override(o: Partial<MeetingOverride> & Pick<MeetingOverride, 'kind' | 'sectionId' | 'week'>): MeetingOverride {
  return {
    id: o.id ?? 1,
    fromDay: o.fromDay ?? null,
    toDay: o.toDay ?? null,
    start: o.start ?? null,
    end: o.end ?? null,
    roomId: o.roomId ?? null,
    instructorId: o.instructorId ?? null,
    note: '',
    ...o
  }
}

describe('week dates', () => {
  it('computes week start from term start date', () => {
    const w1 = weekStart(term, 1)!
    expect(w1.getFullYear()).toBe(2026)
    expect(w1.getMonth()).toBe(8)
    expect(w1.getDate()).toBe(28)
    const w3 = weekStart(term, 3)!
    expect(w3.getDate()).toBe(12)
    expect(addDays(w3, 1).getDate()).toBe(13)
  })

  it('returns null without a start date', () => {
    expect(weekStart({ ...term, startDate: '' }, 2)).toBeNull()
    expect(weekLabel({ ...term, startDate: '' }, 2, 'tr')).toBe('W02')
  })

  it('formats localized week labels', () => {
    expect(weekLabel(term, 1, 'en')).toContain('Sep')
    expect(weekLabel(term, 10, 'en')).toContain('Nov')
  })

  it('detects break weeks', () => {
    expect(isBreakWeek(term, 8)).toBe(true)
    expect(isBreakWeek(term, 7)).toBe(false)
  })
})

describe('occurrencesForWeek', () => {
  const s1 = section(1, [{ days: [1, 3, 5], start: 540, end: 590 }])

  it('expands the pattern into occurrences', () => {
    const occ = occurrencesForWeek([s1], [], 2)
    expect(occ).toHaveLength(3)
    expect(occ.every((o) => o.source.type === 'pattern' && !o.cancelled)).toBe(true)
    expect(occ.map((o) => o.day)).toEqual([1, 3, 5])
  })

  it('cancels one occurrence for a week', () => {
    const occ = occurrencesForWeek(
      [s1],
      [override({ kind: 'cancel', sectionId: 1, week: 2, fromDay: 3, id: 9 })],
      2
    )
    const cancelled = occ.find((o) => o.day === 3)!
    expect(cancelled.cancelled).toBe(true)
    expect(cancelled.cancelOverrideId).toBe(9)
    expect(occ.filter((o) => !o.cancelled)).toHaveLength(2)
  })

  it('moves one occurrence with room and instructor fallback', () => {
    const occ = occurrencesForWeek(
      [s1],
      [override({ kind: 'move', sectionId: 1, week: 2, fromDay: 1, toDay: 2, start: 600, end: 675, roomId: 5 })],
      2
    )
    const moved = occ.find((o) => o.day === 2)!
    expect(moved.start).toBe(600)
    expect(moved.roomId).toBe(5)
    expect(moved.instructorId).toBe(1)
    expect(moved.source).toEqual({ type: 'override', overrideId: 1 })
    expect(occ.some((o) => o.day === 1 && !o.cancelled)).toBe(false)
  })

  it('adds extra sessions and ignores other weeks', () => {
    const occ = occurrencesForWeek(
      [s1],
      [
        override({ kind: 'extra', sectionId: 1, week: 2, toDay: 4, start: 840, end: 915, id: 7 }),
        override({ kind: 'extra', sectionId: 1, week: 3, toDay: 4, start: 840, end: 915, id: 8 })
      ],
      2
    )
    const extras = occ.filter((o) => o.extra)
    expect(extras).toHaveLength(1)
    expect(extras[0].key).toBe('o:7')
    expect(occurrencesForWeek([s1], [], 2).length).toBe(3)
  })

  it('counts overrides per week', () => {
    const counts = overrideCountByWeek([
      override({ kind: 'cancel', sectionId: 1, week: 2, fromDay: 1 }),
      override({ kind: 'extra', sectionId: 2, week: 2, toDay: 3, start: 1, end: 2 })
    ])
    expect(counts.get(2)).toBe(2)
    expect(counts.get(3)).toBeUndefined()
  })
})

describe('assignmentsToOverrides', () => {
  it('maps same-count reassignments to moves', () => {
    const rows = assignmentsToOverrides([1, 3], { days: [2, 4], start: 600, end: 675, roomId: 3, instructorId: 4 })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ kind: 'move', fromDay: 1, toDay: 2 })
    expect(rows[1]).toMatchObject({ kind: 'move', fromDay: 3, toDay: 4 })
    expect(rows[0].roomId).toBe(3)
  })

  it('emits cancels when the new pattern has fewer days', () => {
    const rows = assignmentsToOverrides([1, 3, 5], { days: [2], start: 600, end: 675, roomId: 3, instructorId: 4 })
    expect(rows).toHaveLength(3)
    expect(rows[0].kind).toBe('move')
    expect(rows[1].kind).toBe('cancel')
    expect(rows[2].kind).toBe('cancel')
  })

  it('emits extras when the new pattern has more days', () => {
    const rows = assignmentsToOverrides([1], { days: [2, 4], start: 600, end: 675, roomId: 3, instructorId: 4 })
    expect(rows).toHaveLength(2)
    expect(rows[0].kind).toBe('move')
    expect(rows[1]).toMatchObject({ kind: 'extra', fromDay: null, toDay: 4 })
  })

  it('maps pattern-less sections to extras only', () => {
    const rows = assignmentsToOverrides([], { days: [2, 4], start: 600, end: 675, roomId: 3, instructorId: 4 })
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.kind === 'extra' && r.fromDay === null)).toBe(true)
    expect(rows[0].toDay).toBe(2)
    expect(rows[1].toDay).toBe(4)
    expect(rows[0].start).toBe(600)
  })
})
