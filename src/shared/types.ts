export interface Term {
  id: number
  name: string
  weeks: number
  startDate: string
  breakWeeks: number[]
}

export interface TimeSlot {
  days: number[]
  start: number
  end: number
}

export type Meeting = TimeSlot

export interface SchoolClass {
  id: number
  termId: number
  name: string
  grade: string
  capacity: number
  homeroom: string
}

export interface Subject {
  id: number
  termId: number
  code: string
  title: string
}

export interface Teacher {
  id: number
  name: string
  email: string
  maxWeeklyHours: number
  unavailable: TimeSlot[]
  subjectIds: number[]
}

export interface LessonDTO {
  id: number
  classId: number
  subjectId: number
  sessionsPerWeek: number
  durationMinutes: number
  teacherId: number | null
  locked: boolean
  meetings: Meeting[]
}

export interface LessonFull extends LessonDTO {
  className: string
  subjectCode: string
  subjectTitle: string
  teacherName: string | null
}

export type OverrideKind = 'move' | 'cancel' | 'extra'

export interface MeetingOverride {
  id: number
  lessonId: number
  week: number
  kind: OverrideKind
  fromDay: number | null
  toDay: number | null
  start: number | null
  end: number | null
  teacherId: number | null
  note: string
}

export type OverrideInput = Omit<MeetingOverride, 'id'>

export type OccurrenceSource =
  | { type: 'pattern' }
  | { type: 'override'; overrideId: number }

export interface Occurrence {
  key: string
  lessonId: number
  day: number
  start: number
  end: number
  teacherId: number | null
  source: OccurrenceSource
  extra: boolean
  cancelled: boolean
  cancelOverrideId: number | null
}

export type ConflictType =
  | 'class-overlap'
  | 'teacher-overlap'
  | 'teacher-unavailable'
  | 'teacher-unqualified'
  | 'teacher-overhours'

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
  defaultWeeks: number
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
  defaultWeeks: 18,
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

export interface ClassAssignment {
  days: number[]
  start: number
  end: number
}

export type SolutionSummary =
  | { kind: 'window'; minutes: number }
  | { kind: 'load'; hours: number }
  | { kind: 'changes'; count: number }
  | { kind: 'clean' }

export interface ClassSolution {
  score: number
  window: number
  assignments: Record<string, ClassAssignment>
  summary: SolutionSummary[]
}

export interface FlexLesson {
  id: number
  classId: number
  subjectId: number
  code: string
  sessionsPerWeek: number
  durationMinutes: number
}

export interface FixLesson {
  id: number
  classId: number
  subjectId: number
  code: string
  meetings: Meeting[]
}

export interface ClassSolveInput {
  settings: Settings
  classes: { id: number; name: string }[]
  flexible: FlexLesson[]
  fixed: FixLesson[]
}

export interface ClassSolveResult {
  solutions: ClassSolution[]
  problems: string[]
  timedOut: boolean
  exhausted: boolean
  nodesSearched: number
}

export interface PlacedLesson {
  id: number
  classId: number
  subjectId: number
  code: string
  sessionsPerWeek: number
  durationMinutes: number
  meetings: Meeting[]
  teacherId: number | null
  fixed: boolean
}

export interface TeacherSolveInput {
  settings: Settings
  teachers: Teacher[]
  lessons: PlacedLesson[]
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
  term: Term
  classes: SchoolClass[]
  subjects: Subject[]
  teachers: Teacher[]
  lessons: LessonFull[]
  overrides: MeetingOverride[]
}
