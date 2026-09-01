import { sqliteTable, integer, real, text } from 'drizzle-orm/sqlite-core'

export const terms = sqliteTable('terms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
  weeks: integer('weeks').notNull().default(14),
  startDate: text('start_date').notNull().default(''),
  breakWeeks: text('break_weeks').notNull().default('[]')
})

export const courses = sqliteTable('courses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  termId: integer('term_id').notNull(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  credits: real('credits').notNull()
})

export const instructors = sqliteTable('instructors', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().default(''),
  maxWeeklyHours: real('max_weekly_hours').notNull().default(12),
  unavailable: text('unavailable').notNull().default('[]')
})

export const rooms = sqliteTable('rooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  building: text('building').notNull().default(''),
  capacity: integer('capacity').notNull().default(0),
  travelGroup: text('travel_group').notNull().default('A')
})

export const sections = sqliteTable('sections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  courseId: integer('course_id').notNull(),
  number: text('number').notNull(),
  capacity: integer('capacity').notNull().default(0),
  sessionsPerWeek: integer('sessions_per_week').notNull().default(2),
  durationMinutes: integer('duration_minutes').notNull().default(75),
  instructorId: integer('instructor_id'),
  roomId: integer('room_id'),
  locked: integer('locked').notNull().default(0)
})

export const meetingTimes = sqliteTable('meeting_times', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sectionId: integer('section_id').notNull(),
  days: text('days').notNull(),
  startMinute: integer('start_minute').notNull(),
  endMinute: integer('end_minute').notNull()
})

export const meetingOverrides = sqliteTable('meeting_overrides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sectionId: integer('section_id').notNull(),
  week: integer('week').notNull(),
  kind: text('kind').notNull(),
  fromDay: integer('from_day'),
  toDay: integer('to_day'),
  startMinute: integer('start_minute'),
  endMinute: integer('end_minute'),
  roomId: integer('room_id'),
  instructorId: integer('instructor_id'),
  note: text('note').notNull().default('')
})

export const settingsTable = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  json: text('json').notNull()
})
