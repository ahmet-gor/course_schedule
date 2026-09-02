import { useMemo, useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import TimetableGrid, { type DropCandidate, type DropInfo } from '../components/TimetableGrid'
import { Badge, Button, Checkbox, EmptyState, Field, Input, Modal, Select, SelectOption, Tabs, TabsList, TabsTrigger, ToggleGroup, ToggleGroupItem } from '../components/ui'
import { computeConflicts, type CtxEntry } from '@shared/constraints'
import { toHHMM, fromHHMM } from '@shared/time'
import { DAY_LETTERS, useI18n, useT } from '../i18n'
import { conflictsByEntry, entryCode, softScore, toCtxEntries, toGridMeetings } from '../lib/schedule'
import type { EntryFull, LessonRef, ScheduleData } from '@shared/types'

type ViewMode = 'school' | 'department' | 'teacher'

export default function TimetablesPage() {
  const currentScheduleId = useApp((s) => s.currentScheduleId)
  const schedules = useApp((s) => s.schedules)
  const setPage = useApp((s) => s.setPage)
  const toast = useApp((s) => s.toast)
  const t = useT()
  const { locale } = useI18n()
  const [view, setView] = useState<ViewMode>('school')
  const [deptId, setDeptId] = useState<number | null>(null)
  const [teacherId, setTeacherId] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState<EntryFull | null>(null)
  const [blocking, setBlocking] = useState(false)
  const { data, reload } = useAsync(
    () => (currentScheduleId !== null ? window.api.schedule.getData(currentScheduleId) : Promise.resolve(null)),
    [currentScheduleId]
  )

  const scheduleName = schedules.find((s) => s.id === currentScheduleId)?.name

  const placed = useMemo(() => (data?.entries ?? []).filter((e) => e.days.length > 0 && e.lessons.length > 0), [data])
  const conflicts = useMemo(
    () => (data && currentScheduleId !== null ? conflictsByEntry(data, locale, currentScheduleId) : {}),
    [data, locale, currentScheduleId]
  )
  const conflictCount = useMemo(
    () => new Set(Object.entries(conflicts).flatMap(([id, msgs]) => msgs.map((m) => `${id}:${m}`))).size,
    [conflicts]
  )
  const soft = useMemo(() => (data ? softScore(data) : null), [data])

  const visible = useMemo(() => {
    if (!data) return []
    if (view === 'department' && deptId !== null)
      return placed.filter((e) => e.lessons.some((l) => l.departmentId === deptId))
    if (view === 'teacher' && teacherId !== null) return placed.filter((e) => e.teacherId === teacherId)
    return placed
  }, [data, view, deptId, teacherId, placed])

  const unplacedLessons = useMemo(() => {
    if (!data) return []
    const inEntries = new Set(data.entries.flatMap((e) => e.lessonIds))
    return data.lessons.filter((l) => !inEntries.has(l.id))
  }, [data])
  const unplacedBlocks = useMemo(
    () => (data?.entries ?? []).filter((e) => e.days.length === 0 && e.lessons.length > 1),
    [data]
  )

  const selected = data?.entries.find((e) => e.id === selectedId) ?? null

  const validateDrop = (cand: DropCandidate): boolean => {
    if (!data) return true
    const entryId = Number(cand.occKey)
    const entry = data.entries.find((e) => e.id === entryId)
    if (!entry) return true
    const shifted = shiftDays(entry.days, cand.day)
    const candidate: CtxEntry = {
      id: -999,
      departmentIds: entry.lessons.map((l) => l.departmentId),
      lessonIds: entry.lessonIds,
      code: entryCode(entry),
      meetings: [{ days: shifted, start: cand.start, end: cand.end }],
      teacher: null
    }
    const others = toCtxEntries(data, currentScheduleId ?? 0).filter((c) => c.id !== entryId)
    return !computeConflicts([candidate, ...others], data.settings).some(
      (c) => c.lessonId === -999 || (c.withLessonIds?.includes(-999) ?? false)
    )
  }

  const handleDrop = async (drop: DropInfo) => {
    if (!data) return
    const entryId = Number(drop.occKey)
    const entry = data.entries.find((e) => e.id === entryId)
    if (!entry) return
    const days = shiftDays(entry.days, drop.day)
    try {
      await window.api.entries.update(entryId, { days, start: drop.start, end: drop.end })
      reload()
      toast(t('toast.entryMoved'), 'success')
    } catch (err) {
      toast(String(err), 'error')
    }
  }

  if (currentScheduleId === null) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <EmptyState title={t('timetable.noSchedule')} hint={t('timetable.noScheduleHint')} />
      </div>
    )
  }
  if (!data) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  const fallbackTeacher = '—'
  const letters = DAY_LETTERS[locale]

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 bg-card border-b flex items-center gap-3 flex-wrap">
        <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
          <TabsList>
            <TabsTrigger value="school">{t('timetable.school')}</TabsTrigger>
            <TabsTrigger value="department">{t('timetable.byClass')}</TabsTrigger>
            <TabsTrigger value="teacher">{t('timetable.byTeacher')}</TabsTrigger>
          </TabsList>
        </Tabs>
        {view === 'department' && (
          <Select value={deptId === null ? 'all' : String(deptId)} onChange={(v) => setDeptId(v === 'all' ? null : Number(v))}>
            <SelectOption value="all">{t('timetable.selectClass')}</SelectOption>
            {data.departments.map((d) => (
              <SelectOption key={d.id} value={String(d.id)}>
                {d.name}
              </SelectOption>
            ))}
          </Select>
        )}
        {view === 'teacher' && (
          <Select value={teacherId === null ? 'all' : String(teacherId)} onChange={(v) => setTeacherId(v === 'all' ? null : Number(v))}>
            <SelectOption value="all">{t('timetable.selectTeacher')}</SelectOption>
            {data.teachers.map((tc) => (
              <SelectOption key={tc.id} value={String(tc.id)}>
                {tc.name}
              </SelectOption>
            ))}
          </Select>
        )}
        <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
          <Badge tone={conflictCount > 0 ? 'red' : 'green'}>
            {conflictCount > 0 ? t('timetable.conflicts', { count: conflictCount }) : t('timetable.noConflicts')}
          </Badge>
          {soft !== null && <span className="text-xs">{t('timetable.prefScore', { score: Math.round(soft) })}</span>}
          <Button size="sm" onClick={() => setBlocking(true)} disabled={unplacedLessons.length < 2}>
            {t('timetable.addBlock')}
          </Button>
          <Button
            size="sm"
            onClick={() =>
              window.api.io.exportExcel(currentScheduleId).then((p) => p && toast(t('toast.exported', { path: p }), 'success'))
            }
          >
            {t('settings.exportExcel')}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {placed.length === 0 ? (
          <EmptyState title={t('timetable.emptyTitle')} hint={t('timetable.emptyHint')} />
        ) : (
          <TimetableGrid
            meetings={toGridMeetings(visible, fallbackTeacher).map((m) => ({ ...m, occKey: String(m.lessonId) }))}
            dayStart={data.settings.dayStart}
            dayEnd={data.settings.dayEnd}
            conflictsByLesson={conflicts}
            selectedId={selectedId}
            onSelect={(lessonId) => setSelectedId(lessonId)}
            dragEnabled
            snapMinutes={Math.min(data.settings.slotStepMin, 15)}
            onDrop={handleDrop}
            validateDrop={validateDrop}
          />
        )}
      </div>

      {(conflictCount > 0 || selected || unplacedLessons.length > 0 || unplacedBlocks.length > 0) && (
        <div className="border-t bg-card px-5 py-3 max-h-44 overflow-y-auto text-sm">
          {selected && (
            <div className="mb-2 pb-2 border-b">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{entryCode(selected)}</span>
                {selected.lessons.length > 1 && <Badge tone="indigo">{t('timetable.block')}</Badge>}
                {selected.locked && <Badge tone="amber">{t('timetable.locked')}</Badge>}
                <span className="text-muted-foreground">{selected.teacherName ?? fallbackTeacher}</span>
                <Button size="sm" className="ml-auto" onClick={() => setEditing(selected)}>
                  {t('common.edit')}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {selected.days.length > 0 && selected.start !== null && selected.end !== null
                  ? `${selected.days.map((d) => letters[d]).join('')} ${toHHMM(selected.start)}–${toHHMM(selected.end)}`
                  : t('timetable.noMeetings')}
              </div>
              {(conflicts[selected.id] ?? []).map((c) => (
                <div key={c} className="text-xs text-destructive mt-1">⚠ {c}</div>
              ))}
            </div>
          )}
          {(unplacedLessons.length > 0 || unplacedBlocks.length > 0) && (
            <div className="mb-2 pb-2 border-b">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {t('timetable.unplaced', {
                  count: unplacedLessons.length + unplacedBlocks.length
                })}
              </p>
              <div className="flex gap-1 flex-wrap">
                {unplacedLessons.map((l) => (
                  <Badge key={l.id} tone="slate">{l.departmentName}·{l.code}</Badge>
                ))}
                {unplacedBlocks.map((e) => (
                  <Badge key={e.id} tone="indigo">{entryCode(e)}</Badge>
                ))}
              </div>
              <Button size="sm" className="mt-2" onClick={() => setPage('generate')}>
                {t('nav.generate')}
              </Button>
            </div>
          )}
          {Object.entries(conflicts)
            .slice(0, 12)
            .map(([id, msgs]) =>
              msgs.map((m) => (
                <div key={`${id}:${m}`} className="text-xs text-destructive">⚠ {m}</div>
              ))
            )}
        </div>
      )}

      {editing && (
        <EntryEditor
          data={data}
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null)
            reload()
            if (message) toast(message, 'success')
          }}
        />
      )}
      {blocking && (
        <BlockDialog
          scheduleId={currentScheduleId}
          unplaced={unplacedLessons}
          onClose={() => setBlocking(false)}
          onCreated={() => {
            setBlocking(false)
            reload()
            toast(t('toast.blockCreated'), 'success')
          }}
        />
      )}
      <p className="sr-only">{scheduleName}</p>
    </div>
  )
}

