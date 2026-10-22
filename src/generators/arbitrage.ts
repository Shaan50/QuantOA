/**
 * Arbitrage & market sense. Every template can produce a genuine "no
 * arbitrage" case, and arb cases are constructed with a strictly positive,
 * non-trivial profit. All money arithmetic is exact (Fractions) on the
 * numbers exactly as displayed.
 */
import { Fraction, frac, ONE, ZERO } from '../core/fraction'
import type { QuestionDraft, QuestionTemplate } from '../core/types'
import { formatNumber } from '../core/answer'
import { assert, byDifficulty, decAnswer, expectedTime, money, tex } from './helpers'
import { makeGenerator } from './registry'

const CAT = 'arbitrage' as const

export const ARBITRAGE_SUBCATEGORIES = [
  { id: 'triangular-fx', label: 'Triangular FX arbitrage' },
  { id: 'dutch-book', label: 'Dutch book' },
  { id: 'put-call-parity', label: 'Put–call parity' },
  { id: 'venue-crossing', label: 'Crossed venues' },
  { id: 'forward', label: 'Forward pricing' },
] as const

export const NO_ARB = 'No arbitrage'

/** Round a positive number to `sig` significant figures, returned as an exact Fraction of its decimal. */
function roundSigFrac(x: Fraction, sig: number): Fraction {
  const v = x.toNumber()
  return Fraction.from(Number(v.toPrecision(sig)))
}

const dec = (f: Fraction, places = 4) => formatNumber(f.toNumber(), places)

function mc(choices: string[], correct: string) {
  const idx = choices.indexOf(correct)
  assert(idx >= 0, 'correct choice present')
  assert(new Set(choices).size === choices.length, 'distinct choices')
  return { type: 'multiple-choice' as const, choices, correctIndex: idx }
}

/** Profit answer: exact value with a 1% relative tolerance (0 must be exact). */
function profitAnswer(profit: Fraction, absTol = 0.01) {
  const v = profit.toNumber()
  return decAnswer(v, v === 0 ? { abs: 1e-9 } : { rel: 0.01, abs: absTol }, 2)
}

// ---------------------------------------------------------------------------
// Triangular FX arbitrage
// ---------------------------------------------------------------------------

interface Triangle {
  ccy: [string, string, string]
  r1: number[] // A/B mids
  r2: number[] // B/C mids
}

const TRIANGLES: Triangle[] = [
  { ccy: ['EUR', 'USD', 'JPY'], r1: [1.05, 1.08, 1.1, 1.12, 1.2, 1.25], r2: [140, 145, 150, 155, 160] },
  { ccy: ['GBP', 'USD', 'JPY'], r1: [1.2, 1.25, 1.3, 1.35], r2: [140, 148, 150, 152, 160] },
  { ccy: ['EUR', 'USD', 'CAD'], r1: [1.05, 1.1, 1.15, 1.2, 1.25], r2: [1.3, 1.32, 1.35, 1.4] },
  { ccy: ['GBP', 'EUR', 'USD'], r1: [1.15, 1.16, 1.2, 1.25], r2: [1.05, 1.08, 1.1, 1.12] },
  { ccy: ['AUD', 'USD', 'JPY'], r1: [0.64, 0.65, 0.66, 0.7, 0.75], r2: [140, 145, 150, 155] },
]

export interface FxQuote {
  pair: [string, string] // base, quote: 1 base = price quote-ccy
  bid: Fraction
  ask: Fraction
}

/** Multiplier from walking a cycle of currencies, converting at bid (sell base) or ask (buy base). */
export function cycleMultiplier(quotes: FxQuote[], path: string[]): Fraction {
  let m = ONE
  for (let i = 0; i + 1 < path.length; i++) {
    const from = path[i]
    const to = path[i + 1]
    const q = quotes.find((x) => (x.pair[0] === from && x.pair[1] === to) || (x.pair[0] === to && x.pair[1] === from))
    if (!q) throw new Error(`no quote for ${from}/${to}`)
    // Selling base for quote currency at the bid; buying base with quote currency at the ask.
    m = q.pair[0] === from ? m.mul(q.bid) : m.div(q.ask)
  }
  return m
}

