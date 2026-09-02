import { entryPrecheck, solveEntries } from '@shared/solver/entryEngine'
import { solveTeachers, teacherPrecheck } from '@shared/solver/teacherEngine'
import type { EntrySolveInput, EntrySolveResult, TeacherSolveInput, TeacherSolveResult } from '@shared/types'

export type SolverRequest =
  | { type: 'solveEntries'; input: EntrySolveInput }
  | { type: 'solveTeachers'; input: TeacherSolveInput }

export type SolverResponse =
  | { type: 'problems'; problems: string[] }
  | { type: 'progress'; nodes: number; depth: number; total: number; solutions: number }
  | { type: 'done'; kind: 'entries' | 'teachers'; result: EntrySolveResult | TeacherSolveResult }
  | { type: 'error'; message: string }

self.onmessage = (e: MessageEvent<SolverRequest>) => {
  const post = (msg: SolverResponse) => self.postMessage(msg)
  try {
    const req = e.data
    if (req.type === 'solveEntries') {
      const { input } = req
      if (input.flexible.length === 0) {
        post({ type: 'problems', problems: ['No lessons to schedule'] })
        return
      }
      const problems = entryPrecheck(input)
      if (problems.length > 0) {
        post({ type: 'problems', problems })
        return
      }
      const result = solveEntries(input, (p) => post({ type: 'progress', ...p }))
      post({ type: 'done', kind: 'entries', result })
    } else {
      const { input } = req
      if (input.entries.length === 0) {
        post({ type: 'problems', problems: ['No placed entries to assign'] })
        return
      }
      const problems = teacherPrecheck(input)
      if (problems.length > 0) {
        post({ type: 'problems', problems })
        return
      }
      const result = solveTeachers(input, (p) => post({ type: 'progress', ...p }))
      post({ type: 'done', kind: 'teachers', result })
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
