import { sqliteTable, integer, real, text } from 'drizzle-orm/sqlite-core'

export const departments = sqliteTable('departments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  capacity: integer('capacity').notNull().default(0),
  homeroom: text('homeroom').notNull().default('')
})

export const lessons = sqliteTable('lessons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  departmentId: integer('department_id')
    .notNull()
    .references(() => departments.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  title: text('title').notNull().default(''),
  sessionsPerWeek: integer('sessions_per_week').notNull().default(2),
  durationMinutes: integer('duration_minutes').notNull().default(40)
})

export const teachers = sqliteTable('teachers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().default(''),
  maxWeeklyHours: real('max_weekly_hours').notNull().default(12),
  unavailable: text('unavailable').notNull().default('[]')
})

export const teacherLessons = sqliteTable('teacher_lessons', {
  teacherId: integer('teacher_id')
    .notNull()
    .references(() => teachers.id, { onDelete: 'cascade' }),
  lessonId: integer('lesson_id')
    .notNull()
    .references(() => lessons.id, { onDelete: 'cascade' })
})

export const schedules = sqliteTable('schedules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull()
})

export const scheduleEntries = sqliteTable('schedule_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scheduleId: integer('schedule_id')
    .notNull()
    .references(() => schedules.id, { onDelete: 'cascade' }),
  days: text('days').notNull().default(''),
  startMinute: integer('start_minute'),
  endMinute: integer('end_minute'),
  teacherId: integer('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
  locked: integer('locked').notNull().default(0)
})

export const entryLessons = sqliteTable('entry_lessons', {
  entryId: integer('entry_id')
    .notNull()
    .references(() => scheduleEntries.id, { onDelete: 'cascade' }),
  lessonId: integer('lesson_id')
    .notNull()
    .references(() => lessons.id, { onDelete: 'cascade' })
})

export const settingsTable = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  json: text('json').notNull()
})
