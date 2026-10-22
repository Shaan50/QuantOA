/** Session summaries for the results screen and persistence. */
import type { CategoryId } from '../core/types'
import type { AttemptRecord, EndReason, ModeId, SessionEngine } from './session'

export interface SessionSummary {
  id: string
  mode: ModeId
  title: string
  variantKey: string
  seed: string
  startedAt: number
  endedAt: number
  score: number
  correct: number
  incorrect: number
  partial: number
  skipped: number
  answered: number
  total: number
  /** Correct (with partial credit) / answered. */
  accuracy: number
  avgTimeMs: number
  categories: CategoryId[]
  endReason: EndReason
}

export function summarize(e: SessionEngine, id: string): SessionSummary {
  const r = e.records
  const answered = r.filter((x) => x.status !== 'skipped')
  const credit = answered.reduce((s, x) => s + x.credit, 0)
  return {
    id,
    mode: e.config.mode,
    title: e.config.title,
    variantKey: e.config.variantKey,
    seed: e.config.seed,
    startedAt: e.startedAt,
    endedAt: e.endedAt ?? Date.now(),
    score: Math.round(e.score * 100) / 100,
    correct: r.filter((x) => x.status === 'correct').length,
    incorrect: r.filter((x) => x.status === 'incorrect' || x.status === 'timeout').length,
    partial: r.filter((x) => x.status === 'partial').length,
    skipped: r.filter((x) => x.status === 'skipped').length,
    answered: answered.length,
    total: r.length,
    accuracy: answered.length ? credit / answered.length : 0,
    avgTimeMs: r.length ? r.reduce((s, x) => s + x.timeMs, 0) / r.length : 0,
    categories: [...new Set(r.map((x) => x.question.category))],
    endReason: e.endReason ?? 'complete',
  }
}

export interface SubcategoryRow {
  category: CategoryId
  subcategory: string
  n: number
  correct: number
  accuracy: number
  avgTimeMs: number
  /** Average time relative to the questions' expected time (>1 = slow). */
  paceRatio: number
}

/** Per-subcategory breakdown, slowest (relative to expected pace) first. */
export function subcategoryBreakdown(records: AttemptRecord[]): SubcategoryRow[] {
  const groups = new Map<string, AttemptRecord[]>()
  for (const r of records) {
    const k = `${r.question.category}|${r.question.subcategory}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  return [...groups.values()]
    .map((g) => {
      const n = g.length
      const correct = g.filter((x) => x.status === 'correct').length
      const avgTimeMs = g.reduce((s, x) => s + x.timeMs, 0) / n
      const expected = g.reduce((s, x) => s + x.question.expectedSeconds * 1000, 0) / n
      return {
        category: g[0].question.category,
        subcategory: g[0].question.subcategory,
        n,
        correct,
        accuracy: correct / n,
        avgTimeMs,
        paceRatio: avgTimeMs / expected,
      }
    })
    .sort((a, b) => b.paceRatio - a.paceRatio)
}
