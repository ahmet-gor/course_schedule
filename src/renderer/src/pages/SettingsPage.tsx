import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import { fromHHMM, toHHMM } from '@shared/time'
import { localeNames, localeOrder, useI18n, useT, type Locale } from '../i18n'
import { useTheme, type ThemeChoice } from '../theme'
import { useLicensing } from '../store/useLicensing'
import { Badge, Button, Field, Input, Select, SelectOption } from '../components/ui'
import type { CsvEntity, ImportCounts } from '@shared/api'
import type { Settings } from '@shared/types'

export default function SettingsPage() {
  const { toast } = useApp()
  const t = useT()
  const { locale, setLocale } = useI18n()
  const { choice: themeChoice, setChoice: setThemeChoice } = useTheme()
  const licenseInfo = useLicensing((s) => s.info)
  const { data: settings, reload: reloadSettings } = useAsync(() => window.api.settings.get(), [])
  const [draft, setDraft] = useState<Settings | null>(null)
  const [csvEntity, setCsvEntity] = useState<CsvEntity>('departments')
  const csvFileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (settings && !draft) setDraft(structuredClone(settings))
  }, [settings, draft])

  if (!draft) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  const set = (patch: Partial<Settings>) => setDraft({ ...draft, ...patch })
  const timeSet = (v: string, fallback: number) => fromHHMM(v) ?? fallback

  const save = async () => {
    try {
      await window.api.settings.update(draft)
      reloadSettings()
      toast(t('toast.settingsSaved'), 'success')
    } catch (err) {
      toast(String(err), 'error')
    }
  }

  const importCsv = async (file: File) => {
    const text = await file.text()
    try {
      const res: ImportCounts = await window.api.io.importCsv(csvEntity, text)
      const summary = t('toast.csvImport', {
        entity: t(`entity.${csvEntity}` as 'entity.departments'),
        added: res.imported,
        updated: res.updated
      })
      toast(res.errors.length > 0 ? `${summary}, ${t('toast.csvErrors', { count: res.errors.length })}` : summary, res.errors.length > 0 ? 'error' : 'success')
      if (res.errors.length > 0) console.warn('CSV import errors:', res.errors)
    } catch (err) {
      toast(String(err), 'error')
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6 flex flex-col gap-6 max-w-4xl">
      <section className="bg-card rounded-lg border p-5">
        <h2 className="font-semibold mb-4">{t('settings.language')}</h2>
        <div className="flex gap-8 flex-wrap">
          <Field label={t('common.language')} hint={t('settings.languageHint')}>
            <Select className="w-48" value={locale} onChange={(v) => setLocale(v as Locale)}>
              {localeOrder.map((l) => (
                <SelectOption key={l} value={l}>
                  {localeNames[l]}
                </SelectOption>
              ))}
            </Select>
          </Field>
          <Field label={t('common.theme')} hint={t('settings.themeHint')}>
            <Select className="w-48" value={themeChoice} onChange={(v) => setThemeChoice(v as ThemeChoice)}>
              <SelectOption value="system">{t('theme.system')}</SelectOption>
              <SelectOption value="light">{t('theme.light')}</SelectOption>
              <SelectOption value="dark">{t('theme.dark')}</SelectOption>
            </Select>
          </Field>
        </div>
      </section>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="font-semibold mb-4">{t('settings.window')}</h2>
        <div className="grid grid-cols-3 gap-4">
          <Field label={t('settings.dayStart')}>
            <Input type="time" step={300} value={toHHMM(draft.dayStart)} onChange={(e) => set({ dayStart: timeSet(e.target.value, 480) })} />
          </Field>
          <Field label={t('settings.dayEnd')}>
            <Input type="time" step={300} value={toHHMM(draft.dayEnd)} onChange={(e) => set({ dayEnd: timeSet(e.target.value, 1260) })} />
          </Field>
          <Field label={t('settings.slotStep')} hint={t('settings.slotStepHint')}>
            <Input type="number" min="5" max="60" step="5" value={draft.slotStepMin} onChange={(e) => set({ slotStepMin: parseInt(e.target.value, 10) || 30 })} />
          </Field>
          <Field label={t('settings.prefStart')} hint={t('settings.prefHint')}>
            <Input type="time" step={300} value={toHHMM(draft.preferredStart)} onChange={(e) => set({ preferredStart: timeSet(e.target.value, 540) })} />
          </Field>
          <Field label={t('settings.prefEnd')} hint={t('settings.prefHint')}>
            <Input type="time" step={300} value={toHHMM(draft.preferredEnd)} onChange={(e) => set({ preferredEnd: timeSet(e.target.value, 1080) })} />
          </Field>
        </div>
      </section>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="font-semibold mb-4">{t('settings.solverTitle')}</h2>
        <div className="grid grid-cols-3 gap-4">
          <Field label={t('settings.wWindow')} hint={t('settings.wWindowHint')}>
            <Input type="number" min="0" value={draft.weights.window} onChange={(e) => set({ weights: { ...draft.weights, window: parseFloat(e.target.value) || 0 } })} />
          </Field>
          <Field label={t('settings.wLoad')} hint={t('settings.wLoadHint')}>
            <Input type="number" min="0" value={draft.weights.load} onChange={(e) => set({ weights: { ...draft.weights, load: parseFloat(e.target.value) || 0 } })} />
          </Field>
          <Field label={t('settings.wOverHours')} hint={t('settings.wOverHoursHint')}>
            <Input type="number" min="0" value={draft.weights.overHours} onChange={(e) => set({ weights: { ...draft.weights, overHours: parseFloat(e.target.value) || 0 } })} />
          </Field>
          <Field label={t('settings.wStability')} hint={t('settings.wStabilityHint')}>
            <Input type="number" min="0" value={draft.weights.stability} onChange={(e) => set({ weights: { ...draft.weights, stability: parseFloat(e.target.value) || 0 } })} />
          </Field>
          <Field label={t('settings.topN')}>
            <Input type="number" min="1" max="20" value={draft.solver.topN} onChange={(e) => set({ solver: { ...draft.solver, topN: parseInt(e.target.value, 10) || 5 } })} />
          </Field>
          <Field label={t('settings.timeLimit')}>
            <Input type="number" min="1" max="120" value={Math.round(draft.solver.timeLimitMs / 1000)} onChange={(e) => set({ solver: { ...draft.solver, timeLimitMs: (parseInt(e.target.value, 10) || 8) * 1000 } })} />
          </Field>
          <Field label={t('settings.nodeCap')}>
            <Input type="number" min="10000" step="10000" value={draft.solver.maxNodes} onChange={(e) => set({ solver: { ...draft.solver, maxNodes: parseInt(e.target.value, 10) || 1000000 } })} />
          </Field>
        </div>
        <div className="mt-4">
          <Button variant="primary" onClick={save}>
            {t('settings.save')}
          </Button>
        </div>
      </section>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="font-semibold mb-4">{t('license.title')}</h2>
        {licenseInfo && licenseInfo.mode !== 'off' ? (
          <div className="flex items-center gap-3 text-sm">
            <Badge
              tone={
                licenseInfo.state.status === 'licensed'
                  ? 'green'
                  : licenseInfo.state.status === 'trial'
                    ? 'indigo'
                    : licenseInfo.state.status === 'grace'
                      ? 'amber'
                      : 'red'
              }
            >
              {t(`license.status.${licenseInfo.state.status}` as 'license.status.trial')}
            </Badge>
            <span className="text-muted-foreground flex-1">
              {licenseInfo.state.status === 'trial'
                ? t('license.trialLeft', { days: licenseInfo.state.trialDaysLeft ?? 0 })
                : licenseInfo.state.status === 'grace'
                  ? t('license.graceLeft', { days: licenseInfo.state.graceDaysLeft ?? 0 })
                  : licenseInfo.state.status === 'licensed' && licenseInfo.state.expiresAt
                    ? t('license.subscribedUntil', {
                        date: new Date(licenseInfo.state.expiresAt).toLocaleDateString()
                      })
                    : t('license.readonlyNotice')}
            </span>
            <Button size="sm" onClick={() => useLicensing.getState().setDialogOpen(true)}>
              {t('license.manage')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </section>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="font-semibold mb-1">{t('settings.exportTitle')}</h2>
        <p className="text-xs text-muted-foreground mb-3">{t('settings.exportDesc')}</p>
        <div className="flex gap-2 flex-wrap items-center">
          <Button onClick={() => window.api.io.exportJson().then((p) => p && toast(t('toast.exported', { path: p }), 'success'))}>
            {t('settings.exportJson')}
          </Button>
          {(['departments', 'lessons', 'teachers'] as CsvEntity[]).map((entity) => (
            <Button
              key={entity}
              onClick={() =>
                window.api.io.exportCsv(entity).then((p) => p && toast(t('toast.exported', { path: p }), 'success'))
              }
            >
              {t('settings.exportCsv', { entity: t(`entity.${entity}` as 'entity.departments') })}
            </Button>
          ))}
        </div>
      </section>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="font-semibold mb-1">{t('settings.importTitle')}</h2>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            onClick={async () => {
              const res = await window.api.io.importJson()
              if (res) {
                await useApp.getState().loadSchedules()
                toast(t('toast.importedJson', { schedules: res.schedules }), 'success')
              }
            }}
          >
            {t('settings.importJson')}
          </Button>
          <Select value={csvEntity} onChange={(v) => setCsvEntity(v as CsvEntity)}>
            <SelectOption value="departments">departments: name,capacity,homeroom</SelectOption>
            <SelectOption value="lessons">lessons: departmentName,code,title,sessionsPerWeek,durationMinutes</SelectOption>
            <SelectOption value="teachers">teachers: name,email,maxWeeklyHours,lessons,unavailDays,unavailStart,unavailEnd</SelectOption>
          </Select>
          <input
            ref={csvFileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importCsv(f)
              e.target.value = ''
            }}
          />
          <Button onClick={() => csvFileRef.current?.click()}>{t('settings.importCsv')}</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{t('settings.csvHint')}</p>
      </section>
    </div>
  )
}
