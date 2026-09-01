import { describe, expect, it } from 'vitest'
import { computeConflicts, scoreSoft, type CtxSection } from '@shared/constraints'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'

const room = (id: number, name: string, capacity: number, travelGroup: string) => ({
  id,
  name,
  capacity,
  travelGroup
})
const ins = (id: number, name: string, unavailable: { days: number[]; start: number; end: number }[] = [], maxWeeklyHours = 12) => ({
  id,
  name,
  maxWeeklyHours,
  unavailable
})

function ctx(partial: Partial<CtxSection> & { id: number }): CtxSection {
  return {
    courseId: partial.id,
    code: `C${partial.id}`,
    capacity: 30,
    meetings: [],
    room: null,
    instructor: null,
    ...partial
  }
}

describe('computeConflicts', () => {
  it('detects room double-booking', () => {
    const r = room(1, 'CS-101', 40, 'A')
    const conflicts = computeConflicts(
      [
        ctx({ id: 1, meetings: [{ days: [1, 3], start: 540, end: 615 }], room: r }),
        ctx({ id: 2, meetings: [{ days: [1, 3], start: 600, end: 675 }], room: r })
      ],
      DEFAULT_SETTINGS
    )
    expect(conflicts.some((c) => c.type === 'room-overlap')).toBe(true)
  })

  it('detects instructor overlap even in different rooms', () => {
    const i = ins(1, 'Ada')
    const conflicts = computeConflicts(
      [
        ctx({ id: 1, meetings: [{ days: [2], start: 540, end: 615 }], room: room(1, 'R1', 40, 'A'), instructor: i }),
        ctx({ id: 2, meetings: [{ days: [2], start: 540, end: 615 }], room: room(2, 'R2', 40, 'A'), instructor: i })
      ],
      DEFAULT_SETTINGS
    )
    expect(conflicts.some((c) => c.type === 'instructor-overlap')).toBe(true)
  })

  it('detects overlapping sections of the same course', () => {
    const conflicts = computeConflicts(
      [
        ctx({ id: 1, courseId: 9, meetings: [{ days: [1], start: 540, end: 615 }] }),
        ctx({ id: 2, courseId: 9, meetings: [{ days: [1], start: 600, end: 675 }] })
      ],
      DEFAULT_SETTINGS
    )
    expect(conflicts.some((c) => c.type === 'course-overlap')).toBe(true)
  })

  it('detects capacity violations and instructor unavailability', () => {
    const i = ins(1, 'Ada', [{ days: [1], start: 480, end: 600 }])
    const conflicts = computeConflicts(
      [ctx({ id: 1, capacity: 100, meetings: [{ days: [1], start: 540, end: 630 }], room: room(1, 'R1', 40, 'A'), instructor: i })],
      DEFAULT_SETTINGS
    )
    expect(conflicts.some((c) => c.type === 'capacity')).toBe(true)
    expect(conflicts.some((c) => c.type === 'instructor-unavailable')).toBe(true)
  })

  it('flags insufficient travel time between groups', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, travelMinutes: { 'A|B': 20 } }
    const i = ins(1, 'Ada')
    const conflicts = computeConflicts(
      [
        ctx({ id: 1, meetings: [{ days: [1], start: 540, end: 615 }], room: room(1, 'R1', 40, 'A'), instructor: i }),
        ctx({ id: 2, meetings: [{ days: [1], start: 625, end: 700 }], room: room(2, 'R2', 40, 'B'), instructor: i })
      ],
      settings
    )
    expect(conflicts.some((c) => c.type === 'travel')).toBe(true)
  })

  it('accepts a clean schedule', () => {
    const conflicts = computeConflicts(
      [
        ctx({ id: 1, meetings: [{ days: [1, 3], start: 540, end: 615 }], room: room(1, 'R1', 40, 'A'), instructor: ins(1, 'A') }),
        ctx({ id: 2, meetings: [{ days: [2, 4], start: 600, end: 675 }], room: room(1, 'R1', 40, 'A'), instructor: ins(2, 'B') })
      ],
      DEFAULT_SETTINGS
    )
    expect(conflicts).toHaveLength(0)
  })
})

describe('scoreSoft', () => {
  it('penalizes meetings outside the preferred window', () => {
    const score = scoreSoft(
      [ctx({ id: 1, meetings: [{ days: [1], start: 480, end: 540 }] })],
      DEFAULT_SETTINGS
    )
    expect(score.window).toBe(60 * DEFAULT_SETTINGS.weights.window)
  })

  it('penalizes back-to-back meetings of the same instructor', () => {
    const i = ins(1, 'Ada')
    const score = scoreSoft(
      [
        ctx({ id: 1, meetings: [{ days: [1], start: 540, end: 615 }], instructor: i }),
        ctx({ id: 2, meetings: [{ days: [1], start: 625, end: 700 }], instructor: i })
      ],
      DEFAULT_SETTINGS
    )
    expect(score.backToBack).toBe(DEFAULT_SETTINGS.weights.backToBack)
  })

  it('penalizes exceeding weekly hour limits', () => {
    const i = ins(1, 'Ada', [], 3)
    const meetings = [
      { days: [1], start: 540, end: 660 },
      { days: [2], start: 540, end: 660 },
      { days: [3], start: 540, end: 660 }
    ]
    const score = scoreSoft([ctx({ id: 1, meetings, instructor: i })], DEFAULT_SETTINGS)
    expect(score.maxHours).toBe(3 * DEFAULT_SETTINGS.weights.maxHours)
  })
})
