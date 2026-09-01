import { useMemo, useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import { Badge, Button, Checkbox, ConfirmDialog, EmptyState, Field, Input, Modal, Select, SelectOption, ToggleGroup, ToggleGroupItem } from '../components/ui'
import { conflictsByLesson, lessonCode } from '../lib/schedule'
import { computeConflicts, type CtxLesson } from '@shared/constraints'
import { toHHMM, fromHHMM } from '@shared/time'
import { DAY_LETTERS, conflictText, labelDays, useI18n, useT } from '../i18n'
import type { LessonFull, ScheduleData, SchoolClass } from '@shared/types'

export default function ClassesPage() {
  const currentTermId = useApp((s) => s.currentTermId)
  const toast = useApp((s) => s.toast)
  const t = useT()
  const { locale } = useI18n()
  const { data, reload } = useAsync(() => window.api.schedule.getData(currentTermId!), [currentTermId])
  const [classId, setClassId] = useState<number | null>(null)
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null)
  const [creatingClass, setCreatingClass] = useState(false)
  const [confirmingClass, setConfirmingClass] = useState<SchoolClass | null>(null)
  const [editingLesson, setEditingLesson] = useState<LessonFull | null>(null)
  const [creatingLesson, setCreatingLesson] = useState(false)
  const [confirmingLesson, setConfirmingLesson] = useState<LessonFull | null>(null)

  const conflicts = useMemo(() => (data ? conflictsByLesson(data, locale) : {}), [data, locale])
  const classes = data?.classes ?? []
  const activeClassId = classId !== null && classes.some((c) => c.id === classId) ? classId : (classes[0]?.id ?? null)
  const cls = classes.find((c) => c.id === activeClassId) ?? null
  const lessons = useMemo(
    () => (data?.lessons ?? []).filter((l) => l.classId === activeClassId),
    [data, activeClassId]
  )
  const scheduledCount = lessons.filter((l) => l.meetings.length > 0).length
  const unassignedCount = lessons.filter((l) => l.teacherId === null).length

  if (!data) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 bg-card border-b flex items-center gap-3 flex-wrap">
        <h1 className="font-semibold">{t('classes.title')}</h1>
        {classes.length > 0 && (
          <Select
            className="w-44"
            value={activeClassId !== null ? String(activeClassId) : undefined}
            onChange={(v) => setClassId(Number(v))}
          >
            {classes.map((c) => (
              <SelectOption key={c.id} value={String(c.id)}>
                {c.name}
              </SelectOption>
            ))}
          </Select>
        )}
        {cls && (
          <span className="text-sm text-muted-foreground">
            {t('classes.counts', {
              total: lessons.length,
              scheduled: scheduledCount,
              remaining: lessons.length - scheduledCount,
              unassigned: unassignedCount
            })}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          {cls && (
            <Button onClick={() => setCreatingLesson(true)}>{t('classes.addLesson')}</Button>
          )}
          <Button onClick={() => classes.length > 0 && cls ? setEditingClass(cls) : setCreatingClass(true)}>
            {classes.length > 0 && cls ? t('common.edit') : t('classes.new')}
          </Button>
          {classes.length === 0 && (
            <Button variant="primary" onClick={() => setCreatingClass(true)}>
              {t('classes.new')}
            </Button>
          )}
          {cls && (
            <Button variant="danger" onClick={() => setConfirmingClass(cls)}>
              {t('common.delete')}
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {classes.length === 0 ? (
          <EmptyState title={t('classes.empty')} hint={t('classes.emptyHint')} />
        ) : lessons.length === 0 ? (
          <EmptyState title={t('classes.noLessons')} hint={t('classes.addLesson')} />
        ) : (
          <table className="w-full bg-card rounded-lg border text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('classes.col.subject')}</th>
                <th className="px-4 py-2.5 font-medium">{t('classes.col.meetings')}</th>
                <th className="px-4 py-2.5 font-medium">{t('classes.col.teacher')}</th>
                <th className="px-4 py-2.5 font-medium">{t('classes.col.pattern')}</th>
                <th className="px-4 py-2.5 font-medium">{t('classes.col.status')}</th>
                <th className="px-4 py-2.5 font-medium w-64"></th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((l) => {
                const msgs = conflicts[l.id] ?? []
                return (
                  <tr key={l.id} className={`border-t hover:bg-muted/40 ${msgs.length > 0 ? 'bg-destructive/5' : ''}`}>
                    <td className="px-4 py-2.5 font-mono font-semibold whitespace-nowrap">
                      {l.subjectCode}
                      <span className="ml-2 font-sans font-normal text-muted-foreground">{l.subjectTitle}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      {l.meetings.length > 0 ? (
                        l.meetings
                          .map((m) => `${labelDays(m.days, locale)} ${toHHMM(m.start)}–${toHHMM(m.end)}`)
                          .join(' · ')
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {msgs.length > 0 && <div className="text-xs text-destructive mt-0.5">⚠ {msgs[0]}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      {l.teacherName ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {t('classes.pattern', { count: l.sessionsPerWeek, minutes: l.durationMinutes })}
                    </td>
                    <td className="px-4 py-2.5">
                      {l.locked ? (
                        <Badge tone="amber">{t('classes.locked')}</Badge>
                      ) : l.meetings.length > 0 ? (
                        <Badge tone="green">{t('classes.scheduled')}</Badge>
                      ) : (
                        <Badge tone="slate">{t('classes.unscheduled')}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                      <Button size="sm" onClick={() => setEditingLesson(l)}>{t('common.edit')}</Button>
                      {l.meetings.length > 0 && (
                        <Button
                          size="sm"
                          onClick={async () => {
                            await window.api.schedule.unschedule([l.id])
                            reload()
                            toast(t('toast.lessonCleared', { lesson: lessonCode(l) }), 'success')
                          }}
                        >
                          {t('common.clear')}
                        </Button>
                      )}
                      <Button
                        variant="danger" size="sm"
                        onClick={() => setConfirmingLesson(l)}
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
      {confirmingClass && (
        <ConfirmDialog
          title={t('common.confirmTitle')}
          description={t('class.confirmDelete', { name: confirmingClass.name })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirmingClass(null)}
          onConfirm={async () => {
            await window.api.classes.remove(confirmingClass.id)
            setConfirmingClass(null)
            setClassId(null)
            reload()
            toast(t('class.deleted', { name: confirmingClass.name }), 'success')
          }}
        />
      )}
      {confirmingLesson && (
        <ConfirmDialog
          title={t('common.confirmTitle')}
          description={t('lesson.confirmDelete', { lesson: lessonCode(confirmingLesson) })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirmingLesson(null)}
          onConfirm={async () => {
            await window.api.lessons.remove(confirmingLesson.id)
            setConfirmingLesson(null)
            reload()
            toast(t('lesson.deleted'), 'success')
          }}
        />
      )}
      {(creatingClass || editingClass) && (
        <ClassDialog
          cls={editingClass}
          onDone={(message) => {
            setCreatingClass(false)
            setEditingClass(null)
            reload()
            if (message) toast(message, 'success')
          }}
        />
      )}
      {(creatingLesson || editingLesson) && cls && (
        <LessonDialog
          data={data}
          cls={cls}
          lesson={editingLesson}
          onDone={(message) => {
            setCreatingLesson(false)
            setEditingLesson(null)
            reload()
            if (message) toast(message, 'success')
          }}
        />
      )}
    </div>
  )
}

function ClassDialog({ cls, onDone }: { cls: SchoolClass | null; onDone: (message?: string) => void }) {
  const currentTermId = useApp((s) => s.currentTermId)
  const t = useT()
  const [name, setName] = useState(cls?.name ?? '')
  const [grade, setGrade] = useState(cls?.grade ?? '')
  const [capacity, setCapacity] = useState(String(cls?.capacity ?? 0))
  const [homeroom, setHomeroom] = useState(cls?.homeroom ?? '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        grade: grade.trim(),
        capacity: parseInt(capacity, 10) || 0,
        homeroom: homeroom.trim()
      }
      if (cls) await window.api.classes.update(cls.id, payload)
      else await window.api.classes.create(currentTermId!, payload)
      onDone(t('class.saved', { name: payload.name }))
    } catch (err) {
      useApp.getState().toast(String(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title={cls ? t('classes.editTitle', { name: cls.name }) : t('classes.newTitle')} onClose={() => onDone()}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('classes.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('classes.namePlaceholder')} />
        </Field>
        <Field label={t('classes.grade')}>
          <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder={t('classes.gradePlaceholder')} />
        </Field>
        <Field label={t('classes.capacity')}>
          <Input type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </Field>
        <Field label={t('classes.homeroom')}>
          <Input value={homeroom} onChange={(e) => setHomeroom(e.target.value)} placeholder={t('classes.homeroomPlaceholder')} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={() => onDone()}>{t('common.cancel')}</Button>
        <Button variant="primary" onClick={save} disabled={busy || !name.trim()}>
          {t('common.save')}
        </Button>
      </div>
    </Modal>
  )
}

function LessonDialog({
  data,
  cls,
  lesson,
  onDone
}: {
  data: ScheduleData
  cls: SchoolClass
  lesson: LessonFull | null
  onDone: (message?: string) => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const letters = DAY_LETTERS[locale]
  const [subjectId, setSubjectId] = useState<number>(lesson?.subjectId ?? data.subjects[0]?.id ?? 0)
  const [sessionsPerWeek, setSessionsPerWeek] = useState(String(lesson?.sessionsPerWeek ?? 4))
  const [durationMinutes, setDurationMinutes] = useState(String(lesson?.durationMinutes ?? 40))
  const [teacherId, setTeacherId] = useState<string>(lesson?.teacherId !== null ? String(lesson?.teacherId) : '')
  const [locked, setLocked] = useState(lesson?.locked ?? false)
  const [days, setDays] = useState<number[]>(lesson?.meetings[0]?.days ?? [])
  const [start, setStart] = useState(lesson?.meetings[0] ? toHHMM(lesson.meetings[0].start) : '09:00')
  const [end, setEnd] = useState(
    lesson?.meetings[0] ? toHHMM(lesson.meetings[0].end) : toHHMM((lesson?.durationMinutes ?? 40) + 540)
  )
  const [busy, setBusy] = useState(false)

  const qualifiedTeachers = data.teachers.filter((tc) => tc.subjectIds.includes(subjectId))
  const parsedStart = fromHHMM(start) ?? -1
  const parsedEnd = fromHHMM(end) ?? -1
  const scheduled = days.length > 0 && parsedStart >= 0 && parsedEnd > parsedStart

  const liveConflicts = useMemo(() => {
    if (!lesson) return []
    const others = data.lessons
      .filter((l) => l.id !== lesson.id)
      .map((l): CtxLesson => {
        const tc = l.teacherId !== null ? data.teachers.find((x) => x.id === l.teacherId) : undefined
        return {
          id: l.id,
          classId: l.classId,
          subjectId: l.subjectId,
          code: lessonCode(l),
          meetings: l.meetings,
          teacher: tc
            ? {
                id: tc.id,
                name: tc.name,
                maxWeeklyHours: tc.maxWeeklyHours,
                unavailable: tc.unavailable,
                subjectIds: tc.subjectIds
              }
            : null
        }
      })
    const tc = data.teachers.find((x) => x.id === Number(teacherId))
    const draft: CtxLesson = {
      id: lesson.id,
      classId: lesson.classId,
      subjectId,
      code: lessonCode(lesson),
      meetings: scheduled ? [{ days, start: parsedStart, end: parsedEnd }] : [],
      teacher: tc
        ? {
            id: tc.id,
            name: tc.name,
            maxWeeklyHours: tc.maxWeeklyHours,
            unavailable: tc.unavailable,
            subjectIds: tc.subjectIds
          }
        : null
    }
    return computeConflicts([draft, ...others], data.settings)
      .filter((c) => c.lessonId === lesson.id)
      .map((c) => conflictText(c, locale))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, start, end, teacherId, subjectId, locale])

  const save = async () => {
    if (data.subjects.length === 0) return
    setBusy(true)
    try {
      const payload = {
        subjectId,
        sessionsPerWeek: parseInt(sessionsPerWeek, 10) || 1,
        durationMinutes: parseInt(durationMinutes, 10) || 40,
        teacherId: teacherId ? Number(teacherId) : null
      }
      if (lesson) {
        await window.api.lessons.update(lesson.id, { ...payload, locked })
        await window.api.lessons.setSchedule(
          lesson.id,
          days,
          scheduled ? parsedStart : null,
          scheduled ? parsedEnd : null
        )
        onDone(t('lesson.saved', { lesson: lessonCode(lesson) }))
      } else {
        await window.api.lessons.create(cls.id, { ...payload, locked })
        onDone(t('lesson.created'))
      }
    } catch (err) {
      useApp.getState().toast(String(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal
      title={lesson ? t('classes.editLessonTitle', { lesson: lessonCode(lesson) }) : t('classes.newLessonTitle', { name: cls.name })}
      onClose={() => onDone()}
      wide
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('classes.col.subject')}>
          <Select value={String(subjectId)} onChange={(v) => setSubjectId(Number(v))} disabled={!!lesson}>
            {data.subjects.map((s) => (
              <SelectOption key={s.id} value={String(s.id)}>
                {s.code} — {s.title}
              </SelectOption>
            ))}
          </Select>
        </Field>
        <Field label={t('classes.sessionsPerWeek')} hint={t('classes.sessionsHint')}>
          <Input type="number" min="1" max="6" value={sessionsPerWeek} onChange={(e) => setSessionsPerWeek(e.target.value)} />
        </Field>
        <Field label={t('classes.duration')}>
          <Input type="number" min="30" step="5" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
        </Field>
        <Field label={t('teachers.title')} hint={t('teachers.subjectsHint')}>
          <Select value={teacherId || 'any'} onChange={(v) => setTeacherId(v === 'any' ? '' : v)}>
            <SelectOption value="any">—</SelectOption>
            {qualifiedTeachers.map((tc) => (
              <SelectOption key={tc.id} value={String(tc.id)}>
                {tc.name}
              </SelectOption>
            ))}
          </Select>
        </Field>
        <Field label={t('classes.locked')}>
          <div className="flex items-center gap-2 h-[34px]">
            <Checkbox
              id="lesson-locked"
              checked={locked}
              onCheckedChange={(v) => setLocked(v === true)}
            />
            <label htmlFor="lesson-locked" className="text-sm text-muted-foreground cursor-pointer">
              {t('timetable.locked')}
            </label>
          </div>
        </Field>
      </div>

      <div className="mt-4">
        <span className="font-medium text-muted-foreground text-sm">{t('classes.col.meetings')}</span>
        <div className="flex items-center gap-3 bg-muted/50 rounded-md p-2 mt-2 flex-wrap">
          <ToggleGroup
            type="multiple"
            variant="outline"
            value={days.map(String)}
            onValueChange={(vals) => setDays(vals.map(Number).sort((a, b) => a - b))}
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
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-28"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="time"
            step={300}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-28"
          />
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
