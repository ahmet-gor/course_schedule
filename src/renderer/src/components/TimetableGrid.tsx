import { useEffect, useMemo, useRef, useState } from 'react'
import { hashString, toHHMM } from '@shared/time'
import { DAY_SHORT, useI18n } from '../i18n'
import { layoutDayMeetings } from '../lib/gridLayout'

export interface GridMeeting {
  lessonId: number
  occKey?: string
  label: string
  title: string
  days: number[]
  start: number
  end: number
  teacherLabel: string
  classLabel: string
  subjectCode: string
  dimmed?: boolean
  cancelled?: boolean
  badge?: 'moved' | 'extra' | 'cancelled'
}

export interface DropInfo {
  occKey: string
  lessonId: number
  day: number
  start: number
  end: number
}

export interface DropCandidate {
  occKey: string
  lessonId: number
  day: number
  start: number
  end: number
}

const PX_PER_MIN = 64 / 60
const BADGE_CHAR: Record<string, string> = { moved: '⤴', extra: '＋', cancelled: '✕' }
const DRAG_THRESHOLD_PX = 5

interface DragState {
  message: string
  occKey: string
  lessonId: number
  subjectCode: string
  hue: number
  duration: number
  rect: { width: number; height: number }
  x0: number
  y0: number
  x: number
  y: number
  day: number
  start: number
  over: boolean
  valid: boolean
  moved: boolean
}

