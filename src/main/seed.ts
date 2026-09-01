import { getDb } from './db/client'
import { classes, lessons, subjects, teachers, terms } from './db/schema'
import { daysToStr, getSettings, saveSettings, mapTerm } from './ipc/catalog'
import type { Term } from '@shared/types'

export function seedSampleData(): Term {
  const db = getDb()
  const existing = db.select().from(terms).all()
  if (existing.length > 0) {
    throw new Error('Sample data can only be loaded into an empty database')
  }

  const term = db
    .insert(terms)
    .values({ name: '2026-2027 Fall (Sample)', createdAt: Date.now(), weeks: getSettings().defaultWeeks })
    .returning()
    .get()

  const subjectRows = [
    { code: 'MAT', title: 'Mathematics' },
    { code: 'PHY', title: 'Physics' },
    { code: 'TUR', title: 'Turkish' },
    { code: 'ENG', title: 'English' },
    { code: 'HIS', title: 'History' },
    { code: 'BIO', title: 'Biology' },
    { code: 'CHE', title: 'Chemistry' },
    { code: 'ART', title: 'Art' },
    { code: 'PE', title: 'Physical Education' }
  ].map((v) => db.insert(subjects).values({ ...v, termId: term.id }).returning().get())
  const subjectByCode = (code: string) => subjectRows.find((s) => s.code === code)!.id

  const teacherRows = [
    { name: 'Ayşe Yılmaz', email: 'ayse@okul.edu.tr', maxWeeklyHours: 20, unavailable: '[]', subjectIds: ['MAT'] },
    { name: 'Mehmet Demir', email: 'mehmet@okul.edu.tr', maxWeeklyHours: 22, unavailable: '[]', subjectIds: ['MAT', 'PHY'] },
    { name: 'Zeynep Kaya', email: 'zeynep@okul.edu.tr', maxWeeklyHours: 22, unavailable: '[]', subjectIds: ['TUR', 'HIS'] },
    { name: 'Elif Şahin', email: 'elif@okul.edu.tr', maxWeeklyHours: 20, unavailable: JSON.stringify([{ days: [5], start: 780, end: 960 }]), subjectIds: ['ENG', 'TUR', 'HIS'] },
    { name: 'Ahmet Çelik', email: 'ahmetc@okul.edu.tr', maxWeeklyHours: 20, unavailable: '[]', subjectIds: ['HIS', 'ART', 'ENG'] },
    { name: 'Fatma Aydın', email: 'fatma@okul.edu.tr', maxWeeklyHours: 20, unavailable: '[]', subjectIds: ['BIO', 'CHE', 'ART'] },
    { name: 'Can Arslan', email: 'can@okul.edu.tr', maxWeeklyHours: 22, unavailable: '[]', subjectIds: ['PHY', 'CHE', 'BIO', 'MAT'] },
    { name: 'Deniz Koç', email: 'deniz@okul.edu.tr', maxWeeklyHours: 18, unavailable: '[]', subjectIds: ['ENG', 'PE', 'ART'] },
    { name: 'Hatice Özdemir', email: 'hatice@okul.edu.tr', maxWeeklyHours: 20, unavailable: '[]', subjectIds: ['MAT', 'TUR'] },
    { name: 'Burak Yıldız', email: 'burak@okul.edu.tr', maxWeeklyHours: 20, unavailable: '[]', subjectIds: ['PHY', 'BIO', 'CHE', 'PE'] }
  ].map((v) =>
    db
      .insert(teachers)
      .values({
        name: v.name,
        email: v.email,
        maxWeeklyHours: v.maxWeeklyHours,
        unavailable: v.unavailable,
        subjectIds: JSON.stringify(v.subjectIds.map(subjectByCode))
      })
      .returning()
      .get()
  )
  void teacherRows

  interface LessonSeed {
    subject: string
    sessionsPerWeek: number
    durationMinutes: number
    locked?: boolean
    days?: number[]
    start?: number
  }
  interface ClassSeed {
    name: string
    grade: string
    capacity: number
    homeroom: string
    lessons: LessonSeed[]
  }

  const grade9: Record<string, number> = { MAT: 5, TUR: 4, PHY: 3, ENG: 4, HIS: 2, BIO: 2, CHE: 2, ART: 1, PE: 2 }
  const grade10: Record<string, number> = { MAT: 5, TUR: 4, PHY: 3, ENG: 4, HIS: 2, CHE: 3, BIO: 2, ART: 1, PE: 2 }

  const curriculum = (hours: Record<string, number>): LessonSeed[] =>
    Object.entries(hours).map(([subject, sessionsPerWeek]) => ({
      subject,
      sessionsPerWeek,
      durationMinutes: 40
    }))

  const seed: ClassSeed[] = [
    {
      name: '9-A',
      grade: '9',
      capacity: 28,
      homeroom: 'B-201',
      lessons: [
        {
          ...curriculum(grade9)[0],
          locked: true,
          days: [1, 2, 3, 4, 5],
          start: 510
        },
        ...curriculum(grade9).slice(1)
      ]
    },
    { name: '9-B', grade: '9', capacity: 27, homeroom: 'B-202', lessons: curriculum(grade9) },
    { name: '10-A', grade: '10', capacity: 26, homeroom: 'C-101', lessons: curriculum(grade10) },
    { name: '10-B', grade: '10', capacity: 25, homeroom: 'C-102', lessons: curriculum(grade10) }
  ]

  for (const c of seed) {
    const cls = db
      .insert(classes)
      .values({ termId: term.id, name: c.name, grade: c.grade, capacity: c.capacity, homeroom: c.homeroom })
      .returning()
      .get()
    for (const l of c.lessons) {
      db.insert(lessons)
        .values({
          classId: cls.id,
          subjectId: subjectByCode(l.subject),
          sessionsPerWeek: l.sessionsPerWeek,
          durationMinutes: l.durationMinutes,
          teacherId: null,
          locked: l.locked ? 1 : 0,
          days: l.days ? daysToStr(l.days) : '',
          startMinute: l.start ?? null,
          endMinute: l.start !== undefined ? l.start + l.durationMinutes : null
        })
        .run()
    }
  }

  saveSettings(getSettings())
  return mapTerm(term)
}
