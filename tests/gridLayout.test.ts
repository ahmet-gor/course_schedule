import { describe, expect, it } from 'vitest'
import { layoutDayMeetings } from '@renderer/lib/gridLayout'

interface Block {
  id: string
  start: number
  end: number
}

const byId = (laid: ReturnType<typeof layoutDayMeetings<Block>>) =>
  Object.fromEntries(laid.map((l) => [l.item.id, { left: l.left, width: l.width }]))

describe('layoutDayMeetings', () => {
  it('gives a single block full width', () => {
    const laid = layoutDayMeetings<Block>([{ id: 'a', start: 540, end: 615 }])
    expect(byId(laid).a).toEqual({ left: 0, width: 100 })
  })

  it('splits width only between overlapping blocks', () => {
    const laid = layoutDayMeetings<Block>([
      { id: 'a', start: 540, end: 615 },
      { id: 'b', start: 570, end: 645 }
    ])
    const pos = byId(laid)
    expect(pos.a.width).toBeCloseTo(50)
    expect(pos.b.width).toBeCloseTo(50)
    expect(pos.a.left).toBe(0)
    expect(pos.b.left).toBeCloseTo(50)
  })

  it('keeps non-overlapping blocks full width in the same day', () => {
    const laid = layoutDayMeetings<Block>([
      { id: 'a', start: 540, end: 615 },
      { id: 'b', start: 570, end: 645 },
      { id: 'later', start: 840, end: 915 }
    ])
    const pos = byId(laid)
    expect(pos.a.width).toBeCloseTo(50)
    expect(pos.b.width).toBeCloseTo(50)
    expect(pos.later).toEqual({ left: 0, width: 100 })
  })

  it('splits back-to-back blocks into separate clusters', () => {
    const laid = layoutDayMeetings<Block>([
      { id: 'a', start: 540, end: 615 },
      { id: 'b', start: 615, end: 690 }
    ])
    const pos = byId(laid)
    expect(pos.a.width).toBe(100)
    expect(pos.b.width).toBe(100)
  })

  it('handles a chain of pairwise overlaps with two lanes', () => {
    const laid = layoutDayMeetings<Block>([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 30, end: 90 },
      { id: 'c', start: 60, end: 120 }
    ])
    const pos = byId(laid)
    expect(pos.a.width).toBeCloseTo(50)
    expect(pos.b.width).toBeCloseTo(50)
    expect(pos.c.width).toBeCloseTo(50)
    expect(pos.a.left).toBe(0)
    expect(pos.c.left).toBe(0)
  })

  it('gives three concurrent blocks a third of the width each', () => {
    const laid = layoutDayMeetings<Block>([
      { id: 'a', start: 0, end: 30 },
      { id: 'b', start: 0, end: 30 },
      { id: 'c', start: 15, end: 45 }
    ])
    const pos = byId(laid)
    expect(pos.a.width).toBeCloseTo(100 / 3)
    expect(pos.b.width).toBeCloseTo(100 / 3)
    expect(pos.c.width).toBeCloseTo(100 / 3)
  })

  it('lets a block span into free adjacent lanes', () => {
    const laid = layoutDayMeetings<Block>([
      { id: 'a', start: 0, end: 20 },
      { id: 'b', start: 0, end: 20 },
      { id: 'c', start: 10, end: 30 },
      { id: 'd', start: 25, end: 40 }
    ])
    const pos = byId(laid)
    expect(pos.a.width).toBeCloseTo(100 / 3)
    expect(pos.b.width).toBeCloseTo(100 / 3)
    expect(pos.c.width).toBeCloseTo(100 / 3)
    expect(pos.d.width).toBeCloseTo((2 / 3) * 100)
    expect(pos.d.left).toBe(0)
  })

  it('sorts unsorted input chronologically', () => {
    const laid = layoutDayMeetings<Block>([
      { id: 'late', start: 800, end: 900 },
      { id: 'early', start: 500, end: 600 }
    ])
    expect(laid.map((l) => l.item.id)).toEqual(['early', 'late'])
    expect(byId(laid).early.width).toBe(100)
    expect(byId(laid).late.width).toBe(100)
  })
})
