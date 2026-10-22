/**
 * Arbitrage generator tests. Each check re-derives the answer independently
 * with plain floating point from the displayed numbers (stored in meta):
 * enumerate FX cycles, replicate option payoffs across terminal prices,
 * sweep order books share by share, and verify cash-and-carry P&L.
 */
import { describe, expect, it } from 'vitest'
import type { Difficulty, Question } from '../../core/types'
import {
  ARBITRAGE_SUBCATEGORIES,
  FWD_CHEAP,
  FWD_FAIR,
  FWD_RICH,
  NO_ARB,
  PCP_CONVERSION,
  PCP_REVERSAL,
  arbitrageTemplates,
} from '../arbitrage'
import { checkTemplateInvariants, sampleTemplate } from './harness'

const D: Difficulty[] = [1, 2, 3, 4, 5]
const byId = (id: string) => arbitrageTemplates.find((t) => t.id === id)!
const num = (s: unknown) => {
  const [n, d = '1'] = String(s).split('/')
  return Number(n) / Number(d)
}
const answerValue = (q: Question) => (q.answer.type === 'decimal' ? q.answer.value : NaN)
const chosen = (q: Question) => (q.answer.type === 'multiple-choice' ? q.answer.choices[q.answer.correctIndex] : '')

describe('arbitrage generator', () => {
  for (const t of arbitrageTemplates) {
    it(`${t.id} satisfies the shared invariants`, () => {
      checkTemplateInvariants(t, 120)
    })
  }

  it('covers every subcategory', () => {
    const covered = new Set(arbitrageTemplates.map((t) => t.subcategory))
    for (const s of ARBITRAGE_SUBCATEGORIES) expect(covered.has(s.id)).toBe(true)
  })

  it('every template produces both arbitrage and no-arbitrage cases', () => {
    for (const t of arbitrageTemplates) {
      let arb = 0
      let none = 0
      for (const d of D)
        for (const q of sampleTemplate(t, d, 80)) {
          const isNone = q.answer.type === 'multiple-choice' ? /No arbitrage|Fairly priced/.test(chosen(q)) : answerValue(q) === 0
          if (q.meta!.variant === 'fair' || q.meta!.variant === 'stake') continue
          if (isNone) none++
          else arb++
        }
      expect(arb, t.id).toBeGreaterThan(20)
      expect(none, t.id).toBeGreaterThan(10)
    }
  })

  it('triangular FX: brute-force cycle enumeration agrees', () => {
    for (const d of D)
      for (const q of sampleTemplate(byId('arb.triangular-fx'), d, 200)) {
        const m = q.meta as any
        const quotes = m.quotes.map((x: any) => ({ base: x.pair[0], quote: x.pair[1], bid: num(x.bid), ask: num(x.ask) }))
        const ccys = [...new Set(quotes.flatMap((x: any) => [x.base, x.quote]))] as string[]
        const convert = (amt: number, from: string, to: string) => {
          const direct = quotes.find((x: any) => x.base === from && x.quote === to)
          if (direct) return amt * direct.bid
          const inv = quotes.find((x: any) => x.base === to && x.quote === from)
          return amt / inv.ask
        }
        const others = ccys.filter((c) => c !== m.start)
        const results = [
          [m.start, others[0], others[1], m.start],
          [m.start, others[1], others[0], m.start],
        ].map((path) => {
          let amt = m.N
          for (let i = 0; i + 1 < path.length; i++) amt = convert(amt, path[i], path[i + 1])
          return { path: path.join(' → '), profit: amt - m.N }
        })
        const best = results.reduce((a, b) => (b.profit > a.profit ? b : a))
        const expectedProfit = Math.max(0, best.profit)
        if (m.variant === 'profit') {
          expect(Math.abs(answerValue(q) - expectedProfit)).toBeLessThanOrEqual(Math.max(1e-6, m.N * 1e-12))
        } else {
          expect(chosen(q)).toBe(best.profit / m.N > 1e-12 ? best.path : NO_ARB)
        }
        // Non-degenerate: an arb is worth at least 4bp of notional.
        if (best.profit / m.N > 1e-12) expect(best.profit / m.N).toBeGreaterThan(0.0004)
      }
  })

  it('dutch book: equal-payout stakes realise the stated profit in every outcome', () => {
    for (const d of D)
      for (const q of sampleTemplate(byId('arb.dutch-book'), d, 200)) {
        const m = q.meta as any
        const odds = m.odds.map(num)
        const book = odds.reduce((s: number, o: number) => s + 1 / o, 0)
        expect(Math.abs(book - 1)).toBeGreaterThan(0.015) // never a knife-edge book
        const stakes = odds.map((o: number) => (m.S * (1 / o)) / book)
        const totalStake = stakes.reduce((a: number, b: number) => a + b, 0)
        expect(totalStake).toBeCloseTo(m.S, 6)
        const payouts = stakes.map((s: number, i: number) => s * odds[i])
        for (const p of payouts) expect(p).toBeCloseTo(payouts[0], 6)
        const profit = book < 1 ? payouts[0] - m.S : 0
        if (m.variant === 'profit') expect(answerValue(q)).toBeCloseTo(profit, 6)
        if (m.variant === 'stake') expect(answerValue(q)).toBeCloseTo(stakes[m.outcome], 6)
        if (m.variant === 'exists') expect(chosen(q) === NO_ARB).toBe(book >= 1)
        // Odds strictly above 1 (otherwise a bet cannot profit).
        for (const o of odds) expect(o).toBeGreaterThan(1)
      }
  })

  it('put–call parity: the recommended portfolio is riskless and earns the stated profit', () => {
    for (const d of D)
      for (const q of sampleTemplate(byId('arb.put-call-parity'), d, 200)) {
        const m = q.meta as any
        const [S, K, DF, C, P, Dv] = [m.S, m.K, m.DF, m.C, m.P, m.D].map(num)
        expect(C).toBeGreaterThan(0)
        expect(P).toBeGreaterThan(0)
        // Conversion: -C + P + S - borrow PV(K); reversal is the negative.
        const conversionCashToday = C - P - S + DF * K + Dv // dividend PV received by the stock holder
        const payoff = (ST: number) => -Math.max(ST - K, 0) + Math.max(K - ST, 0) + ST - K
        for (const ST of [0, K / 2, K, K * 1.5, K * 3]) expect(payoff(ST)).toBeCloseTo(0, 9)
        const expectedSide = Math.abs(conversionCashToday) < 1e-9 ? NO_ARB : conversionCashToday > 0 ? PCP_CONVERSION : PCP_REVERSAL
        const profit = Math.abs(conversionCashToday) * m.multiplier
        if (m.variant === 'side') expect(chosen(q)).toBe(expectedSide)
        else expect(answerValue(q)).toBeCloseTo(profit < 1e-9 ? 0 : profit, 6)
      }
  })

  it('crossed venues: share-by-share sweep agrees and venues are internally sane', () => {
    for (const d of D)
      for (const q of sampleTemplate(byId('arb.venue-crossing'), d, 200)) {
        const m = q.meta as any
        const fee = num(m.fee)
        const expand = (levels: [string, number][]) => levels.flatMap(([p, s]) => Array(s / 100).fill(num(p)))
        const sweep = (asks: number[], bids: number[]) => {
          const a = [...asks].sort((x, y) => x - y)
          const b = [...bids].sort((x, y) => y - x)
          let profit = 0
          for (let i = 0; i < Math.min(a.length, b.length); i++) {
            const e = b[i] - a[i] - 2 * fee
            if (e <= 1e-12) break
            profit += e * 100
          }
          return profit
        }
        for (const v of [m.A, m.B]) expect(num(v.bids[0][0])).toBeLessThan(num(v.asks[0][0]))
        const p1 = sweep(expand(m.A.asks), expand(m.B.bids))
        const p2 = sweep(expand(m.B.asks), expand(m.A.bids))
        expect(p1 > 0 && p2 > 0).toBe(false)
        const total = p1 + p2
        if (m.variant === 'profit') expect(answerValue(q)).toBeCloseTo(total, 6)
        else expect(chosen(q)).toBe(p1 > 0 ? 'Buy on A, sell on B' : p2 > 0 ? 'Buy on B, sell on A' : NO_ARB)
        if (total > 1e-9) expect(total).toBeGreaterThanOrEqual(1 - 1e-9)
      }
  })

  it('forwards: cash-and-carry P&L matches the answer', () => {
    for (const d of D)
      for (const q of sampleTemplate(byId('arb.forward'), d, 200)) {
        const m = q.meta as any
        const fair = num(m.fair)
        // Independent recomputation of the fair value from the prompt numbers.
        const S = num(m.S)
        const growth = 1 + num(m.r) * num(m.T)
        if (m.kind === 'plain') expect(fair).toBeCloseTo(S * growth, 9)
        if (m.kind === 'dividend') expect(fair).toBeLessThan(S * growth)
        if (m.kind === 'storage') expect(fair).toBeGreaterThan(S * growth)
        if (m.variant === 'fair') {
          expect(Math.abs(answerValue(q) - fair)).toBeLessThanOrEqual(1e-9)
          continue
        }
        const Q = num(m.quoted)
        // Cash-and-carry: sell forward at Q, buy spot financed => P&L at expiry = Q - fair.
        const carry = Q - fair
        const side = Math.abs(carry) < 1e-12 ? FWD_FAIR : carry > 0 ? FWD_RICH : FWD_CHEAP
        if (m.variant === 'side') expect(chosen(q)).toBe(side)
        else expect(answerValue(q)).toBeCloseTo(Math.abs(carry) * (m.kind === 'fx' ? 1_000_000 : 1), 4)
      }
  })
})
