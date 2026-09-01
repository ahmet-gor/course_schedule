export const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const DAY_LETTERS = ['', 'M', 'T', 'W', 'R', 'F', 'S', 'U']

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

export function toHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${pad2(h)}:${pad2(m)}`
}

export function fromHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mm = parseInt(m[2], 10)
  if (h > 24 || mm > 59) return null
  return h * 60 + mm
}

export function daysToLabel(days: number[]): string {
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_LETTERS[d] ?? '?')
    .join('')
}

const LETTER_TO_DAY: Record<string, number> = { M: 1, T: 2, W: 3, R: 4, F: 5, S: 6, U: 7 }

export function parseDays(input: string): number[] {
  const s = input.trim().toUpperCase()
  if (!s) return []
  if (/^\d+(,\d+)*$/.test(s)) {
    return s
      .split(',')
      .map((x) => parseInt(x, 10))
      .filter((d) => d >= 1 && d <= 7)
  }
  const days: number[] = []
  for (const ch of s) {
    const d = LETTER_TO_DAY[ch]
    if (d && !days.includes(d)) days.push(d)
  }
  return days
}

export interface Interval {
  start: number
  end: number
}

export function overlap(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end
}

export function gapBetween(a: Interval, b: Interval): number {
  const first = a.start <= b.start ? a : b
  const second = first === a ? b : a
  if (overlap(first, second)) return 0
  return second.start - first.end
}

export function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}
