import { describe, expect, it } from 'vitest'
import { daysToLabel, fromHHMM, gapBetween, overlap, parseDays, toHHMM } from '@shared/time'

describe('time utils', () => {
  it('formats minutes as HH:MM', () => {
    expect(toHHMM(0)).toBe('00:00')
    expect(toHHMM(540)).toBe('09:00')
    expect(toHHMM(755)).toBe('12:35')
  })

  it('parses HH:MM into minutes', () => {
    expect(fromHHMM('09:00')).toBe(540)
    expect(fromHHMM('12:35')).toBe(755)
    expect(fromHHMM('9:5')).toBeNull()
    expect(fromHHMM('25:00')).toBeNull()
  })

  it('labels day sets', () => {
    expect(daysToLabel([1, 3, 5])).toBe('MWF')
    expect(daysToLabel([2, 4])).toBe('TR')
    expect(daysToLabel([6])).toBe('S')
  })

  it('parses day strings in both formats', () => {
    expect(parseDays('MWF')).toEqual([1, 3, 5])
    expect(parseDays('1,3,5')).toEqual([1, 3, 5])
    expect(parseDays('tr')).toEqual([2, 4])
    expect(parseDays('')).toEqual([])
  })

  it('detects overlap and gaps', () => {
    expect(overlap({ start: 540, end: 600 }, { start: 590, end: 650 })).toBe(true)
    expect(overlap({ start: 540, end: 600 }, { start: 600, end: 650 })).toBe(false)
    expect(gapBetween({ start: 540, end: 600 }, { start: 615, end: 650 })).toBe(15)
    expect(gapBetween({ start: 540, end: 600 }, { start: 550, end: 650 })).toBe(0)
  })
})
