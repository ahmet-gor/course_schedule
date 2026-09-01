import { useMemo, useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import { Badge, Button, Checkbox, ConfirmDialog, EmptyState, Field, Input, Modal, Select, SelectOption, ToggleGroup, ToggleGroupItem } from '../components/ui'
import { conflictsBySection } from '../lib/schedule'
import { computeConflicts, type CtxSection } from '@shared/constraints'
import { toHHMM, fromHHMM } from '@shared/time'
import { DAY_LETTERS, conflictText, labelDays, useI18n, useT } from '../i18n'
import type { Course, ScheduleData, SectionFull } from '@shared/types'

interface MeetingDraft {
  days: number[]
  start: string
  end: string
}

export default function SectionsPage() {
  const currentTermId = useApp((s) => s.currentTermId)
  const toast = useApp((s) => s.toast)
  const t = useT()
  const { locale } = useI18n()
  const { data, reload } = useAsync(() => window.api.schedule.getData(currentTermId!), [currentTermId])
  const { data: courseList } = useAsync(() => window.api.courses.list(currentTermId!), [currentTermId])
  const [editing, setEditing] = useState<SectionFull | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState<SectionFull | null>(null)

  const conflicts = useMemo(() => (data ? conflictsBySection(data, locale) : {}), [data, locale])
  const sections = useMemo(() => data?.sections ?? [], [data])
  const scheduledCount = sections.filter((s) => s.meetings.length > 0).length

  if (!data) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 bg-card border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold">{t('sections.title')}</h1>
          <span className="text-sm text-muted-foreground">
            {t('sections.counts', {
              total: sections.length,
              scheduled: scheduledCount,
              remaining: sections.length - scheduledCount
            })}
          </span>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          {t('sections.new')}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {sections.length === 0 ? (
          <EmptyState title={t('sections.empty')} hint={t('sections.emptyHint')} />
        ) : (
          <table className="w-full bg-card rounded-lg border text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('sections.col.section')}</th>
                <th className="px-4 py-2.5 font-medium">{t('sections.col.meetings')}</th>
                <th className="px-4 py-2.5 font-medium">{t('sections.col.instructor')}</th>
                <th className="px-4 py-2.5 font-medium">{t('sections.col.room')}</th>
                <th className="px-4 py-2.5 font-medium">{t('sections.col.cap')}</th>
                <th className="px-4 py-2.5 font-medium">{t('sections.col.pattern')}</th>
                <th className="px-4 py-2.5 font-medium">{t('sections.col.status')}</th>
                <th className="px-4 py-2.5 font-medium w-64"></th>
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => {
                const msgs = conflicts[s.id] ?? []
                return (
                  <tr key={s.id} className={`border-t hover:bg-muted/40 ${msgs.length > 0 ? 'bg-destructive/5' : ''}`}>
                    <td className="px-4 py-2.5 font-mono font-semibold whitespace-nowrap">
                      {s.code}-{s.number}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.meetings.length > 0 ? (
                        s.meetings
                          .map((m) => `${labelDays(m.days, locale)} ${toHHMM(m.start)}–${toHHMM(m.end)}`)
                          .join(' · ')
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {msgs.length > 0 && <div className="text-xs text-destructive mt-0.5">⚠ {msgs[0]}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.instructorName ?? <span className="text-muted-foreground">{t('sections.any')}</span>}
                    </td>
                    <td className="px-4 py-2.5">{s.roomName ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-2.5">{s.capacity}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {t('sections.pattern', { count: s.sessionsPerWeek, minutes: s.durationMinutes })}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.locked ? (
                        <Badge tone="amber">{t('sections.locked')}</Badge>
                      ) : s.meetings.length > 0 ? (
                        <Badge tone="green">{t('sections.scheduled')}</Badge>
                      ) : (
                        <Badge tone="slate">{t('sections.unscheduled')}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                      <Button size="sm" onClick={() => setEditing(s)}>{t('common.edit')}</Button>
                      {s.meetings.length > 0 && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            await window.api.schedule.unschedule([s.id])
                            reload()
                            toast(t('toast.sectionCleared', { code: s.code, number: s.number }), 'success')
                          }}
                        >
                          {t('common.clear')}
                        </Button>
                      )}
                      <Button
                        variant="danger" size="sm"
                        onClick={() => setConfirming(s)}
                      >
                        {t('common.delete')}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title={t('common.confirmTitle')}
          description={t('section.confirmDelete', { code: confirming.code, number: confirming.number })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            await window.api.sections.remove(confirming.id)
            setConfirming(null)
            reload()
            toast(t('section.deleted'), 'success')
          }}
        />
      )}
      {(creating || editing) && courseList && (
        <SectionDialog
          data={data}
          courses={courseList}
          section={editing}
          onDone={(message) => {
            setCreating(false)
            setEditing(null)
            reload()
            if (message) toast(message, 'success')
          }}
        />
      )}
    </div>
  )
}

