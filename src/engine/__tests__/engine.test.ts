import { describe, expect, it } from 'vitest'
import { canonicalInput } from '../../core/answer'
import { SeededRNG } from '../../core/rng'
import type { Difficulty } from '../../core/types'
import { categoryTotals, dailySeries, heatmap, personalBests, previousBest, weakSpots, type Attempt } from '../analytics'
import { completeDaily, currentStreak, DAILY_PLAN, EMPTY_DAILY } from '../daily'
import { expectedScore, INITIAL_RATING, pickDifficulty, updateRating } from '../elo'
import { dailyConfig, decodeConfig, drillConfig, encodeConfig, oaConfig, reviewConfig, sprintConfig, survivalConfig, zenConfig } from '../modes'
import { summarize, subcategoryBreakdown } from '../results'
import { BOX_INTERVAL_DAYS, dueItems, recordMistake, recordReview } from '../review'
import { pointsFor } from '../scoring'
import { SessionEngine } from '../session'
import { DEFAULT_SETTINGS } from '../settings'

const T0 = 1_700_000_000_000

describe('scoring', () => {
  it('applies the marking scheme and hint penalty', () => {
    const scheme = { correct: 1, wrong: -1, skip: 0 }
    expect(pointsFor('correct', 1, scheme)).toBe(1)
    expect(pointsFor('incorrect', 0, scheme)).toBe(-1)
    expect(pointsFor('skipped', 0, scheme)).toBe(0)
    expect(pointsFor('partial', 0.4, scheme)).toBeCloseTo(0.4)
    expect(pointsFor('correct', 1, scheme, 1)).toBe(0.75)
    expect(pointsFor('correct', 1, scheme, 2)).toBe(0.5)
  })
})

describe('elo', () => {
  it('expected score falls with difficulty', () => {
    expect(expectedScore(1400, 1)).toBeGreaterThan(expectedScore(1400, 5))
    expect(expectedScore(1400, 3)).toBeCloseTo(0.5)
  })
  it('ratings rise on success and fall on failure', () => {
    const up = updateRating(undefined, 3, 1)
    const down = updateRating(undefined, 3, 0)
    expect(up.rating).toBeGreaterThan(INITIAL_RATING)
    expect(down.rating).toBeLessThan(INITIAL_RATING)
    expect(up.attempts).toBe(1)
  })
  it('picks harder questions for stronger players', () => {
    expect(pickDifficulty(900)).toBe(1)
    expect(pickDifficulty(2200)).toBe(5)
    expect(pickDifficulty(1600)).toBeGreaterThan(pickDifficulty(1200))
  })
  it('converges toward a player who always answers d3 correctly and d4 wrongly', () => {
    let r = undefined as ReturnType<typeof updateRating> | undefined
    const rng = new SeededRNG('elo')
    for (let i = 0; i < 300; i++) {
      const d = pickDifficulty(r?.rating, rng)
      r = updateRating(r, d, d <= 3 ? 1 : 0)
    }
    expect([3, 4]).toContain(pickDifficulty(r!.rating))
  })
})

describe('review queue', () => {
  const q = { templateId: 'mm.division', difficulty: 3 as Difficulty, category: 'mental-math' as const, subcategory: 'division', prompt: 'x' }
  it('promotes through boxes and graduates', () => {
    let queue = recordMistake({}, q as never, T0)
    const key = Object.keys(queue)[0]
    expect(dueItems(queue, T0)).toHaveLength(1)
    let now = T0
    for (let box = 1; box < BOX_INTERVAL_DAYS.length; box++) {
      queue = recordReview(queue, key, true, now)
      expect(queue[key].box).toBe(box)
      expect(dueItems(queue, now)).toHaveLength(BOX_INTERVAL_DAYS[box] === 0 ? 1 : 0)
      now = queue[key].due
    }
    queue = recordReview(queue, key, true, now)
    expect(queue[key]).toBeUndefined()
  })
  it('a lapse resets to box 0', () => {
    let queue = recordMistake({}, q as never, T0)
    const key = Object.keys(queue)[0]
    queue = recordReview(queue, key, true, T0)
    queue = recordReview(queue, key, false, T0 + 1)
    expect(queue[key].box).toBe(0)
    expect(queue[key].lapses).toBe(2)
  })
})

