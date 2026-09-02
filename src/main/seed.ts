import { getDb } from './db/client'
import {
  departments,
  entryLessons,
  lessons,
  scheduleEntries,
  schedules,
  teacherLessons,
  teachers
} from './db/schema'
import { daysToStr, getSettings, saveSettings } from './ipc/catalog'
import type { Schedule } from '@shared/types'

export function seedSampleData(): Schedule {
  const db = getDb()
  const existing = db.select().from(schedules).all()
  if (existing.length > 0) {
    throw new Error('Sample data can only be loaded when no schedules exist')
  }

  const deptRows = [
    { name: '9th Grade', capacity: 28, homeroom: 'B-201' },
    { name: '10th Grade', capacity: 26, homeroom: 'C-101' }
  ].map((v) => db.insert(departments).values(v).returning().get())

  const grade9: [string, string, number][] = [
    ['MAT', 'Mathematics', 5],
    ['PHY', 'Physics', 3],
    ['TUR', 'Turkish', 4],
    ['ENG', 'English', 4],
    ['HIS', 'History', 2],
    ['BIO', 'Biology', 2],
    ['CHE', 'Chemistry', 2],
    ['ART', 'Art', 1],
    ['PE', 'Physical Education', 2]
  ]
  const grade10: [string, string, number][] = [
    ['MAT', 'Mathematics', 5],
    ['PHY', 'Physics', 3],
    ['TUR', 'Turkish', 4],
    ['ENG', 'English', 4],
    ['HIS', 'History', 2],
    ['CHE', 'Chemistry', 3],
    ['BIO', 'Biology', 2],
    ['ART', 'Art', 1],
    ['PE', 'Physical Education', 2]
  ]

  const insertLessons = (deptId: number, rows: [string, string, number][]) =>
    rows.map(([code, title, hours]) =>
      db
        .insert(lessons)
        .values({ departmentId: deptId, code, title, sessionsPerWeek: hours, durationMinutes: 40 })
        .returning()
        .get()
    )
  const dept9Lessons = insertLessons(deptRows[0].id, grade9)
  const dept10Lessons = insertLessons(deptRows[1].id, grade10)

  const findLesson = (rows: typeof dept9Lessons, code: string) => rows.find((l) => l.code === code)!

  const teacherRows = [
    { name: 'Ayşe Yılmaz', email: 'ayse@okul.edu.tr', maxWeeklyHours: 20, unavailable: '[]', codes: ['MAT', 'MAT'] },
    { name: 'Mehmet Demir', email: 'mehmet@okul.edu.tr', maxWeeklyHours: 22, unavailable: '[]', codes: ['MAT', 'PHY', 'MAT', 'PHY'] },
    { name: 'Zeynep Kaya', email: 'zeynep@okul.edu.tr', maxWeeklyHours: 22, unavailable: '[]', codes: ['TUR', 'HIS', 'TUR', 'HIS'] },
    {
      name: 'Elif Şahin',
      email: 'elif@okul.edu.tr',
      maxWeeklyHours: 20,
      unavailable: JSON.stringify([{ days: [5], start: 780, end: 960 }]),
      codes: ['ENG', 'TUR', 'HIS', 'ENG']
    },
    { name: 'Ahmet Çelik', email: 'ahmetc@okul.edu.tr', maxWeeklyHours: 20, unavailable: '[]', codes: ['HIS', 'ART', 'ENG', 'HIS', 'ART'] },
    { name: 'Fatma Aydın', email: 'fatma@okul.edu.tr', maxWeeklyHours: 20, unavailable: '[]', codes: ['BIO', 'CHE', 'ART', 'BIO', 'CHE', 'ART'] },
    { name: 'Can Arslan', email: 'can@okul.edu.tr', maxWeeklyHours: 22, unavailable: '[]', codes: ['PHY', 'CHE', 'BIO', 'MAT', 'PHY', 'CHE', 'BIO', 'MAT'] },
    { name: 'Deniz Koç', email: 'deniz@okul.edu.tr', maxWeeklyHours: 18, unavailable: '[]', codes: ['ENG', 'PE', 'ART', 'ENG', 'PE', 'ART'] },
    { name: 'Hatice Özdemir', email: 'hatice@okul.edu.tr', maxWeeklyHours: 20, unavailable: '[]', codes: ['MAT', 'TUR', 'MAT', 'TUR'] },
    { name: 'Burak Yıldız', email: 'burak@okul.edu.tr', maxWeeklyHours: 20, unavailable: '[]', codes: ['PHY', 'BIO', 'CHE', 'PE', 'PHY', 'BIO', 'CHE', 'PE'] }
  ].map((v) => {
    const codes = v.codes
    const linked: number[] = []
    if (codes.includes('MAT')) linked.push(findLesson(dept9Lessons, 'MAT').id, findLesson(dept10Lessons, 'MAT').id)
    if (codes.includes('PHY')) linked.push(findLesson(dept9Lessons, 'PHY').id, findLesson(dept10Lessons, 'PHY').id)
    if (codes.includes('TUR')) linked.push(findLesson(dept9Lessons, 'TUR').id, findLesson(dept10Lessons, 'TUR').id)
    if (codes.includes('ENG')) linked.push(findLesson(dept9Lessons, 'ENG').id, findLesson(dept10Lessons, 'ENG').id)
    if (codes.includes('HIS')) linked.push(findLesson(dept9Lessons, 'HIS').id, findLesson(dept10Lessons, 'HIS').id)
    if (codes.includes('BIO')) linked.push(findLesson(dept9Lessons, 'BIO').id, findLesson(dept10Lessons, 'BIO').id)
    if (codes.includes('CHE')) linked.push(findLesson(dept9Lessons, 'CHE').id, findLesson(dept10Lessons, 'CHE').id)
    if (codes.includes('ART')) linked.push(findLesson(dept9Lessons, 'ART').id, findLesson(dept10Lessons, 'ART').id)
    if (codes.includes('PE')) linked.push(findLesson(dept9Lessons, 'PE').id, findLesson(dept10Lessons, 'PE').id)
    const row = db
      .insert(teachers)
      .values({ name: v.name, email: v.email, maxWeeklyHours: v.maxWeeklyHours, unavailable: v.unavailable })
      .returning()
      .get()
    const unique = [...new Set(linked)]
    if (unique.length > 0) {
      db.insert(teacherLessons).values(unique.map((lessonId) => ({ teacherId: row.id, lessonId }))).run()
    }
    return row
  })
  void teacherRows

  const schedule = db
    .insert(schedules)
    .values({ name: 'Sample Schedule', createdAt: Date.now() })
    .returning()
    .get()

  // One locked placed entry (9th Grade MAT) to demonstrate a fixed session
  const mat = findLesson(dept9Lessons, 'MAT')
  const entry = db
    .insert(scheduleEntries)
    .values({
      scheduleId: schedule.id,
      days: daysToStr([1, 2, 3, 4, 5]),
      startMinute: 510,
      endMinute: 550,
      teacherId: null,
      locked: 1
    })
    .returning()
    .get()
  db.insert(entryLessons).values({ entryId: entry.id, lessonId: mat.id }).run()

  saveSettings(getSettings())
  return schedule
}
