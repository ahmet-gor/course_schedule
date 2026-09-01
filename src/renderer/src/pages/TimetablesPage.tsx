import { useCallback, useMemo, useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import TimetableGrid, { type DropCandidate, type DropInfo } from '../components/TimetableGrid'
import { Badge, Button, EmptyState, Field, Input, Modal, Select, SelectOption, Tabs, TabsList, TabsTrigger, ToggleGroup, ToggleGroupItem } from '../components/ui'
import { conflictsBySection, occurrenceCtxSections, occurrenceGridMeetings, toGridMeetings, weekConflicts, weekOccurrences } from '../lib/schedule'
import { computeConflicts, scoreSoft, type CtxSection } from '@shared/constraints'
import { toHHMM, fromHHMM } from '@shared/time'
import { dayDateLabel, isBreakWeek, overrideCountByWeek, weekLabel } from '@shared/weeks'
import { DAY_LETTERS, DAY_SHORT, useI18n, useT } from '../i18n'
import type { MeetingOverride, Occurrence, OverrideInput, ScheduleData, SectionFull } from '@shared/types'

type ViewMode = 'department' | 'room' | 'instructor'

export default function TimetablesPage() {
  const currentTermId = useApp((s) => s.currentTermId)
  const toast = useApp((s) => s.toast)
  const t = useT()
  const { locale } = useI18n()
  const [view, setView] = useState<ViewMode>('department')
  const [roomId, setRoomId] = useState<number | null>(null)
  const [instructorId, setInstructorId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [week, setWeek] = useState<number | null>(null)
  const [editOcc, setEditOcc] = useState<{ occ: Occurrence; section: SectionFull } | null>(null)
  const [addingExtra, setAddingExtra] = useState(false)
  const { data, reload } = useAsync(() => window.api.schedule.getData(currentTermId!), [currentTermId])

  const term = data?.term
  const weekIsBreak = term !== undefined && week !== null && isBreakWeek(term, week)
  const overrideCounts = useMemo(() => (data ? overrideCountByWeek(data.overrides) : new Map<number, number>()), [data])

  const scheduled = useMemo(() => (data?.sections ?? []).filter((s) => s.meetings.length > 0), [data])
  const patternConflicts = useMemo(() => (data ? conflictsBySection(data, locale) : {}), [data, locale])

  const allWeekPairs = useMemo(
    () => (data && week !== null && !weekIsBreak ? weekOccurrences(data, week) : []),
    [data, week, weekIsBreak]
  )
  const weekPairs = useMemo(() => {
    if (view === 'room' && roomId !== null) return allWeekPairs.filter((p) => p.occ.roomId === roomId)
    if (view === 'instructor' && instructorId !== null) return allWeekPairs.filter((p) => p.occ.instructorId === instructorId)
    return allWeekPairs
  }, [allWeekPairs, view, roomId, instructorId])

  const weekConflictMap = useMemo(
    () => (data && allWeekPairs.length >= 0 && week !== null ? weekConflicts(data, allWeekPairs, locale) : {}),
    [data, allWeekPairs, week, locale]
  )
  const conflicts = week === null ? patternConflicts : weekConflictMap
  const conflictCount = useMemo(
    () => new Set(Object.entries(conflicts).flatMap(([id, msgs]) => msgs.map((m) => `${id}:${m}`))).size,
    [conflicts]
  )

  const visible = useMemo(() => {
    if (!data) return []
    if (view === 'room' && roomId !== null) return scheduled.filter((s) => s.roomId === roomId)
    if (view === 'instructor' && instructorId !== null) return scheduled.filter((s) => s.instructorId === instructorId)
    return scheduled
  }, [data, view, roomId, instructorId, scheduled])

  const selected = scheduled.find((s) => s.id === selectedId) ?? null
  const soft = useMemo(
    () =>
      data
        ? week !== null
          ? scoreSoft(occurrenceCtxSections(data, allWeekPairs), data.settings)
          : scoreSoft(
              data.sections
                .filter((s) => s.meetings.length > 0)
                .map((s) => ({
                  id: s.id,
                  courseId: s.courseId,
                  code: `${s.code}-${s.number}`,
                  capacity: s.capacity,
                  meetings: s.meetings,
                  room: s.roomId !== null ? data.rooms.find((r) => r.id === s.roomId) ?? null : null,
                  instructor:
                    s.instructorId !== null ? data.instructors.find((i) => i.id === s.instructorId) ?? null : null
                })),
              data.settings
            )
        : null,
    [data, week, allWeekPairs]
  )

  const validateDrop = useCallback(
    (cand: DropCandidate): boolean => {
      if (!data || week === null) return true
      const pair = allWeekPairs.find((p) => p.occ.key === cand.occKey)
      if (!pair) return true
      const others = occurrenceCtxSections(
        data,
        allWeekPairs.filter((p) => p.occ.key !== cand.occKey && !p.occ.cancelled)
      )
      const room = pair.occ.roomId !== null ? data.rooms.find((r) => r.id === pair.occ.roomId) : undefined
      const ins =
        pair.occ.instructorId !== null ? data.instructors.find((i) => i.id === pair.occ.instructorId) : undefined
      const candidate: CtxSection = {
        id: -999,
        courseId: pair.section.courseId,
        code: `${pair.section.code}-${pair.section.number}`,
        capacity: pair.section.capacity,
        meetings: [{ days: [cand.day], start: cand.start, end: cand.end }],
        room: room ? { id: room.id, name: room.name, capacity: room.capacity, travelGroup: room.travelGroup } : null,
        instructor: ins
          ? { id: ins.id, name: ins.name, maxWeeklyHours: ins.maxWeeklyHours, unavailable: ins.unavailable }
          : null
      }
      return !computeConflicts([candidate, ...others], data.settings).some(
        (c) => c.sectionId === -999 || (c.withSectionIds?.includes(-999) ?? false)
      )
    },
    [data, week, allWeekPairs]
  )

  if (!data || !term) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  const fallbacks = { room: t('sections.unassigned'), instructor: t('sections.any') }
  const letters = DAY_LETTERS[locale]

  const handleSelect = (sectionId: number, occKey?: string) => {
    if (week !== null && occKey) {
      const pair = allWeekPairs.find((p) => p.occ.key === occKey)
      if (pair) {
        setEditOcc(pair)
        return
      }
    }
    setSelectedId(sectionId)
  }

  const handleDrop = async (drop: DropInfo) => {
    if (week === null || weekIsBreak) return
    const pair = allWeekPairs.find((p) => p.occ.key === drop.occKey)
    if (!pair) return
    const duration = pair.occ.end - pair.occ.start
    try {
      if (pair.occ.source.type === 'pattern') {
        const input: OverrideInput = {
          sectionId: pair.section.id,
          week,
          kind: 'move',
          fromDay: pair.occ.day,
          toDay: drop.day,
          start: drop.start,
          end: drop.start + duration,
          roomId: pair.occ.roomId,
          instructorId: pair.occ.instructorId,
          note: ''
        }
        await window.api.overrides.create(input)
      } else {
        await window.api.overrides.update(pair.occ.source.overrideId, {
          toDay: drop.day,
          start: drop.start,
          end: drop.start + duration
        })
      }
      reload()
      toast(
        t('toast.dropped', { day: DAY_SHORT[locale][drop.day] ?? '', time: toHHMM(drop.start) }),
        'success'
      )
    } catch (err) {
      toast(String(err), 'error')
    }
  }

  const weeksList = Array.from({ length: term.weeks }, (_, i) => i + 1)
  const sublabels: Record<number, string> | undefined =
    week !== null
      ? Object.fromEntries(
          [1, 2, 3, 4, 5, 6].flatMap((d) => {
            const label = dayDateLabel(term, week, d, locale)
            return label !== null ? ([[d, label] as [number, string]]) : []
          })
        )
      : undefined

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 bg-card border-b flex items-center gap-3 flex-wrap">
        <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="department">{t('timetable.department')}</TabsTrigger>
            <TabsTrigger value="room">{t('timetable.byRoom')}</TabsTrigger>
            <TabsTrigger value="instructor">{t('timetable.byInstructor')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {view === 'room' && (
          <Select
            value={roomId === null ? 'all' : String(roomId)}
            onChange={(v) => setRoomId(v === 'all' ? null : Number(v))}
          >
            <SelectOption value="all">{t('timetable.selectRoom')}</SelectOption>
            {data.rooms.map((r) => (
              <SelectOption key={r.id} value={String(r.id)}>
                {t('timetable.roomOption', { name: r.name, building: r.building, capacity: r.capacity })}
              </SelectOption>
            ))}
          </Select>
        )}
        {view === 'instructor' && (
          <Select
            value={instructorId === null ? 'all' : String(instructorId)}
            onChange={(v) => setInstructorId(v === 'all' ? null : Number(v))}
          >
            <SelectOption value="all">{t('timetable.selectInstructor')}</SelectOption>
            {data.instructors.map((i) => (
              <SelectOption key={i.id} value={String(i.id)}>
                {i.name}
              </SelectOption>
            ))}
          </Select>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          <Button
            size="sm"
            variant="ghost"
            disabled={week === null || week <= 1}
            onClick={() => setWeek(Math.max(1, (week ?? 1) - 1))}
            aria-label={t('timetable.week.prev')}
          >
            ‹
          </Button>
          <Select
            className="w-60"
            value={week === null ? 'pattern' : String(week)}
            onChange={(v) => setWeek(v === 'pattern' ? null : Number(v))}
          >
            <SelectOption value="pattern">{t('timetable.week.pattern')}</SelectOption>
            {weeksList.map((w) => {
              const isBreak = isBreakWeek(term, w)
              const count = overrideCounts.get(w) ?? 0
              const label = weekLabel(term, w, locale)
              return (
                <SelectOption key={w} value={String(w)} disabled={isBreak}>
                  {`W${String(w).padStart(2, '0')} · ${label}`}
                  {isBreak ? ` · ${t('timetable.week.break')}` : ''}
                  {count > 0 ? ` (${count})` : ''}
                </SelectOption>
              )
            })}
          </Select>
          <Button
            size="sm"
            variant="ghost"
            disabled={week !== null && week <= 1}
            onClick={async () => {
              if (week === null) {
                setWeek(1)
                return
              }
              if (week >= term.weeks) {
                await window.api.terms.update(term.id, { weeks: term.weeks + 1 })
                setWeek(term.weeks + 1)
                reload()
              } else {
                setWeek(week + 1)
              }
            }}
            aria-label={t('timetable.week.next')}
          >
            ›
          </Button>
          {week !== null && !weekIsBreak && (
            <Button size="sm" onClick={() => setAddingExtra(true)}>
              {t('timetable.occ.addExtra')}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground basis-full sm:basis-auto">
          <Badge tone={conflictCount > 0 ? 'red' : 'green'}>
            {conflictCount > 0 ? t('timetable.conflicts', { count: conflictCount }) : t('timetable.noConflicts')}
          </Badge>
          {soft && <span className="text-xs">{t('timetable.prefScore', { score: Math.round(soft.total) })}</span>}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {week !== null && weekIsBreak ? (
          <EmptyState title={t('timetable.week.break')} hint={t('timetable.week.breakNotice')} />
        ) : week !== null ? (
          <TimetableGrid
            meetings={occurrenceGridMeetings(data, weekPairs, fallbacks)}
            dayStart={data.settings.dayStart}
            dayEnd={data.settings.dayEnd}
            conflictsBySection={conflicts}
            selectedId={selectedId}
            onSelect={handleSelect}
            daySublabels={sublabels}
            dragEnabled
            snapMinutes={Math.min(data.settings.slotStepMin, 15)}
            onDrop={handleDrop}
            validateDrop={validateDrop}
          />
        ) : visible.length === 0 ? (
          <EmptyState title={t('timetable.emptyTitle')} hint={t('timetable.emptyHint')} />
        ) : (
          <TimetableGrid
            meetings={toGridMeetings(visible, fallbacks)}
            dayStart={data.settings.dayStart}
            dayEnd={data.settings.dayEnd}
            conflictsBySection={conflicts}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        )}
      </div>

      {(conflictCount > 0 || selected) && (
        <div className="border-t bg-card px-5 py-3 max-h-44 overflow-y-auto text-sm">
          {selected && (
            <div className="mb-2 pb-2 border-b">
              <div className="flex items-center gap-2">
                <span className="font-semibold">
                  {selected.code}-{selected.number}
                </span>
                <span className="text-muted-foreground">{selected.title}</span>
                {selected.locked && <Badge tone="amber">{t('timetable.locked')}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {selected.meetings
                  .map((m) => `${m.days.map((d) => letters[d]).join('')} ${toHHMM(m.start)}–${toHHMM(m.end)}`)
                  .join(' · ') || t('timetable.noMeetings')}{' '}
                · {selected.instructorName ?? fallbacks.instructor} · {selected.roomName ?? fallbacks.room}
              </div>
              {(conflicts[selected.id] ?? []).map((c) => (
                <div key={c} className="text-xs text-destructive mt-1">
                  ⚠ {c}
                </div>
              ))}
            </div>
          )}
          {Object.entries(conflicts)
            .slice(0, 12)
            .map(([id, msgs]) =>
              msgs.map((m) => (
                <div key={`${id}:${m}`} className="text-xs text-destructive">
                  ⚠ {m}
                </div>
              ))
            )}
        </div>
      )}

      {editOcc && (
        <OccurrenceEditor
          data={data}
          week={week!}
          pair={editOcc}
          onClose={() => setEditOcc(null)}
          onSaved={(message) => {
            setEditOcc(null)
            reload()
            if (message) toast(message, 'success')
          }}
        />
      )}
      {addingExtra && (
        <ExtraSessionDialog
          data={data}
          week={week!}
          onClose={() => setAddingExtra(false)}
          onSaved={() => {
            setAddingExtra(false)
            reload()
            toast(t('toast.overrideSaved'), 'success')
          }}
        />
      )}
    </div>
  )
}

function OccurrenceFormFields({
  data,
  day,
  setDay,
  start,
  setStart,
  end,
  setEnd,
  roomId,
  setRoomId,
  instructorId,
  setInstructorId,
  note,
  setNote,
  inheritRoomId,
  inheritInstructorId
}: {
  data: ScheduleData
  day: number
  setDay: (d: number) => void
  start: string
  setStart: (s: string) => void
  end: string
  setEnd: (s: string) => void
  roomId: string
  setRoomId: (v: string) => void
  instructorId: string
  setInstructorId: (v: string) => void
  note: string
  setNote: (v: string) => void
  inheritRoomId: number | null
  inheritInstructorId: number | null
}) {
  const t = useT()
  const { locale } = useI18n()
  const letters = DAY_LETTERS[locale]
  return (
    <div className="flex flex-col gap-3">
      <Field label={t('common.day')}>
        <ToggleGroup
          type="single"
          variant="outline"
          value={String(day)}
          onValueChange={(v) => {
            if (v !== '') setDay(Number(v))
          }}
          className="bg-transparent gap-1"
        >
          {[1, 2, 3, 4, 5, 6].map((d) => (
            <ToggleGroupItem key={d} value={String(d)} className="w-9 h-8 px-0 text-xs font-semibold">
              {letters[d]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('common.start')}>
          <Input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={t('common.end')}>
          <Input type="time" step={300} value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label={t('sections.room')}>
        <Select value={roomId} onChange={setRoomId}>
          <SelectOption value="">{inheritRoomId !== null ? data.rooms.find((r) => r.id === inheritRoomId)?.name ?? '—' : '—'}</SelectOption>
          {data.rooms.map((r) => (
            <SelectOption key={r.id} value={String(r.id)}>
              {r.name} ({r.capacity})
            </SelectOption>
          ))}
        </Select>
      </Field>
      <Field label={t('sections.instructor')}>
        <Select value={instructorId} onChange={setInstructorId}>
          <SelectOption value="">
            {inheritInstructorId !== null ? data.instructors.find((i) => i.id === inheritInstructorId)?.name ?? '—' : '—'}
          </SelectOption>
          {data.instructors.map((i) => (
            <SelectOption key={i.id} value={String(i.id)}>
              {i.name}
            </SelectOption>
          ))}
        </Select>
      </Field>
      <Field label={t('common.note')}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </div>
  )
}

function OccurrenceEditor({
  data,
  week,
  pair,
  onClose,
  onSaved
}: {
  data: ScheduleData
  week: number
  pair: { occ: Occurrence; section: SectionFull }
  onClose: () => void
  onSaved: (message?: string) => void
}) {
  const t = useT()
  const { occ, section } = pair
  const sourceOverrideId = occ.source.type === 'override' ? occ.source.overrideId : null
  const override = sourceOverrideId !== null ? data.overrides.find((o) => o.id === sourceOverrideId) ?? null : null
  const [day, setDay] = useState<number>(occ.day)
  const [start, setStart] = useState(toHHMM(occ.start))
  const [end, setEnd] = useState(toHHMM(occ.end))
  const [roomId, setRoomId] = useState(override?.roomId !== null && override?.roomId !== undefined ? String(override.roomId) : '')
  const [instructorId, setInstructorId] = useState(
    override?.instructorId !== null && override?.instructorId !== undefined ? String(override.instructorId) : ''
  )
  const [note, setNote] = useState(override?.note ?? '')

  const parsedStart = fromHHMM(start) ?? -1
  const parsedEnd = fromHHMM(end) ?? -1
  const valid = parsedStart >= 0 && parsedEnd > parsedStart

  const moveValues = () => ({
    toDay: day,
    start: parsedStart,
    end: parsedEnd,
    roomId: roomId ? Number(roomId) : null,
    instructorId: instructorId ? Number(instructorId) : null,
    note
  })

  const saveMove = async (message: string) => {
    if (!valid) return
    if (override && override.kind !== 'cancel' && occ.source.type === 'override') {
      await window.api.overrides.update(override.id, moveValues())
    } else {
      await window.api.overrides.create({
        sectionId: section.id,
        week,
        kind: 'move',
        fromDay: occ.day,
        ...moveValues()
      })
    }
    onSaved(message)
  }

  const title = `${section.code}-${section.number} · ${t('timetable.occ.editTitle')}`

  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-xs text-muted-foreground mb-3">
        {occ.cancelled || (occ.source.type === 'pattern' && !override)
          ? t('timetable.occ.patternInfo')
          : t('timetable.occ.overrideInfo')}
      </p>
      {occ.cancelled ? (
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (occ.cancelOverrideId !== null) await window.api.overrides.remove(occ.cancelOverrideId)
              onSaved(t('toast.overrideDeleted'))
            }}
          >
            {t('timetable.occ.restore')}
          </Button>
        </div>
      ) : (
        <>
          <OccurrenceFormFields
            data={data}
            day={day}
            setDay={setDay}
            start={start}
            setStart={setStart}
            end={end}
            setEnd={setEnd}
            roomId={roomId}
            setRoomId={setRoomId}
            instructorId={instructorId}
            setInstructorId={setInstructorId}
            note={note}
            setNote={setNote}
            inheritRoomId={section.roomId}
            inheritInstructorId={section.instructorId}
          />
          <div className="flex justify-between gap-2 pt-4">
            <div>
              {occ.source.type === 'override' && sourceOverrideId !== null && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    await window.api.overrides.remove(sourceOverrideId)
                    onSaved(t('toast.overrideDeleted'))
                  }}
                >
                  {occ.extra ? t('timetable.occ.deleteExtra') : t('timetable.occ.restore')}
                </Button>
              )}
              {occ.source.type === 'pattern' && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    await window.api.overrides.create({
                      sectionId: section.id,
                      week,
                      kind: 'cancel',
                      fromDay: occ.day,
                      toDay: null,
                      start: null,
                      end: null,
                      roomId: null,
                      instructorId: null,
                      note: ''
                    })
                    onSaved(t('toast.overrideSaved'))
                  }}
                >
                  {t('timetable.occ.cancelAction')}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={onClose}>{t('common.cancel')}</Button>
              <Button variant="primary" disabled={!valid} onClick={() => saveMove(t('toast.overrideSaved'))}>
                {t('timetable.occ.moveAction')}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  )
}

function ExtraSessionDialog({
  data,
  week,
  onClose,
  onSaved
}: {
  data: ScheduleData
  week: number
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const candidates = data.sections.filter((s) => s.meetings.length > 0)
  const [sectionId, setSectionId] = useState<string>(candidates[0] ? String(candidates[0].id) : '')
  const [day, setDay] = useState(1)
  const [start, setStart] = useState('17:00')
  const [end, setEnd] = useState('18:15')
  const [roomId, setRoomId] = useState('')
  const [instructorId, setInstructorId] = useState('')
  const [note, setNote] = useState('')

  const section = candidates.find((s) => s.id === Number(sectionId))
  const parsedStart = fromHHMM(start) ?? -1
  const parsedEnd = fromHHMM(end) ?? -1
  const valid = !!section && parsedStart >= 0 && parsedEnd > parsedStart

  const save = async () => {
    if (!valid || !section) return
    await window.api.overrides.create({
      sectionId: section.id,
      week,
      kind: 'extra',
      fromDay: null,
      toDay: day,
      start: parsedStart,
      end: parsedEnd,
      roomId: roomId ? Number(roomId) : null,
      instructorId: instructorId ? Number(instructorId) : null,
      note
    })
    onSaved()
  }

  return (
    <Modal title={t('timetable.occ.addTitle')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label={t('sections.course')}>
          <Select value={sectionId} onChange={setSectionId}>
            {candidates.map((s) => (
              <SelectOption key={s.id} value={String(s.id)}>
                {s.code}-{s.number} · {s.title}
              </SelectOption>
            ))}
          </Select>
        </Field>
        <OccurrenceFormFields
          data={data}
          day={day}
          setDay={setDay}
          start={start}
          setStart={setStart}
          end={end}
          setEnd={setEnd}
          roomId={roomId}
          setRoomId={setRoomId}
          instructorId={instructorId}
          setInstructorId={setInstructorId}
          note={note}
          setNote={setNote}
          inheritRoomId={section?.roomId ?? null}
          inheritInstructorId={section?.instructorId ?? null}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!valid} onClick={save}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export type { MeetingOverride }
