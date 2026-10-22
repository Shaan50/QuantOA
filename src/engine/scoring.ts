/** Marking schemes and per-attempt points. */
import type { CheckStatus } from '../core/answer'

export interface MarkingScheme {
  correct: number
  /** Points for a wrong answer (usually zero or negative). */
  wrong: number
  /** Points for a skipped question. */
  skip: number
}

export const DEFAULT_MARKING: MarkingScheme = { correct: 1, wrong: 0, skip: 0 }

export type AttemptStatus = Exclude<CheckStatus, 'invalid'> | 'skipped' | 'timeout'

/** Each hint used costs a quarter of the question's value. */
export const HINT_PENALTY = 0.25

export function pointsFor(status: AttemptStatus, credit: number, scheme: MarkingScheme, hintsUsed = 0): number {
  switch (status) {
    case 'correct':
    case 'partial':
      return scheme.correct * credit * Math.max(0, 1 - HINT_PENALTY * hintsUsed)
    case 'incorrect':
    case 'timeout':
      return scheme.wrong
    case 'skipped':
      return scheme.skip
  }
}

export function isCorrect(status: AttemptStatus): boolean {
  return status === 'correct'
}
