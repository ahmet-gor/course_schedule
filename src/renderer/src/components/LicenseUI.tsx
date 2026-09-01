import { useState } from 'react'
import { useLicensing } from '../store/useLicensing'
import { useApp } from '../store/useApp'
import { useT } from '../i18n'
import { Badge, Button, Input } from './ui'

export function LicenseBanner() {
  const { info, setDialogOpen } = useLicensing()
  const t = useT()
  if (!info || info.mode === 'off') return null
  const { status, trialDaysLeft, graceDaysLeft } = info.state
  if (status === 'licensed') return null

  const tone = status === 'trial' ? 'info' : status === 'grace' ? 'warn' : 'error'
  const styles = {
    info: 'bg-primary/10 text-primary border-primary/30',
    warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40',
    error: 'bg-destructive/12 text-destructive border-destructive/40'
  }[tone]

  const message =
    status === 'trial'
      ? t('license.trialLeft', { days: trialDaysLeft ?? 0 })
      : status === 'grace'
        ? t('license.graceLeft', { days: graceDaysLeft ?? 0 })
        : t('license.readonlyNotice')

  return (
    <div className={`flex items-center gap-3 px-5 py-2 border-b text-sm ${styles}`}>
      <span className="flex-1">{message}</span>
      <Button size="sm" onClick={() => setDialogOpen(true)}>
        {t('license.manage')}
      </Button>
    </div>
  )
}

export function LicenseDialog() {
  const { info, dialogOpen, setDialogOpen, activate, deactivate, refresh } = useLicensing()
  const toast = useApp((s) => s.toast)
  const t = useT()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  if (!dialogOpen || !info) return null
  const { state } = info

  const doActivate = async () => {
    setBusy(true)
    try {
      await activate(key.trim())
      setKey('')
      toast(t('license.activated'), 'success')
    } catch {
      toast(t('license.invalidKey'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const doDeactivate = async () => {
    setBusy(true)
    try {
      await deactivate()
      toast(t('license.deactivated'), 'success')
    } catch (err) {
      toast(String(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40" onMouseDown={() => setDialogOpen(false)}>
      <div
        className="bg-card rounded-xl shadow-xl w-[460px] max-h-[85vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">{t('license.title')}</h2>
          <button className="text-muted-foreground hover:text-foreground text-xl leading-none" onClick={() => setDialogOpen(false)}>
            ×
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Badge
              tone={
                state.status === 'licensed'
                  ? 'green'
                  : state.status === 'trial'
                    ? 'indigo'
                    : state.status === 'grace'
                      ? 'amber'
                      : 'red'
              }
            >
              {t(`license.status.${state.status}` as 'license.status.trial')}
            </Badge>
            {state.status === 'trial' && (
              <span className="text-muted-foreground">{t('license.trialLeft', { days: state.trialDaysLeft ?? 0 })}</span>
            )}
            {state.status === 'grace' && (
              <span className="text-muted-foreground">{t('license.graceLeft', { days: state.graceDaysLeft ?? 0 })}</span>
            )}
            {state.licenseKeyMasked && (
              <span className="font-mono text-xs text-muted-foreground">{state.licenseKeyMasked}</span>
            )}
          </div>

          {state.status === 'read-only' && (
            <p className="text-sm text-destructive">{t('license.readonlyNotice')}</p>
          )}
          {state.status === 'licensed' && state.expiresAt && (
            <p className="text-sm text-muted-foreground">
              {t('license.subscribedUntil', {
                date: new Date(state.expiresAt).toLocaleDateString()
              })}
            </p>
          )}

          {!state.licenseKeyMasked || state.status !== 'licensed' ? (
            <div className="flex gap-2">
              <Input
                className="flex-1"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={t('license.keyPlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && key.trim() && doActivate()}
              />
              <Button variant="primary" onClick={doActivate} disabled={busy || !key.trim()}>
                {t('license.activate')}
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={doDeactivate} disabled={busy}>
              {t('license.deactivate')}
            </Button>
          )}

          <div className="flex gap-2 items-center justify-between border-t pt-3">
            <Button
              onClick={() => {
                void window.api.licensing.openStore()
              }}
            >
              {t('license.buy')}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await refresh()
                } finally {
                  setBusy(false)
                }
              }}
            >
              {t('license.refresh')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