const triangular: QuestionTemplate = {
  id: 'arb.triangular-fx',
  category: CAT,
  subcategory: 'triangular-fx',
  generate(d, rng) {
    const withSpreads = d >= 4
    let tri: Triangle, quotes: FxQuote[], start: string, routes: string[][], mults: Fraction[], r1: Fraction, r2: Fraction
    // Retry until the case is clear-cut: a real arb (> 4bp) or a clear no-arb (< -0.5bp).
    for (let guard = 0; ; guard++) {
      if (guard > 1000) throw new Error('triangular search failed')
      tri = rng.pick(TRIANGLES)
      const [A, B, Cc] = tri.ccy
      r1 = Fraction.from(rng.pick(tri.r1))
      r2 = Fraction.from(rng.pick(tri.r2))
      const implied = r1.mul(r2)
      const noArb = rng.chance(0.3)
      // Deviation of the quoted cross from the implied cross.
      const eps = noArb ? ZERO : Fraction.from(rng.sign() * rng.pick(withSpreads ? [0.003, 0.004, 0.005, 0.01, 0.0015] : [0.0025, 0.005, 0.01, 0.02, 0.015]))
      const crossMid = roundSigFrac(implied.mul(ONE.add(eps)), 5)
      if (!withSpreads) {
        quotes = [
          { pair: [A, B], bid: r1, ask: r1 },
          { pair: [B, Cc], bid: r2, ask: r2 },
          { pair: [A, Cc], bid: crossMid, ask: crossMid },
        ]
      } else {
        const half = rng.pick([0.0005, 0.001, 0.0008])
        const mk = (pair: [string, string], mid: Fraction): FxQuote => ({
          pair,
          bid: roundSigFrac(mid.mul(1 - half), 5),
          ask: roundSigFrac(mid.mul(1 + half), 5),
        })
        quotes = [mk([A, B], r1), mk([B, Cc], r2), mk([A, Cc], crossMid)]
      }
      start = rng.pick([A, B, Cc])
      const others = [A, B, Cc].filter((c) => c !== start)
      routes = [
        [start, others[0], others[1], start],
        [start, others[1], others[0], start],
      ]
      mults = routes.map((r) => cycleMultiplier(quotes, r))
      const bestM = mults[0].gt(mults[1]) ? mults[0] : mults[1]
      const edge = bestM.toNumber() - 1
      if (edge > 0.0004 || edge < -0.00005 || bestM.eq(ONE)) break
    }
    const [A, , Cc] = tri.ccy
    const implied = r1.mul(r2)
    const bestIdx = mults[0].gt(mults[1]) ? 0 : 1
    const best = mults[bestIdx]
    const isArb = best.gt(ONE)
    const N = rng.pick([100_000, 1_000_000, 10_000_000])
    const profit = isArb ? best.sub(ONE).mul(N) : ZERO
    const routeLabel = (r: string[]) => r.join(' → ')

    const quoteLines = quotes
      .map((q) => (withSpreads ? `$\\text{${q.pair[0]}/${q.pair[1]}}$: bid $${dec(q.bid, 6)}$ / ask $${dec(q.ask, 6)}$` : `$\\text{${q.pair[0]}/${q.pair[1]}} = ${dec(q.bid, 6)}$`))
      .join('\n')
    const convention = `(A quote $\\text{X/Y} = p$ means 1 X costs $p$ Y${withSpreads ? '; you sell X at the bid and buy X at the ask' : ''}.)`
    const explanation = [
      `Implied cross: $\\text{${A}/${Cc}} = ${dec(r1, 6)} \\times ${dec(r2, 6)} = ${dec(implied, 6)}$ (mid)`,
      ...routes.map((r, i) => `${routeLabel(r)}: multiplier $${dec(mults[i], 6)}$`),
      isArb ? `Best route multiplies money by $${dec(best, 6)}$: profit $= ${tex(N)} \\times ${dec(best.sub(ONE), 6)} \\approx ${tex(profit.toNumber(), 2)}$ ${start}` : 'Neither round trip returns more than you started with: no arbitrage.',
    ]
    const meta = { quotes: quotes.map((q) => ({ pair: q.pair, bid: q.bid.toString(), ask: q.ask.toString() })), start, N, routes, isArb, profit: profit.toString() }

    if (rng.chance(0.5)) {
      return {
        prompt: `You can trade these FX quotes:\n${quoteLines}\n${convention}\nStarting with ${tex(N)} ${start}, what is the riskless profit in ${start} from the best round trip? Enter $0$ if there is no arbitrage.`,
        answer: profitAnswer(profit, 1),
        explanation,
        expectedSeconds: expectedTime(45, d),
        unit: { suffix: ` ${start}` },
        inputHint: 'Profit (0 if none)',
        meta: { ...meta, variant: 'profit' },
      }
    }
    const choices = [NO_ARB, routeLabel(routes[0]), routeLabel(routes[1])]
    return {
      prompt: `You can trade these FX quotes:\n${quoteLines}\n${convention}\nStarting with ${start}, which round trip locks in a riskless profit?`,
      answer: mc(choices, isArb ? routeLabel(routes[bestIdx]) : NO_ARB),
      explanation,
      expectedSeconds: expectedTime(35, d),
      meta: { ...meta, variant: 'route' },
    }
  },
}

