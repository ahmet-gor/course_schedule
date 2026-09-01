import { scoreSoft, travelMinutesFor } from '../constraints'
import { daysToLabel, toHHMM } from '../time'
import type {
  Assignment,
  FixSection,
  FlexSection,
  Instructor,
  Room,
  Settings,
  Solution,
  SolutionSummary,
  SolveInput,
  SolveResult
} from '../types'

interface CalEntry {
  s: number
  e: number
  sectionId: number
  roomId: number | null
  group: string
}

interface Candidate {
  days: number[]
  start: number
  end: number
  roomId: number
  instructorId: number
}

export interface SolveProgress {
  depth: number
  total: number
  nodes: number
  solutions: number
}

export function precheck(input: SolveInput): string[] {
  const problems: string[] = []
  const { settings, rooms, instructors, flexible } = input
  const instructorIds = new Set(instructors.map((i) => i.id))
  const span = settings.dayEnd - settings.dayStart
  for (const s of flexible) {
    if (s.durationMinutes > span) {
      problems.push(`${s.code}: duration ${s.durationMinutes} min exceeds day span`)
    }
    if (!rooms.some((r) => r.capacity >= s.capacity)) {
      problems.push(`${s.code}: no room with capacity >= ${s.capacity}`)
    }
    if (s.instructorId !== null && !instructorIds.has(s.instructorId)) {
      problems.push(`${s.code}: assigned instructor no longer exists`)
    }
  }
  return problems
}

function combinations(days: number[], k: number): number[][] {
  if (k === 0) return [[]]
  if (days.length < k) return []
  const [first, ...rest] = days
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c])
  const without = combinations(rest, k)
  return [...withFirst, ...without]
}

function dayPatternsFor(settings: Settings, sessionsPerWeek: number): number[][] {
  const matched = settings.dayPatterns.filter((p) => p.length === sessionsPerWeek)
  if (matched.length > 0) return matched
  return combinations([1, 2, 3, 4, 5, 6], Math.min(sessionsPerWeek, 6))
}

function buildCandidates(
  s: FlexSection,
  input: SolveInput,
  orderHint: boolean
): Candidate[] {
  const { settings, rooms, instructors } = input
  const patterns = dayPatternsFor(settings, s.sessionsPerWeek)
  const eligibleRooms = rooms.filter((r) => r.capacity >= s.capacity)
  const eligibleInstructors =
    s.instructorId !== null
      ? instructors.filter((i) => i.id === s.instructorId)
      : instructors
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const candidates: Candidate[] = []
  for (const days of patterns) {
    for (let start = settings.dayStart; start + s.durationMinutes <= settings.dayEnd; start += settings.slotStepMin) {
      const end = start + s.durationMinutes
      for (const room of eligibleRooms) {
        for (const ins of eligibleInstructors) {
          candidates.push({ days, start, end, roomId: room.id, instructorId: ins.id })
        }
      }
    }
  }
  if (orderHint) {
    candidates.sort((a, b) => candidateHeuristic(s, a, input) - candidateHeuristic(s, b, input))
  }
  return candidates
}

