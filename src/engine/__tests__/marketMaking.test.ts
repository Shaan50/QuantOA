import { describe, expect, it } from 'vitest'
import { SeededRNG } from '../../core/rng'
import { MarketGame, SCENARIOS, SPREAD_PENALTY, expectedMaxWith } from '../marketMaking'

describe('market making scenarios', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.id}: fair value equals the Monte Carlo conditional expectation at every round`, () => {
      const rng = new SeededRNG(`fair-${sc.id}`)
      for (let g = 0; g < 6; g++) {
        const s = sc.sample(rng)
        for (let r = 0; r < sc.rounds; r++) {
          const n = 3000
          let total = 0
          for (let i = 0; i < n; i++) total += sc.trueValue(sc.resample(s, r, rng))
          const est = total / n
          const spread = sc.range[1] - sc.range[0]
          expect(Math.abs(est - sc.fair(s, r)), `${sc.id} round ${r}`).toBeLessThan(spread * 0.03 + 0.05)
        }
        // Information is consistent: the true state is one of the resample outcomes.
        expect(sc.trueValue(s)).toBeGreaterThanOrEqual(sc.range[0])
        expect(sc.trueValue(s)).toBeLessThanOrEqual(sc.range[1])
      }
    })

    it(`${sc.id}: fair value is a martingale (unconditional mean preserved)`, () => {
      const rng = new SeededRNG(`mart-${sc.id}`)
      const n = 4000
      const means = new Array(sc.rounds).fill(0)
      let truth = 0
      for (let i = 0; i < n; i++) {
        const s = sc.sample(rng)
        for (let r = 0; r < sc.rounds; r++) means[r] += sc.fair(s, r) / n
        truth += sc.trueValue(s) / n
      }
      for (const m of means) expect(Math.abs(m - truth)).toBeLessThan((sc.range[1] - sc.range[0]) * 0.02)
    })
  }

  it('expectedMaxWith matches known values', () => {
    expect(expectedMaxWith(0, 1)).toBeCloseTo(3.5)
    expect(expectedMaxWith(0, 2)).toBeCloseTo(161 / 36)
    expect(expectedMaxWith(6, 3)).toBe(6)
    expect(expectedMaxWith(4, 0)).toBe(4)
  })
})

describe('market game', () => {
  it('validates quotes against the spread cap', () => {
    const g = new MarketGame(SCENARIOS[0], 'v')
    expect(g.validate(10, 9)).toMatch(/above/)
    expect(g.validate(9, 12)).toMatch(/capped/)
    expect(g.validate(10, 11)).toBeNull()
    expect(() => g.quote(10, 13)).toThrow()
  })

  it('P&L equals the sum over trades of (true value - price) x signed size', () => {
    for (const sc of SCENARIOS) {
      for (let k = 0; k < 20; k++) {
        const g = new MarketGame(sc, `pnl-${k}`)
        const rng = new SeededRNG(`q-${k}`)
        while (!g.finished) {
          const fair = sc.fair(g.state, g.round)
          const width = sc.maxSpread * rng.float(0.2, 1)
          const skew = rng.float(-1, 1) * sc.maxSpread
          g.quote(fair + skew - width / 2, fair + skew + width / 2)
        }
        const trades = g.log.flatMap((l) => l.trades)
        const pnl = trades.reduce((s, t) => s + t.side * t.qty * (g.trueValue - t.price), 0)
        expect(g.pnl).toBeCloseTo(pnl, 9)
        const res = g.result('id', 0)
        expect(res.penalty).toBeCloseTo(SPREAD_PENALTY * g.log.reduce((s, l) => s + l.ask - l.bid, 0), 2)
        expect(res.score).toBeCloseTo(res.pnl - res.penalty, 2)
      }
    }
  })

  it('counterparties only trade against mispriced quotes in the right direction', () => {
    const g = new MarketGame(SCENARIOS[0], 'dir')
    // A quote far above any possible value: everyone sells to us (we buy at the bid).
    const log = g.quote(30, 31)
    expect(log.trades.length).toBe(3)
    expect(log.trades.every((t) => t.side === 1 && t.price === 30)).toBe(true)
    expect(g.position).toBe(3)
  })

  it('a tight quote at fair value earns money on average; a quote ignoring information loses', () => {
    let good = 0
    let stale = 0
    const games = 600
    for (let i = 0; i < games; i++) {
      const a = new MarketGame(SCENARIOS[0], `avg-${i}`)
      while (!a.finished) {
        const f = SCENARIOS[0].fair(a.state, a.round)
        a.quote(f - 1, f + 1)
      }
      good += a.pnl / games
      const b = new MarketGame(SCENARIOS[0], `avg-${i}`)
      while (!b.finished) b.quote(9.5, 11.5) // never updates on revealed dice
      stale += b.pnl / games
    }
    expect(good).toBeGreaterThan(0)
    expect(stale).toBeLessThan(good)
  })

  it('is deterministic for a seed', () => {
    const run = () => {
      const g = new MarketGame(SCENARIOS[1], 'det')
      while (!g.finished) g.quote(30, 34)
      return g.result('x', 0)
    }
    expect(run()).toEqual(run())
  })
})
