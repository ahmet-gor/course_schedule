import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import TimetableGrid from '../components/TimetableGrid'
import { Badge, Button, EmptyState, Input, Tabs, TabsList, TabsTrigger, ToggleGroup, ToggleGroupItem } from '../components/ui'
import { entryCode } from '../lib/schedule'
import { summaryText, useI18n, useT } from '../i18n'
import type { SolverResponse } from '../solver/solver.worker'
import type { EntryFull, EntrySolution, PlacedEntry, TeacherSolution } from '@shared/types'

type Stage = 'entries' | 'teachers'
type Phase = 'idle' | 'running' | 'done' | 'problems' | 'error'

export default function GeneratePage() {
  const currentScheduleId = useApp((s) => s.currentScheduleId)
  const toast = useApp((s) => s.toast)
  const t = useT()
  const { locale } = useI18n()
  const { data, reload } = useAsync(
    () => (currentScheduleId !== null ? window.api.schedule.getData(currentScheduleId) : Promise.resolve(null)),
    [currentScheduleId]
  )
  const [stage, setStage] = useState<Stage>('entries')
  const [timeLimitSec, setTimeLimitSec] = useState<number>(8)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState({ nodes: 0, solutions: 0 })
  const [problems, setProblems] = useState<string[]>([])
  const [entrySolutions, setEntrySolutions] = useState<EntrySolution[]>([])
  const [teacherSolutions, setTeacherSolutions] = useState<TeacherSolution[]>([])
  const [selected, setSelected] = useState<number>(0)
  const workerRef = useRef<Worker | null>(null)
  let unitDefs: {
    lessonIds: number[]
    departmentIds: number[]
    code: string
    sessionsPerWeek: number
    durationMinutes: number
  }[] = []

  const entries = data?.entries ?? []
  const placed = useMemo(() => entries.filter((e) => e.days.length > 0 && e.lessons.length > 0), [entries])
  const placedNoTeacher = useMemo(() => placed.filter((e) => e.teacherId === null), [placed])
  const lockedAssignments = useMemo(
    () => placed.filter((e) => e.locked && e.teacherId !== null),
    [placed]
  )

  useEffect(() => () => workerRef.current?.terminate(), [])

  const entrySolution = entrySolutions[selected] ?? null
  const teacherSolution = teacherSolutions[selected] ?? null

  const previewMeetings = useMemo(() => {
    if (!data) return []
    if (stage === 'entries') {
      if (!entrySolution) return []
      const fixed = placed
        .filter((e) => e.locked)
        .map((e) => ({
          lessonId: e.id,
          occKey: String(e.id),
          label: entryCode(e),
          title: e.lessons.map((l) => l.title).join(' + '),
          days: [...e.days],
          start: e.start ?? 0,
          end: e.end ?? 0,
          teacherLabel: e.teacherName ?? '—',
          classLabel: e.lessons.map((l) => l.departmentName).join(' + '),
          subjectCode: e.lessons.map((l) => l.code).join('+'),
          dimmed: true
        }))
      const byId = new Map(entries.map((e) => [e.id, e]))
      const flexible = Object.entries(entrySolution.assignments).map(([key, a]) => {
        const e = byId.get(Number(key))
        return {
          lessonId: Number(key),
          occKey: key,
          label: e ? entryCode(e) : key,
          title: e ? e.lessons.map((l) => l.title).join(' + ') : '',
          days: [...a.days],
          start: a.start,
          end: a.end,
          teacherLabel: e?.teacherName ?? '—',
          classLabel: e ? e.lessons.map((l) => l.departmentName).join(' + ') : '',
          subjectCode: e ? e.lessons.map((l) => l.code).join('+') : '',
          dimmed: false
        }
      })
      return [...fixed, ...flexible]
    } else {
      if (!teacherSolution) return []
      const teacherById = new Map((data.teachers ?? []).map((tc) => [tc.id, tc]))
      return placed.map((e) => {
        const assigned = teacherSolution.assignments[String(e.id)]
        const tid = assigned !== undefined ? assigned : e.teacherId
        const teacher = tid !== null ? teacherById.get(tid) : undefined
        return {
          lessonId: e.id,
          occKey: String(e.id),
          label: entryCode(e),
          title: e.lessons.map((l) => l.title).join(' + '),
          days: [...e.days],
          start: e.start ?? 0,
          end: e.end ?? 0,
          teacherLabel: teacher?.name ?? '—',
          classLabel: e.lessons.map((l) => l.departmentName).join(' + '),
          subjectCode: e.lessons.map((l) => l.code).join('+'),
          dimmed: assigned === undefined
        }
      })
    }
  }, [data, stage, entrySolution, teacherSolution, entries, placed])

  if (currentScheduleId === null) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <EmptyState title={t('timetable.noSchedule')} hint={t('timetable.noScheduleHint')} />
      </div>
    )
  }
  if (!data) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  const runEntries = () => {
    // flexible units: lessons without an entry + unplaced blocks + unlocked placed entries
    const covered = new Set(entries.flatMap((e) => e.lessonIds))
    interface Unit {
      lessonIds: number[]
      departmentIds: number[]
      code: string
      sessionsPerWeek: number
      durationMinutes: number
    }
    const units: Unit[] = []
    for (const l of data.lessons) {
      if (covered.has(l.id)) continue
      units.push({
        lessonIds: [l.id],
        departmentIds: [l.departmentId],
        code: `${l.departmentName}·${l.code}`,
        sessionsPerWeek: l.sessionsPerWeek,
        durationMinutes: l.durationMinutes
      })
    }
    for (const e of entries) {
      if (e.locked || e.lessons.length === 0) continue
      units.push({
        lessonIds: e.lessonIds,
        departmentIds: e.lessons.map((l) => l.departmentId),
        code: entryCode(e),
        sessionsPerWeek: e.lessons[0].sessionsPerWeek,
        durationMinutes: e.lessons[0].durationMinutes
      })
    }
    if (units.length === 0) {
      toast(t('generate.nothingToDo'), 'error')
      return
    }
    unitDefs = units
    const fixed = entries
      .filter((e) => e.locked && e.days.length > 0 && e.lessons.length > 0)
      .map((e) => ({
        id: e.id,
        departmentIds: e.lessons.map((l) => l.departmentId),
        code: entryCode(e),
        meetings: [{ days: e.days, start: e.start ?? 0, end: e.end ?? 0 }]
      }))
    const worker = new Worker(new URL('../solver/solver.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    setPhase('running')
    setEntrySolutions([])
    setProblems([])
    setProgress({ nodes: 0, solutions: 0 })
    const settings = {
      ...data.settings,
      solver: { ...data.settings.solver, timeLimitMs: timeLimitSec * 1000 }
    }
    worker.onmessage = handleWorkerMessage('entries', worker)
    worker.postMessage({
      type: 'solveEntries',
      input: {
        settings,
        departments: data.departments.map((d) => ({ id: d.id, name: d.name })),
        flexible: units.map((u, i) => ({ id: i, ...u })),
        fixed
      }
    })
  }

  const runTeachers = () => {
    if (placed.length === 0) {
      toast(t('generate.teachers.notReady'), 'error')
      return
    }
    const worker = new Worker(new URL('../solver/solver.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    setPhase('running')
    setTeacherSolutions([])
    setProblems([])
    setProgress({ nodes: 0, solutions: 0 })
    const settings = {
      ...data.settings,
      solver: { ...data.settings.solver, timeLimitMs: timeLimitSec * 1000 }
    }
    const placedEntries: PlacedEntry[] = placed.map((e) => ({
      id: e.id,
      lessonIds: e.lessonIds,
      code: entryCode(e),
      meetings: [{ days: e.days, start: e.start ?? 0, end: e.end ?? 0 }],
      teacherId: e.teacherId,
      fixed: e.locked && e.teacherId !== null
    }))
    worker.onmessage = handleWorkerMessage('teachers', worker)
    worker.postMessage({
      type: 'solveTeachers',
      input: { settings, teachers: data.teachers, entries: placedEntries }
    })
  }

  const handleWorkerMessage = (kind: Stage, worker: Worker) => (e: MessageEvent<SolverResponse>) => {
    const msg = e.data
    if (msg.type === 'progress') {
      setProgress({ nodes: msg.nodes, solutions: msg.solutions })
    } else if (msg.type === 'problems') {
      setProblems(msg.problems)
      setPhase('problems')
      worker.terminate()
    } else if (msg.type === 'done') {
      setSelected(0)
      setPhase('done')
      worker.terminate()
      if (msg.kind === 'entries') {
        const result = msg.result as { solutions: EntrySolution[]; problems: string[] }
        setEntrySolutions(result.solutions)
        setProblems(result.problems)
        if (result.solutions.length === 0) toast(t('generate.noResults'), 'error')
      } else {
        const result = msg.result as { solutions: TeacherSolution[]; problems: string[] }
        setTeacherSolutions(result.solutions)
        setProblems(result.problems)
        if (result.solutions.length === 0) toast(t('generate.noResults'), 'error')
      }
    } else if (msg.type === 'error') {
      toast(msg.message, 'error')
      setPhase('error')
      worker.terminate()
    }
  }

  const cancel = () => {
    workerRef.current?.terminate()
    setPhase('idle')
  }

  const apply = async () => {
    try {
      if (stage === 'entries') {
        if (!entrySolution) return
        const assignments: Record<string, { lessonIds: number[]; days: number[]; start: number; end: number }> = {}
        for (const [key, a] of Object.entries(entrySolution.assignments)) {
          const unit = unitDefs[Number(key)]
          if (!unit) continue
          assignments[key] = { lessonIds: unit.lessonIds, days: a.days, start: a.start, end: a.end }
        }
        await window.api.schedule.applyEntries(currentScheduleId!, assignments)
        toast(t('toast.scheduleApplied'), 'success')
      } else {
        if (!teacherSolution) return
        await window.api.schedule.assignTeachers(currentScheduleId!, teacherSolution.assignments)
        toast(t('toast.teachersAssigned'), 'success')
      }
      reload()
      setPhase('idle')
      setEntrySolutions([])
      setTeacherSolutions([])
    } catch (err) {
      toast(String(err), 'error')
    }
  }

  const solutionCount = stage === 'entries' ? entrySolutions.length : teacherSolutions.length
  const activeSolution = stage === 'entries' ? entrySolution : teacherSolution

  return (
    <div className="flex h-full">
      <div className="w-96 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b">
          <h1 className="font-semibold">{t('generate.title')}</h1>
          <Tabs value={stage} onValueChange={(v) => { setStage(v as Stage); setPhase('idle'); setProblems([]) }}>
            <TabsList className="mt-2">
              <TabsTrigger value="entries">{t('generate.stage.classes')}</TabsTrigger>
              <TabsTrigger value="teachers">{t('generate.stage.teachers')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground mt-2">
            {stage === 'entries' ? t('generate.classes.desc') : t('generate.teachers.desc')}
          </p>
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
          {stage === 'entries' ? (
            data.lessons.length === 0 ? (
              <EmptyState title={t('lessons.empty')} hint={t('lessons.emptyHint')} />
            ) : (
              <div className="px-4 py-3">
                {lockedAssignments.length > 0 && (
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
                    {t('generate.classes.fixed', { count: lockedAssignments.length })}
                  </p>
                )}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {t('generate.entriesToPlace', {
                    count:
                      data.lessons.filter((l) => !entries.some((e) => e.lessonIds.includes(l.id))).length +
                      entries.filter((e) => !e.locked && e.lessons.length > 0).length
                  })}
                </p>
                {data.departments.map((d) => {
                  const dl = data.lessons.filter((l) => l.departmentId === d.id)
                  const unplacedCount = dl.filter((l) => !entries.some((e) => e.lessonIds.includes(l.id))).length
                  return (
                    <div key={d.id} className="flex items-center gap-2 py-1.5 text-sm">
                      <span className="font-medium whitespace-nowrap">{d.name}</span>
                      <span className="text-muted-foreground truncate flex-1 text-xs">
                        {t('generate.classes.classCounts', { unscheduled: unplacedCount, scheduled: dl.length - unplacedCount })}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          ) : placed.length === 0 ? (
            <div className="px-4 py-3">
              <EmptyState title={t('generate.teachers.notReady')} hint="" />
            </div>
          ) : (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t('generate.teachers.unassigned', { count: placedNoTeacher.length })}
              </p>
              {lockedAssignments.length > 0 && (
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
                  {t('generate.teachers.locked', { count: lockedAssignments.length })}
                </p>
              )}
              {placedNoTeacher.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('generate.teachers.noUnassigned')}</p>
              )}
              {placedNoTeacher.map((e: EntryFull) => (
                <div key={e.id} className="flex items-center gap-2 py-1 text-sm">
                  <span className="font-mono font-medium whitespace-nowrap">{entryCode(e)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t flex gap-2">
          {phase !== 'running' ? (
            <Button variant="primary" className="flex-1" onClick={stage === 'entries' ? runEntries : runTeachers}>
              {t('generate.run', {
                count: stage === 'entries'
                  ? data.lessons.filter((l) => !entries.some((e) => e.lessonIds.includes(l.id))).length
                  : placedNoTeacher.length
              })}
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
          {phase === 'done' && solutionCount > 0 && (
            <>
              <span className="text-sm font-medium">{t('generate.options', { count: solutionCount })}</span>
              <ToggleGroup
                type="single"
                variant="outline"
                value={String(selected)}
                onValueChange={(v) => {
                  if (v !== '') setSelected(Number(v))
                }}
              >
                {(stage === 'entries' ? entrySolutions : teacherSolutions).map((s, i) => (
                  <ToggleGroupItem key={i} value={String(i)}>
                    #{i + 1} · {t('generate.score', { score: Math.round(s.score) })}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Button variant="primary" className="ml-auto" onClick={apply} disabled={!activeSolution}>
                {stage === 'entries' ? t('generate.apply') : t('generate.applyTeachers')}
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

        {activeSolution && 'summary' in activeSolution && (
          <div className="px-5 py-2 text-sm text-muted-foreground flex gap-2 flex-wrap">
            {activeSolution.summary.map((s, i) => (
              <Badge key={i} tone="slate">{summaryText(s, locale)}</Badge>
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
