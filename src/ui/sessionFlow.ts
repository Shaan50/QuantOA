/** Glue between a finished SessionEngine and persisted progress. */
import type { Attempt } from '../engine/analytics'
import { previousBest } from '../engine/analytics'
import { completeDaily, dateKey } from '../engine/daily'
import { summarize } from '../engine/results'
import { recordMistake, recordReview, reviewKey } from '../engine/review'
import type { SessionEngine } from '../engine/session'
import type { ProgressRepository } from '../storage/repository'
import type { FinishedSession } from './store'
import { uid } from './format'

/** Persist attempts, ratings, review queue, session summary and daily streak. */
export function finalizeSession(engine: SessionEngine, repo: ProgressRepository): FinishedSession {
  const id = uid()
  const summary = summarize(engine, id)
  const attempts: Attempt[] = engine.records.map((r, i) => ({
    id: `${id}-${i}`,
    sessionId: id,
    mode: engine.config.mode,
    category: r.question.category,
    subcategory: r.question.subcategory,
    templateId: r.question.templateId,
    difficulty: r.question.difficulty,
    status: r.status,
    credit: r.credit,
    timeMs: r.timeMs,
    expectedMs: r.question.expectedSeconds * 1000,
    ts: r.answeredAt,
  }))
  repo.addAttempts(attempts)
  repo.setRatings(engine.ratings)

  let queue = repo.review
  for (const r of engine.records) {
    if (engine.config.mode === 'review') {
      if (r.status !== 'skipped') queue = recordReview(queue, reviewKey(r.question), r.status === 'correct', r.answeredAt)
    } else if (r.status === 'incorrect' || r.status === 'timeout') {
      queue = recordMistake(queue, r.question, r.answeredAt)
    }
  }
  repo.setReview(queue)

  if (engine.config.mode === 'daily' && engine.endReason !== 'quit' && engine.records.length > 0) {
    const key = engine.config.seed.replace(/^daily-/, '')
    // Only the actual day's challenge extends the streak.
    if (key === dateKey(new Date())) {
      repo.setDaily(completeDaily(repo.daily, key, { score: summary.score, correct: summary.correct, total: summary.total, completedAt: summary.endedAt }))
    }
  }

  const prev = previousBest(repo.sessions, summary.variantKey, id)
  if (summary.total > 0) repo.addSession(summary)
  return { engine, summary, previousBest: prev }
}
