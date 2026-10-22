/**
 * Spaced repetition for mistakes (Leitner boxes). A wrong answer puts the
 * question's *template* in box 0; reviewing regenerates the template with new
 * numbers. Each correct review promotes it to a longer interval; after the
 * last box it graduates out of the queue.
 */
import type { CategoryId, Difficulty, Question } from '../core/types'

export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30]
const DAY = 86_400_000

export interface ReviewItem {
  /** templateId:difficulty */
  key: string
  templateId: string
  category: CategoryId
  subcategory: string
  difficulty: Difficulty
  box: number
  due: number
  lapses: number
  addedAt: number
  lastSeen: number
  /** The original prompt, shown in the queue list. */
  sample: string
}

export type ReviewQueue = Record<string, ReviewItem>

export const reviewKey = (q: Pick<Question, 'templateId' | 'difficulty'>) => `${q.templateId}:${q.difficulty}`

/** Record a mistake from any mode. */
export function recordMistake(queue: ReviewQueue, q: Question, now: number): ReviewQueue {
  const key = reviewKey(q)
  const prev = queue[key]
  return {
    ...queue,
    [key]: {
      key,
      templateId: q.templateId,
      category: q.category,
      subcategory: q.subcategory,
      difficulty: q.difficulty,
      box: 0,
      due: now,
      lapses: (prev?.lapses ?? 0) + 1,
      addedAt: prev?.addedAt ?? now,
      lastSeen: now,
      sample: q.prompt,
    },
  }
}

/** Apply the result of a review attempt. */
export function recordReview(queue: ReviewQueue, key: string, correct: boolean, now: number): ReviewQueue {
  const item = queue[key]
  if (!item) return queue
  if (!correct) return { ...queue, [key]: { ...item, box: 0, due: now, lapses: item.lapses + 1, lastSeen: now } }
  const box = item.box + 1
  if (box >= BOX_INTERVAL_DAYS.length) {
    const next = { ...queue }
    delete next[key]
    return next
  }
  return { ...queue, [key]: { ...item, box, due: now + BOX_INTERVAL_DAYS[box] * DAY, lastSeen: now } }
}

export function dueItems(queue: ReviewQueue, now: number): ReviewItem[] {
  return Object.values(queue)
    .filter((i) => i.due <= now)
    .sort((a, b) => a.box - b.box || a.due - b.due)
}

export function nextDue(queue: ReviewQueue, now: number): number | null {
  const future = Object.values(queue).filter((i) => i.due > now)
  return future.length ? Math.min(...future.map((i) => i.due)) : null
}
