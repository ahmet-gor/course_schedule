import { create } from 'zustand'
import { toast as sonnerToast } from 'sonner'
import type { Schedule } from '@shared/types'
import { LICENSE_ERROR } from '@shared/licensing'
import { translate, useI18n } from '../i18n'

export type Page =
  | 'schedules'
  | 'departments'
  | 'lessons'
  | 'teachers'
  | 'timetables'
  | 'generate'
  | 'settings'

interface AppState {
  page: Page
  schedules: Schedule[]
  currentScheduleId: number | null
  ready: boolean
  setPage: (page: Page) => void
  loadSchedules: () => Promise<void>
  selectSchedule: (id: number | null) => void
  toast: (message: string, kind?: 'success' | 'error' | 'info') => void
}

export const useApp = create<AppState>()((set, get) => ({
  page: 'schedules',
  schedules: [],
  currentScheduleId: null,
  ready: false,
  setPage: (page) => set({ page }),
  loadSchedules: async () => {
    try {
      const schedules = await window.api.schedules.list()
      const current = get().currentScheduleId
      const next = schedules.some((s) => s.id === current) ? current : (schedules[0]?.id ?? null)
      set({ schedules, currentScheduleId: next, ready: true })
    } catch (err) {
      get().toast(errText(err), 'error')
      set({ ready: true })
    }
  },
  selectSchedule: (id) => set({ currentScheduleId: id }),
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
