import { classPrecheck, solveClasses } from '@shared/solver/classEngine'
import { solveTeachers, teacherPrecheck } from '@shared/solver/teacherEngine'
import type { ClassSolveInput, ClassSolveResult, TeacherSolveInput, TeacherSolveResult } from '@shared/types'

export type SolverRequest =
  | { type: 'solveClasses'; input: ClassSolveInput }
  | { type: 'solveTeachers'; input: TeacherSolveInput }

export type SolverResponse =
  | { type: 'problems'; problems: string[] }
  | { type: 'progress'; nodes: number; depth: number; total: number; solutions: number }
  | { type: 'done'; kind: 'classes' | 'teachers'; result: ClassSolveResult | TeacherSolveResult }
  | { type: 'error'; message: string }

self.onmessage = (e: MessageEvent<SolverRequest>) => {
  const post = (msg: SolverResponse) => self.postMessage(msg)
  try {
    const req = e.data
    if (req.type === 'solveClasses') {
      const { input } = req
      if (input.flexible.length === 0) {
        post({ type: 'problems', problems: ['No classes selected to schedule'] })
        return
      }
      const problems = classPrecheck(input)
      if (problems.length > 0) {
        post({ type: 'problems', problems })
        return
      }
      const result = solveClasses(input, (p) => post({ type: 'progress', ...p }))
      post({ type: 'done', kind: 'classes', result })
    } else {
      const { input } = req
      if (input.lessons.length === 0) {
        post({ type: 'problems', problems: ['No scheduled lessons to assign'] })
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
