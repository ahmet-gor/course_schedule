import { describe, expect, it } from 'vitest'
import { solveTeachers, teacherPrecheck } from '@shared/solver/teacherEngine'
import { computeConflicts, type CtxEntry } from '@shared/constraints'
import { DEFAULT_SETTINGS, type PlacedEntry, type Teacher, type TeacherSolveInput } from '@shared/types'

function teacher(id: number, name: string, lessonIds: number[], overrides: Partial<Teacher> = {}): Teacher {
  return { id, name, email: `${name.toLowerCase()}@okul.edu.tr`, maxWeeklyHours: 20, unavailable: [], lessonIds, ...overrides }
}

function entry(
  id: number,
  lessonIds: number[],
  days: number[],
  start: number,
  end: number,
  extra: Partial<PlacedEntry> = {}
): PlacedEntry {
  return {
    id,
    lessonIds,
    code: `E${id}`,
    meetings: [{ days, start, end }],
    teacherId: null,
    fixed: false,
    ...extra
  }
}

function baseInput(overrides: Partial<TeacherSolveInput> = {}): TeacherSolveInput {
  return {
    settings: { ...DEFAULT_SETTINGS, solver: { topN: 3, timeLimitMs: 2000, maxNodes: 500000 } },
    teachers: [teacher(1, 'Ayşe', [11, 12, 13]), teacher(2, 'Mehmet', [11, 12, 13])],
    entries: [
      entry(11, [11], [1, 2], 510, 550),
      entry(12, [12], [1, 2], 510, 550),
      entry(13, [13], [3, 4], 510, 550)
    ],
    ...overrides
  }
}

function assembled(input: TeacherSolveInput, assignments: Record<string, number>): CtxEntry[] {
  const teacherById = new Map(input.teachers.map((t) => [t.id, t]))
  return input.entries.map((e) => {
    const tid = assignments[String(e.id)]
    const t = tid !== undefined ? teacherById.get(tid) : undefined
    return {
      id: e.id,
      departmentIds: [],
      lessonIds: e.lessonIds,
      code: e.code,
      meetings: e.meetings,
      teacher: t
        ? { id: t.id, name: t.name, maxWeeklyHours: t.maxWeeklyHours, unavailable: t.unavailable, lessonIds: t.lessonIds }
        : null
    }
  })
}

describe('teacherPrecheck', () => {
  it('reports entries whose lesson nobody is related to', () => {
    const problems = teacherPrecheck(baseInput({ teachers: [teacher(1, 'Ayşe', [99])] }))
    expect(problems.some((p) => p.includes('no teacher is related'))).toBe(true)
  })
})

describe('solveTeachers', () => {
  it('assigns related teachers without double-booking', () => {
    const input = baseInput()
    const result = solveTeachers(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    const sol = result.solutions[0]
    for (const e of input.entries) {
      expect(sol.assignments[String(e.id)]).toBeDefined()
    }
    const conflicts = computeConflicts(assembled(input, sol.assignments), input.settings)
    expect(conflicts).toHaveLength(0)
  })

  it('requires the teacher to be related to ALL lessons of a block entry', () => {
    const input = baseInput({
      teachers: [teacher(1, 'Ayşe', [11]), teacher(2, 'Mehmet', [12])],
      entries: [entry(50, [11, 12], [1, 2], 510, 550)]
    })
    const result = solveTeachers(input)
    const sol = result.solutions[0]
    expect(sol?.assignments['50']).toBeUndefined()
    expect(result.problems.some((p) => p.includes('no teacher is related'))).toBe(true)
  })

  it('respects teacher unavailability', () => {
    const input = baseInput({
      teachers: [
        teacher(1, 'Ayşe', [11], { unavailable: [{ days: [1, 2, 3, 4, 5], start: 480, end: 960 }] })
      ],
      entries: [entry(11, [11], [1, 2], 510, 550)]
    })
    const result = solveTeachers(input)
    const sol = result.solutions[0]
    expect(sol?.assignments['11']).toBeUndefined()
    expect(result.problems.some((p) => p.includes('unavailable'))).toBe(true)
  })

  it('enforces max weekly hours as a hard limit', () => {
    const input = baseInput({ teachers: [teacher(1, 'Ayşe', [11, 12, 13], { maxWeeklyHours: 1 })] })
    const result = solveTeachers(input)
    const sol = result.solutions[0]
    expect(Object.keys(sol?.assignments ?? {}).length).toBe(0)
    expect(
      result.problems.some((p) => p.includes('No feasible teacher assignment') || p.includes('unavailable'))
    ).toBe(true)
  })

  it('keeps locked teacher assignments fixed', () => {
    const input = baseInput({
      teachers: [teacher(1, 'Ayşe', [11, 12, 13]), teacher(2, 'Mehmet', [11, 12, 13])],
      entries: [
        entry(11, [11], [1, 2], 510, 550, { teacherId: 2, fixed: true }),
        entry(12, [12], [1, 2], 570, 610),
        entry(13, [13], [3, 4], 510, 550)
      ]
    })
    const result = solveTeachers(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    expect(result.solutions[0].assignments['11']).toBe(2)
  })

  it('keeps solutions sorted by score', () => {
    const result = solveTeachers(baseInput())
    expect(result.solutions.length).toBeGreaterThan(0)
    for (let i = 1; i < result.solutions.length; i++) {
      expect(result.solutions[i - 1].score).toBeLessThanOrEqual(result.solutions[i].score)
    }
  })
})