function candidateHeuristic(s: FlexSection, c: Candidate, input: SolveInput): number {
  const { settings } = input
  let score = 0
  const before = Math.max(0, settings.preferredStart - c.start)
  const after = Math.max(0, c.end - settings.preferredEnd)
  score += (before + after) * 10
  if (s.roomId !== null && c.roomId !== s.roomId) score += 5
  return score
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(arr: T[], rand: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

export function solve(input: SolveInput, onProgress?: (p: SolveProgress) => void): SolveResult {
  const { settings, rooms, instructors, flexible, fixed } = input
  const problems = precheck(input)
  const problemIds = new Set(
    flexible
      .filter(
        (s) =>
          s.durationMinutes > settings.dayEnd - settings.dayStart ||
          !rooms.some((r) => r.capacity >= s.capacity) ||
          (s.instructorId !== null && !instructors.some((i) => i.id === s.instructorId))
      )
      .map((s) => s.id)
  )
  const sections = flexible.filter((s) => !problemIds.has(s.id))

  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const instructorById = new Map(instructors.map((i) => [i.id, i]))

  const cal = new Map<string, CalEntry[]>()
  const calKey = (kind: string, id: number, day: number) => `${kind}:${id}:${day}`
  const pushCal = (key: string, entry: CalEntry) => {
    const arr = cal.get(key)
    if (arr) arr.push(entry)
    else cal.set(key, [entry])
  }
  const removeBySection = (sectionId: number) => {
    for (const arr of cal.values()) {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].sectionId === sectionId) arr.splice(i, 1)
      }
    }
  }

  for (const f of fixed) {
    const room = f.roomId !== null ? roomById.get(f.roomId) ?? null : null
    const ins = f.instructorId !== null ? instructorById.get(f.instructorId) ?? null : null
    for (const m of f.meetings) {
      for (const d of m.days) {
        if (room) {
          pushCal(calKey('r', room.id, d), { s: m.start, e: m.end, sectionId: f.id, roomId: room.id, group: room.travelGroup })
        }
        if (ins) {
          pushCal(calKey('i', ins.id, d), { s: m.start, e: m.end, sectionId: f.id, roomId: room?.id ?? null, group: room?.travelGroup ?? '' })
        }
        pushCal(calKey('c', f.courseId, d), { s: m.start, e: m.end, sectionId: f.id, roomId: null, group: '' })
      }
    }
  }
  for (const ins of instructors) {
    for (const u of ins.unavailable) {
      for (const d of u.days) {
        pushCal(calKey('u', ins.id, d), { s: u.start, e: u.end, sectionId: -1, roomId: null, group: '' })
      }
    }
  }

  const ov = (iv: { start: number; end: number }, e: CalEntry) => iv.start < e.e && e.s < iv.end

  const feasible = (s: FlexSection, c: Candidate): boolean => {
    const room = roomById.get(c.roomId)
    if (!room) return false
    for (const d of c.days) {
      const iv = { start: c.start, end: c.end }
      const roomArr = cal.get(calKey('r', c.roomId, d))
      if (roomArr) {
        for (const e of roomArr) if (ov(iv, e)) return false
      }
      const instrArr = cal.get(calKey('i', c.instructorId, d))
      if (instrArr) {
        for (const e of instrArr) {
          if (ov(iv, e)) return false
          const needed = travelMinutesFor(settings, room.travelGroup, e.group)
          if (needed > 0) {
            const gap = e.s >= c.end ? e.s - c.end : c.start - e.e
            if (gap >= 0 && gap < needed) return false
          }
        }
      }
      const unavailArr = cal.get(calKey('u', c.instructorId, d))
      if (unavailArr) {
        for (const e of unavailArr) if (ov(iv, e)) return false
      }
      const courseArr = cal.get(calKey('c', s.courseId, d))
      if (courseArr) {
        for (const e of courseArr) if (ov(iv, e)) return false
      }
    }
    return true
  }

  const assign = (s: FlexSection, c: Candidate) => {
    const room = roomById.get(c.roomId)!
    for (const d of c.days) {
      pushCal(calKey('r', c.roomId, d), { s: c.start, e: c.end, sectionId: s.id, roomId: room.id, group: room.travelGroup })
      pushCal(calKey('i', c.instructorId, d), { s: c.start, e: c.end, sectionId: s.id, roomId: room.id, group: room.travelGroup })
      pushCal(calKey('c', s.courseId, d), { s: c.start, e: c.end, sectionId: s.id, roomId: null, group: '' })
    }
  }

  const withCandidates = sections
    .map((s) => ({ section: s, candidates: buildCandidates(s, input, true) }))
    .sort((a, b) => a.candidates.length - b.candidates.length)

  const solutions: Solution[] = []
  const seen = new Set<string>()
  const chosen = new Map<number, Candidate>()
  const topN = Math.max(1, settings.solver.topN)
  const deadline = Date.now() + settings.solver.timeLimitMs
  const maxNodes = Math.max(10000, settings.solver.maxNodes)
  let nodes = 0
  let timedOut = false
  let exhausted = false

  const evaluate = () => {
    const assignments: Record<string, Assignment> = {}
    const ctxSections = fixed.map((f) => ({
      id: f.id,
      courseId: f.courseId,
      code: f.code,
      capacity: 0,
      meetings: f.meetings,
      room: f.roomId !== null ? roomById.get(f.roomId) ?? null : null,
      instructor: f.instructorId !== null ? instructorById.get(f.instructorId) ?? null : null
    }))
    for (const { section } of withCandidates) {
      const c = chosen.get(section.id)
      if (!c) continue
      assignments[String(section.id)] = { days: c.days, start: c.start, end: c.end, roomId: c.roomId, instructorId: c.instructorId }
      ctxSections.push({
        id: section.id,
        courseId: section.courseId,
        code: section.code,
        capacity: section.capacity,
        meetings: [{ days: c.days, start: c.start, end: c.end }],
        room: roomById.get(c.roomId) ?? null,
        instructor: instructorById.get(c.instructorId) ?? null
      })
    }
    const soft = scoreSoft(ctxSections, settings)
    const hash = JSON.stringify(
      Object.keys(assignments)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => [k, assignments[k]])
    )
    if (seen.has(hash)) return
    seen.add(hash)
    const w = settings.weights
    const windowMinutes = w.window ? soft.window / w.window : 0
    const btCount = w.backToBack ? soft.backToBack / w.backToBack : 0
    const overHours = w.maxHours ? soft.maxHours / w.maxHours : 0
    const summary: SolutionSummary[] = []
    if (windowMinutes > 0) summary.push({ kind: 'window', minutes: windowMinutes })
    if (btCount > 0) summary.push({ kind: 'backToBack', count: btCount })
    if (overHours > 0) summary.push({ kind: 'maxHours', hours: overHours })
    if (summary.length === 0) summary.push({ kind: 'clean' })
    solutions.push({ score: soft.total, parts: { window: soft.window, backToBack: soft.backToBack, maxHours: soft.maxHours }, summary, assignments })
    solutions.sort((a, b) => a.score - b.score)
    if (solutions.length > topN) solutions.length = topN
  }

  let nodeCap = maxNodes

  const dfs = (idx: number): 'complete' | 'capped' => {
    if (timedOut) return 'capped'
    if (idx === withCandidates.length) {
      evaluate()
      return 'complete'
    }
    nodes++
    if ((nodes & 511) === 0) {
      if (Date.now() > deadline) {
        timedOut = true
        return 'capped'
      }
      onProgress?.({ depth: idx, total: withCandidates.length, nodes, solutions: solutions.length })
    }
    if (nodes > nodeCap) return 'capped'
    const { section, candidates } = withCandidates[idx]
    for (const c of candidates) {
      if (!feasible(section, c)) continue
      assign(section, c)
      chosen.set(section.id, c)
      const r = dfs(idx + 1)
      if (r === 'capped') {
        removeBySection(section.id)
        chosen.delete(section.id)
        return 'capped'
      }
      removeBySection(section.id)
      chosen.delete(section.id)
      if (timedOut) return 'capped'
    }
    return 'complete'
  }

  let pass = 0
  while (Date.now() < deadline && !exhausted && !timedOut) {
    nodeCap = maxNodes * (pass + 1)
    const r = dfs(0)
    if (r === 'complete') exhausted = true
    if (timedOut) break
    pass++
    if (pass > 60) break
    for (const entry of withCandidates) {
      shuffle(entry.candidates, mulberry32(pass * 7919 + entry.section.id * 2654435761))
    }
  }

  if (problemIds.size > 0) {
    for (const s of flexible) {
      if (problemIds.has(s.id)) problems.push(`Skipped ${s.code}: infeasible inputs`)
    }
  }

  return { solutions, problems, timedOut, exhausted, nodesSearched: nodes }
}
