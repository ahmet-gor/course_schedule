import { useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import { Button, ConfirmDialog, EmptyState, Field, Input, Modal } from '../components/ui'
import { useT } from '../i18n'
import type { Schedule } from '@shared/types'

export default function SchedulesPage() {
  const toast = useApp((s) => s.toast)
  const setPage = useApp((s) => s.setPage)
  const selectSchedule = useApp((s) => s.selectSchedule)
  const loadSchedules = useApp((s) => s.loadSchedules)
  const currentScheduleId = useApp((s) => s.currentScheduleId)
  const t = useT()
  const { data, reload } = useAsync(() => window.api.schedules.list(), [])
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<Schedule | null>(null)
  const [confirming, setConfirming] = useState<Schedule | null>(null)

  const schedules = data ?? []
  const refresh = async () => {
    reload()
    await loadSchedules()
  }

  const open = (s: Schedule) => {
    selectSchedule(s.id)
    setPage('timetables')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 bg-card border-b flex items-center gap-3">
        <h1 className="font-semibold">{t('schedules.title')}</h1>
        <span className="text-sm text-muted-foreground">{t('schedules.subtitle')}</span>
        <div className="ml-auto flex gap-2">
          <Button onClick={() => void loadSample()} disabled={schedules.length > 0}>
            {t('onboarding.loadSample')}
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('schedules.new')}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {schedules.length === 0 ? (
          <EmptyState title={t('schedules.empty')} hint={t('schedules.emptyHint')} />
        ) : (
          <table className="w-full bg-card rounded-lg border text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('schedules.col.name')}</th>
                <th className="px-4 py-2.5 font-medium">{t('schedules.col.created')}</th>
                <th className="px-4 py-2.5 font-medium w-44"></th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s) => (
                <tr
                  key={s.id}
                  className={`border-t hover:bg-muted/40 cursor-pointer ${s.id === currentScheduleId ? 'bg-muted/30' : ''}`}
                  onClick={() => open(s)}
                >
                  <td className="px-4 py-2.5 font-semibold">
                    {s.name}
                    {s.id === currentScheduleId && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{t('schedules.active')}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); open(s) }}>
                      {t('schedules.open')}
                    </Button>
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); setRenaming(s) }}>
                      {t('common.edit')}
                    </Button>
                    <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); setConfirming(s) }}>
                      {t('common.delete')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <ScheduleDialog
          title={t('schedules.newTitle')}
          initialName=""
          onClose={() => setCreating(false)}
          onSave={async (name) => {
            const created = await window.api.schedules.create(name)
            setCreating(false)
            await refresh()
            toast(t('schedule.saved', { name: created.name }), 'success')
          }}
        />
      )}
      {renaming && (
        <ScheduleDialog
          title={t('schedules.editTitle', { name: renaming.name })}
          initialName={renaming.name}
          onClose={() => setRenaming(null)}
          onSave={async (name) => {
            await window.api.schedules.rename(renaming.id, name)
            setRenaming(null)
            await refresh()
            toast(t('schedule.saved', { name }), 'success')
          }}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={t('common.confirmTitle')}
          description={t('schedules.confirmDelete', { name: confirming.name })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            await window.api.schedules.remove(confirming.id)
            setConfirming(null)
            await refresh()
            toast(t('schedule.deleted', { name: confirming.name }), 'success')
          }}
        />
      )}
    </div>
  )

  async function loadSample() {
    try {
      const schedule = await window.api.io.seedSample()
      await refresh()
      toast(t('toast.sampleLoaded'), 'success')
      open(schedule)
    } catch (err) {
      toast(String(err), 'error')
    }
  }
}

function ScheduleDialog({
  title,
  initialName,
  onClose,
  onSave
}: {
  title: string
  initialName: string
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const t = useT()
  const [name, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)

  return (
    <Modal title={title} onClose={onClose}>
      <Field label={t('schedules.col.name')}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('schedules.namePlaceholder')}
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2 pt-4">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button
          variant="primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true)
            try {
              await onSave(name.trim())
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
