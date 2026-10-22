/** Daily Challenge: a date-seeded set of 20 mixed questions plus a streak. */
import type { CategoryId, Difficulty } from '../core/types'

export const DAILY_LENGTH = 20

/** Category and difficulty for each of the 20 slots: a gentle ramp across a mix. */
export const DAILY_PLAN: { category: CategoryId; difficulty: Difficulty }[] = [
  { category: 'mental-math', difficulty: 1 },
  { category: 'sequences', difficulty: 1 },
  { category: 'mental-math', difficulty: 2 },
  { category: 'probability', difficulty: 1 },
  { category: 'sequences', difficulty: 2 },
  { category: 'mental-math', difficulty: 2 },
  { category: 'probability', difficulty: 2 },
  { category: 'arbitrage', difficulty: 2 },
  { category: 'brainteasers', difficulty: 2 },
  { category: 'mental-math', difficulty: 3 },
  { category: 'sequences', difficulty: 3 },
  { category: 'probability', difficulty: 3 },
  { category: 'arbitrage', difficulty: 3 },
  { category: 'fermi', difficulty: 3 },
  { category: 'mental-math', difficulty: 4 },
  { category: 'probability', difficulty: 3 },
  { category: 'sequences', difficulty: 4 },
  { category: 'arbitrage', difficulty: 4 },
  { category: 'brainteasers', difficulty: 3 },
  { category: 'probability', difficulty: 4 },
]

export interface DailyResult {
  score: number
  correct: number
  total: number
  completedAt: number
}

export interface DailyState {
  lastCompleted: string | null
  streak: number
  bestStreak: number
  history: Record<string, DailyResult>
}

export const EMPTY_DAILY: DailyState = { lastCompleted: null, streak: 0, bestStreak: 0, history: {} }

/** Local calendar date as YYYY-MM-DD. */
export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dailySeed(key: string): string {
  return `daily-${key}`
}

function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return dateKey(new Date(y, m - 1, d + delta))
}

/** Record a completed daily; repeat plays keep the best score but don't extend the streak. */
export function completeDaily(state: DailyState, key: string, result: DailyResult): DailyState {
  const prevResult = state.history[key]
  const history = { ...state.history, [key]: prevResult && prevResult.score >= result.score ? prevResult : result }
  if (state.lastCompleted === key) return { ...state, history }
  const streak = state.lastCompleted === addDays(key, -1) ? state.streak + 1 : 1
  return { lastCompleted: key, streak, bestStreak: Math.max(state.bestStreak, streak), history }
}

/** The streak as of `today`: alive if the last completion was today or yesterday. */
export function currentStreak(state: DailyState, today: string): number {
  if (!state.lastCompleted) return 0
  if (state.lastCompleted === today || state.lastCompleted === addDays(today, -1)) return state.streak
  return 0
}
