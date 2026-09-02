import { describe, expect, it } from 'vitest'
import { entryPrecheck, solveEntries } from '@shared/solver/entryEngine'
import { DEFAULT_SETTINGS, type EntrySolveInput, type FlexEntry } from '@shared/types'

const departments = [
  { id: 1, name: '9-A' },
  { id: 2, name: '9-B' }
]

function flex(
  id: number,
  departmentIds: number[],
  sessionsPerWeek: number,
  durationMinutes = 40
): FlexEntry {
  return {
    id,
    lessonIds: [id],
    departmentIds,
    code: `U${id}`,
    sessionsPerWeek,
    durationMinutes
  }
}

function baseInput(overrides: Partial<EntrySolveInput> = {}): EntrySolveInput {
  return {
    settings: { ...DEFAULT_SETTINGS, solver: { topN: 3, timeLimitMs: 2000, maxNodes: 500000 } },
    departments,
    flexible: [
      flex(11, [1], 5),
      flex(12, [1], 4),
      flex(13, [1], 3),
      flex(21, [2], 5),
      flex(22, [2], 4)
    ],
    fixed: [],
    ...overrides
  }
}

describe('entryPrecheck', () => {
  it('rejects more than 6 sessions per week', () => {
    const problems = entryPrecheck(baseInput({ flexible: [flex(1, [1], 7)] }))
    expect(problems.some((p) => p.includes('exceeds'))).toBe(true)
  })

  it('rejects lessons longer than the day span', () => {
    const problems = entryPrecheck(baseInput({ flexible: [flex(1, [1], 2, 2000)] }))
    expect(problems.some((p) => p.includes('exceeds day span'))).toBe(true)
  })
})

describe('solveEntries', () => {
  it('places every unit with hours matched and no department clashes', () => {
    const input = baseInput()
    const result = solveEntries(input)
    expect(result.problems).toHaveLength(0)
    expect(result.solutions.length).toBeGreaterThan(0)
    const sol = result.solutions[0]
    for (const f of input.flexible) {
      const a = sol.assignments[String(f.id)]
      expect(a).toBeDefined()
      expect(a.days).toHaveLength(f.sessionsPerWeek)
      expect(a.end - a.start).toBe(f.durationMinutes)
    }
    for (const deptId of [1, 2]) {
      const placed = input.flexible
        .filter((f) => f.departmentIds.includes(deptId))
        .map((f) => sol.assignments[String(f.id)])
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

  it('treats a block unit (two departments) as one placement', () => {
    const input = baseInput({
      flexible: [flex(11, [1, 2], 5), flex(12, [1], 4), flex(22, [2], 4)]
    })
    input.flexible[0].lessonIds = [101, 201]
    const result = solveEntries(input)
    expect(result.problems).toHaveLength(0)
    expect(result.solutions.length).toBeGreaterThan(0)
    const sol = result.solutions[0]
    const block = sol.assignments['11']
    const a = sol.assignments['12']
    const b = sol.assignments['22']
    expect(block).toBeDefined()
    // dept 1 lessons (block + unit 12) must not clash; same for dept 2
    for (const other of [a, b]) {
      const sharedDay = block.days.some((d) => other.days.includes(d))
      if (sharedDay) {
        expect(block.start >= other.end || other.start >= block.end).toBe(true)
      }
    }
  })

  it('respects fixed locked entries of the same department', () => {
    const input = baseInput({
      fixed: [
        {
          id: 99,
          departmentIds: [1],
          code: '9-A·FIXED',
          meetings: [{ days: [1, 2, 3, 4, 5], start: 510, end: 550 }]
        }
      ]
    })
    const result = solveEntries(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    const sol = result.solutions[0]
    for (const f of input.flexible.filter((x) => x.departmentIds.includes(1))) {
      const a = sol.assignments[String(f.id)]
      for (const _d of a.days) {
        expect(a.start >= 550 || a.end <= 510).toBe(true)
      }
    }
  })

  it('reports infeasibility instead of returning solutions', () => {
    const input = baseInput({ flexible: [flex(11, [1], 6, 400), flex(12, [1], 6, 400)] })
    const result = solveEntries(input)
    expect(result.solutions).toHaveLength(0)
    expect(result.problems.length).toBeGreaterThan(0)
  })

  it('keeps solutions sorted by window score', () => {
    const result = solveEntries(baseInput())
    expect(result.solutions.length).toBeGreaterThan(0)
    for (let i = 1; i < result.solutions.length; i++) {
      expect(result.solutions[i - 1].score).toBeLessThanOrEqual(result.solutions[i].score)
    }
  })
})
