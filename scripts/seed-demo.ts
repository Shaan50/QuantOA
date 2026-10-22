/**
 * Generates a realistic demo progress file by running the real session engine
 * with a simulated player over the last ~30 days. Used for README screenshots:
 *
 *   npx tsx scripts/seed-demo.ts > demo-progress.json
 *
 * Then import it from Settings → Import JSON.
 */
import { canonicalInput } from '../src/core/answer'
import { SeededRNG } from '../src/core/rng'
import type { CategoryId } from '../src/core/types'
import { completeDaily, dateKey, EMPTY_DAILY } from '../src/engine/daily'
import { dailyConfig, drillConfig, oaConfig, sprintConfig, survivalConfig } from '../src/engine/modes'
import { summarize } from '../src/engine/results'
import { recordMistake } from '../src/engine/review'
import { SessionEngine, type SessionConfig } from '../src/engine/session'
import { DEFAULT_SETTINGS } from '../src/engine/settings'
import type { Attempt } from '../src/engine/analytics'
import type { Ratings } from '../src/engine/elo'
import type { MarketResult } from '../src/engine/marketMaking'
import { MarketGame, SCENARIOS } from '../src/engine/marketMaking'

const rng = new SeededRNG('demo-player')
const DAY = 86_400_000
const now = Date.now()

// Simulated skill: per-category base accuracy that improves over the month.
const skill: Record<CategoryId, number> = { 'mental-math': 0.86, sequences: 0.8, probability: 0.62, arbitrage: 0.66, brainteasers: 0.58, fermi: 0.6 }
const weakSubs = new Set(['nearest', 'percentages', 'conditional', 'stopping', 'put-call-parity', 'interleaved'])

let ratings: Ratings = {}
const attempts: Attempt[] = []
const sessions = []
let review = {}
let daily = EMPTY_DAILY
const market: MarketResult[] = []

function play(config: SessionConfig, start: number, progress: number) {
  const e = new SessionEngine(config, ratings, start)
  let t = start
  let guard = 0
  while (e.phase !== 'finished' && guard++ < 400) {
    if (e.phase === 'section-break') {
      e.startNextSection(t)
      continue
    }
    const q = e.current!
    const p = Math.min(0.97, skill[q.category] + progress * 0.12 - (q.difficulty - 2) * 0.07 - (weakSubs.has(q.subcategory) ? 0.18 : 0))
    const speed = (0.55 + rng.next() * 0.9) * (1.15 - progress * 0.35)
    t += Math.round(q.expectedSeconds * 1000 * speed)
    const limit = e.sectionTimeRemaining(t)
    if (limit !== null && limit <= 0) {
      e.sectionTimeUp(t)
      continue
    }
    if (config.allowSkip && rng.chance(0.04)) e.skip(t)
    else e.submit(rng.chance(p) ? canonicalInput(q) : q.answer.type === 'multiple-choice' ? String(((q.answer.correctIndex + 1) % q.answer.choices.length) + 1) : q.answer.type === 'estimate' ? String(q.answer.value * (rng.chance(0.5) ? 4 : 0.07)) : '-987654321', t)
    for (const r of e.records.slice(-1)) if (r.status === 'incorrect') review = recordMistake(review, r.question, t)
    e.advance(t)
  }
  if (e.phase !== 'finished') e.quit(t)
  ratings = e.ratings
  const id = `demo-${sessions.length}`
  const s = summarize(e, id)
  sessions.push(s)
  e.records.forEach((r, i) =>
    attempts.push({
      id: `${id}-${i}`,
      sessionId: id,
      mode: config.mode,
      category: r.question.category,
      subcategory: r.question.subcategory,
      templateId: r.question.templateId,
      difficulty: r.question.difficulty,
      status: r.status,
      credit: r.credit,
      timeMs: r.timeMs,
      expectedMs: r.question.expectedSeconds * 1000,
      ts: r.answeredAt,
    }),
  )
  return s
}

const settings = { ...DEFAULT_SETTINGS }
for (let day = 29; day >= 0; day--) {
  const progress = (29 - day) / 29
  const base = now - day * DAY - 3 * 3600_000
  const key = dateKey(new Date(base))
  if (day === 0) continue // leave today's daily for the user
  // A recent unbroken streak, with a few gaps earlier in the month.
  if (day <= 9 || rng.chance(0.75)) {
    const s = play(dailyConfig(key), base, progress)
    daily = completeDaily(daily, key, { score: s.score, correct: s.correct, total: s.total, completedAt: base })
  }
  if (rng.chance(0.6)) play(sprintConfig({ seconds: 120, categories: ['mental-math'], seed: `s${day}` }, settings), base + 3600_000, progress)
  if (rng.chance(0.35)) play(oaConfig({ preset: 'classic', seed: `oa${day}` }, settings), base + 2 * 3600_000, progress)
  if (rng.chance(0.4)) play(drillConfig({ filters: [{ category: rng.pick(['probability', 'arbitrage', 'sequences', 'brainteasers'] as CategoryId[]) }], difficulty: 'adaptive', count: 15, perQuestionSec: null, seed: `d${day}` }), base + 4 * 3600_000, progress)
  if (rng.chance(0.25)) play(survivalConfig({ categories: ['mental-math', 'sequences'], perQuestionSec: null, seed: `sv${day}` }), base + 5 * 3600_000, progress)
  if (rng.chance(0.3)) {
    const g = new MarketGame(rng.pick(SCENARIOS), `m${day}`)
    while (!g.finished) {
      const f = g.scenario.fair(g.state, g.round)
      const w = g.scenario.maxSpread * (0.5 + rng.next() * 0.5)
      g.quote(f - w / 2, f + w / 2)
    }
    market.push(g.result(`mm${day}`, base))
  }
}

process.stdout.write(JSON.stringify({ version: 1, attempts, sessions, settings, ratings, review, daily, market }))
