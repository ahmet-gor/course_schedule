import { create } from 'zustand'
import type { Conflict, SolutionSummary } from '@shared/types'
import { en } from './en'
import { tr } from './tr'

export type Locale = 'tr' | 'en'
export type Translation = typeof en

export const dictionaries: Record<Locale, Translation> = { tr, en }
export const localeNames: Record<Locale, string> = { tr: 'Türkçe', en: 'English' }
export const localeOrder: Locale[] = ['tr', 'en']

export const DAY_SHORT: Record<Locale, string[]> = {
  en: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  tr: ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
}

export const DAY_LETTERS: Record<Locale, string[]> = {
  en: ['', 'M', 'T', 'W', 'R', 'F', 'S', 'U'],
  tr: ['', 'Pz', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']
}

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

function storedLocale(): Locale {
  try {
    const v = localStorage.getItem('locale')
    return v === 'en' || v === 'tr' ? v : 'tr'
  } catch {
    return 'tr'
  }
}

export const useI18n = create<I18nState>()((set) => ({
  locale: storedLocale(),
  setLocale: (locale) => {
    try {
      localStorage.setItem('locale', locale)
    } catch {
      /* storage unavailable */
    }
    set({ locale })
  }
}))

export function translate(locale: Locale, key: keyof Translation, params?: Record<string, string | number>): string {
  let s: string = dictionaries[locale][key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v))
    }
  }
  return s
}

export function useT() {
  const locale = useI18n((s) => s.locale)
  return (key: keyof Translation, params?: Record<string, string | number>) => translate(locale, key, params)
}

export function labelDays(days: number[], locale: Locale): string {
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_LETTERS[locale][d] ?? '?')
    .join('')
}

export function conflictText(c: Conflict, locale: Locale): string {
  const params: Record<string, string | number> = { ...(c.params ?? {}) }
  if (typeof params['dayIndex'] === 'number') {
    params['day'] = DAY_SHORT[locale][params['dayIndex']] ?? ''
    delete params['dayIndex']
  }
  return translate(locale, `conflict.${c.type}` as keyof Translation, params)
}

export function summaryText(s: SolutionSummary, locale: Locale): string {
  if (s.kind === 'window') return translate(locale, 'summary.window', { minutes: s.minutes })
  if (s.kind === 'load') return translate(locale, 'summary.load', { hours: s.hours.toFixed(1) })
  if (s.kind === 'changes') return translate(locale, 'summary.changes', { count: s.count })
  return translate(locale, 'summary.clean')
}