// ---------------------------------------------------------------------------
// Dutch book
// ---------------------------------------------------------------------------

/** Decimal odds with "nice" implied probabilities. */
const ODDS: Fraction[] = ['1.2', '1.25', '1.5', '1.6', '1.8', '2', '2.2', '2.5', '3', '3.5', '4', '4.5', '5', '6', '7', '8', '9', '10', '11'].map((s) => Fraction.from(s))

function fractionalOdds(o: Fraction): string {
  const f = o.sub(1)
  if (f.eq(1)) return '\\text{evens}'
  return `${f.num}/${f.den}`
}

const OUTCOME_SETS: Record<number, string[]> = {
  2: ['Player A wins', 'Player B wins'],
  3: ['Home win', 'Draw', 'Away win'],
  4: ['Horse 1', 'Horse 2', 'Horse 3', 'Horse 4'],
}

const dutchBook: QuestionTemplate = {
  id: 'arb.dutch-book',
  category: CAT,
  subcategory: 'dutch-book',
  generate(d, rng) {
    const n = byDifficulty(d, [2, rng.pick([2, 3]), 3, rng.pick([3, 4]), 4])
    const wantArb = rng.chance(0.7)
    let odds: Fraction[]
    let total: Fraction
    let guard = 0
    for (;;) {
      odds = Array.from({ length: n }, () => rng.pick(ODDS))
      total = odds.reduce((s, o) => s.add(o.inv()), ZERO)
      const t = total.toNumber()
      if (wantArb ? t >= 0.85 && t <= 0.98 : t >= 1.02 && t <= 1.2) break
      if (++guard > 5000) throw new Error('dutch book search failed')
    }
    const useFractional = d >= 4
    const fmtOdds = (o: Fraction) => (useFractional ? fractionalOdds(o) : dec(o, 2))
    const outcomes = OUTCOME_SETS[n]
    const S = rng.pick([100, 1000, 1000, 10_000])
    const isArb = total.lt(ONE)
    const payout = frac(S).div(total)
    const profit = isArb ? payout.sub(S) : ZERO
    const stakes = odds.map((o) => frac(S).mul(o.inv()).div(total))
    const lines = outcomes.map((name, i) => `${name}: $${fmtOdds(odds[i])}$`).join('\n')
    const oddsNote = useFractional ? 'Odds are fractional ($a/b$ pays $a$ profit per $b$ staked, plus your stake back).' : 'Odds are decimal (a winning \\$1 bet returns the odds, stake included).'
    const explanation = [
      ...(useFractional ? [`Decimal odds: ${odds.map((o) => `$${dec(o, 4)}$`).join(', ')}`] : []),
      `Implied probabilities: ${odds.map((o) => `$${o.inv().toLatex()}$`).join(' + ')} $= ${total.toLatex()} ${isArb ? '< 1' : '> 1'}$`,
      isArb
        ? `Stake in proportion to $\\frac{1}{o_i}$ so every outcome pays $\\frac{${tex(S)}}{${dec(total, 6)}} \\approx ${tex(payout.toNumber(), 2)}$`
        : 'Backing every outcome costs more than it can return: no Dutch book for a bettor.',
      ...(isArb ? [`Stakes: ${stakes.map((s, i) => `${outcomes[i]} $\\approx ${tex(s.toNumber(), 2)}$`).join(', ')}`, `Guaranteed profit $\\approx ${tex(profit.toNumber(), 2)}$`] : []),
    ]
    const meta = { odds: odds.map((o) => o.toString()), S, isArb, profit: profit.toString(), total: total.toString() }
    const variant = isArb && d >= 3 && rng.chance(0.35) ? 'stake' : rng.chance(0.5) ? 'profit' : 'exists'
    if (variant === 'stake') {
      const i = rng.int(0, n - 1)
      return {
        prompt: `A bookmaker offers:\n${lines}\n${oddsNote} You have \\$${tex(S)} to bet and want the same payout whichever outcome occurs. How much should you stake on "${outcomes[i]}"?`,
        answer: decAnswer(stakes[i].toNumber(), { rel: 0.01, abs: 0.01 }, 2),
        explanation,
        expectedSeconds: expectedTime(45, d),
        unit: { prefix: '$' },
        meta: { ...meta, variant, outcome: i, stake: stakes[i].toString() },
      }
    }
    if (variant === 'profit') {
      return {
        prompt: `A bookmaker offers:\n${lines}\n${oddsNote} With \\$${tex(S)} in total, what is the largest profit you can guarantee by betting on these outcomes? Enter $0$ if none.`,
        answer: profitAnswer(profit),
        explanation,
        expectedSeconds: expectedTime(40, d),
        unit: { prefix: '$' },
        inputHint: 'Profit (0 if none)',
        meta: { ...meta, variant },
      }
    }
    const yes = 'Yes — back every outcome'
    return {
      prompt: `A bookmaker offers:\n${lines}\n${oddsNote} Can a bettor lock in a riskless profit?`,
      answer: mc([yes, NO_ARB], isArb ? yes : NO_ARB),
      explanation,
      expectedSeconds: expectedTime(25, d),
      meta: { ...meta, variant },
    }
  },
}

