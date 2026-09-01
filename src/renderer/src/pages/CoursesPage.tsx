import { useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import { Button, ConfirmDialog, EmptyState, Field, Input, Modal } from '../components/ui'
import { useT } from '../i18n'
import type { Course } from '@shared/types'

export default function CoursesPage() {
  const currentTermId = useApp((s) => s.currentTermId)
  const toast = useApp((s) => s.toast)
  const t = useT()
  const { data: courses, reload } = useAsync(() => window.api.courses.list(currentTermId!), [currentTermId])
  const [editing, setEditing] = useState<Course | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState<Course | null>(null)

  if (!courses) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 bg-card border-b flex items-center justify-between">
        <h1 className="font-semibold">{t('courses.title')}</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          {t('courses.new')}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {courses.length === 0 ? (
          <EmptyState title={t('courses.empty')} hint={t('courses.emptyHint')} />
        ) : (
          <table className="w-full bg-card rounded-lg border text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('courses.col.code')}</th>
                <th className="px-4 py-2.5 font-medium">{t('courses.col.title')}</th>
                <th className="px-4 py-2.5 font-medium">{t('courses.col.credits')}</th>
                <th className="px-4 py-2.5 font-medium w-44"></th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-mono font-semibold">{c.code}</td>
                  <td className="px-4 py-2.5">{c.title}</td>
                  <td className="px-4 py-2.5">{c.credits}</td>
                  <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                    <Button size="sm" onClick={() => setEditing(c)}>{t('common.edit')}</Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirming(c)}>
                      {t('common.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {confirming && (
        <ConfirmDialog
          title={t('common.confirmTitle')}
          description={t('course.confirmDelete', { code: confirming.code })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            try {
              await window.api.courses.remove(confirming.id)
              setConfirming(null)
              reload()
              toast(t('course.deleted', { code: confirming.code }), 'success')
            } catch (err) {
              setConfirming(null)
              toast(String(err), 'error')
            }
          }}
        />
      )}
      {(creating || editing) && (
        <CourseDialog
          course={editing}
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

function CourseDialog({ course, onDone }: { course: Course | null; onDone: (message?: string) => void }) {
  const currentTermId = useApp((s) => s.currentTermId)
  const t = useT()
  const [code, setCode] = useState(course?.code ?? '')
  const [title, setTitle] = useState(course?.title ?? '')
  const [credits, setCredits] = useState(String(course?.credits ?? 3))
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!code.trim() || !title.trim()) return
    setBusy(true)
    try {
      const payload = { code: code.trim().toUpperCase(), title: title.trim(), credits: parseFloat(credits) || 0 }
      if (course) await window.api.courses.update(course.id, payload)
      else await window.api.courses.create(currentTermId!, payload)
      onDone(t('course.saved', { name: payload.code }))
    } catch (err) {
      useApp.getState().toast(String(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title={course ? t('courses.editTitle', { code: course.code }) : t('courses.newTitle')} onClose={() => onDone()}>
      <div className="flex flex-col gap-3">
        <Field label={t('courses.col.code')}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('courses.codePlaceholder')} />
        </Field>
        <Field label={t('courses.col.title')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('courses.titlePlaceholder')} />
        </Field>
        <Field label={t('courses.credits')}>
          <Input type="number" min="0" max="12" step="0.5" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={() => onDone()}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={busy || !code.trim() || !title.trim()}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
