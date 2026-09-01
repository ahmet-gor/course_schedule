import { useMemo, useState } from 'react'
import { useAsync } from '../components/Layout'
import { useApp } from '../store/useApp'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, ToggleGroup, ToggleGroupItem } from '../components/ui'
import { toHHMM, fromHHMM } from '@shared/time'
import { DAY_LETTERS, labelDays, useI18n, useT } from '../i18n'
import type { Instructor, TimeSlot } from '@shared/types'

interface SlotDraft {
  days: number[]
  start: string
  end: string
}

export default function InstructorsPage() {
  const toast = useApp((s) => s.toast)
  const t = useT()
  const { locale } = useI18n()
  const { data: instructors, reload } = useAsync(() => window.api.instructors.list(), [])
  const [editing, setEditing] = useState<Instructor | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState<Instructor | null>(null)

  if (!instructors) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 bg-card border-b flex items-center justify-between">
        <h1 className="font-semibold">{t('instructors.title')}</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          {t('instructors.new')}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {instructors.length === 0 ? (
          <EmptyState title={t('instructors.empty')} hint={t('instructors.emptyHint')} />
        ) : (
          <table className="w-full bg-card rounded-lg border text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('instructors.col.name')}</th>
                <th className="px-4 py-2.5 font-medium">{t('instructors.col.email')}</th>
                <th className="px-4 py-2.5 font-medium">{t('instructors.col.maxHours')}</th>
                <th className="px-4 py-2.5 font-medium">{t('instructors.col.unavailable')}</th>
                <th className="px-4 py-2.5 font-medium w-44"></th>
              </tr>
            </thead>
            <tbody>
              {instructors.map((i) => (
                <tr key={i.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-medium">{i.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{i.email}</td>
                  <td className="px-4 py-2.5">{i.maxWeeklyHours}</td>
                  <td className="px-4 py-2.5">
                    {i.unavailable.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      i.unavailable.map((u, idx) => (
                        <Badge key={idx} tone="slate">
                          {labelDays(u.days, locale)} {toHHMM(u.start)}–{toHHMM(u.end)}
                        </Badge>
                      ))
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                    <Button size="sm" onClick={() => setEditing(i)}>{t('common.edit')}</Button>
                    <Button
                      variant="danger" size="sm"
                      onClick={() => setConfirming(i)}
                    >
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
          description={t('instructor.confirmDelete', { name: confirming.name })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            await window.api.instructors.remove(confirming.id)
            setConfirming(null)
            reload()
            toast(t('instructor.deleted'), 'success')
          }}
        />
      )}
      {(creating || editing) && (
        <InstructorDialog
          instructor={editing}
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

function InstructorDialog({
  instructor,
  onDone
}: {
  instructor: Instructor | null
  onDone: (message?: string) => void
}) {
  const t = useT()
  const { locale } = useI18n()
  const letters = DAY_LETTERS[locale]
  const [name, setName] = useState(instructor?.name ?? '')
  const [email, setEmail] = useState(instructor?.email ?? '')
  const [maxHours, setMaxHours] = useState(String(instructor?.maxWeeklyHours ?? 12))
  const [slots, setSlots] = useState<SlotDraft[]>(
    (instructor?.unavailable ?? []).map((u) => ({ days: [...u.days], start: toHHMM(u.start), end: toHHMM(u.end) }))
  )
  const [busy, setBusy] = useState(false)

  const unavailable: TimeSlot[] = useMemo(
    () =>
      slots
        .map((s) => ({ days: s.days, start: fromHHMM(s.start) ?? -1, end: fromHHMM(s.end) ?? -1 }))
        .filter((s) => s.days.length > 0 && s.start >= 0 && s.end > s.start),
    [slots]
  )

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        email: email.trim(),
        maxWeeklyHours: parseFloat(maxHours) || 12,
        unavailable
      }
      if (instructor) await window.api.instructors.update(instructor.id, payload)
      else await window.api.instructors.create(payload)
      onDone(t('instructor.saved', { name: payload.name }))
    } catch (err) {
      useApp.getState().toast(String(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title={instructor ? t('instructors.editTitle', { name: instructor.name }) : t('instructors.newTitle')} onClose={() => onDone()}>
      <div className="flex flex-col gap-3">
        <Field label={t('instructors.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('instructors.namePlaceholder')} />
        </Field>
        <Field label={t('instructors.email')}>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ornek@uni.edu.tr" />
        </Field>
        <Field label={t('instructors.maxHours')} hint={t('instructors.maxHoursHint')}>
          <Input type="number" min="1" max="40" step="0.5" value={maxHours} onChange={(e) => setMaxHours(e.target.value)} />
        </Field>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-muted-foreground text-sm">{t('instructors.unavailable')}</span>
            <Button onClick={() => setSlots([...slots, { days: [1], start: '08:00', end: '12:00' }])}>
              {t('instructors.addUnavailable')}
            </Button>
          </div>
          {slots.map((s, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-md p-2 mb-2">
              <ToggleGroup
                type="multiple"
                variant="outline"
                value={s.days.map(String)}
                onValueChange={(vals) =>
                  setSlots(
                    slots.map((x, i) =>
                      i === idx ? { ...x, days: vals.map(Number).sort((a, b) => a - b) } : x
                    )
                  )
                }
                className="gap-1 bg-transparent"
              >
                {[1, 2, 3, 4, 5, 6].map((d) => (
                  <ToggleGroupItem
                    key={d}
                    value={String(d)}
                    className="w-8 h-7 px-0 text-xs font-semibold data-[state=on]:bg-rose-500 data-[state=on]:text-white data-[state=on]:hover:bg-rose-500"
                  >
                    {letters[d]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <Input
                type="time"
                value={s.start}
                onChange={(e) => setSlots(slots.map((x, i) => (i === idx ? { ...x, start: e.target.value } : x)))}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                value={s.end}
                onChange={(e) => setSlots(slots.map((x, i) => (i === idx ? { ...x, end: e.target.value } : x)))}
              />
              <Button variant="ghost" onClick={() => setSlots(slots.filter((_, i) => i !== idx))}>
                ✕
              </Button>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={() => onDone()}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={busy || !name.trim()}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