// ---------------------------------------------------------------------------
// Put–call parity
// ---------------------------------------------------------------------------

export const PCP_REVERSAL = 'Buy call, sell put, short stock, lend PV(K)'
export const PCP_CONVERSION = 'Sell call, buy put, buy stock, borrow PV(K)'

const putCallParity: QuestionTemplate = {
  id: 'arb.put-call-parity',
  category: CAT,
  subcategory: 'put-call-parity',
  generate(d, rng) {
    const S = Fraction.from(rng.int(40, 160))
    const K = Fraction.from(Math.round(S.toNumber() / 5) * 5 + rng.pick([-10, -5, 0, 5, 10]))
    const DF = d <= 2 ? ONE : Fraction.from(rng.pick(['0.99', '0.98', '0.97', '0.96', '0.95']))
    const dividend = d === 5 && rng.chance(0.5) ? Fraction.from(rng.pick(['0.5', '1', '1.5', '2'])) : ZERO
    const fairDiff = S.sub(dividend).sub(DF.mul(K)) // C - P
    const noArb = rng.chance(0.3)
    const delta = noArb ? ZERO : Fraction.from(rng.sign() * rng.pick([0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]))
    // Choose P on a quarter grid so both option prices are at least $1.
    const minP = Math.max(1, 1 - fairDiff.add(delta).toNumber())
    const P = Fraction.from(Math.ceil(minP * 4) / 4 + rng.int(0, 32) / 4)
    const Cq = P.add(fairDiff).add(delta)
    assert(Cq.toNumber() >= 1 && P.toNumber() >= 1, 'option prices positive')
    const actualDiff = Cq.sub(P)
    const mis = actualDiff.sub(fairDiff) // >0: call rich
    const contracts = d >= 4 ? rng.pick([5, 10, 20]) : 0
    const multiplier = contracts ? contracts * 100 : 1
    const profit = mis.abs().mul(multiplier)
    const correct = mis.isZero() ? NO_ARB : mis.gt(0) ? PCP_CONVERSION : PCP_REVERSAL

    const rateText = d <= 2 ? 'Interest rates are zero.' : `The discount factor to expiry is $${dec(DF)}$ (so $PV(K) = ${dec(DF)}K$).`
    const divText = dividend.isZero() ? '' : ` The stock pays a dividend of \\$${money(dividend.toNumber())} before expiry (assume its present value is \\$${money(dividend.toNumber())}).`
    const setup = `A stock trades at \\$${money(S.toNumber())}. European options with strike \\$${money(K.toNumber())} and the same expiry: call \\$${money(Cq.toNumber())}, put \\$${money(P.toNumber())}. ${rateText}${divText}`
    const explanation = [
      `Parity: $C - P = S ${dividend.isZero() ? '' : '- PV(D) '}- PV(K) = ${money(S.toNumber())} ${dividend.isZero() ? '' : `- ${money(dividend.toNumber())} `}- ${dec(DF.mul(K), 4)} = ${dec(fairDiff, 4)}$`,
      `Market: $C - P = ${money(Cq.toNumber())} - ${money(P.toNumber())} = ${dec(actualDiff, 4)}$`,
      mis.isZero()
        ? 'Parity holds exactly: no arbitrage.'
        : mis.gt(0)
          ? `The call is rich by $${dec(mis, 4)}$: sell the call, buy the put, buy the stock${dividend.isZero() ? '' : ' (collect the dividend)'}, borrow $PV(K)$ (a conversion).`
          : `The call is cheap by $${dec(mis.abs(), 4)}$: buy the call, sell the put, short the stock${dividend.isZero() ? '' : ' (pay the dividend)'}, lend $PV(K)$ (a reversal).`,
      ...(contracts && !mis.isZero() ? [`Per share $${dec(mis.abs(), 4)}$ × ${contracts} contracts × 100 shares $= ${tex(profit.toNumber(), 2)}$`] : []),
    ]
    const meta = { S: S.toString(), K: K.toString(), DF: DF.toString(), C: Cq.toString(), P: P.toString(), D: dividend.toString(), mis: mis.toString(), multiplier }

    if (rng.chance(0.5)) {
      return {
        prompt: `${setup}\nWhich trade locks in an arbitrage?`,
        answer: mc([PCP_REVERSAL, PCP_CONVERSION, NO_ARB], correct),
        explanation,
        expectedSeconds: expectedTime(40, d),
        meta: { ...meta, variant: 'side' },
      }
    }
    const what = contracts ? `on ${contracts} contracts (100 shares each)` : 'per share'
    return {
      prompt: `${setup}\nWhat riskless profit can you lock in today ${what}? Enter $0$ if there is no arbitrage.`,
      answer: profitAnswer(profit),
      explanation,
      expectedSeconds: expectedTime(45, d),
      unit: { prefix: '$' },
      inputHint: 'Profit (0 if none)',
      meta: { ...meta, variant: 'profit' },
    }
  },
}

