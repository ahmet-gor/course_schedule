import { getDb } from './db/client'
import { courses, instructors, meetingTimes, rooms, sections, terms } from './db/schema'
import { daysToStr, getSettings, saveSettings, mapTerm } from './ipc/catalog'
import type { Term } from '@shared/types'

export function seedSampleData(): Term {
  const db = getDb()
  const existing = db.select().from(terms).all()
  if (existing.length > 0) {
    throw new Error('Sample data can only be loaded into an empty database')
  }

  const term = db.insert(terms).values({ name: 'Fall 2026 (Sample)', createdAt: Date.now() }).returning().get()

  const ins = [
    { name: 'Dr. Ada Lovelace', email: 'ada@uni.edu', maxWeeklyHours: 9, unavailable: JSON.stringify([{ days: [1], start: 480, end: 720 }]) },
    { name: 'Dr. Alan Turing', email: 'alan@uni.edu', maxWeeklyHours: 12, unavailable: '[]' },
    { name: 'Dr. Grace Hopper', email: 'grace@uni.edu', maxWeeklyHours: 12, unavailable: JSON.stringify([{ days: [5], start: 900, end: 1260 }]) },
    { name: 'Dr. Edsger Dijkstra', email: 'edsger@uni.edu', maxWeeklyHours: 10, unavailable: '[]' },
    { name: 'Dr. Barbara Liskov', email: 'barbara@uni.edu', maxWeeklyHours: 12, unavailable: '[]' },
    { name: 'Dr. Donald Knuth', email: 'donald@uni.edu', maxWeeklyHours: 6, unavailable: '[]' }
  ].map((v) => db.insert(instructors).values(v).returning().get())
  const insByName = (name: string) => ins.find((i) => i.name === name)!.id

  const rms = [
    { name: 'CS-101', building: 'CS Building', capacity: 40, travelGroup: 'A' },
    { name: 'CS-210', building: 'CS Building', capacity: 60, travelGroup: 'A' },
    { name: 'CS-315', building: 'CS Building', capacity: 35, travelGroup: 'A' },
    { name: 'NH-240', building: 'North Hall', capacity: 110, travelGroup: 'B' },
    { name: 'NH-110', building: 'North Hall', capacity: 45, travelGroup: 'B' }
  ].map((v) => db.insert(rooms).values(v).returning().get())
  const roomByName = (name: string) => rms.find((r) => r.name === name)!.id

  const settings = getSettings()
  saveSettings({ ...settings, travelMinutes: { ...settings.travelMinutes, 'A|B': 12 } })

  interface SectionSeed {
    number: string
    capacity: number
    sessionsPerWeek: number
    durationMinutes: number
    instructor?: string
    room?: string
    locked?: boolean
    meetings?: { days: number[]; start: number; end: number }[]
  }
  interface CourseSeed {
    code: string
    title: string
    credits: number
    sections: SectionSeed[]
  }

  const seed: CourseSeed[] = [
    {
      code: 'CSE101',
      title: 'Introduction to Computer Science',
      credits: 4,
      sections: [
        {
          number: 'A',
          capacity: 38,
          sessionsPerWeek: 3,
          durationMinutes: 50,
          instructor: 'Dr. Alan Turing',
          room: 'CS-101',
          locked: true,
          meetings: [{ days: [1, 3, 5], start: 540, end: 590 }]
        },
        { number: 'B', capacity: 38, sessionsPerWeek: 3, durationMinutes: 50, instructor: 'Dr. Alan Turing' },
        { number: 'C', capacity: 38, sessionsPerWeek: 3, durationMinutes: 50, instructor: 'Dr. Grace Hopper' },
        { number: 'D', capacity: 32, sessionsPerWeek: 3, durationMinutes: 50 }
      ]
    },
    {
      code: 'CSE201',
      title: 'Data Structures',
      credits: 4,
      sections: [
        {
          number: 'A',
          capacity: 55,
          sessionsPerWeek: 2,
          durationMinutes: 75,
          instructor: 'Dr. Barbara Liskov',
          room: 'CS-210',
          meetings: [{ days: [2, 4], start: 600, end: 675 }]
        },
        { number: 'B', capacity: 55, sessionsPerWeek: 2, durationMinutes: 75, instructor: 'Dr. Barbara Liskov' },
        { number: 'C', capacity: 50, sessionsPerWeek: 2, durationMinutes: 75 }
      ]
    },
    {
      code: 'CSE202',
      title: 'Discrete Mathematics',
      credits: 3,
      sections: [
        {
          number: 'A',
          capacity: 100,
          sessionsPerWeek: 2,
          durationMinutes: 75,
          instructor: 'Dr. Donald Knuth',
          room: 'NH-240',
          meetings: [{ days: [1, 3], start: 840, end: 915 }]
        },
        { number: 'B', capacity: 100, sessionsPerWeek: 2, durationMinutes: 75, instructor: 'Dr. Donald Knuth' }
      ]
    },
    {
      code: 'CSE301',
      title: 'Operating Systems',
      credits: 3,
      sections: [
        { number: 'A', capacity: 45, sessionsPerWeek: 2, durationMinutes: 75, instructor: 'Dr. Edsger Dijkstra' },
        { number: 'B', capacity: 45, sessionsPerWeek: 2, durationMinutes: 75, instructor: 'Dr. Edsger Dijkstra' }
      ]
    },
    {
      code: 'CSE310',
      title: 'Database Systems',
      credits: 3,
      sections: [{ number: 'A', capacity: 100, sessionsPerWeek: 2, durationMinutes: 75, instructor: 'Dr. Ada Lovelace' }]
    },
    {
      code: 'CSE491',
      title: 'Senior Seminar',
      credits: 1,
      sections: [{ number: 'A', capacity: 25, sessionsPerWeek: 1, durationMinutes: 110, instructor: 'Dr. Grace Hopper' }]
    },
    {
      code: 'MAT210',
      title: 'Linear Algebra',
      credits: 3,
      sections: [
        { number: 'A', capacity: 40, sessionsPerWeek: 3, durationMinutes: 50, instructor: 'Dr. Ada Lovelace' },
        { number: 'B', capacity: 40, sessionsPerWeek: 3, durationMinutes: 50 }
      ]
    },
    {
      code: 'MAT211',
      title: 'Statistics',
      credits: 3,
      sections: [
        {
          number: 'A',
          capacity: 40,
          sessionsPerWeek: 2,
          durationMinutes: 75,
          room: 'CS-315',
          meetings: [{ days: [2, 4], start: 840, end: 915 }]
        },
        { number: 'B', capacity: 35, sessionsPerWeek: 2, durationMinutes: 75 }
      ]
    }
  ]

  for (const c of seed) {
    const course = db.insert(courses).values({ termId: term.id, code: c.code, title: c.title, credits: c.credits }).returning().get()
    for (const s of c.sections) {
      const section = db
        .insert(sections)
        .values({
          courseId: course.id,
          number: s.number,
          capacity: s.capacity,
          sessionsPerWeek: s.sessionsPerWeek,
          durationMinutes: s.durationMinutes,
          instructorId: s.instructor ? insByName(s.instructor) : null,
          roomId: s.room ? roomByName(s.room) : null,
          locked: s.locked ? 1 : 0
        })
        .returning()
        .get()
      for (const m of s.meetings ?? []) {
        db.insert(meetingTimes)
          .values({ sectionId: section.id, days: daysToStr(m.days), startMinute: m.start, endMinute: m.end })
          .run()
      }
    }
  }

  return mapTerm(term)
}
