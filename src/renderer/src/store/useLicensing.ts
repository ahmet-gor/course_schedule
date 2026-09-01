import { create } from 'zustand'
import type { LicensingInfo } from '@shared/licensing'

interface LicensingState {
  info: LicensingInfo | null
  dialogOpen: boolean
  setDialogOpen: (open: boolean) => void
  refresh: () => Promise<void>
  activate: (licenseKey: string) => Promise<void>
  deactivate: () => Promise<void>
}

export const useLicensing = create<LicensingState>()((set) => ({
  info: null,
  dialogOpen: false,
  setDialogOpen: (dialogOpen) => set({ dialogOpen }),
  refresh: async () => {
    try {
      const info = await window.api.licensing.getState()
      set({ info })
    } catch (err) {
      console.error(err)
    }
  },
  activate: async (licenseKey) => {
    const info = await window.api.licensing.activate(licenseKey)
    set({ info })
  },
  deactivate: async () => {
    const info = await window.api.licensing.deactivate()
    set({ info })
  }
}))