// ---------------------------------------------------------------------------
// Crossed venues
// ---------------------------------------------------------------------------

export interface Level {
  price: Fraction
  size: number
}

/** Maximum riskless profit from buying asks on one venue and selling into bids on the other. */
export function sweepProfit(asks: Level[], bids: Level[], feePerShare: Fraction): { profit: Fraction; shares: number } {
  const a = asks.map((l) => ({ ...l })).sort((x, y) => x.price.cmp(y.price))
  const b = bids.map((l) => ({ ...l })).sort((x, y) => y.price.cmp(x.price))
  let i = 0
  let j = 0
  let profit = ZERO
  let shares = 0
  while (i < a.length && j < b.length) {
    const edge = b[j].price.sub(a[i].price).sub(feePerShare.mul(2))
    if (!edge.gt(0)) break
    const q = Math.min(a[i].size, b[j].size)
    profit = profit.add(edge.mul(q))
    shares += q
    a[i].size -= q
    b[j].size -= q
    if (a[i].size === 0) i++
    if (b[j].size === 0) j++
  }
  return { profit, shares }
}

const venueCrossing: QuestionTemplate = {
  id: 'arb.venue-crossing',
  category: CAT,
  subcategory: 'venue-crossing',
  generate(d, rng) {
    const levels = d >= 4 ? 2 : 1
    const fee = d >= 3 ? Fraction.from(rng.pick(['0.002', '0.003', '0.005', '0.01'])) : ZERO
    const base = rng.int(2000, 20000) // cents
    const cents = (c: number) => frac(c, 100)
    const size = () => rng.pick([100, 200, 300, 400, 500, 800, 1000])
    // A "fee trap" is crossed by one cent before fees and flat after them; it needs fees of at least half a cent.
    const canTrap = fee.mul(2).cmp(frac(1, 100)) >= 0
    const scenario = rng.weighted(['cross', 'none', 'fee-trap'] as const, [6, 2, canTrap ? 2 : 0])

    // Build venue A and B books around the same fair price.
    let A: { bids: Level[]; asks: Level[] }
    let B: { bids: Level[]; asks: Level[] }
    const book = (bidTop: number, spread: number) => ({
      bids: Array.from({ length: levels }, (_, k) => ({ price: cents(bidTop - k * rng.int(1, 3)), size: size() })),
      asks: Array.from({ length: levels }, (_, k) => ({ price: cents(bidTop + spread + k * rng.int(1, 3)), size: size() })),
    })
    let guard = 0
    for (;;) {
      const spreadA = rng.int(1, 4)
      const spreadB = rng.int(1, 4)
      A = book(base, spreadA)
      let bTop: number
      if (scenario === 'none') bTop = base + rng.int(-spreadB + 1, spreadA - 1) // books overlap without crossing
      else if (scenario === 'fee-trap') bTop = base + spreadA + 1 // crossed by exactly one cent
      else bTop = base + spreadA + rng.int(1, 6)
      B = book(bTop, spreadB)
      if (rng.chance(0.5)) [A, B] = [B, A]
      const net = sweepProfit(A.asks, B.bids, fee).profit.add(sweepProfit(B.asks, A.bids, fee).profit)
      const gross = sweepProfit(A.asks, B.bids, ZERO).profit.add(sweepProfit(B.asks, A.bids, ZERO).profit)
      const ok =
        scenario === 'cross' ? net.toNumber() >= 1 : scenario === 'none' ? gross.isZero() : gross.gt(0) && net.isZero()
      // A venue's own book must not be crossed.
      const sane = [A, B].every((v) => v.bids[0].price.lt(v.asks[0].price))
      if (ok && sane) break
      if (++guard > 5000) throw new Error('venue search failed')
    }
    const r1 = sweepProfit(A.asks, B.bids, fee)
    const r2 = sweepProfit(B.asks, A.bids, fee)
    const profit = r1.profit.add(r2.profit)
    const direction = r1.profit.gt(0) ? 'Buy on A, sell on B' : r2.profit.gt(0) ? 'Buy on B, sell on A' : NO_ARB

    const fmtBook = (name: string, v: { bids: Level[]; asks: Level[] }) => {
      const bids = v.bids.map((l) => `${money(l.price.toNumber())} × ${l.size}`).join(', ')
      const asks = v.asks.map((l) => `${money(l.price.toNumber())} × ${l.size}`).join(', ')
      return `Venue ${name} — bids: ${bids} | asks: ${asks}`
    }
    const feeText = fee.isZero() ? '' : ` Each execution costs a fee of \\$${dec(fee, 4)} per share on either venue.`
    const sweepLines = (asks: Level[], bids: Level[], label: string) => {
      const rr = sweepProfit(asks, bids, fee)
      return rr.profit.gt(0) ? [`${label}: ${rr.shares} shares, profit $\\$${dec(rr.profit, 2)}$`] : []
    }
    const explanation = [
      'A riskless arb exists only if one venue\'s bid is above the other venue\'s ask (after fees).',
      `Best bid/ask — A: $${money(A.bids[0].price.toNumber())} / ${money(A.asks[0].price.toNumber())}$, B: $${money(B.bids[0].price.toNumber())} / ${money(B.asks[0].price.toNumber())}$`,
      ...(fee.isZero() ? [] : [`Fees cost $2 \\times ${dec(fee, 4)} = ${dec(fee.mul(2), 4)}$ per share round trip.`]),
      ...sweepLines(A.asks, B.bids, 'Buy A asks, sell into B bids'),
      ...sweepLines(B.asks, A.bids, 'Buy B asks, sell into A bids'),
      profit.isZero() ? 'Nothing crosses profitably: no arbitrage.' : `Walk the books level by level while the edge stays positive: total $\\$${dec(profit, 2)}$`,
    ]
    const meta = {
      A: { bids: A.bids.map((l) => [l.price.toString(), l.size]), asks: A.asks.map((l) => [l.price.toString(), l.size]) },
      B: { bids: B.bids.map((l) => [l.price.toString(), l.size]), asks: B.asks.map((l) => [l.price.toString(), l.size]) },
      fee: fee.toString(),
      profit: profit.toString(),
      direction,
    }
    const books = `${fmtBook('A', A)}\n${fmtBook('B', B)}`
    if (levels === 1 && rng.chance(0.5)) {
      return {
        prompt: `Two venues quote the same stock (price × size):\n${books}\n${feeText.trim()}${feeText ? '\n' : ''}What should you do?`,
        answer: mc(['Buy on A, sell on B', 'Buy on B, sell on A', NO_ARB], direction),
        explanation,
        expectedSeconds: expectedTime(20, d),
        meta: { ...meta, variant: 'direction' },
      }
    }
    return {
      prompt: `Two venues quote the same stock (price × size):\n${books}\n${feeText.trim()}${feeText ? '\n' : ''}What is the maximum riskless profit available right now? Enter $0$ if none.`,
      answer: decAnswer(profit.toNumber(), { abs: 0.005 }, 2),
      explanation,
      expectedSeconds: expectedTime(30, d),
      unit: { prefix: '$' },
      inputHint: 'Profit (0 if none)',
      meta: { ...meta, variant: 'profit' },
    }
  },
}