describe('daily challenge', () => {
  it('builds the same 20 questions for a date and different ones for another', () => {
    const a = dailyConfig('2026-10-22')
    const b = dailyConfig('2026-10-22')
    const c = dailyConfig('2026-10-23')
    expect(a.fixed).toHaveLength(20)
    expect(a.fixed).toEqual(b.fixed)
    expect(a.fixed).not.toEqual(c.fixed)
    expect(DAILY_PLAN).toHaveLength(20)
  })
  it('tracks streaks across consecutive days and resets after a gap', () => {
    const res = { score: 10, correct: 10, total: 20, completedAt: T0 }
    let s = completeDaily(EMPTY_DAILY, '2026-10-20', res)
    s = completeDaily(s, '2026-10-21', res)
    s = completeDaily(s, '2026-10-21', { ...res, score: 15 })
    expect(s.streak).toBe(2)
    expect(s.history['2026-10-21'].score).toBe(15)
    expect(currentStreak(s, '2026-10-22')).toBe(2)
    expect(currentStreak(s, '2026-10-23')).toBe(0)
    s = completeDaily(s, '2026-10-24', res)
    expect(s.streak).toBe(1)
    expect(s.bestStreak).toBe(2)
  })
  it('handles month boundaries', () => {
    const res = { score: 1, correct: 1, total: 20, completedAt: T0 }
    let s = completeDaily(EMPTY_DAILY, '2026-10-31', res)
    s = completeDaily(s, '2026-11-01', res)
    expect(s.streak).toBe(2)
  })
})

