/**
 * Analytics over the persisted attempt log: time series per category,
 * the subcategory x difficulty heatmap, totals and personal bests.
 */
import type { CategoryId, Difficulty } from '../core/types'
import type { AttemptStatus } from './scoring'
import type { ModeId } from './session'
import type { SessionSummary } from './results'

/** A single persisted attempt (compact, analytics-only). */
export interface Attempt {
  id: string
  sessionId: string
  mode: ModeId
  category: CategoryId
  subcategory: string
  templateId: string
  difficulty: Difficulty
  status: AttemptStatus
  credit: number
  timeMs: number
  expectedMs: number
  ts: number
}

export interface DayPoint {
  day: string
  n: number
  accuracy: number
  avgTimeSec: number
}

const dayOf = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const answered = (a: Attempt) => a.status !== 'skipped'

/** Daily accuracy and speed for one category (or all when category is null). */
export function dailySeries(attempts: Attempt[], category: CategoryId | null): DayPoint[] {
  const by = new Map<string, Attempt[]>()
  for (const a of attempts) {
    if (!answered(a) || (category && a.category !== category)) continue
    const k = dayOf(a.ts)
    by.set(k, [...(by.get(k) ?? []), a])
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, xs]) => ({
      day,
      n: xs.length,
      accuracy: xs.reduce((s, x) => s + x.credit, 0) / xs.length,
      avgTimeSec: xs.reduce((s, x) => s + x.timeMs, 0) / xs.length / 1000,
    }))
}

export interface HeatCell {
  subcategory: string
  difficulty: Difficulty
  n: number
  accuracy: number
}

/** Subcategory x difficulty accuracy grid for one category. */
export function heatmap(attempts: Attempt[], category: CategoryId): HeatCell[] {
  const cells = new Map<string, { n: number; credit: number; sub: string; d: Difficulty }>()
  for (const a of attempts) {
    if (a.category !== category || !answered(a)) continue
    const k = `${a.subcategory}|${a.difficulty}`
    const c = cells.get(k) ?? { n: 0, credit: 0, sub: a.subcategory, d: a.difficulty }
    c.n++
    c.credit += a.credit
    cells.set(k, c)
  }
  return [...cells.values()].map((c) => ({ subcategory: c.sub, difficulty: c.d, n: c.n, accuracy: c.credit / c.n }))
}

export interface CategoryTotals {
  category: CategoryId
  n: number
  accuracy: number
  avgTimeSec: number
  /** Accuracy over the most recent 50 attempts. */
  recentAccuracy: number
}

export function categoryTotals(attempts: Attempt[], categories: CategoryId[]): CategoryTotals[] {
  return categories.map((category) => {
    const xs = attempts.filter((a) => a.category === category && answered(a))
    const recent = xs.slice(-50)
    return {
      category,
      n: xs.length,
      accuracy: xs.length ? xs.reduce((s, x) => s + x.credit, 0) / xs.length : 0,
      avgTimeSec: xs.length ? xs.reduce((s, x) => s + x.timeMs, 0) / xs.length / 1000 : 0,
      recentAccuracy: recent.length ? recent.reduce((s, x) => s + x.credit, 0) / recent.length : 0,
    }
  })
}

/** Weakest (subcategory, difficulty) cells with enough data, lowest accuracy first. */
export function weakSpots(attempts: Attempt[], minN = 3, limit = 5): (HeatCell & { category: CategoryId })[] {
  const cats = [...new Set(attempts.map((a) => a.category))]
  return cats
    .flatMap((c) => heatmap(attempts, c).map((h) => ({ ...h, category: c })))
    .filter((h) => h.n >= minN)
    .sort((a, b) => a.accuracy - b.accuracy || b.n - a.n)
    .slice(0, limit)
}

export interface PersonalBest {
  variantKey: string
  mode: ModeId
  title: string
  bestScore: number
  bestAccuracy: number
  plays: number
  achievedAt: number
}

export function personalBests(sessions: SessionSummary[]): PersonalBest[] {
  const by = new Map<string, PersonalBest>()
  for (const s of sessions) {
    if (s.endReason === 'quit' || s.total === 0) continue
    const cur = by.get(s.variantKey)
    if (!cur) {
      by.set(s.variantKey, { variantKey: s.variantKey, mode: s.mode, title: s.title, bestScore: s.score, bestAccuracy: s.accuracy, plays: 1, achievedAt: s.endedAt })
      continue
    }
    cur.plays++
    if (s.score > cur.bestScore) {
      cur.bestScore = s.score
      cur.achievedAt = s.endedAt
      cur.title = s.title
    }
    cur.bestAccuracy = Math.max(cur.bestAccuracy, s.accuracy)
  }
  return [...by.values()].sort((a, b) => b.achievedAt - a.achievedAt)
}

/** Previous best for a variant, excluding one session (for "new PB!" banners). */
export function previousBest(sessions: SessionSummary[], variantKey: string, excludeId: string): number | null {
  const xs = sessions.filter((s) => s.variantKey === variantKey && s.id !== excludeId && s.endReason !== 'quit')
  return xs.length ? Math.max(...xs.map((s) => s.score)) : null
}
