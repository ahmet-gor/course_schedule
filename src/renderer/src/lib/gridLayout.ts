export interface LaidOutItem<T> {
  item: T
  left: number
  width: number
}

export function layoutDayMeetings<T extends { start: number; end: number }>(items: T[]): LaidOutItem<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const result: LaidOutItem<T>[] = []
  let cluster: { item: T; lane: number }[] = []
  let clusterEnd = -1
  let laneEnds: number[] = []

  const flush = () => {
    if (cluster.length === 0) return
    const lanesCount = Math.max(...cluster.map((c) => c.lane)) + 1
    for (const c of cluster) {
      let span = 1
      for (let l = c.lane + 1; l < lanesCount; l++) {
        const busy = cluster.some(
          (o) => o !== c && o.lane === l && o.item.start < c.item.end && c.item.start < o.item.end
        )
        if (busy) break
        span++
      }
      result.push({
        item: c.item,
        left: (c.lane / lanesCount) * 100,
        width: (span / lanesCount) * 100
      })
    }
    cluster = []
    laneEnds = []
    clusterEnd = -1
  }

  for (const m of sorted) {
    if (cluster.length > 0 && m.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => m.start >= end)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(m.end)
    } else {
      laneEnds[lane] = m.end
    }
    cluster.push({ item: m, lane })
    clusterEnd = Math.max(clusterEnd, m.end)
  }
  flush()

  return result
}