describe('session engine', () => {
  it('runs a fixed-count drill to completion with correct answers', () => {
    const cfg = drillConfig({ filters: [{ category: 'mental-math' }], difficulty: 2, count: 10, perQuestionSec: null, seed: 'drill' })
    const e = new SessionEngine(cfg, {}, T0)
    let now = T0
    while (e.phase !== 'finished') {
      now += 3000
      const res = e.submit(canonicalInput(e.current!), now)
      expect(res.status).toBe('correct')
      e.advance(now)
    }
    expect(e.records).toHaveLength(10)
    expect(e.score).toBe(10)
    const s = summarize(e, 'id')
    expect(s.accuracy).toBe(1)
    expect(s.avgTimeMs).toBe(3000)
    expect(e.ratings['mental-math']!.rating).toBeGreaterThan(INITIAL_RATING)
  })

  it('is reproducible from its seed', () => {
    const cfg = sprintConfig({ seconds: 60, categories: ['mental-math', 'sequences'], seed: 'same' }, { ...DEFAULT_SETTINGS, adaptive: false })
    const prompts = () => {
      const e = new SessionEngine(cfg, {}, T0)
      const out: string[] = []
      for (let i = 0; i < 15; i++) {
        out.push(e.current!.prompt)
        e.skip(T0 + i)
        e.advance(T0 + i)
      }
      return out
    }
    expect(prompts()).toEqual(prompts())
  })

  it('treats invalid input as not-yet-answered', () => {
    const e = new SessionEngine(zenConfig({ filters: [{ category: 'mental-math', subcategories: ['multiplication'] }], difficulty: 1, seed: 'z' }), {}, T0)
    expect(e.submit('banana', T0).status).toBe('invalid')
    expect(e.records).toHaveLength(0)
    expect(e.phase).toBe('question')
  })

  it('applies negative marking in OA mode and ends on time', () => {
    const cfg = oaConfig({ preset: 'classic', seed: 'oa' }, DEFAULT_SETTINGS)
    expect(cfg.sections[0].questionCount).toBe(80)
    expect(cfg.sections[0].timeLimitSec).toBe(480)
    const e = new SessionEngine(cfg, {}, T0)
    e.submit('-999999999', T0 + 1000)
    e.advance(T0 + 1000)
    expect(e.score).toBe(-1)
    e.skip(T0 + 2000)
    e.advance(T0 + 2000)
    expect(e.score).toBe(-1)
    expect(e.sectionTimeRemaining(T0 + 480_000)).toBe(0)
    e.sectionTimeUp(T0 + 480_000)
    expect(e.phase).toBe('finished')
    expect(e.endReason).toBe('time')
  })

  it('chains Full OA sections with a break between them', () => {
    const e = new SessionEngine(oaConfig({ preset: 'full', seed: 'full' }, DEFAULT_SETTINGS), {}, T0)
    expect(e.config.sections.map((s) => s.label)).toEqual(['Mental Math', 'Sequences', 'Probability', 'Arbitrage'])
    expect(e.current!.category).toBe('mental-math')
    e.sectionTimeUp(T0 + 360_000)
    expect(e.phase).toBe('section-break')
    e.startNextSection(T0 + 400_000)
    expect(e.section).toBe(1)
    expect(e.current!.category).toBe('sequences')
    expect(e.sectionTimeRemaining(T0 + 400_000)).toBe(360_000)
  })

  it('survival: three strikes and difficulty ramps every 5 correct', () => {
    const e = new SessionEngine(survivalConfig({ categories: ['mental-math'], perQuestionSec: null, seed: 'surv' }), {}, T0)
    let now = T0
    for (let i = 0; i < 10; i++) {
      now += 1000
      e.submit(canonicalInput(e.current!), now)
      e.advance(now)
    }
    expect(e.survivalDifficulty()).toBe(3)
    expect(e.current!.difficulty).toBe(3)
    expect(e.skip(now)).toBeNull() // no skipping in survival
    for (let i = 0; i < 3; i++) {
      now += 1000
      e.submit('-123456789', now)
      e.advance(now)
    }
    expect(e.phase).toBe('finished')
    expect(e.endReason).toBe('lives')
    expect(e.lives).toBe(0)
  })

  it('per-question timeouts count as wrong', () => {
    const e = new SessionEngine(drillConfig({ filters: [{ category: 'sequences' }], difficulty: 1, count: 3, perQuestionSec: 10, seed: 't' }), {}, T0)
    expect(e.questionTimeRemaining(T0 + 4000)).toBe(6000)
    e.timeout(T0 + 10_000)
    expect(e.lastRecord!.status).toBe('timeout')
  })

  it('hints are progressive and reduce points', () => {
    const cfg = drillConfig({ filters: [{ category: 'brainteasers' }], difficulty: 1, count: 1, perQuestionSec: null, seed: 'h' })
    const e = new SessionEngine(cfg, {}, T0)
    const h1 = e.useHint()
    const h2 = e.useHint()
    expect(h1).toBe(e.current!.hints![0])
    expect(h2).toBe(e.current!.hints![1])
    expect(e.useHint()).toBeNull()
    e.submit(canonicalInput(e.current!), T0 + 1)
    expect(e.lastRecord!.points).toBe(0.5)
  })

  it('avoids duplicate questions within a session', () => {
    const e = new SessionEngine(drillConfig({ filters: [{ category: 'brainteasers' }], difficulty: 2, count: 20, perQuestionSec: null, seed: 'dup' }), {}, T0)
    const ids = new Set<string>()
    while (e.phase !== 'finished') {
      ids.add(e.current!.templateId)
      e.skip(T0)
      e.advance(T0)
    }
    expect(ids.size).toBe(20)
  })

  it('review sessions regenerate templates with new numbers', () => {
    const base = new SessionEngine(drillConfig({ filters: [{ category: 'mental-math', subcategories: ['multiplication'] }], difficulty: 3, count: 1, perQuestionSec: null, seed: 'r' }), {}, T0)
    const q = base.current!
    const queue = recordMistake({}, q, T0)
    const e = new SessionEngine(reviewConfig(Object.values(queue), T0 + 5), {}, T0 + 5)
    expect(e.current!.templateId).toBe(q.templateId)
    expect(e.current!.difficulty).toBe(q.difficulty)
    expect(e.current!.prompt).not.toBe(q.prompt)
  })

  it('subcategory breakdown sorts slowest first', () => {
    const e = new SessionEngine(drillConfig({ filters: [{ category: 'mental-math', subcategories: ['add-sub', 'multiplication'] }], difficulty: 1, count: 12, perQuestionSec: null, seed: 'b' }), {}, T0)
    let now = T0
    while (e.phase !== 'finished') {
      now += e.current!.subcategory === 'multiplication' ? 30_000 : 1000
      e.submit(canonicalInput(e.current!), now)
      e.advance(now)
    }
    const rows = subcategoryBreakdown(e.records)
    expect(rows[0].subcategory).toBe('multiplication')
  })
})

