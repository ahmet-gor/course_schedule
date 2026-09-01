import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import TimetableGrid from '../components/TimetableGrid'
import { Badge, Button, Checkbox, EmptyState, Field, Input, Select, SelectOption, ToggleGroup, ToggleGroupItem } from '../components/ui'
import { weekOccurrences } from '../lib/schedule'
import { summaryText, useI18n, useT } from '../i18n'
import { isBreakWeek, weekLabel } from '@shared/weeks'
import type { SolverResponse } from '../solver/solver.worker'
import type { FixSection, FlexSection, SectionFull, Solution } from '@shared/types'
import type { GridMeeting } from '../components/TimetableGrid'

type Phase = 'idle' | 'running' | 'done' | 'problems' | 'error'
type Target = 'pattern' | number

function initialTarget(): Target {
  try {
    const v = localStorage.getItem('generateTarget')
    if (v === 'pattern') return 'pattern'
    const n = parseInt(v ?? '', 10)
    return Number.isFinite(n) && n >= 1 ? n : 'pattern'
  } catch {
    return 'pattern'
  }
}

export default function GeneratePage() {
  const currentTermId = useApp((s) => s.currentTermId)
  const toast = useApp((s) => s.toast)
  const t = useT()
  const { locale } = useI18n()
  const { data, reload } = useAsync(() => window.api.schedule.getData(currentTermId!), [currentTermId])
  const [target, setTarget] = useState<Target>(initialTarget)
  const [include, setInclude] = useState<Record<number, boolean> | null>(null)
  const [timeLimitSec, setTimeLimitSec] = useState<number>(8)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState({ nodes: 0, solutions: 0 })
  const [problems, setProblems] = useState<string[]>([])
  const [solutions, setSolutions] = useState<Solution[]>([])
  const [selected, setSelected] = useState<number>(0)
  const workerRef = useRef<Worker | null>(null)

  const sections = data?.sections ?? []
  const targetWeek = typeof target === 'number' ? target : null
  const weekIsBreak = data !== null && targetWeek !== null && isBreakWeek(data.term, targetWeek)

  const fixed = useMemo(() => sections.filter((s) => s.meetings.length > 0 && s.locked), [sections])
  const unlockedScheduled = useMemo(() => sections.filter((s) => s.meetings.length > 0 && !s.locked), [sections])
  const unscheduled = useMemo(() => sections.filter((s) => s.meetings.length === 0), [sections])

  const weekPairs = useMemo(
    () => (data && targetWeek !== null ? weekOccurrences(data, targetWeek) : []),
    [data, targetWeek]
  )

  useEffect(() => {
    try {
      localStorage.setItem('generateTarget', String(target))
    } catch {
      /* storage unavailable */
    }
  }, [target])

  useEffect(() => {
    if (!data) return
    if (typeof target === 'number' && target > data.term.weeks) setTarget('pattern')
  }, [data, target])

  useEffect(() => {
    if (data && include === null) {
      const initial: Record<number, boolean> = {}
      for (const s of data.sections) {
        initial[s.id] = target === 'pattern' ? s.meetings.length === 0 && !s.locked : false
      }
      setInclude(initial)
    }
  }, [data, include, target])

  useEffect(() => () => workerRef.current?.terminate(), [])

  const solution = solutions[selected] ?? null

  const selectedIds = useMemo(
    () =>
      include
        ? Object.entries(include)
            .filter(([, on]) => on)
            .map(([id]) => Number(id))
        : [],
    [include]
  )

  const patternPreviewMeetings: GridMeeting[] = useMemo(() => {
    if (!solution || !data || targetWeek !== null) return []
    const roomById = new Map(data.rooms.map((r) => [r.id, r]))
    const insById = new Map(data.instructors.map((i) => [i.id, i]))
    const byId = new Map(sections.map((s) => [s.id, s]))
    const fixedMeetings = fixed.map((s) => ({
      sectionId: s.id,
      label: `${s.code}-${s.number}`,
      title: s.title,
      days: s.meetings.flatMap((m) => m.days),
      start: s.meetings[0]?.start ?? 0,
      end: s.meetings[0]?.end ?? 0,
      roomLabel: s.roomName ?? '—',
      instructorLabel: s.instructorName ?? '—',
      courseCode: s.code,
      dimmed: true
    }))
    const flexMeetings = Object.entries(solution.assignments).map(([id, a]) => {
      const s = byId.get(Number(id)) as SectionFull
      const room = roomById.get(a.roomId)
      const ins = insById.get(a.instructorId)
      return {
        sectionId: s.id,
        label: `${s.code}-${s.number}`,
        title: s.title,
        days: [...a.days],
        start: a.start,
        end: a.end,
        roomLabel: room?.name ?? '—',
        instructorLabel: ins?.name ?? '—',
        courseCode: s.code,
        dimmed: false
      }
    })
    return [...fixedMeetings, ...flexMeetings]
  }, [solution, data, sections, fixed, targetWeek])

  const weekPreviewMeetings: GridMeeting[] = useMemo(() => {
    if (!solution || !data || targetWeek === null) return []
    const roomById = new Map(data.rooms.map((r) => [r.id, r]))
    const insById = new Map(data.instructors.map((i) => [i.id, i]))
    const fixedPairs = weekPairs.filter((p) => !selectedIds.includes(p.section.id) || p.section.locked)
    const fixedMeetings = fixedPairs
      .filter((p) => !p.occ.cancelled)
      .map((p) => ({
        sectionId: p.section.id,
        occKey: p.occ.key,
        label: `${p.section.code}-${p.section.number}`,
        title: p.section.title,
        days: [p.occ.day],
        start: p.occ.start,
        end: p.occ.end,
        roomLabel: p.occ.roomId !== null ? roomById.get(p.occ.roomId)?.name ?? '—' : '—',
        instructorLabel: p.occ.instructorId !== null ? insById.get(p.occ.instructorId)?.name ?? '—' : '—',
        courseCode: p.section.code,
        dimmed: true
      }))
    const byId = new Map(sections.map((s) => [s.id, s]))
    const flexMeetings = Object.entries(solution.assignments).flatMap(([id, a]) => {
      const s = byId.get(Number(id))
      if (!s) return []
      const room = roomById.get(a.roomId)
      const ins = insById.get(a.instructorId)
      return a.days.map((d) => ({
        sectionId: s.id,
        label: `${s.code}-${s.number}`,
        title: s.title,
        days: [d],
        start: a.start,
        end: a.end,
        roomLabel: room?.name ?? '—',
        instructorLabel: ins?.name ?? '—',
        courseCode: s.code,
        dimmed: false
      }))
    })
    return [...fixedMeetings, ...flexMeetings]
  }, [solution, data, sections, weekPairs, selectedIds, targetWeek])

  const previewMeetings = targetWeek === null ? patternPreviewMeetings : weekPreviewMeetings

  if (!data) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>
  if (include === null) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  const run = () => {
    if (selectedIds.length === 0) {
      toast(t('generate.selectFirst'), 'error')
      return
    }
    if (targetWeek !== null && weekIsBreak) {
      toast(t('timetable.week.breakNotice'), 'error')
      return
    }
    const worker = new Worker(new URL('../solver/solver.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    setPhase('running')
    setSolutions([])
    setProblems([])
    setProgress({ nodes: 0, solutions: 0 })

    const settings = {
      ...data.settings,
      solver: { ...data.settings.solver, timeLimitMs: timeLimitSec * 1000 }
    }
    let solverFixed: FixSection[] = []
    let solverFlexible: FlexSection[] = []
    if (targetWeek === null) {
      solverFixed = fixed.map((s) => ({
        id: s.id,
        courseId: s.courseId,
        code: `${s.code}-${s.number}`,
        meetings: s.meetings,
        roomId: s.roomId,
        instructorId: s.instructorId
      }))
      solverFlexible = sections
        .filter((s) => selectedIds.includes(s.id) && !s.locked)
        .map((s) => ({
          id: s.id,
          courseId: s.courseId,
          code: `${s.code}-${s.number}`,
          capacity: s.capacity,
          sessionsPerWeek: s.sessionsPerWeek,
          durationMinutes: s.durationMinutes,
          instructorId: s.instructorId,
          roomId: s.roomId
        }))
    } else {
      solverFixed = weekPairs
        .filter((p) => !p.occ.cancelled)
        .filter((p) => !selectedIds.includes(p.section.id) || p.section.locked)
        .map((p, i) => ({
          id: -(i + 1),
          courseId: p.section.courseId,
          code: `${p.section.code}-${p.section.number}`,
          meetings: [{ days: [p.occ.day], start: p.occ.start, end: p.occ.end }],
          roomId: p.occ.roomId,
          instructorId: p.occ.instructorId
        }))
      solverFlexible = sections
        .filter((s) => selectedIds.includes(s.id) && !s.locked)
        .map((s) => ({
          id: s.id,
          courseId: s.courseId,
          code: `${s.code}-${s.number}`,
          capacity: s.capacity,
          sessionsPerWeek: s.sessionsPerWeek,
          durationMinutes: s.durationMinutes,
          instructorId: s.instructorId,
          roomId: s.roomId
        }))
    }

    worker.onmessage = (e: MessageEvent<SolverResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        setProgress({ nodes: msg.nodes, solutions: msg.solutions })
      } else if (msg.type === 'problems') {
        setProblems(msg.problems)
        setPhase('problems')
        worker.terminate()
      } else if (msg.type === 'done') {
        setSolutions(msg.result.solutions)
        setProblems(msg.result.problems)
        setSelected(0)
        setPhase('done')
        worker.terminate()
        if (msg.result.solutions.length === 0) {
          toast(t('generate.noResults'), 'error')
        }
      } else if (msg.type === 'error') {
        toast(msg.message, 'error')
        setPhase('error')
        worker.terminate()
      }
    }
    worker.postMessage({
      type: 'solve',
      input: {
        settings,
        rooms: data.rooms,
        instructors: data.instructors,
        fixed: solverFixed,
        flexible: solverFlexible
      }
    })
  }

  const cancel = () => {
    workerRef.current?.terminate()
    setPhase('idle')
  }

  const apply = async () => {
    if (!solution) return
    try {
      if (targetWeek === null) {
        const cleared = await window.api.schedule.apply(currentTermId!, solution.assignments)
        toast(
          cleared > 0 ? t('toast.overridesCleared', { count: cleared }) : t('toast.scheduleApplied'),
          'success'
        )
      } else {
        await window.api.schedule.resolveWeek(currentTermId!, targetWeek, solution.assignments)
        toast(t('toast.scheduleApplied'), 'success')
      }
      reload()
      setPhase('idle')
      setSolutions([])
    } catch (err) {
      toast(String(err), 'error')
    }
  }

  const weeksList = Array.from({ length: data.term.weeks }, (_, i) => i + 1)
  const weekSelectable = targetWeek === null ? sections : [...unscheduled, ...unlockedScheduled]

  return (
    <div className="flex h-full">
      <div className="w-96 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b">
          <h1 className="font-semibold">{t('generate.title')}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {targetWeek === null ? t('generate.desc') : t('generate.week.desc')}
          </p>
        </div>

        <div className="px-4 py-3 border-b">
          <Field label={t('generate.target')}>
            <Select
              value={targetWeek === null ? 'pattern' : String(targetWeek)}
              onChange={(v) => setTarget(v === 'pattern' ? 'pattern' : Number(v))}
            >
              <SelectOption value="pattern">{t('generate.target.template')}</SelectOption>
              {weeksList.map((w) => (
                <SelectOption key={w} value={String(w)} disabled={isBreakWeek(data.term, w)}>
                  {`W${String(w).padStart(2, '0')} · ${weekLabel(data.term, w, locale)}`}
                </SelectOption>
              ))}
            </Select>
          </Field>
        </div>

        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('generate.timeLimit')}</span>
          <Input
            type="number"
            min="1"
            max="120"
            value={timeLimitSec}
            onChange={(e) => setTimeLimitSec(Math.max(1, parseInt(e.target.value, 10) || 8))}
            className="w-16"
          />
          <span className="text-sm text-muted-foreground">s</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {targetWeek === null ? (
            <>
              {fixed.length > 0 && (
                <div className="px-4 py-3 border-b">
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">
                    {t('generate.fixed', { count: fixed.length })}
                  </p>
                  {fixed.map((s) => (
                    <SectionRow key={s.id} section={s} locked />
                  ))}
                </div>
              )}
              {unscheduled.length > 0 && (
                <div className="px-4 py-3 border-b">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    {t('generate.unscheduled', { count: unscheduled.length })}
                  </p>
                  {unscheduled.map((s) => (
                    <SectionRow
                      key={s.id}
                      section={s}
                      checked={include[s.id] ?? false}
                      onToggle={(v) => setInclude({ ...include, [s.id]: v })}
                    />
                  ))}
                </div>
              )}
              {unlockedScheduled.length > 0 && (
                <div className="px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    {t('generate.reschedulable', { count: unlockedScheduled.length })}
                  </p>
                  {unlockedScheduled.map((s) => (
                    <SectionRow
                      key={s.id}
                      section={s}
                      checked={include[s.id] ?? false}
                      onToggle={(v) => setInclude({ ...include, [s.id]: v })}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {t('generate.week.fixed', { count: weekPairs.filter((p) => !p.occ.cancelled).length })}
              </p>
              {weekSelectable.map((s) => (
                <SectionRow
                  key={s.id}
                  section={s}
                  locked={s.locked}
                  checked={s.locked ? true : include[s.id] ?? false}
                  onToggle={(v) => setInclude({ ...include, [s.id]: v })}
                />
              ))}
            </div>
          )}
          {sections.length === 0 && <EmptyState title={t('generate.noSections')} hint={t('generate.noSectionsHint')} />}
        </div>

        <div className="px-4 py-3 border-t flex gap-2">
          {phase !== 'running' ? (
            <Button variant="primary" className="flex-1" onClick={run} disabled={selectedIds.length === 0}>
              {t('generate.run', { count: selectedIds.length })}
            </Button>
          ) : (
            <Button variant="danger" className="flex-1" onClick={cancel}>
              {t('generate.cancel')}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-5 py-3 bg-card border-b flex items-center gap-3 flex-wrap">
          {phase === 'running' && (
            <span className="text-sm text-muted-foreground animate-pulse">
              {t('generate.solving', { nodes: progress.nodes.toLocaleString(), solutions: progress.solutions })}
            </span>
          )}
          {phase === 'done' && (
            <>
              <span className="text-sm font-medium">{t('generate.options', { count: solutions.length })}</span>
              <ToggleGroup
                type="single"
                variant="outline"
                value={String(selected)}
                onValueChange={(v) => {
                  if (v !== '') setSelected(Number(v))
                }}
              >
                {solutions.map((s, i) => (
                  <ToggleGroupItem key={i} value={String(i)}>
                    #{i + 1} · {t('generate.score', { score: Math.round(s.score) })}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Button variant="primary" className="ml-auto" onClick={apply} disabled={!solution}>
                {targetWeek === null ? t('generate.apply') : t('generate.applyWeek')}
              </Button>
            </>
          )}
          {phase === 'problems' && <span className="text-sm text-destructive">{t('generate.blocked')}</span>}
        </div>

        {problems.length > 0 && (
          <div className="mx-5 mt-4 rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
            {problems.map((p) => (
              <div key={p}>⚠ {p}</div>
            ))}
          </div>
        )}

        {solution && (
          <div className="px-5 py-2 text-sm text-muted-foreground flex gap-2 flex-wrap">
            {solution.summary.map((s, i) => (
              <Badge key={i} tone="slate">
                {summaryText(s, locale)}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-auto p-5">
          {previewMeetings.length > 0 ? (
            <TimetableGrid
              meetings={previewMeetings}
              dayStart={data.settings.dayStart}
              dayEnd={data.settings.dayEnd}
            />
          ) : phase !== 'running' ? (
            <EmptyState title={t('generate.noPreviewTitle')} hint={t('generate.noPreviewHint')} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground animate-pulse">
              {t('generate.searching')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionRow({
  section,
  checked,
  onToggle,
  locked
}: {
  section: SectionFull
  checked?: boolean
  onToggle?: (v: boolean) => void
  locked?: boolean
}) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <Checkbox
        checked={locked ? true : checked ?? false}
        disabled={locked}
        onCheckedChange={(v) => onToggle?.(v === true)}
        aria-label={`${section.code}-${section.number}`}
      />
      <span className="font-mono font-medium whitespace-nowrap">
        {section.code}-{section.number}
      </span>
      <span className="text-muted-foreground truncate flex-1">{section.title}</span>
      {section.instructorName && (
        <span className="text-xs text-muted-foreground truncate max-w-28">{section.instructorName}</span>
      )}
    </div>
  )
}
