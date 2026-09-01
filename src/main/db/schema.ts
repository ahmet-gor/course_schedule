import { sqliteTable, integer, real, text } from 'drizzle-orm/sqlite-core'

export const terms = sqliteTable('terms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
  weeks: integer('weeks').notNull().default(14),
  startDate: text('start_date').notNull().default(''),
  breakWeeks: text('break_weeks').notNull().default('[]')
})

export const classes = sqliteTable('classes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  termId: integer('term_id')
    .notNull()
    .references(() => terms.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  grade: text('grade').notNull().default(''),
  capacity: integer('capacity').notNull().default(0),
  homeroom: text('homeroom').notNull().default('')
})

export const subjects = sqliteTable('subjects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  termId: integer('term_id')
    .notNull()
    .references(() => terms.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  title: text('title').notNull()
})

export const teachers = sqliteTable('teachers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().default(''),
  maxWeeklyHours: real('max_weekly_hours').notNull().default(12),
  unavailable: text('unavailable').notNull().default('[]'),
  subjectIds: text('subject_ids').notNull().default('[]')
})

export const lessons = sqliteTable('lessons', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  classId: integer('class_id')
    .notNull()
    .references(() => classes.id, { onDelete: 'cascade' }),
  subjectId: integer('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  sessionsPerWeek: integer('sessions_per_week').notNull().default(2),
  durationMinutes: integer('duration_minutes').notNull().default(40),
  teacherId: integer('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
  locked: integer('locked').notNull().default(0),
  days: text('days').notNull().default(''),
  startMinute: integer('start_minute'),
  endMinute: integer('end_minute')
})

export const meetingOverrides = sqliteTable('meeting_overrides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  lessonId: integer('lesson_id')
    .notNull()
    .references(() => lessons.id, { onDelete: 'cascade' }),
  week: integer('week').notNull(),
  kind: text('kind').notNull(),
  fromDay: integer('from_day'),
  toDay: integer('to_day'),
  startMinute: integer('start_minute'),
  endMinute: integer('end_minute'),
  teacherId: integer('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
  note: text('note').notNull().default('')
})

export const settingsTable = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  json: text('json').notNull()
})