describe('config sharing', () => {
  it('round-trips through the URL encoding', () => {
    const cfg = sprintConfig({ seconds: 120, categories: ['probability'], seed: 'abcd-efgh' }, DEFAULT_SETTINGS)
    expect(decodeConfig(encodeConfig(cfg))).toEqual(cfg)
    const daily = dailyConfig('2026-10-22')
    expect(decodeConfig(encodeConfig(daily))!.fixed).toEqual(daily.fixed)
    expect(decodeConfig('not-a-config')).toBeNull()
  })
})

describe('analytics', () => {
  const mk = (i: number, over: Partial<Attempt>): Attempt => ({
    id: String(i),
    sessionId: 's',
    mode: 'drill',
    category: 'mental-math',
    subcategory: 'division',
    templateId: 'mm.division',
    difficulty: 2,
    status: 'correct',
    credit: 1,
    timeMs: 4000,
    expectedMs: 5000,
    ts: T0 + i * 3_600_000,
    ...over,
  })
  const attempts = [
    ...Array.from({ length: 10 }, (_, i) => mk(i, {})),
    ...Array.from({ length: 6 }, (_, i) => mk(100 + i, { subcategory: 'multiplication', status: 'incorrect', credit: 0, difficulty: 4 })),
    mk(200, { status: 'skipped', credit: 0 }),
  ]
  it('series excludes skips and buckets by day', () => {
    const s = dailySeries(attempts, 'mental-math')
    expect(s.reduce((a, p) => a + p.n, 0)).toBe(16)
  })
  it('heatmap and weak spots', () => {
    const h = heatmap(attempts, 'mental-math')
    expect(h.find((c) => c.subcategory === 'multiplication' && c.difficulty === 4)!.accuracy).toBe(0)
    expect(weakSpots(attempts)[0].subcategory).toBe('multiplication')
  })
  it('category totals', () => {
    const t = categoryTotals(attempts, ['mental-math', 'fermi'])
    expect(t[0].n).toBe(16)
    expect(t[0].accuracy).toBeCloseTo(10 / 16)
    expect(t[1].n).toBe(0)
  })
  it('personal bests', () => {
    const base = { mode: 'sprint' as const, title: 'Sprint', seed: 's', startedAt: T0, correct: 1, incorrect: 0, partial: 0, skipped: 0, answered: 1, total: 1, accuracy: 1, avgTimeMs: 1, categories: [], endReason: 'time' as const }
    const sessions = [
      { ...base, id: 'a', variantKey: 'sprint:60:mm', score: 10, endedAt: T0 },
      { ...base, id: 'b', variantKey: 'sprint:60:mm', score: 14, endedAt: T0 + 1 },
      { ...base, id: 'c', variantKey: 'sprint:60:mm', score: 30, endedAt: T0 + 2, endReason: 'quit' as const },
    ]
    const pbs = personalBests(sessions)
    expect(pbs).toHaveLength(1)
    expect(pbs[0].bestScore).toBe(14)
    expect(pbs[0].plays).toBe(2)
    expect(previousBest(sessions, 'sprint:60:mm', 'b')).toBe(10)
  })
})
