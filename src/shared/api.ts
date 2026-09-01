import type {
  Course,
  Instructor,
  Meeting,
  MeetingOverride,
  OverrideInput,
  Room,
  ScheduleData,
  SectionDTO,
  SectionFull,
  Settings,
  Term,
  TimeSlot
} from './types'

export interface SectionInput {
  number: string
  capacity: number
  sessionsPerWeek: number
  durationMinutes: number
  instructorId: number | null
  roomId: number | null
}

export interface CourseInput {
  code: string
  title: string
  credits: number
}

export interface InstructorInput {
  name: string
  email: string
  maxWeeklyHours: number
  unavailable: TimeSlot[]
}

export interface RoomInput {
  name: string
  building: string
  capacity: number
  travelGroup: string
}

export type CsvEntity = 'courses' | 'instructors' | 'rooms' | 'sections'
export type ExcelScope = 'pattern' | 'week' | 'all'

import type { LicensingInfo } from './licensing'

export interface TermPatch {
  name?: string
  weeks?: number
  startDate?: string
  breakWeeks?: number[]
}

export interface ImportCounts {
  imported: number
  updated: number
  errors: string[]
}

export interface RendererApi {
  terms: {
    list(): Promise<Term[]>
    create(name: string): Promise<Term>
    update(id: number, patch: TermPatch): Promise<void>
    remove(id: number): Promise<void>
  }
  courses: {
    list(termId: number): Promise<Course[]>
    create(termId: number, data: CourseInput): Promise<Course>
    update(id: number, data: CourseInput): Promise<void>
    remove(id: number): Promise<void>
  }
  instructors: {
    list(): Promise<Instructor[]>
    create(data: InstructorInput): Promise<Instructor>
    update(id: number, data: InstructorInput): Promise<void>
    remove(id: number): Promise<void>
  }
  rooms: {
    list(): Promise<Room[]>
    create(data: RoomInput): Promise<Room>
    update(id: number, data: RoomInput): Promise<void>
    remove(id: number): Promise<void>
  }
  sections: {
    list(termId: number): Promise<SectionFull[]>
    create(courseId: number, data: SectionInput): Promise<SectionDTO>
    update(
      id: number,
      data: Partial<Omit<SectionInput, 'instructorId' | 'roomId'>> & {
        instructorId?: number | null
        roomId?: number | null
        locked?: boolean
      }
    ): Promise<void>
    setMeetings(id: number, meetings: Meeting[]): Promise<void>
    remove(id: number): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
  }
  overrides: {
    create(data: OverrideInput): Promise<void>
    update(id: number, patch: Partial<OverrideInput>): Promise<void>
    remove(id: number): Promise<void>
    resetWeek(termId: number, week: number, sectionId?: number | null): Promise<void>
  }
  schedule: {
    getData(termId: number): Promise<ScheduleData>
    apply(termId: number, assignments: Record<string, { days: number[]; start: number; end: number; roomId: number; instructorId: number }>): Promise<number>
    resolveWeek(termId: number, week: number, assignments: Record<string, { days: number[]; start: number; end: number; roomId: number; instructorId: number }>): Promise<void>
    unschedule(sectionIds: number[]): Promise<void>
  }
  io: {
    exportJson(termId: number): Promise<string | null>
    importJson(): Promise<{ termName: string; courses: number; sections: number } | null>
    exportExcel(termId: number, scope: ExcelScope, week?: number): Promise<string | null>
    exportCsv(entity: CsvEntity, termId: number): Promise<string | null>
    importCsv(entity: CsvEntity, text: string, termId: number): Promise<ImportCounts>
    seedSample(): Promise<Term>
  }
  licensing: {
    getState(): Promise<LicensingInfo>
    activate(licenseKey: string): Promise<LicensingInfo>
    deactivate(): Promise<LicensingInfo>
    refresh(): Promise<LicensingInfo>
    openStore(): Promise<void>
  }
}
