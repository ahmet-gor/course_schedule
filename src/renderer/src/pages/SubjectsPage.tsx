import { useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import { Button, ConfirmDialog, EmptyState, Field, Input, Modal } from '../components/ui'
import { useT } from '../i18n'
import type { Subject } from '@shared/types'

export default function SubjectsPage() {
  const currentTermId = useApp((s) => s.currentTermId)
  const toast = useApp((s) => s.toast)
  const t = useT()
  const { data: subjects, reload } = useAsync(() => window.api.subjects.list(currentTermId!), [currentTermId])
  const [editing, setEditing] = useState<Subject | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState<Subject | null>(null)

  if (!subjects) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 bg-card border-b flex items-center justify-between">
        <h1 className="font-semibold">{t('subjects.title')}</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          {t('subjects.new')}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {subjects.length === 0 ? (
          <EmptyState title={t('subjects.empty')} hint={t('subjects.emptyHint')} />
        ) : (
          <table className="w-full bg-card rounded-lg border text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('subjects.col.code')}</th>
                <th className="px-4 py-2.5 font-medium">{t('subjects.col.title')}</th>
                <th className="px-4 py-2.5 font-medium w-44"></th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-mono font-semibold">{s.code}</td>
                  <td className="px-4 py-2.5">{s.title}</td>
                  <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                    <Button size="sm" onClick={() => setEditing(s)}>{t('common.edit')}</Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirming(s)}>
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
          description={t('subject.confirmDelete', { code: confirming.code })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            try {
              await window.api.subjects.remove(confirming.id)
              setConfirming(null)
              reload()
              toast(t('subject.deleted', { code: confirming.code }), 'success')
            } catch (err) {
              setConfirming(null)
              toast(String(err), 'error')
            }
          }}
        />
      )}
      {(creating || editing) && (
        <SubjectDialog
          subject={editing}
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

function SubjectDialog({ subject, onDone }: { subject: Subject | null; onDone: (message?: string) => void }) {
  const currentTermId = useApp((s) => s.currentTermId)
  const t = useT()
  const [code, setCode] = useState(subject?.code ?? '')
  const [title, setTitle] = useState(subject?.title ?? '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!code.trim() || !title.trim()) return
    setBusy(true)
    try {
      const payload = { code: code.trim().toUpperCase(), title: title.trim() }
      if (subject) await window.api.subjects.update(subject.id, payload)
      else await window.api.subjects.create(currentTermId!, payload)
      onDone(t('subject.saved', { name: payload.code }))
    } catch (err) {
      useApp.getState().toast(String(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title={subject ? t('subjects.editTitle', { code: subject.code }) : t('subjects.newTitle')} onClose={() => onDone()}>
      <div className="flex flex-col gap-3">
        <Field label={t('subjects.col.code')}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('subjects.codePlaceholder')} />
        </Field>
        <Field label={t('subjects.col.title')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('subjects.titlePlaceholder')} />
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