export default function TimetableGrid({
  meetings,
  dayStart,
  dayEnd,
  conflictsByLesson,
  selectedId,
  onSelect,
  daySublabels,
  dragEnabled = false,
  snapMinutes = 5,
  onDrop,
  validateDrop
}: {
  meetings: GridMeeting[]
  dayStart: number
  dayEnd: number
  conflictsByLesson?: Record<number, string[]>
  selectedId?: number | null
  onSelect?: (lessonId: number, occKey?: string) => void
  daySublabels?: Record<number, string>
  dragEnabled?: boolean
  snapMinutes?: number
  onDrop?: (drop: DropInfo) => void
  validateDrop?: (candidate: DropCandidate) => boolean
}) {
  const { locale } = useI18n()
  const dayShort = DAY_SHORT[locale]
  const columnRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  dragRef.current = drag
  const justDraggedAt = useRef(0)
  const [popLessonId, setPopLessonId] = useState<number | null>(null)

  const days = useMemo(() => {
    const present = new Set<number>()
    for (const m of meetings) m.days.forEach((d) => present.add(d))
    const base = [1, 2, 3, 4, 5, 6]
    return base.filter((d) => present.size <= 0 || present.has(d) || d <= 5)
  }, [meetings])

  const height = (dayEnd - dayStart) * PX_PER_MIN
  const hours: number[] = []
  for (let t = dayStart; t <= dayEnd; t += 60) hours.push(t)

  const byDay = useMemo(() => {
    const map = new Map<number, { m: GridMeeting; left: number; width: number }[]>()
    for (const d of days) {
      const dayMeetings = meetings.filter((m) => m.days.includes(d))
      const laid = layoutDayMeetings(dayMeetings)
      map.set(d, laid.map(({ item, left, width }) => ({ m: item, left, width })))
    }
    return map
  }, [meetings, days])

  const hitTest = (x: number, y: number): { day: number; start: number } | null => {
    for (const [day, el] of columnRefs.current.entries()) {
      const rect = el.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right) {
        const rel = y - rect.top
        const raw = dayStart + rel / PX_PER_MIN
        const snapped = Math.round(raw / snapMinutes) * snapMinutes
        const duration = dragRef.current?.duration ?? 60
        const start = Math.min(Math.max(snapped, dayStart), dayEnd - duration)
        return { day, start }
      }
    }
    return null
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const hit = hitTest(e.clientX, e.clientY)
      setDrag((d) => {
        if (!d) return d
        const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0)
        const moved = d.moved || dist > DRAG_THRESHOLD_PX
        if (!moved) return d
        const day = hit?.day ?? d.day
        const start = hit?.start ?? d.start
        const end = start + d.duration
        let valid = d.valid
        if (hit) {
          valid = validateDrop
            ? validateDrop({ occKey: d.occKey, lessonId: d.lessonId, day, start, end })
            : true
        }
        return { ...d, x: e.clientX, y: e.clientY, day, start, over: !!hit, valid, moved }
      })
    }
    const onUp = () => {
      const d = dragRef.current
      setDrag(null)
      if (!d || !d.moved) return
      justDraggedAt.current = Date.now()
      if (!d.over || !onDrop) return
      setPopLessonId(d.lessonId)
      setTimeout(() => setPopLessonId(null), 400)
      onDrop({
        occKey: d.occKey,
        lessonId: d.lessonId,
        day: d.day,
        start: d.start,
        end: d.start + d.duration
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null, onDrop, validateDrop])

  const beginDrag = (e: React.PointerEvent, m: GridMeeting) => {
    if (!dragEnabled || m.cancelled || !m.occKey) return
    if (e.button !== 0) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDrag({
      message: m.label,
      occKey: m.occKey,
      lessonId: m.lessonId,
      subjectCode: m.subjectCode,
      hue: hashString(m.subjectCode) % 360,
      duration: m.end - m.start,
      rect: { width: rect.width, height: rect.height },
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      day: m.days[0],
      start: m.start,
      over: true,
      valid: true,
      moved: false
    })
  }

  const swallowClick = () => Date.now() - justDraggedAt.current < 250
  const dragging = drag?.moved === true

  return (
    <div className="flex overflow-auto bg-card rounded-lg border">
      <div className="w-14 shrink-0 border-r" style={{ paddingTop: 28 }}>
        {hours.map((h) => (
          <div
            key={h}
            className="relative text-[10px] text-muted-foreground text-right pr-1.5"
            style={{ height: 60 * PX_PER_MIN }}
          >
            <span className="absolute -top-1.5 right-1.5">{h % 60 === 0 ? toHHMM(h) : ''}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-1">
        {days.map((d) => {
          const colActive = dragging && drag.day === d && drag.over
          return (
            <div key={d} className="flex-1 min-w-[120px] border-r border-border/60 last:border-r-0 flex flex-col">
              <div className="h-7 flex flex-col items-center justify-center text-xs font-semibold text-muted-foreground border-b sticky top-0 bg-card z-10 leading-none">
                <span>
                  {dayShort[d]}
                  {daySublabels?.[d] && <span className="ml-1 font-normal text-muted-foreground/70">{daySublabels[d]}</span>}
                </span>
              </div>
              <div
                className={`relative transition-colors duration-150 motion-reduce:transition-none ${
                  dragEnabled ? 'cursor-grab' : ''
                } ${colActive ? 'bg-primary/[0.05]' : ''}`}
                style={{ height }}
                ref={(el) => {
                  if (el) columnRefs.current.set(d, el)
                  else columnRefs.current.delete(d)
                }}
              >
                {hours.slice(0, -1).map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: (h - dayStart) * PX_PER_MIN }}
                  />
                ))}
                {colActive && (
                  <div
                    className="grid-drop-placeholder absolute inset-x-1 rounded-md border-2 border-dashed pointer-events-none z-20 flex items-start justify-center transition-[top,height] duration-[120ms] ease-out motion-reduce:transition-none"
                    style={{
                      top: (drag.start - dayStart) * PX_PER_MIN,
                      height: Math.max(drag.duration * PX_PER_MIN - 2, 18),
                      backgroundColor: drag.valid
                        ? `hsl(${drag.hue} 70% 60% / 0.14)`
                        : 'hsl(2 70% 55% / 0.15)',
                      borderColor: drag.valid ? `hsl(${drag.hue} 50% 55% / 0.7)` : 'hsl(2 65% 50% / 0.8)'
                    }}
                  >
                    <span
                      className="text-[10px] font-semibold mt-0.5 px-1 rounded"
                      style={{ color: drag.valid ? `hsl(${drag.hue} 45% 35%)` : 'hsl(2 60% 35%)' }}
                    >
                      {toHHMM(drag.start)}–{toHHMM(drag.start + drag.duration)}
                    </span>
                  </div>
                )}
                {(byDay.get(d) ?? []).map(({ m, left, width }) => {
                  const hue = hashString(m.subjectCode) % 360
                  const hasConflict = (conflictsByLesson?.[m.lessonId] ?? []).length > 0
                  const isDragSource = dragging && drag.occKey === m.occKey
                  return (
                    <button
                      key={`${m.lessonId}-${m.occKey ?? d}`}
                      onPointerDown={(e) => beginDrag(e, m)}
                      onClick={() => {
                        if (swallowClick()) return
                        onSelect?.(m.lessonId, m.occKey)
                      }}
                      title={`${m.label} ${toHHMM(m.start)}-${toHHMM(m.end)}\n${m.title}\n${m.teacherLabel}${
                        hasConflict ? '\n' + conflictsByLesson![m.lessonId].join('; ') : ''
                      }`}
                      className={`absolute rounded-md border overflow-hidden text-left px-1.5 py-1 hover:shadow-md select-none touch-none transition-[opacity,transform,box-shadow] duration-150 motion-reduce:transition-none ${
                        m.cancelled ? 'border-dashed' : ''
                      } ${popLessonId === m.lessonId ? 'grid-pop' : ''} ${
                        selectedId === m.lessonId ? 'ring-2 ring-offset-1 ring-primary z-10' : ''
                      } ${dragEnabled && !m.cancelled ? 'cursor-grab active:cursor-grabbing' : ''}`}
                      style={{
                        top: (m.start - dayStart) * PX_PER_MIN,
                        height: Math.max((m.end - m.start) * PX_PER_MIN - 2, 18),
                        left: `calc(${left}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                        backgroundColor: hasConflict
                          ? 'hsl(2 80% 92%)'
                          : m.cancelled
                            ? `hsl(${hue} 15% 88%)`
                            : `hsl(${hue} 65% ${m.dimmed ? 96 : 92}%)`,
                        borderColor: hasConflict
                          ? 'hsl(2 60% 55%)'
                          : m.cancelled
                            ? `hsl(${hue} 15% 55%)`
                            : `hsl(${hue} 45% ${m.dimmed ? 80 : 62}%)`,
                        color: hasConflict ? 'hsl(2 55% 35%)' : `hsl(${hue} 40% ${m.dimmed ? 55 : 30}%)`,
                        opacity: isDragSource
                          ? 0.35
                          : m.cancelled
                            ? 0.45
                            : m.dimmed
                              ? 0.8
                              : undefined,
                        transform: isDragSource ? 'scale(0.96)' : undefined,
                        borderStyle: isDragSource ? 'dashed' : undefined,
                        textDecoration: m.cancelled ? 'line-through' : undefined
                      }}
                    >
                      <div className="text-[11px] font-semibold leading-tight truncate">
                        {m.badge && <span className="mr-0.5">{BADGE_CHAR[m.badge]}</span>}
                        {m.label}
                      </div>
                      {(m.end - m.start) * PX_PER_MIN > 30 && (
                        <div className="text-[10px] leading-tight truncate opacity-80">
                          {toHHMM(m.start)}–{toHHMM(m.end)}
                        </div>
                      )}
                      {(m.end - m.start) * PX_PER_MIN > 48 && (
                        <div className="text-[10px] leading-tight truncate opacity-80">{m.teacherLabel}</div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {dragging && (
        <div
          className="grid-drag-ghost fixed left-0 top-0 z-[100] pointer-events-none rounded-md border shadow-2xl px-1.5 py-1 select-none"
          style={{
            width: Math.max(drag.rect.width, 130),
            height: Math.max(drag.rect.height, 22),
            transform: `translate3d(${drag.x - Math.max(drag.rect.width, 130) / 2}px, ${drag.y - 22}px, 0) rotate(2deg) scale(1.03)`,
            backgroundColor: drag.over
              ? drag.valid
                ? `hsl(${drag.hue} 65% 90%)`
                : 'hsl(2 75% 92%)'
              : 'hsl(0 0% 92%)',
            borderColor: drag.over ? (drag.valid ? `hsl(${drag.hue} 45% 60%)` : 'hsl(2 60% 50%)') : 'hsl(0 0% 65%)',
            color: drag.over ? (drag.valid ? `hsl(${drag.hue} 40% 30%)` : 'hsl(2 55% 35%)') : 'hsl(0 0% 45%)',
            opacity: 0.95,
            transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease'
          }}
        >
          <div className="text-[11px] font-semibold leading-tight truncate">
            {drag.message} · {dayShort[drag.day]} {toHHMM(drag.start)}–{toHHMM(drag.start + drag.duration)}
          </div>
        </div>
      )}
    </div>
  )
}
