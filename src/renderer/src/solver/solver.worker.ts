import { precheck, solve } from '@shared/solver/engine'
import type { SolveInput, SolveResult } from '@shared/types'

export type SolverRequest = { type: 'solve'; input: SolveInput }
export type SolverResponse =
  | { type: 'problems'; problems: string[] }
  | { type: 'progress'; nodes: number; depth: number; total: number; solutions: number }
  | { type: 'done'; result: SolveResult }
  | { type: 'error'; message: string }

self.onmessage = (e: MessageEvent<SolverRequest>) => {
  const post = (msg: SolverResponse) => self.postMessage(msg)
  try {
    const { input } = e.data
    const problems = precheck(input)
    if (input.flexible.length === 0) {
      post({ type: 'problems', problems: ['No sections selected to schedule'] })
      return
    }
    if (problems.length > 0) {
      post({ type: 'problems', problems })
      return
    }
    const result = solve(input, (p) => post({ type: 'progress', ...p }))
    post({ type: 'done', result })
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
