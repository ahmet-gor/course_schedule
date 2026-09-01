import { create } from 'zustand'

export type ThemeChoice = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeState {
  choice: ThemeChoice
  resolved: ResolvedTheme
  setChoice: (choice: ThemeChoice) => void
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function storedChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem('theme')
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') return prefersDark() ? 'dark' : 'light'
  return choice
}

function apply(resolved: ResolvedTheme): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export const useTheme = create<ThemeState>()((set) => ({
  choice: storedChoice(),
  resolved: resolve(storedChoice()),
  setChoice: (choice) => {
    try {
      localStorage.setItem('theme', choice)
    } catch {
      /* storage unavailable */
    }
    const resolved = resolve(choice)
    apply(resolved)
    set({ choice, resolved })
  }
}))

apply(useTheme.getState().resolved)

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  const { choice } = useTheme.getState()
  if (choice !== 'system') return
  const resolved: ResolvedTheme = e.matches ? 'dark' : 'light'
  apply(resolved)
  useTheme.setState({ resolved })
})
