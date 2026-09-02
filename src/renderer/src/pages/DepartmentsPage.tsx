import { useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import { Button, ConfirmDialog, EmptyState, Field, Input, Modal } from '../components/ui'
import { useT } from '../i18n'
import type { Department, LessonRef } from '@shared/types'

export default function DepartmentsPage() {
  const toast = useApp((s) => s.toast)
  const t = useT()
  const deptsData = useAsync(() => window.api.departments.list(), [])
  const lessonsData = useAsync(() => window.api.lessons.list(), [])
  const reload = () => {
    deptsData.reload()
    lessonsData.reload()
  }
  const [deptId, setDeptId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [confirming, setConfirming] = useState<Department | null>(null)

  const departments = deptsData.data ?? []
  const lessons = lessonsData.data ?? []
  const activeDept = deptId !== null ? departments.find((d) => d.id === deptId) ?? null : null

  const deptLessons = (id: number) => lessons.filter((l) => l.departmentId === id)

  const body = !activeDept ? (
    <>
      <div className="px-5 py-3 bg-card border-b flex items-center gap-3">
        <h1 className="font-semibold">{t('departments.title')}</h1>
        <span className="text-sm text-muted-foreground">{t('departments.subtitle')}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('departments.new')}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {departments.length === 0 ? (
          <EmptyState title={t('departments.empty')} hint={t('departments.emptyHint')} />
        ) : (
          <table className="w-full bg-card rounded-lg border text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('departments.col.name')}</th>
                <th className="px-4 py-2.5 font-medium">{t('departments.col.lessons')}</th>
                <th className="px-4 py-2.5 font-medium">{t('departments.col.hours')}</th>
                <th className="px-4 py-2.5 font-medium w-36"></th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => {
                const dl = deptLessons(d.id)
                const totalSessions = dl.reduce((s, l) => s + l.sessionsPerWeek, 0)
                const totalMinutes = dl.reduce((s, l) => s + l.sessionsPerWeek * l.durationMinutes, 0)
                return (
                  <tr key={d.id} className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => setDeptId(d.id)}>
                    <td className="px-4 py-2.5 font-semibold whitespace-nowrap">
                      {d.name}
                      {d.homeroom && <span className="ml-2 font-normal text-muted-foreground">{d.homeroom}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {t('departments.lessonsCount', { count: dl.length })}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {dl.length > 0
                        ? t('departments.weeklyTotal', {
                            count: totalSessions,
                            hours: Math.round((totalMinutes / 60) * 10) / 10
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); setDeptId(d.id) }}>
                        {t('departments.open')}
                      </Button>
                      <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); setConfirming(d) }}>
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
    </>
  ) : (
    <>
      <div className="px-5 py-3 bg-card border-b flex items-center gap-3 flex-wrap">
        <Button size="sm" onClick={() => setDeptId(null)}>← {t('departments.back')}</Button>
        <h1 className="font-semibold">{activeDept.name}</h1>
        <span className="text-sm text-muted-foreground">
          {t('departments.lessonsCount', { count: deptLessons(activeDept.id).length })}
        </span>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => setEditing(activeDept)}>{t('common.edit')}</Button>
          <Button variant="danger" onClick={() => setConfirming(activeDept)}>
            {t('common.delete')}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-5 space-y-6">
        <section className="bg-card rounded-lg border p-4">
          <h2 className="font-semibold mb-3">{t('departments.settings')}</h2>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">{t('departments.name')}</p>
              <p className="font-medium">{activeDept.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('departments.capacity')}</p>
              <p className="font-medium">{activeDept.capacity}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('departments.homeroom')}</p>
              <p className="font-medium">{activeDept.homeroom || '—'}</p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-semibold mb-3">{t('departments.weeklyHours')}</h2>
          {deptLessons(activeDept.id).length === 0 ? (
            <EmptyState title={t('departments.noSubjects')} hint={t('departments.needLessons')} />
          ) : (
            <table className="w-full bg-card rounded-lg border text-sm">
              <thead>
                <tr className="bg-muted/50 text-left text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">{t('lessons.col.code')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('lessons.col.title')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('classes.sessionsPerWeek')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('classes.duration')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('departments.col.total')}</th>
                </tr>
              </thead>
              <tbody>
                {deptLessons(activeDept.id).map((l: LessonRef) => (
                  <tr key={l.id} className="border-t hover:bg-muted/40">
                    <td className="px-4 py-2.5 font-mono font-semibold whitespace-nowrap">{l.code}</td>
                    <td className="px-4 py-2.5">{l.title || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-2.5">{l.sessionsPerWeek}</td>
                    <td className="px-4 py-2.5">{t('classes.pattern', { count: l.sessionsPerWeek, minutes: l.durationMinutes })}</td>
                    <td className="px-4 py-2.5">{Math.round((l.sessionsPerWeek * l.durationMinutes) / 6) / 10} h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted-foreground mt-2">{t('departments.manageLessonsHint')}</p>
        </section>
      </div>
    </>
  )

  return (
    <div className="flex flex-col h-full">
      {body}
      {(creating || editing) && (
        <DepartmentDialog
          dept={editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSave={async (payload) => {
            if (editing) await window.api.departments.update(editing.id, payload)
            else await window.api.departments.create(payload)
            setCreating(false)
            setEditing(null)
            reload()
            toast(t('department.saved', { name: payload.name }), 'success')
          }}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={t('common.confirmTitle')}
          description={t('departments.confirmDelete', { name: confirming.name })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            await window.api.departments.remove(confirming.id)
            setConfirming(null)
            setDeptId(null)
            reload()
            toast(t('department.deleted', { name: confirming.name }), 'success')
          }}
        />
      )}
    </div>
  )
}

function DepartmentDialog({
  dept,
  onClose,
  onSave
}: {
  dept: Department | null
  onClose: () => void
  onSave: (payload: { name: string; capacity: number; homeroom: string }) => Promise<void>
}) {
  const t = useT()
  const [name, setName] = useState(dept?.name ?? '')
  const [capacity, setCapacity] = useState(String(dept?.capacity ?? 0))
  const [homeroom, setHomeroom] = useState(dept?.homeroom ?? '')
  const [busy, setBusy] = useState(false)

  return (
    <Modal
      title={dept ? t('departments.editTitle', { name: dept.name }) : t('departments.newTitle')}
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('departments.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('departments.namePlaceholder')} />
        </Field>
        <Field label={t('departments.capacity')}>
          <Input type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </Field>
        <Field label={t('departments.homeroom')}>
          <Input value={homeroom} onChange={(e) => setHomeroom(e.target.value)} placeholder={t('departments.homeroomPlaceholder')} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true)
            try {
              await onSave({
                name: name.trim(),
                capacity: parseInt(capacity, 10) || 0,
                homeroom: homeroom.trim()
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
