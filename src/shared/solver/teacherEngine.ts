import type {
  PlacedEntry,
  Teacher,
  TeacherSolveInput,
  TeacherSolveResult,
  TeacherSolution
} from '../types'
import { overlap } from '../time'
import type { SolveProgress } from './entryEngine'

export function teacherPrecheck(input: TeacherSolveInput): string[] {
  const problems: string[] = []
  for (const l of input.entries) {
    if (l.meetings.length === 0) {
      problems.push(`${l.code}: not scheduled yet — run schedule generation first`)
      continue
    }
    const qualified = input.teachers.filter((t) => l.lessonIds.every((lid) => t.lessonIds.includes(lid)))
    if (qualified.length === 0) {
      problems.push(`${l.code}: no teacher is related to this lesson`)
    }
  }
  return problems
}

function teacherAvailableFor(t: Teacher, l: PlacedEntry): boolean {
  for (const m of l.meetings) {
    for (const d of m.days) {
      for (const u of t.unavailable) {
        if (u.days.includes(d) && overlap(m, u)) return false
      }
    }
  }
  return true
}

function lessonMinutes(l: PlacedEntry): number {
  let minutes = 0
  for (const m of l.meetings) {
    for (const _d of m.days) minutes += m.end - m.start
  }
  return minutes
}

