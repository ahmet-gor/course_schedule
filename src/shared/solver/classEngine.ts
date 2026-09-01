import type {
  ClassAssignment,
  ClassSolveInput,
  ClassSolveResult,
  ClassSolution,
  FixLesson,
  FlexLesson,
  Settings
} from '../types'

export interface SolveProgress {
  depth: number
  total: number
  nodes: number
  solutions: number
}

interface Candidate {
  days: number[]
  start: number
  end: number
}

interface ClassState {
  classId: number
  className: string
  flexible: FlexLesson[]
  fixed: FixLesson[]
}

function combinations(days: number[], k: number): number[][] {
  if (k === 0) return [[]]
  if (days.length < k) return []
  const [first, ...rest] = days
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c])
  const without = combinations(rest, k)
  return [...withFirst, ...without]
}

export function dayPatternsFor(settings: Settings, sessionsPerWeek: number): number[][] {
  const matched = settings.dayPatterns.filter((p) => p.length === sessionsPerWeek)
  if (matched.length > 0) return matched
  return combinations([1, 2, 3, 4, 5, 6], Math.min(sessionsPerWeek, 6))
}

export function classPrecheck(input: ClassSolveInput): string[] {
  const problems: string[] = []
  const span = input.settings.dayEnd - input.settings.dayStart
  for (const s of input.flexible) {
    if (s.sessionsPerWeek > 6) {
      problems.push(`${s.code}: ${s.sessionsPerWeek} sessions per week exceeds the 6-day week`)
    }
    if (s.durationMinutes > span) {
      problems.push(`${s.code}: duration ${s.durationMinutes} min exceeds day span`)
    }
  }
  return problems
}

function buildCandidates(s: FlexLesson, settings: Settings): Candidate[] {
  const patterns = dayPatternsFor(settings, s.sessionsPerWeek)
  const candidates: Candidate[] = []
  for (const days of patterns) {
    for (let start = settings.dayStart; start + s.durationMinutes <= settings.dayEnd; start += settings.slotStepMin) {
      candidates.push({ days, start, end: start + s.durationMinutes })
    }
  }
  candidates.sort((a, b) => windowPenalty(a, settings) - windowPenalty(b, settings))
  return candidates
}

function windowPenalty(c: Candidate, settings: Settings): number {
  return Math.max(0, settings.preferredStart - c.start) + Math.max(0, c.end - settings.preferredEnd)
}

interface LocalSolution {
  window: number
  assignments: Record<string, ClassAssignment>
}

