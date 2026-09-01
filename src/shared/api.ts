import type {
  LessonDTO,
  LessonFull,
  MeetingOverride,
  OverrideInput,
  SchoolClass,
  ScheduleData,
  Settings,
  Subject,
  Teacher,
  Term,
  TimeSlot
} from './types'
import type { LicensingInfo } from './licensing'

export interface ClassInput {
  name: string
  grade: string
  capacity: number
  homeroom: string
}

export interface SubjectInput {
  code: string
  title: string
}

export interface TeacherInput {
  name: string
  email: string
  maxWeeklyHours: number
  unavailable: TimeSlot[]
  subjectIds: number[]
}

export interface LessonInput {
  subjectId: number
  sessionsPerWeek: number
  durationMinutes: number
  teacherId: number | null
  locked?: boolean
}

export type CsvEntity = 'subjects' | 'teachers' | 'classes' | 'lessons'
export type ExcelScope = 'pattern' | 'week' | 'all'

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
  classes: {
    list(termId: number): Promise<SchoolClass[]>
    create(termId: number, data: ClassInput): Promise<SchoolClass>
    update(id: number, data: ClassInput): Promise<void>
    remove(id: number): Promise<void>
  }
  subjects: {
    list(termId: number): Promise<Subject[]>
    create(termId: number, data: SubjectInput): Promise<Subject>
    update(id: number, data: SubjectInput): Promise<void>
    remove(id: number): Promise<void>
  }
  teachers: {
    list(): Promise<Teacher[]>
    create(data: TeacherInput): Promise<Teacher>
    update(id: number, data: TeacherInput): Promise<void>
    remove(id: number): Promise<void>
  }
  lessons: {
    list(termId: number): Promise<LessonFull[]>
    create(classId: number, data: LessonInput): Promise<LessonDTO>
    update(
      id: number,
      data: Partial<LessonInput> & { teacherId?: number | null; locked?: boolean }
    ): Promise<void>
    setSchedule(id: number, days: number[], start: number | null, end: number | null): Promise<void>
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
    resetWeek(termId: number, week: number, lessonId?: number | null): Promise<void>
  }
  schedule: {
    getData(termId: number): Promise<ScheduleData>
    applyClasses(
      termId: number,
      assignments: Record<string, { days: number[]; start: number; end: number }>
    ): Promise<number>
    assignTeachers(termId: number, assignments: Record<string, number | null>): Promise<void>
    unschedule(lessonIds: number[]): Promise<void>
  }
  io: {
    exportJson(termId: number): Promise<string | null>
    importJson(): Promise<{ termName: string; classes: number; lessons: number } | null>
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