export function solveTeachers(input: TeacherSolveInput, onProgress?: (p: SolveProgress) => void): TeacherSolveResult {
  const { settings, teachers } = input
  const problems = teacherPrecheck(input)
  const problemIds = new Set(input.entries.filter((l) => l.meetings.length === 0).map((l) => l.id))

  const teacherById = new Map(teachers.map((t) => [t.id, t]))

  const bookings = new Map<number, { day: number; s: number; e: number }[]>()
  const load = new Map<number, number>()
  const book = (teacherId: number, l: PlacedEntry) => {
    for (const m of l.meetings) {
      for (const d of m.days) {
        const arr = bookings.get(teacherId) ?? []
        arr.push({ day: d, s: m.start, e: m.end })
        bookings.set(teacherId, arr)
      }
    }
    load.set(teacherId, (load.get(teacherId) ?? 0) + lessonMinutes(l))
  }
  const unbookLesson = (teacherId: number, l: PlacedEntry) => {
    const arr = bookings.get(teacherId)
    if (arr) {
      for (let i = arr.length - 1; i >= 0; i--) {
        for (const m of l.meetings) {
          for (const d of m.days) {
            if (arr[i].day === d && arr[i].s === m.start && arr[i].e === m.end) {
              arr.splice(i, 1)
              break
            }
          }
        }
      }
    }
    load.set(teacherId, Math.max(0, (load.get(teacherId) ?? 0) - lessonMinutes(l)))
  }

  const fixedAssignments = new Map<number, number>()
  const assignable: PlacedEntry[] = []
  for (const l of input.entries) {
    if (problemIds.has(l.id)) continue
    if (l.fixed && l.teacherId !== null && teacherById.has(l.teacherId)) {
      fixedAssignments.set(l.id, l.teacherId)
      book(l.teacherId, l)
    } else {
      assignable.push(l)
    }
  }

  const withCandidates = assignable
    .map((l) => {
      const candidates = teachers.filter((t) => l.lessonIds.every((lid) => t.lessonIds.includes(lid)) && teacherAvailableFor(t, l))
      return { lesson: l, candidates }
    })
    .filter((e) => e.candidates.length > 0)
    .sort((a, b) => a.candidates.length - b.candidates.length)

  const skipped = assignable.filter((l) => !withCandidates.some((w) => w.lesson.id === l.id))
  for (const l of skipped) {
    const qualified = teachers.filter((t) => l.lessonIds.every((lid) => t.lessonIds.includes(lid)))
    if (qualified.length === 0) continue
    const hasTime = qualified.some((t) => teacherAvailableFor(t, l))
    problems.push(
      hasTime
        ? `${l.code}: related teachers are fully booked or over their weekly limit`
        : `${l.code}: all related teachers are unavailable at the scheduled times`
    )
  }

  const topN = Math.max(1, settings.solver.topN)
  const deadline = Date.now() + settings.solver.timeLimitMs
  const maxNodes = Math.max(10000, settings.solver.maxNodes)
  let nodes = 0
  let timedOut = false
  let capped = false

  const solutions: TeacherSolution[] = []
  const seen = new Set<string>()
  const chosen = new Map<number, number>()

  const feasible = (teacherId: number, l: PlacedEntry): boolean => {
    const t = teacherById.get(teacherId)
    if (!t) return false
    const minutes = lessonMinutes(l)
    if ((load.get(teacherId) ?? 0) + minutes > t.maxWeeklyHours * 60 + 0.001) return false
    const arr = bookings.get(teacherId) ?? []
    for (const m of l.meetings) {
      for (const d of m.days) {
        for (const b of arr) {
          if (b.day === d && m.start < b.e && b.s < m.end) return false
        }
      }
    }
    return true
  }

  const evaluate = () => {
    const minutes = new Map<number, number>()
    for (const [tid, m] of load) minutes.set(tid, m)
    const loaded = [...minutes.entries()].filter(([, m]) => m > 0)
    let loadHours = 0
    if (loaded.length > 0) {
      const loads = loaded.map(([, m]) => m / 60)
      const avg = loads.reduce((a, b) => a + b, 0) / loads.length
      for (const h of loads) loadHours += Math.max(0, h - avg)
    }
    let changes = 0
    const assignments: Record<string, number> = {}
    for (const [lid, tid] of fixedAssignments) assignments[String(lid)] = tid
    for (const { lesson } of withCandidates) {
      const tid = chosen.get(lesson.id)
      if (tid === undefined) continue
      assignments[String(lesson.id)] = tid
      if (lesson.teacherId !== null && lesson.teacherId !== tid) changes++
    }
    const score = loadHours * settings.weights.load + changes * settings.weights.stability
    const hash = JSON.stringify(assignments)
    if (seen.has(hash)) return
    seen.add(hash)
    const summary: TeacherSolution['summary'] = []
    if (loadHours > 0.01) summary.push({ kind: 'load', hours: loadHours })
    if (changes > 0) summary.push({ kind: 'changes', count: changes })
    if (summary.length === 0) summary.push({ kind: 'clean' })
    solutions.push({ score, parts: { load: loadHours, changes }, assignments, summary })
    solutions.sort((a, b) => a.score - b.score)
    if (solutions.length > topN) solutions.length = topN
  }

  const dfs = (idx: number): 'complete' | 'capped' => {
    if (timedOut) return 'capped'
    if (idx === withCandidates.length) {
      evaluate()
      return 'complete'
    }
    nodes++
    if ((nodes & 255) === 0) {
      if (Date.now() > deadline) {
        timedOut = true
        return 'capped'
      }
      onProgress?.({ depth: idx, total: withCandidates.length, nodes, solutions: solutions.length })
    }
    if (nodes > maxNodes) {
      capped = true
      return 'capped'
    }
    const { lesson, candidates } = withCandidates[idx]
    const ordered = [...candidates].sort((a, b) => {
      if (lesson.teacherId === a.id) return -1
      if (lesson.teacherId === b.id) return 1
      return (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0)
    })
    for (const t of ordered) {
      if (!feasible(t.id, lesson)) continue
      book(t.id, lesson)
      chosen.set(lesson.id, t.id)
      const r = dfs(idx + 1)
      chosen.delete(lesson.id)
      unbookLesson(t.id, lesson)
      if (r === 'capped') return 'capped'
    }
    return 'complete'
  }

  const r = dfs(0)

  if (solutions.length === 0) {
    // Greedy best-effort fallback: assign what is possible, report the rest
    chosen.clear()
    let assignedAny = false
    for (const { lesson, candidates } of withCandidates) {
      const ordered = [...candidates].sort((a, b) => {
        if (lesson.teacherId === a.id) return -1
        if (lesson.teacherId === b.id) return 1
        return (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0)
      })
      const t = ordered.find((tc) => feasible(tc.id, lesson))
      if (!t) continue
      book(t.id, lesson)
      chosen.set(lesson.id, t.id)
      assignedAny = true
    }
    if (assignedAny) {
      evaluate()
      for (const { lesson } of withCandidates) {
        if (!chosen.has(lesson.id)) {
          problems.push(`${lesson.code}: no feasible teacher — left unassigned`)
        }
      }
    }
  }

  if (solutions.length === 0 && r === 'complete' && problems.length === 0) {
    problems.push('No feasible teacher assignment found — relax availability or weekly limits')
  }

  return { solutions, problems, timedOut, exhausted: !timedOut && !capped, nodesSearched: nodes }
}
