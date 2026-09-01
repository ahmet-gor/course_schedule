export interface Term {
  id: number
  name: string
  weeks: number
  startDate: string
  breakWeeks: number[]
}

export interface Course {
  id: number
  termId: number
  code: string
  title: string
  credits: number
}

export interface TimeSlot {
  days: number[]
  start: number
  end: number
}

export type Meeting = TimeSlot

export interface Instructor {
  id: number
  name: string
  email: string
  maxWeeklyHours: number
  unavailable: TimeSlot[]
}

export interface Room {
  id: number
  name: string
  building: string
  capacity: number
  travelGroup: string
}

export interface SectionDTO {
  id: number
  courseId: number
  code: string
  title: string
  number: string
  capacity: number
  sessionsPerWeek: number
  durationMinutes: number
  instructorId: number | null
  roomId: number | null
  locked: boolean
  meetings: Meeting[]
}

export interface SectionFull extends SectionDTO {
  instructorName: string | null
  roomName: string | null
  travelGroup: string | null
}

export type OverrideKind = 'move' | 'cancel' | 'extra'

export interface MeetingOverride {
  id: number
  sectionId: number
  week: number
  kind: OverrideKind
  fromDay: number | null
  toDay: number | null
  start: number | null
  end: number | null
  roomId: number | null
  instructorId: number | null
  note: string
}

export type OverrideInput = Omit<MeetingOverride, 'id'>

export type OccurrenceSource =
  | { type: 'pattern' }
  | { type: 'override'; overrideId: number }

export interface Occurrence {
  key: string
  sectionId: number
  day: number
  start: number
  end: number
  roomId: number | null
  instructorId: number | null
  source: OccurrenceSource
  extra: boolean
  cancelled: boolean
  cancelOverrideId: number | null
}

export type ConflictType =
  | 'room-overlap'
  | 'instructor-overlap'
  | 'course-overlap'
  | 'instructor-unavailable'
  | 'capacity'
  | 'travel'

export interface Conflict {
  sectionId: number
  type: ConflictType
  message: string
  params?: Record<string, string | number>
  withSectionIds?: number[]
}

export interface SoftScore {
  total: number
  window: number
  backToBack: number
  maxHours: number
}

export interface SolverWeights {
  window: number
  backToBack: number
  maxHours: number
}

export interface Settings {
  dayStart: number
  dayEnd: number
  preferredStart: number
  preferredEnd: number
  slotStepMin: number
  defaultWeeks: number
  dayPatterns: number[][]
  travelMinutes: Record<string, number>
  backToBackGapMin: number
  weights: SolverWeights
  solver: { topN: number; timeLimitMs: number; maxNodes: number }
}

export const DEFAULT_SETTINGS: Settings = {
  dayStart: 480,
  dayEnd: 1260,
  preferredStart: 540,
  preferredEnd: 1080,
  slotStepMin: 30,
  defaultWeeks: 14,
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
  travelMinutes: {},
  backToBackGapMin: 15,
  weights: { window: 1, backToBack: 20, maxHours: 15 },
  solver: { topN: 5, timeLimitMs: 8000, maxNodes: 1500000 }
}

export interface Assignment {
  days: number[]
  start: number
  end: number
  roomId: number
  instructorId: number
}

export type SolutionSummary =
  | { kind: 'window'; minutes: number }
  | { kind: 'backToBack'; count: number }
  | { kind: 'maxHours'; hours: number }
  | { kind: 'clean' }

export interface Solution {
  score: number
  parts: { window: number; backToBack: number; maxHours: number }
  summary: SolutionSummary[]
  assignments: Record<string, Assignment>
}

export interface FlexSection {
  id: number
  courseId: number
  code: string
  capacity: number
  sessionsPerWeek: number
  durationMinutes: number
  instructorId: number | null
  roomId: number | null
}

export interface FixSection {
  id: number
  courseId: number
  code: string
  meetings: Meeting[]
  roomId: number | null
  instructorId: number | null
}

export interface SolveInput {
  settings: Settings
  rooms: Room[]
  instructors: Instructor[]
  flexible: FlexSection[]
  fixed: FixSection[]
}

export interface SolveResult {
  solutions: Solution[]
  problems: string[]
  timedOut: boolean
  exhausted: boolean
  nodesSearched: number
}

export interface ScheduleData {
  settings: Settings
  term: Term
  rooms: Room[]
  instructors: Instructor[]
  sections: SectionFull[]
  overrides: MeetingOverride[]
}
