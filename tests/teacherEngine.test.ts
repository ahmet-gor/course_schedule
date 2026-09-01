import { describe, expect, it } from 'vitest'
import { solveTeachers, teacherPrecheck } from '@shared/solver/teacherEngine'
import { computeConflicts, type CtxLesson } from '@shared/constraints'
import { DEFAULT_SETTINGS, type PlacedLesson, type Teacher, type TeacherSolveInput } from '@shared/types'

function teacher(id: number, name: string, subjectIds: number[], overrides: Partial<Teacher> = {}): Teacher {
  return { id, name, email: `${name.toLowerCase()}@okul.edu.tr`, maxWeeklyHours: 20, unavailable: [], subjectIds, ...overrides }
}

function lesson(id: number, classId: number, subjectId: number, days: number[], start: number, end: number, extra: Partial<PlacedLesson> = {}): PlacedLesson {
  return {
    id,
    classId,
    subjectId,
    code: `C${classId}·S${subjectId}`,
    sessionsPerWeek: days.length,
    durationMinutes: end - start,
    meetings: [{ days, start, end }],
    teacherId: null,
    fixed: false,
    ...extra
  }
}

function baseInput(overrides: Partial<TeacherSolveInput> = {}): TeacherSolveInput {
  return {
    settings: { ...DEFAULT_SETTINGS, solver: { topN: 3, timeLimitMs: 2000, maxNodes: 500000 } },
    teachers: [teacher(1, 'Ayşe', [1]), teacher(2, 'Mehmet', [1])],
    lessons: [
      lesson(11, 10, 1, [1, 2], 510, 550),
      lesson(12, 20, 1, [1, 2], 510, 550),
      lesson(13, 30, 1, [3, 4], 510, 550)
    ],
    ...overrides
  }
}

function assembled(input: TeacherSolveInput, assignments: Record<string, number>): CtxLesson[] {
  const teacherById = new Map(input.teachers.map((t) => [t.id, t]))
  return input.lessons.map((l) => {
    const tid = assignments[String(l.id)]
    const t = tid !== undefined ? teacherById.get(tid) : undefined
    return {
      id: l.id,
      classId: l.classId,
      subjectId: l.subjectId,
      code: l.code,
      meetings: l.meetings,
      teacher: t
        ? { id: t.id, name: t.name, maxWeeklyHours: t.maxWeeklyHours, unavailable: t.unavailable, subjectIds: t.subjectIds }
        : null
    }
  })
}

describe('teacherPrecheck', () => {
  it('reports lessons whose subject nobody can teach', () => {
    const problems = teacherPrecheck(baseInput({ teachers: [teacher(1, 'Ayşe', [2])] }))
    expect(problems.some((p) => p.includes('no teacher is qualified'))).toBe(true)
  })
})

describe('solveTeachers', () => {
  it('assigns qualified teachers without double-booking', () => {
    const input = baseInput()
    const result = solveTeachers(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    const sol = result.solutions[0]
    for (const l of input.lessons) {
      expect(sol.assignments[String(l.id)]).toBeDefined()
    }
    const conflicts = computeConflicts(assembled(input, sol.assignments), input.settings)
    expect(conflicts).toHaveLength(0)
  })

  it('returns a best-effort partial assignment when full assignment is impossible', () => {
    const input = baseInput({ teachers: [teacher(1, 'Ayşe', [1])] })
    const result = solveTeachers(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    const sol = result.solutions[0]
    expect(sol.assignments['11']).toBe(1)
    expect(sol.assignments['12']).toBeUndefined()
    expect(sol.assignments['13']).toBe(1)
    expect(result.problems.some((p) => p.includes('C20·S1') && p.includes('left unassigned'))).toBe(true)
  })

  it('respects teacher unavailability', () => {
    const input = baseInput({
      teachers: [
        teacher(1, 'Ayşe', [1], { unavailable: [{ days: [1, 2, 3, 4, 5], start: 480, end: 960 }] }),
        teacher(2, 'Mehmet', [1])
      ],
      lessons: [
        lesson(11, 10, 1, [1, 2], 510, 550),
        lesson(12, 20, 1, [3, 4], 510, 550),
        lesson(13, 30, 1, [1, 2], 600, 640)
      ]
    })
    const result = solveTeachers(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    for (const sol of result.solutions) {
      for (const l of input.lessons) {
        expect(sol.assignments[String(l.id)]).toBe(2)
      }
    }
  })

  it('enforces max weekly hours as a hard limit', () => {
    const input = baseInput({
      teachers: [
        teacher(1, 'Ayşe', [1], { maxWeeklyHours: 1 }),
        teacher(2, 'Mehmet', [1], { maxWeeklyHours: 20 })
      ],
      lessons: [
        lesson(11, 10, 1, [1, 2, 3], 510, 550),
        lesson(12, 10, 1, [4, 5], 510, 550),
        lesson(13, 20, 1, [1, 2, 3], 600, 640)
      ]
    })
    const result = solveTeachers(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    for (const sol of result.solutions) {
      const conflicts = computeConflicts(assembled(input, sol.assignments), input.settings)
      expect(conflicts.filter((c) => c.type === 'teacher-overhours')).toHaveLength(0)
    }
  })

  it('keeps locked teacher assignments fixed', () => {
    const input = baseInput({
      lessons: [
        lesson(11, 10, 1, [1, 2], 510, 550, { teacherId: 1, fixed: true }),
        lesson(12, 20, 1, [1, 2], 510, 550),
        lesson(13, 30, 1, [3, 4], 510, 550)
      ]
    })
    const result = solveTeachers(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    const sol = result.solutions[0]
    expect(sol.assignments['11']).toBe(1)
    expect(sol.assignments['12']).toBe(2)
  })

  it('prefers keeping the current teacher', () => {
    const input = baseInput({
      lessons: [
        lesson(11, 10, 1, [1, 2], 510, 550, { teacherId: 1 }),
        lesson(12, 20, 1, [1, 2], 510, 550),
        lesson(13, 30, 1, [3, 4], 510, 550)
      ]
    })
    const result = solveTeachers(input)
    const sol = result.solutions[0]
    expect(sol.assignments['11']).toBe(1)
    expect(sol.parts.changes).toBeLessThanOrEqual(2)
  })

  it('keeps solutions sorted by score', () => {
    const result = solveTeachers(baseInput())
    for (let i = 1; i < result.solutions.length; i++) {
      expect(result.solutions[i - 1].score).toBeLessThanOrEqual(result.solutions[i].score)
    }
  })
})