export function solveClasses(input: ClassSolveInput, onProgress?: (p: SolveProgress) => void): ClassSolveResult {
  const { settings } = input
  const problems = classPrecheck(input)
  const problemCodes = new Set(
    input.flexible
      .filter((s) => s.sessionsPerWeek > 6 || s.durationMinutes > settings.dayEnd - settings.dayStart)
      .map((s) => s.id)
  )

  const classNameById = new Map(input.classes.map((c) => [c.id, c.name]))
  const byClass = new Map<number, ClassState>()
  for (const f of input.flexible) {
    if (problemCodes.has(f.id)) continue
    const st = byClass.get(f.classId) ?? {
      classId: f.classId,
      className: classNameById.get(f.classId) ?? `#${f.classId}`,
      flexible: [],
      fixed: []
    }
    st.flexible.push(f)
    byClass.set(f.classId, st)
  }
  for (const f of input.fixed) {
    const st = byClass.get(f.classId)
    if (st) st.fixed.push(f)
  }

  const topN = Math.max(1, settings.solver.topN)
  const deadline = Date.now() + settings.solver.timeLimitMs
  const maxNodes = Math.max(10000, settings.solver.maxNodes)
  let nodes = 0
  let timedOut = false

  const localByClass = new Map<number, LocalSolution[]>()
  const seenByClass = new Map<number, Set<string>>()

  for (const st of byClass.values()) {
    if (timedOut) break
    if (st.flexible.length === 0) continue

    const cal = new Map<number, { s: number; e: number; lessonId: number }[]>()
    for (const f of st.fixed) {
      for (const m of f.meetings) {
        for (const d of m.days) {
          const arr = cal.get(d) ?? []
          arr.push({ s: m.start, e: m.end, lessonId: f.id })
          cal.set(d, arr)
        }
      }
    }

    const withCandidates = st.flexible
      .map((s) => ({ lesson: s, candidates: buildCandidates(s, settings) }))
      .sort((a, b) => a.candidates.length - b.candidates.length)

    const local: LocalSolution[] = []
    const seen = new Set<string>()
    seenByClass.set(st.classId, seen)
    const chosen = new Map<number, Candidate>()
    let partialWindow = 0

    const ov = (s: number, e: number, entry: { s: number; e: number }) => s < entry.e && entry.s < e

    const feasible = (c: Candidate): boolean => {
      for (const d of c.days) {
        for (const entry of cal.get(d) ?? []) {
          if (ov(c.start, c.end, entry)) return false
        }
      }
      return true
    }
    const assign = (lessonId: number, c: Candidate) => {
      for (const d of c.days) {
        const arr = cal.get(d) ?? []
        arr.push({ s: c.start, e: c.end, lessonId })
        cal.set(d, arr)
      }
    }
    const remove = (lessonId: number) => {
      for (const [d, arr] of cal) {
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i].lessonId === lessonId) arr.splice(i, 1)
        }
        if (arr.length === 0) cal.delete(d)
      }
    }

    const worstLocal = () => (local.length >= topN ? local[local.length - 1].window : Infinity)

    const dfs = (idx: number): 'complete' | 'capped' => {
      if (timedOut) return 'capped'
      if (idx === withCandidates.length) {
        const assignments: Record<string, ClassAssignment> = {}
        for (const { lesson } of withCandidates) {
          const c = chosen.get(lesson.id)
          if (c) assignments[String(lesson.id)] = { days: c.days, start: c.start, end: c.end }
        }
        const hash = JSON.stringify(assignments)
        if (!seen.has(hash)) {
          seen.add(hash)
          local.push({ window: partialWindow, assignments })
          local.sort((a, b) => a.window - b.window)
          if (local.length > topN) local.length = topN
        }
        return 'complete'
      }
      nodes++
      if ((nodes & 255) === 0) {
        if (Date.now() > deadline) {
          timedOut = true
          return 'capped'
        }
        onProgress?.({ depth: idx, total: withCandidates.length, nodes, solutions: local.length })
      }
      if (nodes > maxNodes) return 'capped'
      const { lesson, candidates } = withCandidates[idx]
      for (const c of candidates) {
        if (partialWindow + windowPenalty(c, settings) >= worstLocal()) continue
        if (!feasible(c)) continue
        assign(lesson.id, c)
        chosen.set(lesson.id, c)
        const saved = partialWindow
        partialWindow += windowPenalty(c, settings)
        const r = dfs(idx + 1)
        partialWindow = saved
        remove(lesson.id)
        chosen.delete(lesson.id)
        if (r === 'capped') return 'capped'
      }
      return 'complete'
    }

    const r = dfs(0)
    if (r === 'complete' && local.length === 0) {
      problems.push(
        `${st.className}: no clash-free arrangement found for ${st.flexible.length} lesson(s) — reduce weekly hours or extend the day window`
      )
    }
    localByClass.set(st.classId, local)
  }

  for (const s of input.flexible) {
    if (problemCodes.has(s.id)) problems.push(`Skipped ${s.code}: infeasible inputs`)
  }

  const solutions: ClassSolution[] = []
  for (let i = 0; i < topN; i++) {
    const assignments: Record<string, ClassAssignment> = {}
    let total = 0
    let ok = true
    for (const [, local] of localByClass) {
      if (local.length === 0) {
        ok = false
        break
      }
      const pick = local[Math.min(i, local.length - 1)]
      total += pick.window
      Object.assign(assignments, pick.assignments)
    }
    if (!ok || Object.keys(assignments).length === 0) break
    if (i > 0) {
      const hash = JSON.stringify(assignments)
      const dup = solutions.some((s) => JSON.stringify(s.assignments) === hash)
      if (dup) continue
    }
    const summary: ClassSolution['summary'] =
      total > 0 ? [{ kind: 'window', minutes: total }] : [{ kind: 'clean' }]
    solutions.push({ score: total, window: total, assignments, summary })
  }

  return { solutions, problems, timedOut, exhausted: !timedOut, nodesSearched: nodes }
}
