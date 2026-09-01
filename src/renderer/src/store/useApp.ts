import { create } from 'zustand'
import { toast as sonnerToast } from 'sonner'
import type { Term } from '@shared/types'
import { LICENSE_ERROR } from '@shared/licensing'
import { translate, useI18n } from '../i18n'

export type Page =
  | 'timetables'
  | 'sections'
  | 'courses'
  | 'instructors'
  | 'rooms'
  | 'generate'
  | 'settings'

interface AppState {
  page: Page
  terms: Term[]
  currentTermId: number | null
  ready: boolean
  setPage: (page: Page) => void
  loadTerms: () => Promise<void>
  selectTerm: (id: number | null) => void
  toast: (message: string, kind?: 'success' | 'error' | 'info') => void
}

export const useApp = create<AppState>()((set, get) => ({
  page: 'timetables',
  terms: [],
  currentTermId: null,
  ready: false,
  setPage: (page) => set({ page }),
  loadTerms: async () => {
    try {
      const terms = await window.api.terms.list()
      const current = get().currentTermId
      const next = terms.some((t) => t.id === current) ? current : (terms[0]?.id ?? null)
      set({ terms, currentTermId: next, ready: true })
    } catch (err) {
      get().toast(errText(err), 'error')
      set({ ready: true })
    }
  },
  selectTerm: (id) => set({ currentTermId: id }),
  toast: (message, kind = 'info') => {
    if (kind === 'success') sonnerToast.success(message)
    else if (kind === 'error') sonnerToast.error(message)
    else sonnerToast(message)
  }
}))

export function errText(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message.replace(/^Error invoking remote method '[^']+': /, '')
    if (msg.includes(LICENSE_ERROR)) {
      return translate(useI18n.getState().locale, 'toast.licenseRequired')
    }
    return msg
  }
  return String(err)
}