// ---------------------------------------------------------------------------
// Forward pricing
// ---------------------------------------------------------------------------

export const FWD_RICH = 'Rich: sell the forward, buy spot (cash-and-carry)'
export const FWD_CHEAP = 'Cheap: buy the forward, short spot (reverse cash-and-carry)'
export const FWD_FAIR = 'Fairly priced: no arbitrage'

const forward: QuestionTemplate = {
  id: 'arb.forward',
  category: CAT,
  subcategory: 'forward',
  generate(d, rng): QuestionDraft {
    const months = rng.pick([3, 6, 12])
    const T = frac(months, 12)
    const rPct = rng.pick([2, 4, 5, 6, 8, 10])
    const r = frac(rPct, 100)
    const growth = ONE.add(r.mul(T)) // simple interest
    const S = Fraction.from(rng.int(d <= 2 ? 20 : 40, d <= 2 ? 200 : 500))
    let fair: Fraction
    let setup: string
    let fairSteps: string[]
    const kind = byDifficulty(d, ['plain', 'plain', rng.pick(['plain', 'dividend'] as const), rng.pick(['dividend', 'storage'] as const), rng.pick(['fx', 'storage', 'dividend'] as const)])
    let asset = 'stock'
    switch (kind) {
      case 'dividend': {
        const D = Fraction.from(rng.pick([1, 2, 2.5, 3, 4]))
        fair = S.mul(growth).sub(D)
        setup = `A stock trades at \\$${money(S.toNumber())}. It pays a \\$${money(D.toNumber())} dividend just before the forward's expiry in ${months} months. The interest rate is $${rPct}\\%$ per year, simple interest.`
        fairSteps = [`$F = S(1 + rT) - D = ${money(S.toNumber())} \\times ${dec(growth, 6)} - ${money(D.toNumber())} = ${dec(fair, 4)}$`]
        break
      }
      case 'storage': {
        const U = Fraction.from(rng.pick([1, 1.5, 2, 3, 5]))
        fair = S.mul(growth).add(U)
        asset = 'commodity'
        setup = `Gold trades at \\$${money(S.toNumber())} per ounce. Storing it costs \\$${money(U.toNumber())} per ounce, paid at the forward's expiry in ${months} months. The interest rate is $${rPct}\\%$ per year, simple interest.`
        fairSteps = [`$F = S(1 + rT) + U = ${money(S.toNumber())} \\times ${dec(growth, 6)} + ${money(U.toNumber())} = ${dec(fair, 4)}$`]
        break
      }
      case 'fx': {
        const spot = Fraction.from(rng.pick(['1.10', '1.20', '1.25', '1.30', '0.80']))
        const rfPct = rng.pick([1, 2, 3, 4].filter((x) => x !== rPct))
        const rf = frac(rfPct, 100)
        fair = spot.mul(growth).div(ONE.add(rf.mul(T)))
        asset = 'currency'
        setup = `EUR/USD spot is $${dec(spot, 4)}$. USD rates are $${rPct}\\%$ and EUR rates are $${rfPct}\\%$ per year (simple interest). Consider a ${months}-month EUR/USD forward.`
        fairSteps = [`Covered interest parity: $F = S \\cdot \\frac{1 + r_{USD}T}{1 + r_{EUR}T} = ${dec(spot, 4)} \\times \\frac{${dec(growth, 6)}}{${dec(ONE.add(rf.mul(T)), 6)}} \\approx ${dec(fair, 5)}$`]
        break
      }
      default: {
        fair = S.mul(growth)
        setup = `A non-dividend-paying stock trades at \\$${money(S.toNumber())}. The interest rate is $${rPct}\\%$ per year, simple interest. Consider a forward expiring in ${months} months.`
        fairSteps = [`$F = S(1 + rT) = ${money(S.toNumber())} \\times (1 + ${dec(r, 4)} \\times ${dec(T, 4)}) = ${dec(fair, 4)}$`]
      }
    }
    const isFx = kind === 'fx'
    const variant = rng.pick(['fair', 'side', 'profit'] as const)
    const meta = { kind, S: S.toString(), T: T.toString(), r: r.toString(), fair: fair.toString() }
    if (variant === 'fair') {
      return {
        prompt: `${setup}\nWhat is the fair forward price?`,
        answer: decAnswer(fair.toNumber(), isFx ? { abs: 0.0005 } : { abs: 0.01 }, isFx ? 4 : 2),
        explanation: [...fairSteps, 'Cost of carry: buying spot and financing it must cost the same as locking in the forward.'],
        expectedSeconds: expectedTime(30, d),
        unit: isFx ? undefined : { prefix: '$' },
        inputHint: isFx ? '4 decimal places' : 'Price',
        meta: { ...meta, variant },
      }
    }
    const noArb = rng.chance(0.3)
    const tick = isFx ? Fraction.from('0.0001') : Fraction.from('0.01')
    // Quote the forward on the tick grid; a "fair" quote must equal fair value exactly.
    const fairOnGrid = fair.div(tick).isInteger()
    const offset = isFx ? Fraction.from(rng.pick(['0.005', '0.01', '0.0075', '0.02'])) : Fraction.from(rng.pick([0.5, 1, 1.5, 2, 3, 4]))
    let quoted: Fraction
    if (noArb && fairOnGrid) quoted = fair
    else {
      const sign = rng.sign()
      const rawQ = fair.add(offset.mul(sign))
      quoted = new Fraction(BigInt(Math.round(rawQ.div(tick).toNumber()))).mul(tick)
    }
    const mis = quoted.sub(fair)
    const correct = mis.isZero() ? FWD_FAIR : mis.gt(0) ? FWD_RICH : FWD_CHEAP
    const qText = isFx ? dec(quoted, 4) : `\\$${money(quoted.toNumber())}`
    const explanation = [
      ...fairSteps,
      `Quoted $${isFx ? dec(quoted, 4) : money(quoted.toNumber())}$ vs fair $${dec(fair, isFx ? 5 : 4)}$`,
      mis.isZero()
        ? 'The quote equals fair value: no arbitrage.'
        : mis.gt(0)
          ? `Rich by $${dec(mis, 5)}$: borrow to buy the ${asset} at spot, sell the forward, deliver at expiry.`
          : `Cheap by $${dec(mis.abs(), 5)}$: short the ${asset} at spot, invest the proceeds, buy the forward.`,
    ]
    if (variant === 'side') {
      return {
        prompt: `${setup}\nA dealer quotes the forward at ${qText}. Is it rich or cheap?`,
        answer: mc([FWD_RICH, FWD_CHEAP, FWD_FAIR], correct),
        explanation,
        expectedSeconds: expectedTime(30, d),
        meta: { ...meta, variant, quoted: quoted.toString() },
      }
    }
    const units = isFx ? 1_000_000 : 1
    const profit = mis.abs().mul(units)
    return {
      prompt: `${setup}\nA dealer quotes the forward at ${qText}. What riskless profit (at expiry) can you lock in ${isFx ? 'per €1,000,000 notional (in USD)' : 'per unit'}? Enter $0$ if none.`,
      answer: profitAnswer(profit, isFx ? 1 : 0.01),
      explanation: [...explanation, ...(isFx && !mis.isZero() ? [`$${dec(mis.abs(), 6)} \\times 1{,}000{,}000 \\approx ${tex(profit.toNumber(), 2)}$ USD`] : [])],
      expectedSeconds: expectedTime(40, d),
      unit: isFx ? { suffix: ' USD' } : { prefix: '$' },
      inputHint: 'Profit (0 if none)',
      meta: { ...meta, variant, quoted: quoted.toString() },
    }
  },
}

export const arbitrageTemplates: QuestionTemplate[] = [triangular, dutchBook, putCallParity, venueCrossing, forward]

export const arbitrageGenerator = makeGenerator(CAT, 'Arbitrage', ARBITRAGE_SUBCATEGORIES, arbitrageTemplates)
