import { describe, expect, it } from 'vitest'
import { computeConflicts, scoreSoft, type CtxEntry, type CtxTeacher } from '@shared/constraints'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'

const teacher = (
  id: number,
  name: string,
  lessonIds: number[],
  unavailable: { days: number[]; start: number; end: number }[] = [],
  maxWeeklyHours = 20
): CtxTeacher => ({ id, name, maxWeeklyHours, unavailable, lessonIds })

function ctx(partial: Partial<CtxEntry> & { id: number }): CtxEntry {
  return {
    departmentIds: [partial.id],
    lessonIds: [partial.id],
    code: `9-A·MAT`,
    meetings: [],
    teacher: null,
    ...partial
  }
}

describe('computeConflicts', () => {
  it('detects two entries of the same department overlapping', () => {
    const conflicts = computeConflicts(
      [
        ctx({ id: 1, departmentIds: [10], meetings: [{ days: [1, 3], start: 540, end: 580 }] }),
        ctx({ id: 2, departmentIds: [10], meetings: [{ days: [1, 3], start: 560, end: 600 }] })
      ],
      DEFAULT_SETTINGS
    )
    expect(conflicts.some((c) => c.type === 'dept-overlap')).toBe(true)
  })

  it('allows the same time in different departments without teachers', () => {
    const conflicts = computeConflicts(
      [
        ctx({ id: 1, departmentIds: [10], meetings: [{ days: [1], start: 540, end: 580 }] }),
        ctx({ id: 2, departmentIds: [20], meetings: [{ days: [1], start: 540, end: 580 }] })
      ],
      DEFAULT_SETTINGS
    )
    expect(conflicts).toHaveLength(0)
  })

  it('detects teacher double-booking across departments', () => {
    const t = teacher(1, 'Ayşe', [1])
    const conflicts = computeConflicts(
      [
        ctx({ id: 1, departmentIds: [10], meetings: [{ days: [2], start: 540, end: 580 }], teacher: t }),
        ctx({ id: 2, departmentIds: [20], meetings: [{ days: [2], start: 540, end: 580 }], teacher: t })
      ],
      DEFAULT_SETTINGS
    )
    expect(conflicts.some((c) => c.type === 'teacher-overlap')).toBe(true)
  })

  it('flags a teacher not related to the entry lesson', () => {
    const t = teacher(1, 'Ayşe', [2])
    const conflicts = computeConflicts(
      [ctx({ id: 1, lessonIds: [1], meetings: [{ days: [1], start: 540, end: 620 }], teacher: t })],
      DEFAULT_SETTINGS
    )
    expect(conflicts.some((c) => c.type === 'teacher-unqualified')).toBe(true)
  })

  it('accepts a teacher related to all lessons of a block entry', () => {
    const t = teacher(1, 'Ayşe', [1, 2])
    const conflicts = computeConflicts(
      [ctx({ id: 1, lessonIds: [1, 2], departmentIds: [10, 20], meetings: [{ days: [1], start: 540, end: 580 }], teacher: t })],
      DEFAULT_SETTINGS
    )
    expect(conflicts).toHaveLength(0)
  })

  it('detects teacher unavailability and overhours', () => {
    const t1 = teacher(1, 'Ayşe', [1], [{ days: [1], start: 480, end: 600 }])
    const conflicts = computeConflicts(
      [ctx({ id: 1, meetings: [{ days: [1], start: 540, end: 620 }], teacher: t1 })],
      DEFAULT_SETTINGS
    )
    expect(conflicts.some((c) => c.type === 'teacher-unavailable')).toBe(true)

    const t2 = teacher(2, 'Ayşe', [1], [], 2)
    const meetings = [
      { days: [1], start: 540, end: 600 },
      { days: [2], start: 540, end: 600 },
      { days: [3], start: 540, end: 600 }
    ]
    const conflicts2 = computeConflicts([ctx({ id: 1, meetings, teacher: t2 })], DEFAULT_SETTINGS)
    expect(conflicts2.some((c) => c.type === 'teacher-overhours')).toBe(true)
  })

  it('flags dangling entries', () => {
    const conflicts = computeConflicts([ctx({ id: 1, dangling: true })], DEFAULT_SETTINGS)
    expect(conflicts.some((c) => c.type === 'entry-dangling')).toBe(true)
  })

  it('accepts a clean schedule', () => {
    const conflicts = computeConflicts(
      [
        ctx({
          id: 1,
          departmentIds: [10],
          lessonIds: [1],
          meetings: [{ days: [1, 3], start: 540, end: 580 }],
          teacher: teacher(1, 'A', [1])
        }),
        ctx({
          id: 2,
          departmentIds: [20],
          lessonIds: [2],
          meetings: [{ days: [2, 4], start: 600, end: 640 }],
          teacher: teacher(2, 'B', [2])
        })
      ],
      DEFAULT_SETTINGS
    )
    expect(conflicts).toHaveLength(0)
  })
})

describe('scoreSoft', () => {
  it('penalizes entries outside the preferred window', () => {
    const score = scoreSoft(
      [ctx({ id: 1, meetings: [{ days: [1], start: 480, end: 510 }] })],
      DEFAULT_SETTINGS
    )
    expect(score.window).toBe(30 * DEFAULT_SETTINGS.weights.window)
  })

  it('penalizes teacher load imbalance', () => {
    const t1 = teacher(1, 'A', [1])
    const t2 = teacher(2, 'B', [2])
    const score = scoreSoft(
      [
        ctx({ id: 1, meetings: [{ days: [1], start: 510, end: 570 }], teacher: t1 }),
        ctx({ id: 2, meetings: [{ days: [1], start: 510, end: 570 }], teacher: t2 }),
        ctx({ id: 3, meetings: [{ days: [2], start: 510, end: 570 }], teacher: t1 }),
        ctx({ id: 4, meetings: [{ days: [2], start: 510, end: 570 }], teacher: t1 })
      ],
      DEFAULT_SETTINGS
    )
    expect(score.load).toBe(1 * DEFAULT_SETTINGS.weights.load)
  })

  it('returns zero for a perfectly balanced clean schedule', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, preferredStart: 510, preferredEnd: 930 }
    const t1 = teacher(1, 'A', [1], [], 20)
    const t2 = teacher(2, 'B', [1], [], 20)
    const score = scoreSoft(
      [
        ctx({ id: 1, meetings: [{ days: [1], start: 510, end: 570 }], teacher: t1 }),
        ctx({ id: 2, meetings: [{ days: [1], start: 510, end: 570 }], teacher: t2 })
      ],
      settings
    )
    expect(score.total).toBe(0)
  })
})
