/**
 * Elo-style adaptive difficulty. Each category has a player rating; each
 * difficulty level has a fixed "question rating". After each attempt the
 * player rating moves toward the observed result, and the next question's
 * difficulty is chosen so the expected success rate is near a target.
 */
import type { CategoryId, Difficulty } from '../core/types'
import { DIFFICULTIES } from '../core/types'
import type { SeededRNG } from '../core/rng'

export const QUESTION_RATING: Record<Difficulty, number> = { 1: 1000, 2: 1200, 3: 1400, 4: 1600, 5: 1800 }
export const INITIAL_RATING = 1200
/** Aim for questions the player gets right about 70% of the time. */
export const TARGET_SUCCESS = 0.7

export interface CategoryRating {
  rating: number
  attempts: number
}

export type Ratings = Partial<Record<CategoryId, CategoryRating>>

export function expectedScore(playerRating: number, difficulty: Difficulty): number {
  return 1 / (1 + 10 ** ((QUESTION_RATING[difficulty] - playerRating) / 400))
}

/** K-factor shrinks as the rating settles. */
export function kFactor(attempts: number): number {
  return attempts < 20 ? 48 : attempts < 100 ? 32 : 20
}

/**
 * Update a rating. `score` is 0..1 (Fermi partial credit counts). A fast
 * correct answer (under the expected time) earns a small bonus.
 */
export function updateRating(r: CategoryRating | undefined, difficulty: Difficulty, score: number, speedRatio = 1): CategoryRating {
  const cur = r ?? { rating: INITIAL_RATING, attempts: 0 }
  const s = score >= 1 && speedRatio < 0.6 ? 1.1 : score
  const delta = kFactor(cur.attempts) * (s - expectedScore(cur.rating, difficulty))
  return { rating: Math.round(Math.max(600, Math.min(2400, cur.rating + delta))), attempts: cur.attempts + 1 }
}

/** Difficulty whose expected success is closest to the target, with occasional exploration. */
export function pickDifficulty(rating: number | undefined, rng?: SeededRNG, target = TARGET_SUCCESS): Difficulty {
  const r = rating ?? INITIAL_RATING
  let best: Difficulty = 1
  let bestGap = Infinity
  for (const d of DIFFICULTIES) {
    const gap = Math.abs(expectedScore(r, d) - target)
    if (gap < bestGap) {
      bestGap = gap
      best = d
    }
  }
  if (rng && rng.chance(0.2)) {
    const shifted = best + rng.sign()
    if (shifted >= 1 && shifted <= 5) return shifted as Difficulty
  }
  return best
}

/** Human label for a rating band. */
export function ratingTier(rating: number): string {
  if (rating < 1000) return 'Novice'
  if (rating < 1200) return 'Intern'
  if (rating < 1400) return 'Junior Trader'
  if (rating < 1600) return 'Trader'
  if (rating < 1800) return 'Senior Trader'
  return 'Partner'
}
