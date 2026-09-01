import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/useApp'
import { useAsync } from '../components/Layout'
import { fromHHMM, toHHMM } from '@shared/time'
import { localeNames, localeOrder, useI18n, useT, type Locale } from '../i18n'
import { useTheme, type ThemeChoice } from '../theme'
import { useLicensing } from '../store/useLicensing'
import { Badge, Button, ConfirmDialog, Field, Input, Modal, Select, SelectOption, ToggleGroup, ToggleGroupItem } from '../components/ui'
import type { CsvEntity, ExcelScope, ImportCounts } from '@shared/api'
import type { Settings, Term } from '@shared/types'
import { weekLabel } from '@shared/weeks'

export default function SettingsPage() {
  const { terms, currentTermId, selectTerm, loadTerms, toast } = useApp()
  const t = useT()
  const { locale, setLocale } = useI18n()
  const { choice: themeChoice, setChoice: setThemeChoice } = useTheme()
  const licenseInfo = useLicensing((s) => s.info)
  const { data: settings, reload: reloadSettings } = useAsync(() => window.api.settings.get(), [])
  const { data: rooms } = useAsync(() => window.api.rooms.list(), [])
  const [draft, setDraft] = useState<Settings | null>(null)
  const [newTerm, setNewTerm] = useState('')
  const [confirmingTerm, setConfirmingTerm] = useState<Term | null>(null)
  const [editingTerm, setEditingTerm] = useState<Term | null>(null)
  const [excelScope, setExcelScope] = useState<ExcelScope>('pattern')
  const [excelWeek, setExcelWeek] = useState<number>(1)
  const [csvEntity, setCsvEntity] = useState<CsvEntity>('courses')
  const csvFileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (settings && !draft) setDraft(structuredClone(settings))
  }, [settings, draft])

  const travelGroups = useMemo(() => {
    const set = new Set<string>((rooms ?? []).map((r) => r.travelGroup || 'A'))
    for (const key of Object.keys(draft?.travelMinutes ?? {})) key.split('|').forEach((g) => set.add(g))
    set.add('A')
    return [...set].sort()
  }, [rooms, draft])

  if (!draft) return <div className="p-6 text-muted-foreground">{t('common.loading')}</div>

  const currentTerm = terms.find((x) => x.id === currentTermId) ?? null

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
      const res: ImportCounts = await window.api.io.importCsv(csvEntity, text, currentTermId!)
      const summary = t('toast.csvImport', {
        entity: t(`entity.${csvEntity}` as 'entity.courses'),
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
          <Field label={t('settings.defaultWeeks')}>
            <Input type="number" min="1" max="53" value={draft.defaultWeeks} onChange={(e) => set({ defaultWeeks: Math.max(1, Math.min(53, parseInt(e.target.value, 10) || 14)) })} />
          </Field>
          <Field label={t('settings.prefStart')} hint={t('settings.prefHint')}>
            <Input type="time" step={300} value={toHHMM(draft.preferredStart)} onChange={(e) => set({ preferredStart: timeSet(e.target.value, 540) })} />
          </Field>
          <Field label={t('settings.prefEnd')} hint={t('settings.prefHint')}>
            <Input type="time" step={300} value={toHHMM(draft.preferredEnd)} onChange={(e) => set({ preferredEnd: timeSet(e.target.value, 1080) })} />
          </Field>
          <Field label={t('settings.b2bGap')} hint={t('settings.b2bHint')}>
            <Input type="number" min="0" max="60" step="5" value={draft.backToBackGapMin} onChange={(e) => set({ backToBackGapMin: parseInt(e.target.value, 10) || 0 })} />
          </Field>
        </div>
      </section>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="font-semibold mb-1">{t('settings.travelTitle')}</h2>
        <p className="text-xs text-muted-foreground mb-3">{t('settings.travelDesc')}</p>
        {travelGroups.length < 2 && <p className="text-sm text-muted-foreground">{t('settings.travelNeedGroups')}</p>}
        <div className="flex flex-wrap gap-4">
          {travelGroups.flatMap((g1, i) =>
            travelGroups.slice(i + 1).map((g2) => {
              const key = [g1, g2].sort().join('|')
              return (
                <Field key={key} label={t('settings.travelPair', { a: g1, b: g2 })}>
                  <Input
                    type="number"
                    min="0"
                    max="60"
                    className="w-20"
                    value={draft.travelMinutes[key] ?? 0}
                    onChange={(e) => set({ travelMinutes: { ...draft.travelMinutes, [key]: parseInt(e.target.value, 10) || 0 } })}
                  />
                </Field>
              )
            })
          )}
        </div>
      </section>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="font-semibold mb-4">{t('settings.solverTitle')}</h2>
        <div className="grid grid-cols-3 gap-4">
          <Field label={t('settings.wWindow')} hint={t('settings.wWindowHint')}>
            <Input type="number" min="0" value={draft.weights.window} onChange={(e) => set({ weights: { ...draft.weights, window: parseFloat(e.target.value) || 0 } })} />
          </Field>
          <Field label={t('settings.wB2b')} hint={t('settings.wB2bHint')}>
            <Input type="number" min="0" value={draft.weights.backToBack} onChange={(e) => set({ weights: { ...draft.weights, backToBack: parseFloat(e.target.value) || 0 } })} />
          </Field>
          <Field label={t('settings.wHours')} hint={t('settings.wHoursHint')}>
            <Input type="number" min="0" value={draft.weights.maxHours} onChange={(e) => set({ weights: { ...draft.weights, maxHours: parseFloat(e.target.value) || 0 } })} />
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
        <h2 className="font-semibold mb-4">{t('settings.terms')}</h2>
        <div className="flex flex-col gap-2">
          {terms.map((term) => (
            <div key={term.id} className="flex items-center gap-3 text-sm">
              <span className={`flex-1 ${term.id === currentTermId ? 'font-semibold' : ''}`}>{term.name}</span>
              <span className="text-xs text-muted-foreground">
                {term.weeks} {t('settings.termWeeks').toLowerCase()}
                {term.breakWeeks.length > 0 ? ` · ${term.breakWeeks.length} ${t('settings.termBreaks').toLowerCase()}` : ''}
              </span>
              {term.id === currentTermId && <span className="text-xs text-primary">{t('settings.current')}</span>}
              <Button size="sm" onClick={() => setEditingTerm(term)}>
                {t('settings.termEdit')}
              </Button>
              <Button variant="danger" size="sm" onClick={() => setConfirmingTerm(term)}>
                {t('common.delete')}
              </Button>
            </div>
          ))}
        </div>
        {confirmingTerm && (
          <ConfirmDialog
            title={t('common.confirmTitle')}
            description={t('settings.confirmDeleteTerm', { name: confirmingTerm.name })}
            confirmLabel={t('common.delete')}
            cancelLabel={t('common.cancel')}
            onClose={() => setConfirmingTerm(null)}
            onConfirm={async () => {
              await window.api.terms.remove(confirmingTerm.id)
              setConfirmingTerm(null)
              await loadTerms()
              toast(t('toast.termDeleted'), 'success')
            }}
          />
        )}
        {editingTerm && (
          <TermDialog
            term={editingTerm}
            onClose={() => setEditingTerm(null)}
            onSaved={async () => {
              setEditingTerm(null)
              await loadTerms()
              toast(t('toast.termSaved'), 'success')
            }}
          />
        )}
        <div className="flex gap-2 mt-3">
          <Input value={newTerm} onChange={(e) => setNewTerm(e.target.value)} placeholder={t('settings.termPlaceholder')} className="w-56" />
          <Button
            onClick={async () => {
              if (!newTerm.trim()) return
              const term = await window.api.terms.create(newTerm.trim())
              setNewTerm('')
              await loadTerms()
              selectTerm(term.id)
              toast(t('toast.termCreated', { name: term.name }), 'success')
            }}
          >
            {t('settings.addTerm')}
          </Button>
        </div>
      </section>

      <section className="bg-card rounded-lg border p-5">
        <h2 className="font-semibold mb-1">{t('settings.exportTitle')}</h2>
        <p className="text-xs text-muted-foreground mb-3">{t('settings.exportDesc')}</p>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            variant="primary"
            onClick={() =>
              window.api.io
                .exportExcel(currentTermId!, excelScope, excelWeek)
                .then((p) => p && toast(t('toast.exported', { path: p }), 'success'))
            }
          >
            {t('settings.exportExcel')}
          </Button>
          <Field label={t('settings.excelScope')}>
            <Select className="w-48" value={excelScope} onChange={(v) => setExcelScope(v as ExcelScope)}>
              <SelectOption value="pattern">{t('excel.pattern')}</SelectOption>
              <SelectOption value="week">{t('excel.week')}</SelectOption>
              <SelectOption value="all">{t('excel.all')}</SelectOption>
            </Select>
          </Field>
          {excelScope === 'week' && currentTerm && (
            <Field label={t('generate.week.pick')}>
              <Select className="w-48" value={String(excelWeek)} onChange={(v) => setExcelWeek(Number(v))}>
                {Array.from({ length: currentTerm.weeks }, (_, i) => i + 1).map((w) => (
                  <SelectOption key={w} value={String(w)}>
                    {`W${String(w).padStart(2, '0')} · ${weekLabel(currentTerm, w, locale)}`}
                  </SelectOption>
                ))}
              </Select>
            </Field>
          )}
          <Button
            onClick={() => window.api.io.exportJson(currentTermId!).then((p) => p && toast(t('toast.exported', { path: p }), 'success'))}
          >
            {t('settings.exportJson')}
          </Button>
          {(['courses', 'instructors', 'rooms', 'sections'] as CsvEntity[]).map((entity) => (
            <Button
              key={entity}
              onClick={() =>
                window.api.io.exportCsv(entity, currentTermId!).then(
                  (p) => p && toast(t('toast.exported', { path: p }), 'success')
                )
              }
            >
              {t('settings.exportCsv', { entity: t(`entity.${entity}` as 'entity.courses') })}
            </Button>
          ))}
        </div>

        <h2 className="font-semibold mt-6 mb-1">{t('settings.importTitle')}</h2>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            onClick={async () => {
              const res = await window.api.io.importJson()
              if (res) {
                await loadTerms()
                toast(
                  t('toast.importedJson', { name: res.termName, courses: res.courses, sections: res.sections }),
                  'success'
                )
              }
            }}
          >
            {t('settings.importJson')}
          </Button>
          <Select value={csvEntity} onChange={(v) => setCsvEntity(v as CsvEntity)}>
            <SelectOption value="courses">courses: code,title,credits</SelectOption>
            <SelectOption value="instructors">instructors: name,email,maxWeeklyHours,unavailDays,unavailStart,unavailEnd</SelectOption>
            <SelectOption value="rooms">rooms: name,building,capacity,travelGroup</SelectOption>
            <SelectOption value="sections">
              sections: courseCode,number,capacity,sessionsPerWeek,durationMinutes,instructorEmail,roomName,days,start,end,locked
            </SelectOption>
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

function TermDialog({
  term,
  onClose,
  onSaved
}: {
  term: Term
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const { locale } = useI18n()
  const [name, setName] = useState(term.name)
  const [weeks, setWeeks] = useState(String(term.weeks))
  const [startDate, setStartDate] = useState(term.startDate)
  const [breaks, setBreaks] = useState<number[]>([...term.breakWeeks])
  const weekCount = Math.max(1, Math.min(53, parseInt(weeks, 10) || 14))

  const save = async () => {
    await window.api.terms.update(term.id, {
      name: name.trim() || term.name,
      weeks: weekCount,
      startDate,
      breakWeeks: [...breaks].sort((a, b) => a - b)
    })
    await onSaved()
  }

  return (
    <Modal title={`${t('settings.termEdit')} � ${term.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field label={t('settings.termName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('settings.termWeeks')}>
            <Input type="number" min="1" max="53" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
          </Field>
          <Field label={t('settings.termStart')}>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
        </div>
        <Field label={t('settings.termBreaks')}>
          <ToggleGroup
            type="multiple"
            variant="outline"
            value={breaks.map(String)}
            onValueChange={(vals) => setBreaks(vals.map(Number).filter((n) => n >= 1 && n <= weekCount))}
            className="bg-transparent gap-1 flex-wrap justify-start h-auto"
          >
            {Array.from({ length: weekCount }, (_, i) => i + 1).map((w) => (
              <ToggleGroupItem
                key={w}
                value={String(w)}
                className="w-9 h-8 px-0 text-xs font-semibold"
                title={weekLabel({ ...term, weeks: weekCount, startDate, breakWeeks: breaks }, w, locale)}
              >
                {w}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save}>
            {t('common.save')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
