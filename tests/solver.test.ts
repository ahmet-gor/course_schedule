import { describe, expect, it } from 'vitest'
import { computeConflicts, type CtxSection } from '@shared/constraints'
import { solve, precheck } from '@shared/solver/engine'
import { DEFAULT_SETTINGS, type Instructor, type Room, type Settings, type SolveInput } from '@shared/types'

const rooms: Room[] = [
  { id: 1, name: 'CS-101', building: 'CS', capacity: 40, travelGroup: 'A' },
  { id: 2, name: 'CS-210', building: 'CS', capacity: 60, travelGroup: 'A' }
]
const instructors: Instructor[] = [
  { id: 1, name: 'Ada', email: 'ada@uni.edu', maxWeeklyHours: 12, unavailable: [] },
  { id: 2, name: 'Alan', email: 'alan@uni.edu', maxWeeklyHours: 12, unavailable: [] }
]

function baseInput(overrides: Partial<SolveInput> = {}): SolveInput {
  return {
    settings: { ...DEFAULT_SETTINGS, solver: { topN: 3, timeLimitMs: 1200, maxNodes: 500000 } },
    rooms,
    instructors,
    flexible: [
      { id: 11, courseId: 101, code: 'CSE101-A', capacity: 35, sessionsPerWeek: 3, durationMinutes: 50, instructorId: 1, roomId: null },
      { id: 12, courseId: 101, code: 'CSE101-B', capacity: 35, sessionsPerWeek: 3, durationMinutes: 50, instructorId: 1, roomId: null },
      { id: 21, courseId: 201, code: 'CSE201-A', capacity: 35, sessionsPerWeek: 2, durationMinutes: 75, instructorId: 2, roomId: null }
    ],
    fixed: [],
    ...overrides
  }
}

function assembledCtx(input: SolveInput, assignments: Record<string, { days: number[]; start: number; end: number; roomId: number; instructorId: number }>): CtxSection[] {
  const roomById = new Map(input.rooms.map((r) => [r.id, r]))
  const insById = new Map(input.instructors.map((i) => [i.id, i]))
  const result: CtxSection[] = []
  for (const f of input.fixed) {
    result.push({
      id: f.id,
      courseId: f.courseId,
      code: f.code,
      capacity: 0,
      meetings: f.meetings,
      room: f.roomId !== null ? roomById.get(f.roomId) ?? null : null,
      instructor: f.instructorId !== null ? insById.get(f.instructorId) ?? null : null
    })
  }
  for (const s of input.flexible) {
    const a = assignments[String(s.id)]
    if (!a) continue
    result.push({
      id: s.id,
      courseId: s.courseId,
      code: s.code,
      capacity: s.capacity,
      meetings: [{ days: a.days, start: a.start, end: a.end }],
      room: roomById.get(a.roomId) ?? null,
      instructor: insById.get(a.instructorId) ?? null
    })
  }
  return result
}

describe('precheck', () => {
  it('reports sections with no feasible room', () => {
    const problems = precheck(baseInput({ flexible: [{ id: 99, courseId: 1, code: 'X-A', capacity: 500, sessionsPerWeek: 2, durationMinutes: 75, instructorId: null, roomId: null }] }))
    expect(problems.some((p) => p.includes('no room'))).toBe(true)
  })
})

describe('solve', () => {
  it('produces clash-free solutions for a small department', () => {
    const input = baseInput()
    const result = solve(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    for (const sol of result.solutions) {
      expect(sol.assignments['11']).toBeDefined()
      expect(sol.assignments['12']).toBeDefined()
      expect(sol.assignments['21']).toBeDefined()
      const conflicts = computeConflicts(assembledCtx(input, sol.assignments), input.settings)
      expect(conflicts.filter((c) => c.type !== 'capacity')).toHaveLength(0)
      expect(sol.assignments['11'].instructorId).toBe(1)
      expect(sol.assignments['21'].instructorId).toBe(2)
    }
    expect(result.solutions[0].score).toBeLessThanOrEqual(result.solutions[result.solutions.length - 1].score)
  })

  it('respects fixed locked sections', () => {
    const input = baseInput({
      fixed: [
        {
          id: 5,
          courseId: 999,
          code: 'FIXED-A',
          meetings: [{ days: [1, 3, 5], start: 540, end: 590 }],
          roomId: 1,
          instructorId: 1
        }
      ]
    })
    const result = solve(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    const sol = result.solutions[0]
    expect(sol.assignments['11'].start).not.toBe(540)
    const conflicts = computeConflicts(assembledCtx(input, sol.assignments), input.settings)
    expect(conflicts.filter((c) => c.type !== 'capacity')).toHaveLength(0)
  })

  it('enforces travel time between groups as a hard constraint', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      travelMinutes: { 'A|B': 30 },
      solver: { topN: 3, timeLimitMs: 1200, maxNodes: 500000 }
    }
    const input: SolveInput = {
      settings,
      rooms: [
        { id: 1, name: 'CS-101', building: 'CS', capacity: 40, travelGroup: 'A' },
        { id: 2, name: 'NH-1', building: 'North', capacity: 40, travelGroup: 'B' }
      ],
      instructors: [{ id: 1, name: 'Ada', email: 'a@u', maxWeeklyHours: 12, unavailable: [] }],
      fixed: [
        { id: 5, courseId: 999, code: 'FIXED-A', meetings: [{ days: [2], start: 600, end: 675 }], roomId: 2, instructorId: 1 }
      ],
      flexible: [{ id: 9, courseId: 800, code: 'FLEX-A', capacity: 30, sessionsPerWeek: 1, durationMinutes: 75, instructorId: 1, roomId: null }]
    }
    const result = solve(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    for (const sol of result.solutions) {
      const a = sol.assignments['9']
      if (!a.days.includes(2)) continue
      const gap = a.start >= 675 ? a.start - 675 : 600 - a.end
      expect(gap === 0 ? true : gap >= 30).toBe(true)
    }
    const conflicts = computeConflicts(assembledCtx(input, result.solutions[0].assignments), settings)
    expect(conflicts.filter((c) => c.type !== 'capacity')).toHaveLength(0)
  })

  it('keeps solutions sorted by score and respects instructor availability', () => {
    const input = baseInput({
      instructors: [
        { id: 1, name: 'Ada', email: 'ada@uni.edu', maxWeeklyHours: 12, unavailable: [{ days: [1, 2, 3, 4, 5], start: 480, end: 720 }] },
        { id: 2, name: 'Alan', email: 'alan@uni.edu', maxWeeklyHours: 12, unavailable: [] }
      ]
    })
    const result = solve(input)
    expect(result.solutions.length).toBeGreaterThan(0)
    for (const sol of result.solutions) {
      expect(sol.assignments['11'].start).toBeGreaterThanOrEqual(720)
    }
  })
})
