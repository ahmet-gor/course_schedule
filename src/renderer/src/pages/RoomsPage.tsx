import { useState } from 'react'
import { useAsync } from '../components/Layout'
import { useApp } from '../store/useApp'
import { Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal } from '../components/ui'
import { useT } from '../i18n'
import type { Room } from '@shared/types'

export default function RoomsPage() {
  const toast = useApp((s) => s.toast)
  const t = useT()
  const { data: rooms, reload } = useAsync(() => window.api.rooms.list(), [])
  const [editing, setEditing] = useState<Room | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState<Room | null>(null)

  if (!rooms) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 bg-card border-b flex items-center justify-between">
        <h1 className="font-semibold">{t('rooms.title')}</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          {t('rooms.new')}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {rooms.length === 0 ? (
          <EmptyState title={t('rooms.empty')} hint={t('rooms.emptyHint')} />
        ) : (
          <table className="w-full bg-card rounded-lg border text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">{t('rooms.col.room')}</th>
                <th className="px-4 py-2.5 font-medium">{t('rooms.col.building')}</th>
                <th className="px-4 py-2.5 font-medium">{t('rooms.col.capacity')}</th>
                <th className="px-4 py-2.5 font-medium">{t('rooms.col.travelGroup')}</th>
                <th className="px-4 py-2.5 font-medium w-44"></th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-mono font-semibold">{r.name}</td>
                  <td className="px-4 py-2.5">{r.building}</td>
                  <td className="px-4 py-2.5">{r.capacity}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone="indigo">{r.travelGroup || 'A'}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                    <Button size="sm" onClick={() => setEditing(r)}>{t('common.edit')}</Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirming(r)}>
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
          description={t('room.confirmDelete', { name: confirming.name })}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          onClose={() => setConfirming(null)}
          onConfirm={async () => {
            await window.api.rooms.remove(confirming.id)
            setConfirming(null)
            reload()
            toast(t('room.deleted'), 'success')
          }}
        />
      )}
      {(creating || editing) && (
        <RoomDialog
          room={editing}
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

function RoomDialog({ room, onDone }: { room: Room | null; onDone: (message?: string) => void }) {
  const t = useT()
  const [name, setName] = useState(room?.name ?? '')
  const [building, setBuilding] = useState(room?.building ?? '')
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 40))
  const [travelGroup, setTravelGroup] = useState(room?.travelGroup ?? 'A')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const payload = {
        name: name.trim(),
        building: building.trim(),
        capacity: parseInt(capacity, 10) || 0,
        travelGroup: travelGroup.trim().toUpperCase() || 'A'
      }
      if (room) await window.api.rooms.update(room.id, payload)
      else await window.api.rooms.create(payload)
      onDone(t('room.saved', { name: payload.name }))
    } catch (err) {
      useApp.getState().toast(String(err), 'error')
      setBusy(false)
    }
  }

  return (
    <Modal title={room ? t('rooms.editTitle', { name: room.name }) : t('rooms.newTitle')} onClose={() => onDone()}>
      <div className="flex flex-col gap-3">
        <Field label={t('rooms.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('rooms.namePlaceholder')} />
        </Field>
        <Field label={t('rooms.building')}>
          <Input value={building} onChange={(e) => setBuilding(e.target.value)} placeholder={t('rooms.buildingPlaceholder')} />
        </Field>
        <Field label={t('rooms.capacity')}>
          <Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </Field>
        <Field label={t('rooms.travelGroup')} hint={t('rooms.travelGroupHint')}>
          <Input value={travelGroup} onChange={(e) => setTravelGroup(e.target.value)} placeholder="A" />
        </Field>
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
