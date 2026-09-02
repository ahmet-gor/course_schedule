import type {
  Department,
  Lesson,
  LessonRef,
  Schedule,
  ScheduleData,
  Settings,
  Teacher,
  TimeSlot
} from './types'
import type { LicensingInfo } from './licensing'

export interface DepartmentInput {
  name: string
  capacity: number
  homeroom: string
}

export interface LessonInput {
  departmentId: number
  code: string
  title: string
  sessionsPerWeek: number
  durationMinutes: number
}

export interface TeacherInput {
  name: string
  email: string
  maxWeeklyHours: number
  unavailable: TimeSlot[]
  lessonIds: number[]
}

export interface EntryInput {
  lessonIds: number[]
  days: number[]
  start: number | null
  end: number | null
  teacherId: number | null
  locked: boolean
}

export type CsvEntity = 'departments' | 'lessons' | 'teachers'

export interface ImportCounts {
  imported: number
  updated: number
  errors: string[]
}

export interface RendererApi {
  departments: {
    list(): Promise<Department[]>
    create(data: DepartmentInput): Promise<Department>
    update(id: number, patch: Partial<DepartmentInput>): Promise<void>
    remove(id: number): Promise<void>
  }
  lessons: {
    list(): Promise<LessonRef[]>
    create(data: LessonInput): Promise<Lesson>
    update(id: number, patch: Partial<LessonInput>): Promise<void>
    remove(id: number): Promise<void>
  }
  teachers: {
    list(): Promise<Teacher[]>
    create(data: TeacherInput): Promise<Teacher>
    update(id: number, data: TeacherInput): Promise<void>
    remove(id: number): Promise<void>
  }
  schedules: {
    list(): Promise<Schedule[]>
    create(name: string): Promise<Schedule>
    rename(id: number, name: string): Promise<void>
    remove(id: number): Promise<void>
  }
  entries: {
    create(scheduleId: number, data: EntryInput): Promise<number>
    update(id: number, patch: Partial<EntryInput>): Promise<void>
    remove(id: number): Promise<void>
  }
  schedule: {
    getData(scheduleId: number): Promise<ScheduleData>
    applyEntries(
      scheduleId: number,
      assignments: Record<string, { lessonIds: number[]; days: number[]; start: number; end: number }>
    ): Promise<void>
    assignTeachers(scheduleId: number, assignments: Record<string, number | null>): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
  }
  io: {
    exportJson(): Promise<string | null>
    importJson(): Promise<{ schedules: number } | null>
    exportExcel(scheduleId: number): Promise<string | null>
    exportCsv(entity: CsvEntity): Promise<string | null>
    importCsv(entity: CsvEntity, text: string): Promise<ImportCounts>
    seedSample(): Promise<Schedule>
  }
  licensing: {
    getState(): Promise<LicensingInfo>
    activate(licenseKey: string): Promise<LicensingInfo>
    deactivate(): Promise<LicensingInfo>
    refresh(): Promise<LicensingInfo>
    openStore(): Promise<void>
  }
}