function shiftDays(days: number[], targetDay: number): number[] {
  if (days.length === 0) return [targetDay]
  const shift = targetDay - Math.min(...days)
  const shifted = days.map((d) => Math.min(6, d + shift))
  return [...new Set(shifted)].sort((a, b) => a - b)
}

function EntryEditor({
  data,
  entry,
  onClose,
  onSaved
}: {
  data: ScheduleData
  entry: EntryFull
  onClose: () => void
  onSaved: (message?: string) => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const letters = DAY_LETTERS[locale]
  const [days, setDays] = useState<number[]>([...entry.days])
  const [start, setStart] = useState(entry.start !== null ? toHHMM(entry.start) : '09:00')
  const [end, setEnd] = useState(entry.end !== null ? toHHMM(entry.end) : toHHMM((entry.lessons[0]?.durationMinutes ?? 40) + 540))
  const [teacherId, setTeacherId] = useState(entry.teacherId !== null ? String(entry.teacherId) : '')
  const [locked, setLocked] = useState(entry.locked)
  const [busy, setBusy] = useState(false)

  const eligible = data.teachers.filter((tc) => entry.lessonIds.every((lid) => tc.lessonIds.includes(lid)))
  const parsedStart = fromHHMM(start) ?? -1
  const parsedEnd = fromHHMM(end) ?? -1
  const valid = parsedStart >= 0 && parsedEnd > parsedStart

  const save = async () => {
    if (!valid) return
    setBusy(true)
    try {
      await window.api.entries.update(entry.id, {
        days,
        start: days.length > 0 ? parsedStart : null,
        end: days.length > 0 ? parsedEnd : null,
        teacherId: teacherId ? Number(teacherId) : null,
        locked
      })
      onSaved(t('toast.entrySaved'))
    } catch (err) {
      useApp.getState().toast(String(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title={`${entryCode(entry)} · ${t('timetable.editEntry')}`} onClose={onClose}>
      <p className="text-xs text-muted-foreground mb-3">
        {entry.lessons.map((l) => `${l.departmentName}·${l.code} (${l.sessionsPerWeek}×${l.durationMinutes})`).join(' + ')}
        {entry.lessons.length > 1 && <Badge tone="indigo">{t('timetable.block')}</Badge>}
      </p>
      <div className="flex flex-col gap-3">
        <Field label={t('common.day')}>
          <ToggleGroup
            type="multiple"
            variant="outline"
            value={days.map(String)}
            onValueChange={(vals) => setDays(vals.map(Number).sort((a, b) => a - b))}
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
        <Field label={t('teachers.title')} hint={t('teachers.lessonsHint')}>
          <Select value={teacherId || 'any'} onChange={(v) => setTeacherId(v === 'any' ? '' : v)}>
            <SelectOption value="any">—</SelectOption>
            {eligible.map((tc) => (
              <SelectOption key={tc.id} value={String(tc.id)}>
                {tc.name}
              </SelectOption>
            ))}
          </Select>
        </Field>
        <Field label={t('classes.locked')}>
          <div className="flex items-center gap-2 h-[34px]">
            <Checkbox id="entry-locked" checked={locked} onCheckedChange={(v) => setLocked(v === true)} />
            <label htmlFor="entry-locked" className="text-sm text-muted-foreground cursor-pointer">
              {t('timetable.locked')}
            </label>
          </div>
        </Field>
      </div>
      <div className="flex justify-between gap-2 pt-4">
        <Button
          variant="danger"
          onClick={async () => {
            await window.api.entries.remove(entry.id)
            onSaved(t('timetable.entryRemoved'))
          }}
        >
          {entry.lessons.length > 1 ? t('timetable.removeEntryBlock') : t('timetable.entryRemoved')}
        </Button>
        <div className="flex gap-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !valid} onClick={save}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function BlockDialog({
  scheduleId,
  unplaced,
  onClose,
  onCreated
}: {
  scheduleId: number
  unplaced: LessonRef[]
  onClose: () => void
  onCreated: () => void
}) {
  const t = useT()
  const [first, setFirst] = useState<number>(unplaced[0]?.id ?? 0)
  const [second, setSecond] = useState<number>(0)
  const [busy, setBusy] = useState(false)

  const firstLesson = unplaced.find((l) => l.id === first)
  const partners = firstLesson
    ? unplaced.filter(
        (l) =>
          l.id !== firstLesson.id &&
          l.departmentId !== firstLesson.departmentId &&
          l.sessionsPerWeek === firstLesson.sessionsPerWeek &&
          l.durationMinutes === firstLesson.durationMinutes
      )
    : []
  const partner = partners.find((l) => l.id === second) ?? null

  const create = async () => {
    if (!firstLesson || !partner) return
    setBusy(true)
    try {
      await window.api.entries.create(scheduleId, {
        lessonIds: [firstLesson.id, partner.id],
        days: [],
        start: null,
        end: null,
        teacherId: null,
        locked: false
      })
      onCreated()
    } catch (err) {
      useApp.getState().toast(String(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title={t('timetable.addBlock')} onClose={onClose}>
      <p className="text-xs text-muted-foreground mb-3">{t('timetable.blockHint')}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('timetable.blockFirst')}>
          <Select value={String(first)} onChange={(v) => { setFirst(Number(v)); setSecond(0) }}>
            {unplaced.map((l) => (
              <SelectOption key={l.id} value={String(l.id)}>
                {l.departmentName}·{l.code}
              </SelectOption>
            ))}
          </Select>
        </Field>
        <Field label={t('timetable.blockSecond')}>
          <Select value={String(second)} onChange={(v) => setSecond(Number(v))}>
            <SelectOption value="0">—</SelectOption>
            {partners.map((l) => (
              <SelectOption key={l.id} value={String(l.id)}>
                {l.departmentName}·{l.code}
              </SelectOption>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" disabled={busy || !partner} onClick={create}>
          {t('timetable.createBlock')}
        </Button>
      </div>
    </Modal>
  )
}
