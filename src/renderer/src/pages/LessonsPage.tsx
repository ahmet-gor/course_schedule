import { useMemo, useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, Select, SelectOption } from '../components/ui'
import { useT } from '../i18n'
import type { Department, LessonRef } from '@shared/types'

export default function LessonsPage() {
  const toast = useApp((s) => s.toast)
  const t = useT()
  const lessonsData = useAsync(() => window.api.lessons.list(), [])
  const deptsData = useAsync(() => window.api.departments.list(), [])
  const teachersData = useAsync(() => window.api.teachers.list(), [])
  const reload = () => {
    lessonsData.reload()
    teachersData.reload()
  }
  const [deptFilter, setDeptFilter] = useState('all')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<LessonRef | null>(null)
  const [confirming, setConfirming] = useState<LessonRef | null>(null)

  const lessons = lessonsData.data ?? []
  const departments = deptsData.data ?? []
  const teachers = teachersData.data ?? []
  const filtered = useMemo(
    () => (deptFilter === 'all' ? lessons : lessons.filter((l) => String(l.departmentId) === deptFilter)),
    [lessons, deptFilter]
  )

  const teacherName = (id: number) => teachers.find((tc) => tc.id === id)?.name ?? `#${id}`

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 bg-card border-b flex items-center gap-3">
        <h1 className="font-semibold">{t('lessons.title')}</h1>
        <span className="text-sm text-muted-foreground">{t('lessons.subtitle')}</span>
        <Select className="w-48" value={deptFilter} onChange={setDeptFilter}>
          <SelectOption value="all">{t('lessons.allDepartments')}</SelectOption>
          {departments.map((d) => (
            <SelectOption key={d.id} value={String(d.id)}>
              {d.name}
            </SelectOption>
          ))}
        </Select>
        <div className="ml-auto flex gap-2">
          <Button variant="primary" onClick={() => departments.length > 0 && setCreating(true)} disabled={departments.length === 0}>
            {t('lessons.new')}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {departments.length === 0 ? (
          <EmptyState title={t('lessons.noDepartments')} hint={t('lessons.noDepartmentsHint')} />
        ) : lessons.length === 0 ? (
          <EmptyState title={t('lessons.empty')} hint={t('lessons.emptyHint')} />
        ) : (
          <table className="w-full bg-card rounded-lg border text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('departments.col.name')}</th>
                <th className="px-4 py-2.5 font-medium">{t('lessons.col.code')}</th>
                <th className="px-4 py-2.5 font-medium">{t('lessons.col.title')}</th>
                <th className="px-4 py-2.5 font-medium">{t('lessons.col.hours')}</th>
                <th className="px-4 py-2.5 font-medium">{t('teachers.col.lessons')}</th>
                <th className="px-4 py-2.5 font-medium w-28"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{l.departmentName}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold whitespace-nowrap">{l.code}</td>
                  <td className="px-4 py-2.5">{l.title || <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {t('classes.pattern', { count: l.sessionsPerWeek, minutes: l.durationMinutes })}
                    <span className="ml-2">{Math.round((l.sessionsPerWeek * l.durationMinutes) / 6) / 10} h</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {l.teacherIds.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex gap-1 flex-wrap">
                        {l.teacherIds.map((id) => (
                          <Badge key={id} tone="slate">{teacherName(id)}</Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                    <Button size="sm" onClick={() => setEditing(l)}>{t('common.edit')}</Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirming(l)}>
                      {t('common.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(creating || editing) && (
        <LessonDialog
          departments={departments}
          lesson={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSave={async (payload) => {
            if (editing) await window.api.lessons.update(editing.id, payload)
            else await window.api.lessons.create(payload)
            setCreating(false)
            setEditing(null)
            reload()
            toast(t('lesson.saved', { lesson: payload.code }), 'success')
          }}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={t('common.confirmTitle')}
          description={t('lessons.confirmDelete', { lesson: confirming.code })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            await window.api.lessons.remove(confirming.id)
            setConfirming(null)
            reload()
            toast(t('lessons.deleted', { lesson: confirming.code }), 'success')
          }}
        />
      )}
    </div>
  )
}

function LessonDialog({
  departments,
  lesson,
  onClose,
  onSave
}: {
  departments: Department[]
  lesson: LessonRef | null
  onClose: () => void
  onSave: (payload: { departmentId: number; code: string; title: string; sessionsPerWeek: number; durationMinutes: number }) => Promise<void>
}) {
  const t = useT()
  const [departmentId, setDepartmentId] = useState(lesson?.departmentId ?? departments[0]?.id ?? 0)
  const [code, setCode] = useState(lesson?.code ?? '')
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [sessionsPerWeek, setSessionsPerWeek] = useState(String(lesson?.sessionsPerWeek ?? 4))
  const [durationMinutes, setDurationMinutes] = useState(String(lesson?.durationMinutes ?? 40))
  const [busy, setBusy] = useState(false)

  const valid =
    code.trim().length > 0 &&
    departments.some((d) => d.id === departmentId)

  return (
    <Modal
      title={lesson ? t('lessons.editTitle', { lesson: lesson.code }) : t('lessons.newTitle')}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('departments.col.name')}>
          <Select value={String(departmentId)} onChange={(v) => setDepartmentId(Number(v))}>
            {departments.map((d) => (
              <SelectOption key={d.id} value={String(d.id)}>
                {d.name}
              </SelectOption>
            ))}
          </Select>
        </Field>
        <Field label={t('lessons.col.code')}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('lessons.codePlaceholder')} />
        </Field>
        <Field label={t('lessons.col.title')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('lessons.titlePlaceholder')} />
        </Field>
        <Field label={t('classes.sessionsPerWeek')} hint={t('classes.sessionsHint')}>
          <Input type="number" min="1" max="6" value={sessionsPerWeek} onChange={(e) => setSessionsPerWeek(e.target.value)} />
        </Field>
        <Field label={t('classes.duration')}>
          <Input type="number" min="30" step="5" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground pt-3">{t('lessons.teachersHint')}</p>
      <div className="flex justify-end gap-2 pt-3">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="primary"
          disabled={busy || !valid}
          onClick={async () => {
            setBusy(true)
            try {
              await onSave({
                departmentId,
                code: code.trim(),
                title: title.trim(),
                sessionsPerWeek: parseInt(sessionsPerWeek, 10) || 1,
                durationMinutes: parseInt(durationMinutes, 10) || 40
              })
            } catch (err) {
              useApp.getState().toast(String(err), 'error')
              setBusy(false)
            }
          }}
        >
          {t('common.save')}
        </Button>
      </div>
    </Modal>
  )
}
