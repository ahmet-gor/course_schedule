export interface TimeSlot {
  days: number[]
  start: number
  end: number
}

export type Meeting = TimeSlot

export interface Department {
  id: number
  name: string
  capacity: number
  homeroom: string
}

export interface Lesson {
  id: number
  departmentId: number
  code: string
  title: string
  sessionsPerWeek: number
  durationMinutes: number
}

export interface LessonRef extends Lesson {
  departmentName: string
  teacherIds: number[]
}

export interface Teacher {
  id: number
  name: string
  email: string
  maxWeeklyHours: number
  unavailable: TimeSlot[]
  lessonIds: number[]
}

export interface Schedule {
  id: number
  name: string
  createdAt: number
}

export interface ScheduleEntry {
  id: number
  scheduleId: number
  locked: boolean
  teacherId: number | null
  days: number[]
  start: number | null
  end: number | null
  lessonIds: number[]
}

export type EntryFull = ScheduleEntry & {
  lessons: LessonRef[]
  teacherName: string | null
}

export type ConflictType =
  | 'dept-overlap'
  | 'teacher-overlap'
  | 'teacher-unavailable'
  | 'teacher-unqualified'
  | 'teacher-overhours'
  | 'entry-dangling'

export interface Conflict {
  lessonId: number
  type: ConflictType
  message: string
  params?: Record<string, string | number>
  withLessonIds?: number[]
}

export interface SoftScore {
  total: number
  window: number
  load: number
  overHours: number
}

export interface SolverWeights {
  window: number
  load: number
  overHours: number
  stability: number
}

export interface Settings {
  dayStart: number
  dayEnd: number
  preferredStart: number
  preferredEnd: number
  slotStepMin: number
  dayPatterns: number[][]
  weights: SolverWeights
  solver: { topN: number; timeLimitMs: number; maxNodes: number }
}

export const DEFAULT_SETTINGS: Settings = {
  dayStart: 480,
  dayEnd: 960,
  preferredStart: 510,
  preferredEnd: 930,
  slotStepMin: 30,
  dayPatterns: [
    [1, 3, 5],
    [2, 4],
    [1, 3],
    [1, 4],
    [2, 5],
    [3, 5],
    [1, 5],
    [1, 2],
    [3, 4],
    [4, 5],
    [1],
    [2],
    [3],
    [4],
    [5],
    [6]
  ],
  weights: { window: 1, load: 8, overHours: 20, stability: 5 },
  solver: { topN: 5, timeLimitMs: 8000, maxNodes: 1500000 }
}

export interface EntryAssignment {
  days: number[]
  start: number
  end: number
}

export type SolutionSummary =
  | { kind: 'window'; minutes: number }
  | { kind: 'load'; hours: number }
  | { kind: 'changes'; count: number }
  | { kind: 'clean' }

export interface EntrySolution {
  score: number
  window: number
  assignments: Record<string, EntryAssignment>
  summary: SolutionSummary[]
}

export interface FlexEntry {
  id: number
  lessonIds: number[]
  departmentIds: number[]
  code: string
  sessionsPerWeek: number
  durationMinutes: number
}

export interface FixEntry {
  id: number
  departmentIds: number[]
  code: string
  meetings: Meeting[]
}

export interface EntrySolveInput {
  settings: Settings
  departments: { id: number; name: string }[]
  flexible: FlexEntry[]
  fixed: FixEntry[]
}

export interface EntrySolveResult {
  solutions: EntrySolution[]
  problems: string[]
  timedOut: boolean
  exhausted: boolean
  nodesSearched: number
}

export interface PlacedEntry {
  id: number
  lessonIds: number[]
  code: string
  meetings: Meeting[]
  teacherId: number | null
  fixed: boolean
}

export interface TeacherSolveInput {
  settings: Settings
  teachers: Teacher[]
  entries: PlacedEntry[]
}

export interface TeacherSolution {
  score: number
  parts: { load: number; changes: number }
  assignments: Record<string, number>
  summary: SolutionSummary[]
}

export interface TeacherSolveResult {
  solutions: TeacherSolution[]
  problems: string[]
  timedOut: boolean
  exhausted: boolean
  nodesSearched: number
}

export interface ScheduleData {
  settings: Settings
  departments: Department[]
  lessons: LessonRef[]
  teachers: Teacher[]
  entries: EntryFull[]
}
