import type {
  EntryAssignment,
  EntrySolution,
  EntrySolveInput,
  EntrySolveResult,
  FlexEntry,
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

export function entryPrecheck(input: EntrySolveInput): string[] {
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

function buildCandidates(s: FlexEntry, settings: Settings): Candidate[] {
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
  assignments: Record<string, EntryAssignment>
}

export function solveEntries(input: EntrySolveInput, onProgress?: (p: SolveProgress) => void): EntrySolveResult {
  const { settings } = input
  const problems = entryPrecheck(input)
  const problemIds = new Set(
    input.flexible
      .filter((s) => s.sessionsPerWeek > 6 || s.durationMinutes > settings.dayEnd - settings.dayStart)
      .map((s) => s.id)
  )

  // per-department calendars seeded from fixed entries
  const cal = new Map<number, { s: number; e: number; entryId: number }[]>()
  for (const f of input.fixed) {
    for (const m of f.meetings) {
      for (const d of m.days) {
        for (const dept of f.departmentIds) {
          const mapKey = dept * 10 + d
          const arr = cal.get(mapKey) ?? []
          arr.push({ s: m.start, e: m.end, entryId: f.id })
          cal.set(mapKey, arr)
        }
      }
    }
  }

  const topN = Math.max(1, settings.solver.topN)
  const deadline = Date.now() + settings.solver.timeLimitMs
  const maxNodes = Math.max(10000, settings.solver.maxNodes)
  let nodes = 0
  let timedOut = false

  const withCandidates = input.flexible
    .filter((s) => !problemIds.has(s.id))
    .map((s) => ({ unit: s, candidates: buildCandidates(s, settings) }))
    .sort((a, b) => a.candidates.length - b.candidates.length)

  const local: LocalSolution[] = []
  const seen = new Set<string>()
  const chosen = new Map<number, Candidate>()
  let partialWindow = 0

  const ov = (s: number, e: number, entry: { s: number; e: number }) => s < entry.e && entry.s < e

  const feasible = (u: FlexEntry, c: Candidate): boolean => {
    for (const dept of u.departmentIds) {
      for (const d of c.days) {
        for (const entry of cal.get(dept * 10 + d) ?? []) {
          if (ov(c.start, c.end, entry)) return false
        }
      }
    }
    return true
  }
  const assign = (u: FlexEntry, c: Candidate) => {
    for (const dept of u.departmentIds) {
      for (const d of c.days) {
        const mapKey = dept * 10 + d
        const arr = cal.get(mapKey) ?? []
        arr.push({ s: c.start, e: c.end, entryId: u.id })
        cal.set(mapKey, arr)
      }
    }
  }
  const remove = (entryId: number) => {
    for (const [mapKey, arr] of cal) {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].entryId === entryId) arr.splice(i, 1)
      }
      if (arr.length === 0) cal.delete(mapKey)
    }
  }

  const worstLocal = () => (local.length >= topN ? local[local.length - 1].window : Infinity)

  const dfs = (idx: number): 'complete' | 'capped' => {
    if (timedOut) return 'capped'
    if (idx === withCandidates.length) {
      const assignments: Record<string, EntryAssignment> = {}
      for (const { unit } of withCandidates) {
        const c = chosen.get(unit.id)
        if (c) assignments[String(unit.id)] = { days: c.days, start: c.start, end: c.end }
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
    const { unit, candidates } = withCandidates[idx]
    for (const c of candidates) {
      if (partialWindow + windowPenalty(c, settings) >= worstLocal()) continue
      if (!feasible(unit, c)) continue
      assign(unit, c)
      chosen.set(unit.id, c)
      const saved = partialWindow
      partialWindow += windowPenalty(c, settings)
      const r = dfs(idx + 1)
      partialWindow = saved
      remove(unit.id)
      chosen.delete(unit.id)
      if (r === 'capped') return 'capped'
    }
    return 'complete'
  }

  const r = dfs(0)
  if (r === 'complete' && local.length === 0 && withCandidates.length > 0) {
    problems.push('No clash-free arrangement found — reduce weekly hours or extend the day window')
  }

  for (const s of input.flexible) {
    if (problemIds.has(s.id)) problems.push(`Skipped ${s.code}: infeasible inputs`)
  }

  const solutions: EntrySolution[] = []
  for (const pick of local) {
    const summary: EntrySolution['summary'] =
      pick.window > 0 ? [{ kind: 'window', minutes: pick.window }] : [{ kind: 'clean' }]
    solutions.push({ score: pick.window, window: pick.window, assignments: pick.assignments, summary })
  }

  return { solutions, problems, timedOut, exhausted: !timedOut, nodesSearched: nodes }
}
