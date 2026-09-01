import type { LessonFull, MeetingOverride, Occurrence, Term } from './types'

export function isBreakWeek(term: Term, week: number): boolean {
  return term.breakWeeks.includes(week)
}

export function weekStart(term: Term, week: number): Date | null {
  if (!term.startDate) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(term.startDate)
  if (!m) return null
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  base.setDate(base.getDate() + (week - 1) * 7)
  return base
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + n)
  return copy
}

function fmt(locale: string, d: Date): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(d)
}

export function weekLabel(term: Term, week: number, locale: string): string {
  const start = weekStart(term, week)
  if (!start) return `W${String(week).padStart(2, '0')}`
  return `${fmt(locale, start)} – ${fmt(locale, addDays(start, 6))}`
}

export function dayDateLabel(term: Term, week: number, day: number, locale: string): string | null {
  const start = weekStart(term, week)
  if (!start) return null
  return fmt(locale, addDays(start, day - 1))
}

export function occurrencesForWeek(
  lessons: LessonFull[],
  overrides: MeetingOverride[],
  week: number
): Occurrence[] {
  const forWeek = new Map<number, MeetingOverride[]>()
  for (const o of overrides) {
    if (o.week !== week) continue
    const arr = forWeek.get(o.lessonId) ?? []
    arr.push(o)
    forWeek.set(o.lessonId, arr)
  }

  const out: Occurrence[] = []
  for (const l of lessons) {
    const rows = forWeek.get(l.id) ?? []
    for (const m of l.meetings) {
      for (const d of m.days) {
        const o = rows.find((r) => r.kind !== 'extra' && r.fromDay === d)
        if (!o) {
          out.push({
            key: `p:${l.id}:${d}`,
            lessonId: l.id,
            day: d,
            start: m.start,
            end: m.end,
            teacherId: l.teacherId,
            source: { type: 'pattern' },
            extra: false,
            cancelled: false,
            cancelOverrideId: null
          })
        } else if (o.kind === 'cancel') {
          out.push({
            key: `p:${l.id}:${d}`,
            lessonId: l.id,
            day: d,
            start: m.start,
            end: m.end,
            teacherId: l.teacherId,
            source: { type: 'pattern' },
            extra: false,
            cancelled: true,
            cancelOverrideId: o.id
          })
        } else if (o.kind === 'move') {
          out.push({
            key: `o:${o.id}`,
            lessonId: l.id,
            day: o.toDay ?? d,
            start: o.start ?? m.start,
            end: o.end ?? m.end,
            teacherId: o.teacherId ?? l.teacherId,
            source: { type: 'override', overrideId: o.id },
            extra: false,
            cancelled: false,
            cancelOverrideId: null
          })
        }
      }
    }
    for (const o of rows) {
      if (o.kind !== 'extra') continue
      out.push({
        key: `o:${o.id}`,
        lessonId: l.id,
        day: o.toDay ?? 1,
        start: o.start ?? 510,
        end: o.end ?? 570,
        teacherId: o.teacherId ?? l.teacherId,
        source: { type: 'override', overrideId: o.id },
        extra: true,
        cancelled: false,
        cancelOverrideId: null
      })
    }
  }
  return out
}

export function overrideCountByWeek(overrides: MeetingOverride[]): Map<number, number> {
  const map = new Map<number, number>()
  for (const o of overrides) map.set(o.week, (map.get(o.week) ?? 0) + 1)
  return map
}
