import { describe, expect, it } from 'vitest'
import {
  addDays,
  isBreakWeek,
  occurrencesForWeek,
  overrideCountByWeek,
  weekLabel,
  weekStart
} from '@shared/weeks'
import type { LessonFull, MeetingOverride, Term } from '@shared/types'

const term: Term = { id: 1, name: 'Fall 2026', weeks: 14, startDate: '2026-09-28', breakWeeks: [8] }

function lesson(id: number, meetings: { days: number[]; start: number; end: number }[]): LessonFull {
  return {
    id,
    classId: 1,
    subjectId: 10,
    sessionsPerWeek: meetings.length,
    durationMinutes: 40,
    teacherId: 1,
    locked: false,
    meetings,
    className: '9-A',
    subjectCode: 'MAT',
    subjectTitle: 'Mathematics',
    teacherName: 'Ayşe Yılmaz'
  }
}

function override(o: Partial<MeetingOverride> & Pick<MeetingOverride, 'kind' | 'lessonId' | 'week'>): MeetingOverride {
  return {
    id: o.id ?? 1,
    fromDay: o.fromDay ?? null,
    toDay: o.toDay ?? null,
    start: o.start ?? null,
    end: o.end ?? null,
    teacherId: o.teacherId ?? null,
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
  const l1 = lesson(1, [{ days: [1, 3, 5], start: 510, end: 550 }])

  it('expands the pattern into occurrences', () => {
    const occ = occurrencesForWeek([l1], [], 2)
    expect(occ).toHaveLength(3)
    expect(occ.every((o) => o.source.type === 'pattern' && !o.cancelled)).toBe(true)
    expect(occ.map((o) => o.day)).toEqual([1, 3, 5])
    expect(occ.every((o) => o.teacherId === 1)).toBe(true)
  })

  it('cancels one occurrence for a week', () => {
    const occ = occurrencesForWeek(
      [l1],
      [override({ kind: 'cancel', lessonId: 1, week: 2, fromDay: 3, id: 9 })],
      2
    )
    const cancelled = occ.find((o) => o.day === 3)!
    expect(cancelled.cancelled).toBe(true)
    expect(cancelled.cancelOverrideId).toBe(9)
    expect(occ.filter((o) => !o.cancelled)).toHaveLength(2)
  })

  it('moves one occurrence with teacher fallback', () => {
    const occ = occurrencesForWeek(
      [l1],
      [override({ kind: 'move', lessonId: 1, week: 2, fromDay: 1, toDay: 2, start: 600, end: 640, teacherId: 5 })],
      2
    )
    const moved = occ.find((o) => o.day === 2)!
    expect(moved.start).toBe(600)
    expect(moved.teacherId).toBe(5)
    expect(moved.source).toEqual({ type: 'override', overrideId: 1 })
    expect(occ.some((o) => o.day === 1 && !o.cancelled)).toBe(false)
  })

  it('adds extra sessions and ignores other weeks', () => {
    const occ = occurrencesForWeek(
      [l1],
      [
        override({ kind: 'extra', lessonId: 1, week: 2, toDay: 4, start: 840, end: 880, id: 7 }),
        override({ kind: 'extra', lessonId: 1, week: 3, toDay: 4, start: 840, end: 880, id: 8 })
      ],
      2
    )
    const extras = occ.filter((o) => o.extra)
    expect(extras).toHaveLength(1)
    expect(extras[0].key).toBe('o:7')
    expect(occurrencesForWeek([l1], [], 2).length).toBe(3)
  })

  it('counts overrides per week', () => {
    const counts = overrideCountByWeek([
      override({ kind: 'cancel', lessonId: 1, week: 2, fromDay: 1 }),
      override({ kind: 'extra', lessonId: 2, week: 2, toDay: 3, start: 1, end: 2 })
    ])
    expect(counts.get(2)).toBe(2)
    expect(counts.get(3)).toBeUndefined()
  })
})
