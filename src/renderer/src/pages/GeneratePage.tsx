import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import TimetableGrid from '../components/TimetableGrid'
import { Badge, Button, Checkbox, EmptyState, Field, Input, Tabs, TabsList, TabsTrigger, ToggleGroup, ToggleGroupItem } from '../components/ui'
import { lessonCode } from '../lib/schedule'
import { summaryText, useI18n, useT } from '../i18n'
import type { SolverResponse } from '../solver/solver.worker'
import type { ClassSolution, LessonFull, PlacedLesson, TeacherSolution } from '@shared/types'
import type { GridMeeting } from '../components/TimetableGrid'

type Stage = 'classes' | 'teachers'
type Phase = 'idle' | 'running' | 'done' | 'problems' | 'error'

export default function GeneratePage() {
  const currentTermId = useApp((s) => s.currentTermId)
  const toast = useApp((s) => s.toast)
  const t = useT()
  const { locale } = useI18n()
  const { data, reload } = useAsync(() => window.api.schedule.getData(currentTermId!), [currentTermId])
  const [stage, setStage] = useState<Stage>('classes')
  const [includeClasses, setIncludeClasses] = useState<Record<number, boolean> | null>(null)
  const [timeLimitSec, setTimeLimitSec] = useState<number>(8)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState({ nodes: 0, solutions: 0 })
  const [problems, setProblems] = useState<string[]>([])
  const [classSolutions, setClassSolutions] = useState<ClassSolution[]>([])
  const [teacherSolutions, setTeacherSolutions] = useState<TeacherSolution[]>([])
  const [selected, setSelected] = useState<number>(0)
  const workerRef = useRef<Worker | null>(null)

  const lessons = data?.lessons ?? []
  const scheduled = useMemo(() => lessons.filter((l) => l.meetings.length > 0), [lessons])
  const unassignedLessons = useMemo(() => scheduled.filter((l) => l.teacherId === null), [scheduled])
  const lockedAssignments = useMemo(
    () => scheduled.filter((l) => l.locked && l.teacherId !== null),
    [scheduled]
  )

  useEffect(() => {
    if (data && includeClasses === null) {
      const initial: Record<number, boolean> = {}
      for (const c of data.classes) {
        const cls = data.lessons.filter((l) => l.classId === c.id)
        initial[c.id] = cls.some((l) => l.meetings.length === 0)
      }
      setIncludeClasses(initial)
    }
  }, [data, includeClasses])

  useEffect(() => () => workerRef.current?.terminate(), [])

  const classSolution = classSolutions[selected] ?? null
  const teacherSolution = teacherSolutions[selected] ?? null

  const selectedClassIds = useMemo(
    () =>
      includeClasses
        ? Object.entries(includeClasses)
            .filter(([, on]) => on)
            .map(([id]) => Number(id))
        : [],
    [includeClasses]
  )

  const previewMeetings: GridMeeting[] = useMemo(() => {
    if (!data) return []
    const byId = new Map(lessons.map((l) => [l.id, l]))
    if (stage === 'classes') {
      if (!classSolution) return []
      const fixedMeetings = lessons
        .filter((l) => l.locked && l.meetings.length > 0)
        .map((l) => ({
          lessonId: l.id,
          label: lessonCode(l),
          title: l.subjectTitle,
          days: l.meetings.flatMap((m) => m.days),
          start: l.meetings[0]?.start ?? 0,
          end: l.meetings[0]?.end ?? 0,
          teacherLabel: l.teacherName ?? '—',
          classLabel: l.className,
          subjectCode: l.subjectCode,
          dimmed: true
        }))
      const placed = Object.entries(classSolution.assignments).map(([id, a]) => {
        const l = byId.get(Number(id)) as LessonFull
        return {
          lessonId: l.id,
          label: lessonCode(l),
          title: l.subjectTitle,
          days: [...a.days],
          start: a.start,
          end: a.end,
          teacherLabel: l.teacherName ?? '—',
          classLabel: l.className,
          subjectCode: l.subjectCode,
          dimmed: false
        }
      })
      return [...fixedMeetings, ...placed]
    } else {
      if (!teacherSolution) return []
      const teacherById = new Map(data.teachers.map((tc) => [tc.id, tc]))
      return scheduled.map((l) => {
        const assigned = teacherSolution.assignments[String(l.id)]
        const tid = assigned !== undefined ? assigned : l.teacherId
        const teacher = tid !== null ? teacherById.get(tid) : undefined
        return {
          lessonId: l.id,
          label: lessonCode(l),
          title: l.subjectTitle,
          days: l.meetings.flatMap((m) => m.days),
          start: l.meetings[0]?.start ?? 0,
          end: l.meetings[0]?.end ?? 0,
          teacherLabel: teacher?.name ?? '—',
          classLabel: l.className,
          subjectCode: l.subjectCode,
          dimmed: assigned === undefined
        }
      })
    }
  }, [data, stage, classSolution, teacherSolution, lessons, scheduled])

  if (!data) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>
  if (includeClasses === null) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  const runClasses = () => {
    if (selectedClassIds.length === 0) {
      toast(t('generate.selectFirst'), 'error')
      return
    }
    const worker = new Worker(new URL('../solver/solver.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    setPhase('running')
    setClassSolutions([])
    setProblems([])
    setProgress({ nodes: 0, solutions: 0 })
    const settings = {
      ...data.settings,
      solver: { ...data.settings.solver, timeLimitMs: timeLimitSec * 1000 }
    }
    const flexible = lessons
      .filter((l) => selectedClassIds.includes(l.classId) && !l.locked)
      .map((l) => ({
        id: l.id,
        classId: l.classId,
        subjectId: l.subjectId,
        code: lessonCode(l),
        sessionsPerWeek: l.sessionsPerWeek,
        durationMinutes: l.durationMinutes
      }))
    const fixed = lessons
      .filter((l) => l.locked && l.meetings.length > 0)
      .map((l) => ({
        id: l.id,
        classId: l.classId,
        subjectId: l.subjectId,
        code: lessonCode(l),
        meetings: l.meetings
      }))
    worker.onmessage = handleWorkerMessage('classes', worker)
    worker.postMessage({
      type: 'solveClasses',
      input: {
        settings,
        classes: data.classes.map((c) => ({ id: c.id, name: c.name })),
        flexible,
        fixed
      }
    })
  }

  const runTeachers = () => {
    if (scheduled.length === 0) {
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
    const placed: PlacedLesson[] = scheduled.map((l) => ({
      id: l.id,
      classId: l.classId,
      subjectId: l.subjectId,
      code: lessonCode(l),
      sessionsPerWeek: l.sessionsPerWeek,
      durationMinutes: l.durationMinutes,
      meetings: l.meetings,
      teacherId: l.teacherId,
      fixed: l.locked && l.teacherId !== null
    }))
    worker.onmessage = handleWorkerMessage('teachers', worker)
    worker.postMessage({ type: 'solveTeachers', input: { settings, teachers: data.teachers, lessons: placed } })
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
      if (msg.kind === 'classes') {
        const result = msg.result as { solutions: ClassSolution[]; problems: string[] }
        setClassSolutions(result.solutions)
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
      if (stage === 'classes') {
        if (!classSolution) return
        const cleared = await window.api.schedule.applyClasses(currentTermId!, classSolution.assignments)
        toast(
          cleared > 0 ? t('toast.overridesCleared', { count: cleared }) : t('toast.scheduleApplied'),
          'success'
        )
      } else {
        if (!teacherSolution) return
        await window.api.schedule.assignTeachers(currentTermId!, teacherSolution.assignments)
        toast(t('toast.teachersAssigned'), 'success')
      }
      reload()
      setPhase('idle')
      setClassSolutions([])
      setTeacherSolutions([])
    } catch (err) {
      toast(String(err), 'error')
    }
  }

  const solutionCount = stage === 'classes' ? classSolutions.length : teacherSolutions.length
  const activeSolution = stage === 'classes' ? classSolution : teacherSolution

  return (
    <div className="flex h-full">
      <div className="w-96 shrink-0 border-r bg-card flex flex-col overflow-y-auto">
        <div className="px-4 py-3 border-b">
          <h1 className="font-semibold">{t('generate.title')}</h1>
          <Tabs value={stage} onValueChange={(v) => { setStage(v as Stage); setPhase('idle'); setProblems([]) }}>
            <TabsList className="mt-2">
              <TabsTrigger value="classes">{t('generate.stage.classes')}</TabsTrigger>
              <TabsTrigger value="teachers">{t('generate.stage.teachers')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <p className="text-xs text-muted-foreground mt-2">
            {stage === 'classes' ? t('generate.classes.desc') : t('generate.teachers.desc')}
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
          {stage === 'classes' ? (
            data.classes.length === 0 ? (
              <EmptyState title={t('classes.empty')} hint={t('classes.emptyHint')} />
            ) : (
              <div className="px-4 py-3">
                {lessons
                  .filter((l) => l.locked && l.meetings.length > 0)
                  .length > 0 && (
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
                    {t('generate.classes.fixed', {
                      count: lessons.filter((l) => l.locked && l.meetings.length > 0).length
                    })}
                  </p>
                )}
                {data.classes.map((c) => {
                  const cls = lessons.filter((l) => l.classId === c.id)
                  const unscheduled = cls.filter((l) => l.meetings.length === 0).length
                  const placedCount = cls.length - unscheduled
                  return (
                    <label key={c.id} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                      <Checkbox
                        checked={includeClasses[c.id] ?? false}
                        onCheckedChange={(v) => setIncludeClasses({ ...includeClasses, [c.id]: v === true })}
                        aria-label={c.name}
                      />
                      <span className="font-medium whitespace-nowrap">{c.name}</span>
                      <span className="text-muted-foreground truncate flex-1 text-xs">
                        {t('generate.classes.classCounts', { unscheduled, scheduled: placedCount })}
                      </span>
                    </label>
                  )
                })}
              </div>
            )
          ) : scheduled.length === 0 ? (
            <div className="px-4 py-3">
              <EmptyState title={t('generate.teachers.notReady')} hint="" />
            </div>
          ) : (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t('generate.teachers.unassigned', { count: unassignedLessons.length })}
              </p>
              {lockedAssignments.length > 0 && (
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
                  {t('generate.teachers.locked', { count: lockedAssignments.length })}
                </p>
              )}
              {unassignedLessons.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('generate.teachers.noUnassigned')}</p>
              )}
              {unassignedLessons.map((l) => (
                <div key={l.id} className="flex items-center gap-2 py-1 text-sm">
                  <span className="font-mono font-medium whitespace-nowrap">{lessonCode(l)}</span>
                  <span className="text-muted-foreground truncate flex-1">{l.subjectTitle}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t flex gap-2">
          {phase !== 'running' ? (
            <Button
              variant="primary"
              className="flex-1"
              onClick={stage === 'classes' ? runClasses : runTeachers}
              disabled={stage === 'classes' && selectedClassIds.length === 0}
            >
              {t('generate.run', { count: stage === 'classes' ? selectedClassIds.length : unassignedLessons.length })}
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
                {(stage === 'classes' ? classSolutions : teacherSolutions).map((s, i) => (
                  <ToggleGroupItem key={i} value={String(i)}>
                    #{i + 1} · {t('generate.score', { score: Math.round(s.score) })}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Button variant="primary" className="ml-auto" onClick={apply} disabled={!activeSolution}>
                {stage === 'classes' ? t('generate.apply') : t('generate.applyTeachers')}
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
