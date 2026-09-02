import { useEffect, useState, type ReactNode } from 'react'
import { errText, useApp, type Page } from '../store/useApp'
import { Button, Select, SelectOption } from './ui'
import { cn } from '../lib/utils'
import { useT } from '../i18n'

const NAV: { page: Page; labelKey: Parameters<ReturnType<typeof useT>>[0] }[] = [
  { page: 'schedules', labelKey: 'nav.schedules' },
  { page: 'departments', labelKey: 'nav.departments' },
  { page: 'lessons', labelKey: 'nav.lessons' },
  { page: 'teachers', labelKey: 'nav.teachers' },
  { page: 'timetables', labelKey: 'nav.timetables' },
  { page: 'generate', labelKey: 'nav.generate' },
  { page: 'settings', labelKey: 'nav.settings' }
]

export function Layout({ children }: { children: ReactNode }) {
  const { page, setPage, schedules, currentScheduleId, selectSchedule } = useApp()
  const t = useT()

  return (
    <div className="flex h-full">
      <aside className="w-52 bg-slate-900 text-slate-300 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-white font-bold tracking-tight">{t('app.title')}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">{t('app.subtitle')}</p>
        </div>
        <nav className="flex-1 py-2 flex flex-col gap-0.5 overflow-y-auto">
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
          <div className="mb-1 font-medium text-slate-400">{t('common.schedule')}</div>
          <Select
            value={currentScheduleId !== null ? String(currentScheduleId) : undefined}
            onChange={(v) => selectSchedule(Number(v))}
          >
            {schedules.map((s) => (
              <SelectOption key={s.id} value={String(s.id)}>
                {s.name}
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

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    void fn().then((d) => {
      if (alive) setData(d)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { data, reload: () => setTick((x) => x + 1) }
}