function SectionDialog({
  data,
  courses,
  section,
  onDone
}: {
  data: ScheduleData
  courses: Course[]
  section: SectionFull | null
  onDone: (message?: string) => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const letters = DAY_LETTERS[locale]
  const [courseId, setCourseId] = useState<number>(section?.courseId ?? courses[0]?.id ?? 0)
  const [number, setNumber] = useState(section?.number ?? 'A')
  const [capacity, setCapacity] = useState(String(section?.capacity ?? 30))
  const [sessionsPerWeek, setSessionsPerWeek] = useState(String(section?.sessionsPerWeek ?? 2))
  const [durationMinutes, setDurationMinutes] = useState(String(section?.durationMinutes ?? 75))
  const [instructorId, setInstructorId] = useState<string>(section?.instructorId !== null ? String(section?.instructorId) : '')
  const [roomId, setRoomId] = useState<string>(section?.roomId !== null ? String(section?.roomId) : '')
  const [locked, setLocked] = useState(section?.locked ?? false)
  const [meetings, setMeetings] = useState<MeetingDraft[]>(
    (section?.meetings ?? []).map((m) => ({ days: [...m.days], start: toHHMM(m.start), end: toHHMM(m.end) }))
  )
  const [busy, setBusy] = useState(false)

  const parsedMeetings = meetings
    .map((m) => ({
      days: m.days,
      start: fromHHMM(m.start) ?? -1,
      end: fromHHMM(m.end) ?? -1
    }))
    .filter((m) => m.days.length > 0 && m.start >= 0 && m.end > m.start)

  const liveConflicts = useMemo(() => {
    if (!section) return []
    const others = data.sections.filter((s) => s.id !== section.id)
    const ins = data.instructors.find((i) => i.id === Number(instructorId)) ?? null
    const room = data.rooms.find((r) => r.id === Number(roomId)) ?? null
    const draft: CtxSection = {
      id: section.id,
      courseId,
      code: `${section.code}-${number}`,
      capacity: parseInt(capacity, 10) || 0,
      meetings: parsedMeetings,
      room: room ? { id: room.id, name: room.name, capacity: room.capacity, travelGroup: room.travelGroup } : null,
      instructor: ins
        ? { id: ins.id, name: ins.name, maxWeeklyHours: ins.maxWeeklyHours, unavailable: ins.unavailable }
        : null
    }
    const ctxOthers: CtxSection[] = others.map((s) => ({
      id: s.id,
      courseId: s.courseId,
      code: `${s.code}-${s.number}`,
      capacity: s.capacity,
      meetings: s.meetings,
      room: s.roomId !== null ? data.rooms.find((r) => r.id === s.roomId) ?? null : null,
      instructor: s.instructorId !== null ? data.instructors.find((i) => i.id === s.instructorId) ?? null : null
    }))
    return computeConflicts([draft, ...ctxOthers], data.settings)
      .filter((c) => c.sectionId === section.id)
      .map((c) => conflictText(c, locale))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, instructorId, roomId, capacity, number, courseId, locale])

  const save = async () => {
    if (courses.length === 0) return
    setBusy(true)
    try {
      const payload = {
        number: number.trim() || 'A',
        capacity: parseInt(capacity, 10) || 0,
        sessionsPerWeek: parseInt(sessionsPerWeek, 10) || 1,
        durationMinutes: parseInt(durationMinutes, 10) || 60,
        instructorId: instructorId ? Number(instructorId) : null,
        roomId: roomId ? Number(roomId) : null,
        locked
      }
      if (section) {
        await window.api.sections.update(section.id, payload)
        await window.api.sections.setMeetings(section.id, parsedMeetings)
        onDone(t('section.saved', { code: section.code, number: payload.number }))
      } else {
        const created = await window.api.sections.create(courseId, payload)
        await window.api.sections.setMeetings(created.id, parsedMeetings)
        onDone(t('section.created'))
      }
    } catch (err) {
      useApp.getState().toast(String(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={section ? t('sections.editTitle', { code: section.code, number: section.number }) : t('sections.newTitle')}
      onClose={() => onDone()}
      wide
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('sections.course')}>
          <Select
            value={String(courseId)}
            onChange={(v) => setCourseId(Number(v))}
            disabled={!!section}
          >
            {courses.map((c) => (
              <SelectOption key={c.id} value={String(c.id)}>
                {c.code} — {c.title}
              </SelectOption>
            ))}
          </Select>
        </Field>
        <Field label={t('sections.sectionNo')}>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="A" />
        </Field>
        <Field label={t('sections.capacity')}>
          <Input type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </Field>
        <Field label={t('sections.sessionsPerWeek')} hint={t('sections.sessionsHint')}>
          <Input type="number" min="1" max="6" value={sessionsPerWeek} onChange={(e) => setSessionsPerWeek(e.target.value)} />
        </Field>
        <Field label={t('sections.duration')}>
          <Input type="number" min="30" step="5" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
        </Field>
        <Field label={t('sections.lockLabel')}>
          <div className="flex items-center gap-2 h-[34px]">
            <Checkbox
              id="section-locked"
              checked={locked}
              onCheckedChange={(v) => setLocked(v === true)}
            />
            <label htmlFor="section-locked" className="text-sm text-muted-foreground cursor-pointer">
              {t('sections.lockToggle')}
            </label>
          </div>
        </Field>
        <Field label={t('sections.instructor')} hint={t('sections.instructorHint')}>
          <Select value={instructorId || 'any'} onChange={(v) => setInstructorId(v === 'any' ? '' : v)}>
            <SelectOption value="any">{t('sections.anyAvailable')}</SelectOption>
            {data.instructors.map((i) => (
              <SelectOption key={i.id} value={String(i.id)}>
                {i.name}
              </SelectOption>
            ))}
          </Select>
        </Field>
        <Field label={t('sections.room')}>
          <Select value={roomId || 'none'} onChange={(v) => setRoomId(v === 'none' ? '' : v)}>
            <SelectOption value="none">{t('sections.unassigned')}</SelectOption>
            {data.rooms.map((r) => (
              <SelectOption key={r.id} value={String(r.id)}>
                {r.name} ({r.capacity})
              </SelectOption>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-muted-foreground text-sm">{t('sections.meetings')}</span>
          <Button onClick={() => setMeetings([...meetings, { days: [1, 3], start: '09:00', end: '10:15' }])}>
            {t('sections.addMeeting')}
          </Button>
        </div>
        {meetings.length === 0 && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3">{t('sections.noMeetingsNote')}</p>
        )}
        <div className="flex flex-col gap-2">
          {meetings.map((m, idx) => (
            <div key={idx} className="flex items-center gap-3 bg-muted/50 rounded-md p-2">
              <ToggleGroup
                type="multiple"
                variant="outline"
                value={m.days.map(String)}
                onValueChange={(vals) =>
                  setMeetings(
                    meetings.map((x, i) =>
                      i === idx ? { ...x, days: vals.map(Number).sort((a, b) => a - b) } : x
                    )
                  )
                }
                className="gap-1 bg-transparent"
              >
                {[1, 2, 3, 4, 5, 6].map((d) => (
                  <ToggleGroupItem key={d} value={String(d)} className="w-8 h-7 px-0 text-xs font-semibold">
                    {letters[d]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Input
                type="time"
                step={300}
                value={m.start}
                onChange={(e) => setMeetings(meetings.map((x, i) => (i === idx ? { ...x, start: e.target.value } : x)))}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                step={300}
                value={m.end}
                onChange={(e) => setMeetings(meetings.map((x, i) => (i === idx ? { ...x, end: e.target.value } : x)))}
              />
              <Button variant="ghost" onClick={() => setMeetings(meetings.filter((_, i) => i !== idx))}>
                ✕
              </Button>
            </div>
          ))}
        </div>
      </div>

      {liveConflicts.length > 0 && (
        <div className="mt-3 rounded-md bg-destructive/10 border border-destructive/30 p-3">
          {liveConflicts.map((c) => (
            <div key={c} className="text-xs text-destructive">
              ⚠ {c}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={() => onDone()}>{t('common.cancel')}</Button>
        <Button variant="primary" onClick={save} disabled={busy}>
          {t('common.save')}
        </Button>
      </div>
    </Modal>
  )
}
