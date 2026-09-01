import { useEffect, useState, type ReactNode } from 'react'
import { errText, useApp, type Page } from '../store/useApp'
import { Button, Input, Select, SelectOption } from './ui'
import { cn } from '../lib/utils'
import { useT } from '../i18n'

const NAV: { page: Page; labelKey: Parameters<ReturnType<typeof useT>>[0] }[] = [
  { page: 'timetables', labelKey: 'nav.timetables' },
  { page: 'sections', labelKey: 'nav.sections' },
  { page: 'courses', labelKey: 'nav.courses' },
  { page: 'instructors', labelKey: 'nav.instructors' },
  { page: 'rooms', labelKey: 'nav.rooms' },
  { page: 'generate', labelKey: 'nav.generate' },
  { page: 'settings', labelKey: 'nav.settings' }
]

export function Layout({ children }: { children: ReactNode }) {
  const { page, setPage, terms, currentTermId, selectTerm } = useApp()
  const t = useT()

  return (
    <div className="flex h-full">
      <aside className="w-52 bg-slate-900 text-slate-300 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-white font-bold tracking-tight">{t('app.title')}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{t('app.subtitle')}</p>
        </div>
        <nav className="flex-1 py-2 flex flex-col gap-0.5">
          {NAV.map((item) => (
            <Button
              key={item.page}
              variant="ghost"
              onClick={() => setPage(item.page)}
              className={cn(
                'w-full justify-start px-5 py-2 h-9 text-sm font-normal rounded-none',
                page === item.page
                  ? 'bg-slate-800 text-white font-medium hover:bg-slate-800 hover:text-white'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              )}
            >
              {t(item.labelKey)}
            </Button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-slate-800 text-xs text-slate-500">
          <div className="mb-1 font-medium text-slate-400">{t('common.term')}</div>
          <Select
            value={currentTermId !== null ? String(currentTermId) : undefined}
            onChange={(v) => selectTerm(Number(v))}
          >
            {terms.map((term) => (
              <SelectOption key={term.id} value={String(term.id)}>
                {term.name}
              </SelectOption>
            ))}
          </Select>
          <p className="mt-3 leading-relaxed">{t('nav.preferencesHint')}</p>
        </div>
      </aside>
      <main className="flex-1 overflow-hidden flex flex-col">{children}</main>
    </div>
  )
}

export function Onboarding() {
  const { loadTerms, selectTerm, toast } = useApp()
  const t = useT()
  const [name, setName] = useState(t('onboarding.defaultTerm'))
  const [busy, setBusy] = useState(false)

  const createTerm = async () => {
    setBusy(true)
    try {
      const term = await window.api.terms.create(name.trim() || t('onboarding.termPlaceholder'))
      await loadTerms()
      selectTerm(term.id)
      toast(t('toast.termCreated', { name: term.name }), 'success')
    } catch (err) {
      toast(errText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  const loadSample = async () => {
    setBusy(true)
    try {
      const term = await window.api.io.seedSample()
      await loadTerms()
      selectTerm(term.id)
      toast(t('toast.sampleLoaded'), 'success')
    } catch (err) {
      toast(errText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center">
      <div className="bg-card rounded-xl shadow-lg p-8 w-[420px]">
        <h1 className="text-xl font-bold">{t('onboarding.title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('onboarding.desc')}</p>
        <div className="mt-5 flex gap-2">
          <Input
            className="flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('onboarding.termPlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && createTerm()}
          />
          <Button variant="primary" onClick={createTerm} disabled={busy}>
            {t('onboarding.create')}
          </Button>
        </div>
        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t('onboarding.exploring')}</span>
          <Button onClick={loadSample} disabled={busy}>
            {t('onboarding.loadSample')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    fn().then(
      (v) => alive && setData(v),
      (err) => {
        if (alive) {
          console.error(err)
          useApp.getState().toast(errText(err), 'error')
        }
      }
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, reload: () => setTick((t) => t + 1) }
}
