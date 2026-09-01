import { describe, expect, it } from 'vitest'
import { classPrecheck, solveClasses } from '@shared/solver/classEngine'
import { DEFAULT_SETTINGS, type ClassSolveInput, type FlexLesson } from '@shared/types'

const classes = [
  { id: 1, name: '9-A' },
  { id: 2, name: '9-B' }
]

function flex(id: number, classId: number, sessionsPerWeek: number, durationMinutes = 40): FlexLesson {
  return { id, classId, subjectId: 100 + id, code: `${classId === 1 ? '9-A' : '9-B'}·S${id}`, sessionsPerWeek, durationMinutes }
}

function baseInput(overrides: Partial<ClassSolveInput> = {}): ClassSolveInput {
  return {
    settings: { ...DEFAULT_SETTINGS, solver: { topN: 3, timeLimitMs: 2000, maxNodes: 500000 } },
    classes,
    flexible: [
      flex(11, 1, 5),
      flex(12, 1, 4),
      flex(13, 1, 3),
      flex(21, 2, 5),
      flex(22, 2, 4)
    ],
    fixed: [],
    ...overrides
  }
}

describe('classPrecheck', () => {
  it('rejects more than 6 sessions per week', () => {
    const problems = classPrecheck(baseInput({ flexible: [flex(1, 1, 7)] }))
    expect(problems.some((p) => p.includes('exceeds'))).toBe(true)
  })

  it('rejects lessons longer than the day span', () => {
    const problems = classPrecheck(baseInput({ flexible: [flex(1, 1, 2, 2000)] }))
    expect(problems.some((p) => p.includes('exceeds day span'))).toBe(true)
  })
})

describe('solveClasses', () => {
  it('places every lesson with curriculum hours matched and no class clashes', () => {
    const input = baseInput()
    const result = solveClasses(input)
    expect(result.problems).toHaveLength(0)
    expect(result.solutions.length).toBeGreaterThan(0)
    const sol = result.solutions[0]
    for (const f of input.flexible) {
      const a = sol.assignments[String(f.id)]
      expect(a).toBeDefined()
      expect(a.days).toHaveLength(f.sessionsPerWeek)
      expect(a.end - a.start).toBe(f.durationMinutes)
    }
    for (const classId of [1, 2]) {
      const placed = input.flexible
        .filter((f) => f.classId === classId)
        .map((f) => ({ days: sol.assignments[String(f.id)].days, start: sol.assignments[String(f.id)].start, end: sol.assignments[String(f.id)].end }))
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i]
          const b = placed[j]
          const sharedDay = a.days.some((d) => b.days.includes(d))
          if (sharedDay) {
            expect(a.start >= b.end || b.start >= a.end).toBe(true)
          }
        }
      }
    }
  })

  it('respects fixed locked lessons of the same class', () => {
    const input = baseInput({
      fixed: [
        { id: 99, classId: 1, subjectId: 999, code: '9-A·FIXED', meetings: [{ days: [1, 2, 3, 4, 5], start: 510, end: 550 }] }
      ]
    })
    const result = solveClasses(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    const sol = result.solutions[0]
    for (const f of input.flexible.filter((x) => x.classId === 1)) {
      const a = sol.assignments[String(f.id)]
      for (const d of a.days) {
        expect(a.start >= 550 || a.end <= 510).toBe(true)
      }
    }
  })

  it('allows identical placements across different classes', () => {
    const input = baseInput({ flexible: [flex(11, 1, 1), flex(21, 2, 1)] })
    const result = solveClasses(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    const sol = result.solutions[0]
    expect(sol.assignments['11']).toEqual(sol.assignments['21'])
  })

  it('reports infeasible classes instead of returning solutions', () => {
    const input = baseInput({ flexible: [flex(11, 1, 6, 400), flex(12, 1, 6, 400)] })
    const result = solveClasses(input)
    expect(result.solutions).toHaveLength(0)
    expect(result.problems.some((p) => p.includes('9-A'))).toBe(true)
  })

  it('keeps solutions sorted by window score', () => {
    const result = solveClasses(baseInput())
    expect(result.solutions.length).toBeGreaterThan(0)
    for (let i = 1; i < result.solutions.length; i++) {
      expect(result.solutions[i - 1].score).toBeLessThanOrEqual(result.solutions[i].score)
    }
  })
})
