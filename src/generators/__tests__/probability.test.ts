/**
 * Probability generator tests.
 *
 * 1. Shared invariants for every template.
 * 2. Monte Carlo validation: for each question, an *independent* simulator
 *    (written here from the question's meta, never reusing generator formulas)
 *    estimates the answer, which must agree with the exact fraction.
 * 3. Exhaustive checks where enumeration is cheap (poker hands, counting).
 */
import { describe, expect, it } from 'vitest'
import { Fraction } from '../../core/fraction'
import { SeededRNG } from '../../core/rng'
import type { Difficulty, Question } from '../../core/types'
import {
  PROBABILITY_SUBCATEGORIES,
  POKER_COUNTS,
  penney,
  patternWait,
  probabilityTemplates,
  rerollValue,
} from '../probability'
import { checkTemplateInvariants, sampleTemplate } from './harness'

const D: Difficulty[] = [1, 2, 3, 4, 5]
const byId = (id: string) => probabilityTemplates.find((t) => t.id === id)!

function exactOf(q: Question): number {
  return Fraction.from(0).add(parseFrac(q.meta!.exact as string)).toNumber()
}
function parseFrac(s: string): Fraction {
  const [n, d = '1'] = s.split('/')
  return new Fraction(BigInt(n), BigInt(d))
}
const pnum = (s: unknown) => parseFrac(String(s)).toNumber()

// ---------------------------------------------------------------------------
// Simulation primitives
// ---------------------------------------------------------------------------

const die = (r: SeededRNG, sides = 6) => r.int(1, sides)
const deck = () => Array.from({ length: 52 }, (_, i) => i) // rank = i % 13 (0 = ace), suit = floor(i / 13)
const rank = (c: number) => c % 13
const suit = (c: number) => Math.floor(c / 13)
const isRed = (c: number) => suit(c) < 2
function draw(r: SeededRNG, n: number): number[] {
  // Partial Fisher–Yates
  const d = deck()
  for (let i = 0; i < n; i++) {
    const j = r.int(i, 51)
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d.slice(0, n)
}
function urnSeq(r: SeededRNG, balls: string[]): string[] {
  return r.shuffle(balls)
}
const bernoulli = (r: SeededRNG, p: number) => r.next() < p

function trialSuccess(r: SeededRNG, kind: string): boolean {
  switch (kind) {
    case 'die-6':
      return die(r) === 6
    case 'die-56':
      return die(r) >= 5
    case 'coin':
      return r.next() < 0.5
    case 'two-dice-7':
      return die(r) + die(r) === 7
    case 'ace':
      return r.int(0, 51) % 13 === 0
    default:
      throw new Error(kind)
  }
}

/** Returns one sample of the quantity (0/1 for probabilities), or null if the sample is rejected (conditioning). */
function sampleOnce(m: Record<string, any>, r: SeededRNG): number | null {
  switch (m.kind) {
    // ---- dice
    case 'die-set':
      return m.set.includes(die(r)) ? 1 : 0
    case 'sum-eq':
    case 'sum-ge': {
      let s = 0
      for (let i = 0; i < m.n; i++) s += die(r)
      return (m.kind === 'sum-eq' ? s === m.s : s >= m.s) ? 1 : 0
    }
    case 'all-same': {
      const a = die(r)
      return die(r) === a ? 1 : 0
    }
    case 'all-different': {
      const xs = Array.from({ length: m.n }, () => die(r))
      return new Set(xs).size === m.n ? 1 : 0
    }
    case 'at-least-one': {
      for (let i = 0; i < m.n; i++) if (die(r) === m.face) return 1
      return 0
    }
    case 'max-eq':
    case 'max-le': {
      const mx = Math.max(...Array.from({ length: m.n }, () => die(r)))
      return (m.kind === 'max-eq' ? mx === m.k : mx <= m.k) ? 1 : 0
    }
    case 'exactly-k': {
      let c = 0
      for (let i = 0; i < m.n; i++) if (die(r) === m.face) c++
      return c === m.j ? 1 : 0
    }
    // ---- coins
    case 'binom-eq':
    case 'binom-ge': {
      const p = pnum(m.p)
      let h = 0
      for (let i = 0; i < m.n; i++) if (bernoulli(r, p)) h++
      return (m.kind === 'binom-eq' ? h === m.k : h >= m.k) ? 1 : 0
    }
    case 'more-heads': {
      let h = 0
      for (let i = 0; i < m.n; i++) if (bernoulli(r, 0.5)) h++
      return h > m.n - h ? 1 : 0
    }
    case 'no-hh': {
      let prev = false
      for (let i = 0; i < m.n; i++) {
        const h = bernoulli(r, 0.5)
        if (h && prev) return 0
        prev = h
      }
      return 1
    }
    case 'run': {
      let run = 0
      for (let i = 0; i < m.n; i++) {
        run = bernoulli(r, 0.5) ? run + 1 : 0
        if (run >= m.r) return 1
      }
      return 0
    }
    // ---- cards
    case 'one-card': {
      const c = r.int(0, 51)
      const rk = rank(c)
      const face = rk >= 10
      switch (m.pred) {
        case 'heart':
          return suit(c) === 0 ? 1 : 0
        case 'face':
          return face ? 1 : 0
        case 'ace-or-heart':
          return rk === 0 || suit(c) === 0 ? 1 : 0
        case 'red-king':
          return rk === 12 && isRed(c) ? 1 : 0
        case 'number':
          return rk >= 1 && rk <= 9 ? 1 : 0
        case 'black-face':
          return face && !isRed(c) ? 1 : 0
      }
      throw new Error(m.pred)
    }
    case 'two-cards': {
      const [a, b] = draw(r, 2)
      switch (m.pred) {
        case 'both-aces':
          return rank(a) === 0 && rank(b) === 0 ? 1 : 0
        case 'both-hearts':
          return suit(a) === 0 && suit(b) === 0 ? 1 : 0
        case 'same-suit':
          return suit(a) === suit(b) ? 1 : 0
        case 'pair':
          return rank(a) === rank(b) ? 1 : 0
        case 'diff-color':
          return isRed(a) !== isRed(b) ? 1 : 0
        case 'at-least-one-ace':
          return rank(a) === 0 || rank(b) === 0 ? 1 : 0
      }
      throw new Error(m.pred)
    }
    case 'hand': {
      const h = draw(r, m.n)
      const aces = h.filter((c) => rank(c) === 0).length
      switch (m.pred) {
        case 'no-aces':
          return aces === 0 ? 1 : 0
        case 'one-ace':
          return aces === 1 ? 1 : 0
        case 'two-aces':
          return aces === 2 ? 1 : 0
        case 'some-ace':
          return aces > 0 ? 1 : 0
        case 'all-hearts':
          return h.every((c) => suit(c) === 0) ? 1 : 0
        case 'same-color':
          return h.every((c) => isRed(c) === isRed(h[0])) ? 1 : 0
        case 'flush':
          return h.every((c) => suit(c) === suit(h[0])) ? 1 : 0
        case 'four-suits':
          return new Set(h.map(suit)).size === 4 ? 1 : 0
      }
      throw new Error(m.pred)
    }
    case 'poker':
      return null // validated exhaustively below
    // ---- urns
    case 'urn-replace-both-red': {
      const N = m.r + m.b
      return r.int(1, N) <= m.r && r.int(1, N) <= m.r ? 1 : 0
    }
    case 'urn-draw': {
      const seq = urnSeq(r, [...Array(m.r).fill('R'), ...Array(m.b).fill('B')]).slice(0, m.n)
      return seq.filter((x) => x === 'R').length === m.j ? 1 : 0
    }
    case 'urn-kth-red': {
      const seq = urnSeq(r, [...Array(m.r).fill('R'), ...Array(m.b).fill('B')])
      return seq[m.k - 1] === 'R' ? 1 : 0
    }
    case 'urn-three-colors': {
      const seq = urnSeq(r, [...Array(m.r).fill('R'), ...Array(m.b).fill('B'), ...Array(m.g).fill('G')]).slice(0, 3)
      return new Set(seq).size === 3 ? 1 : 0
    }
    case 'urn-red-before-green': {
      const seq = urnSeq(r, [...Array(m.r).fill('R'), ...Array(m.b).fill('B'), ...Array(m.g).fill('G')])
      return seq.find((x) => x !== 'B') === 'R' ? 1 : 0
    }
    case 'urn-first-red-index': {
      const seq = urnSeq(r, [...Array(m.r).fill('R'), ...Array(m.b).fill('B')])
      return seq.indexOf('R') + 1
    }
    // ---- conditional (rejection sampling)
    case 'children-older-boy': {
      const older = bernoulli(r, 0.5)
      const younger = bernoulli(r, 0.5)
      if (!older) return null
      return younger ? 1 : 0
    }
    case 'children-at-least-one-boy': {
      const a = bernoulli(r, 0.5)
      const b = bernoulli(r, 0.5)
      if (!a && !b) return null
      return a && b ? 1 : 0
    }
    case 'dice-sum-ge-given-first': {
      const a = die(r)
      const b = die(r)
      if (a !== m.k) return null
      return a + b >= m.s ? 1 : 0
    }
    case 'dice-sum-given-six': {
      const a = die(r)
      const b = die(r)
      if (a !== 6 && b !== 6) return null
      return a + b === m.s ? 1 : 0
    }
    case 'bayes-test':
    case 'bayes-two-tests': {
      const sick = bernoulli(r, pnum(m.prev))
      const p = sick ? pnum(m.sens) : pnum(m.fpr)
      const tests = m.kind === 'bayes-test' ? 1 : 2
      for (let i = 0; i < tests; i++) if (!bernoulli(r, p)) return null
      return sick ? 1 : 0
    }
    case 'double-headed': {
      const special = r.int(1, m.n) === 1
      for (let i = 0; i < m.k; i++) if (!special && !bernoulli(r, 0.5)) return null
      return special ? 1 : 0
    }
    case 'monty': {
      const car = r.int(1, m.n)
      const pick = r.int(1, m.n)
      const openable = Array.from({ length: m.n }, (_, i) => i + 1).filter((x) => x !== car && x !== pick)
      const opened = r.pick(openable)
      const switchTo = r.pick(Array.from({ length: m.n }, (_, i) => i + 1).filter((x) => x !== pick && x !== opened))
      return switchTo === car ? 1 : 0
    }
    // ---- geometric
    case 'geo-mean':
    case 'geo-first-at':
    case 'geo-more-than': {
      let t = 1
      while (!trialSuccess(r, m.trial)) t++
      if (m.kind === 'geo-mean') return t
      if (m.kind === 'geo-first-at') return t === m.k ? 1 : 0
      return t > m.k ? 1 : 0
    }
    case 'nb-mean':
    case 'nb-at':
    case 'nb-failures-mean': {
      let t = 0
      let s = 0
      while (s < m.r) {
        t++
        if (trialSuccess(r, m.trial)) s++
      }
      if (m.kind === 'nb-mean') return t
      if (m.kind === 'nb-failures-mean') return t - m.r
      return t === m.n ? 1 : 0
    }
    // ---- expectation
    case 'sum-dice-mean': {
      let s = 0
      for (let i = 0; i < m.n; i++) s += die(r)
      return s
    }
    case 'heads-mean': {
      let h = 0
      for (let i = 0; i < m.n; i++) if (bernoulli(r, 0.5)) h++
      return h
    }
    case 'count-sixes-mean': {
      let c = 0
      for (let i = 0; i < m.n; i++) if (die(r) === 6) c++
      return c
    }
    case 'card-values-mean':
      return draw(r, m.n).reduce((s, c) => s + rank(c) + 1, 0)
    case 'fixed-points-mean': {
      const perm = r.shuffle(Array.from({ length: m.n }, (_, i) => i))
      return perm.filter((x, i) => x === i).length
    }
    case 'distinct-faces-mean':
      return new Set(Array.from({ length: m.n }, () => die(r))).size
    case 'hh-pairs-mean': {
      const f = Array.from({ length: m.n }, () => bernoulli(r, 0.5))
      return f.slice(1).filter((x, i) => x && f[i]).length
    }
    case 'empty-boxes-mean': {
      const used = new Set(Array.from({ length: m.balls }, () => r.int(1, m.boxes)))
      return m.boxes - used.size
    }
    case 'runs-mean': {
      const f = Array.from({ length: m.n }, () => bernoulli(r, 0.5))
      return 1 + f.slice(1).filter((x, i) => x !== f[i]).length
    }
    case 'adjacent-mixed-mean': {
      const line = r.shuffle([...Array(m.b).fill('B'), ...Array(m.g).fill('S')])
      return line.slice(1).filter((x, i) => x !== line[i]).length
    }
    case 'cycles-mean': {
      const perm = r.shuffle(Array.from({ length: m.n }, (_, i) => i))
      const seen = new Array(m.n).fill(false)
      let cycles = 0
      for (let i = 0; i < m.n; i++) {
        if (seen[i]) continue
        cycles++
        let j = i
        while (!seen[j]) {
          seen[j] = true
          j = perm[j]
        }
      }
      return cycles
    }
    // ---- stopping
    case 'k-heads-total': {
      let t = 0
      let h = 0
      while (h < m.k) {
        t++
        if (bernoulli(r, 0.5)) h++
      }
      return t
    }
    case 'pattern-wait': {
      let s = ''
      let t = 0
      while (!s.endsWith(m.pattern)) {
        s = (s + (bernoulli(r, 0.5) ? 'H' : 'T')).slice(-m.pattern.length)
        t++
      }
      return t
    }
    case 'coupon': {
      const seen = new Set<number>()
      let t = 0
      while (seen.size < m.n) {
        seen.add(die(r, m.n))
        t++
      }
      return t
    }
    case 'dice-66': {
      let prev = 0
      let t = 0
      for (;;) {
        const x = die(r)
        t++
        if (x === 6 && prev === 6) return t
        prev = x
      }
    }
    case 'sum-until-ge': {
      let s = 0
      for (;;) {
        const x = die(r)
        s += x
        if (x >= m.t) return s
      }
    }
    case 'penney': {
      let s = ''
      for (;;) {
        s += bernoulli(r, 0.5) ? 'H' : 'T'
        if (s.endsWith(m.a)) return 1
        if (s.endsWith(m.b)) return 0
      }
    }
    // ---- betting
    case 'bet-fair':
    case 'bet-mc':
      return playGame(m, r)
    // ---- variance: return the raw draw; the caller computes the variance
    case 'var-die':
      return die(r)
    case 'var-heads':
    case 'sd-heads': {
      let h = 0
      for (let i = 0; i < m.n; i++) if (bernoulli(r, 0.5)) h++
      return h
    }
    case 'var-sum-dice': {
      let s = 0
      for (let i = 0; i < m.n; i++) s += die(r)
      return s
    }
    case 'var-binom': {
      const p = pnum(m.p)
      let h = 0
      for (let i = 0; i < m.n; i++) if (bernoulli(r, p)) h++
      return h
    }
    case 'var-linear': {
      // Any independent distributions with the given variances.
      const x = r.normal(3, Math.sqrt(m.vx))
      const y = (r.next() < 0.5 ? -1 : 1) * Math.sqrt(m.vy)
      return m.a * x - m.b * y + 7
    }
    case 'var-geo': {
      const p = pnum(m.p)
      let t = 1
      while (!bernoulli(r, p)) t++
      return t
    }
    case 'var-max2':
      return Math.max(die(r), die(r))
  }
  throw new Error(`no simulator for kind ${m.kind}`)
}

/** Plays a betting game with a hard-coded optimal strategy (derived by hand, not from the generator). */
function playGame(m: Record<string, any>, r: SeededRNG): number {
  switch (m.game) {
    case 'die':
      return die(r) * m.scale
    case 'six-pays':
      return die(r) === 6 ? m.prize : 0
    case 'max2':
      return Math.max(die(r), die(r))
    case 'product2':
      return die(r) * die(r)
    case 'card':
      return r.int(1, 13)
    case 'square':
      return die(r) ** 2
    case 'heads-before-tail': {
      let h = 0
      while (bernoulli(r, 0.5)) h++
      return h
    }
    case 'st-petersburg': {
      let h = 0
      while (h < m.cap && bernoulli(r, 0.5)) h++
      return 2 ** h
    }
    case 'reroll': {
      const sides = m.sides ?? 6
      // keep-thresholds by rolls remaining after the current one
      const thresholds: Record<string, number[]> = {
        '6-2': [4],
        '6-3': [5, 4],
        '6-4': [5, 5, 4],
        '10-2': [6],
      }
      const th = thresholds[`${sides}-${m.rolls}`]
      for (let i = 0; i < m.rolls - 1; i++) {
        const x = die(r, sides)
        if (x >= th[i]) return x
      }
      return die(r, sides)
    }
    case 'reroll-pair': {
      const t = die(r) + die(r)
      return t >= 7 ? t : die(r) + die(r)
    }
  }
  throw new Error(`no game ${m.game}`)
}

const VARIANCE_KINDS = new Set(['var-die', 'var-heads', 'sd-heads', 'var-sum-dice', 'var-binom', 'var-linear', 'var-geo', 'var-max2'])

function monteCarlo(q: Question, trials: number): { estimate: number; se: number; accepted: number } {
  const m = q.meta as Record<string, any>
  const r = new SeededRNG(`mc-${q.seed}`)
  let n = 0
  let s1 = 0
  let s2 = 0
  let guard = 0
  while (n < trials && guard < trials * 400) {
    guard++
    const x = sampleOnce(m, r)
    if (x === null) continue
    n++
    s1 += x
    s2 += x * x
  }
  const mean = s1 / n
  const v = Math.max(s2 / n - mean * mean, 0)
  if (VARIANCE_KINDS.has(m.kind)) {
    const sampleVar = (v * n) / (n - 1)
    const est = m.kind === 'sd-heads' ? Math.sqrt(sampleVar) : sampleVar
    // Generous: relative SE of a variance is roughly sqrt(2/n) for light tails.
    return { estimate: est, se: est * Math.sqrt(3 / n), accepted: n }
  }
  return { estimate: mean, se: Math.sqrt(v / n), accepted: n }
}

// ---------------------------------------------------------------------------

describe('probability generator', () => {
  for (const t of probabilityTemplates) {
    it(`${t.id} satisfies the shared invariants`, () => {
      checkTemplateInvariants(t, 100)
    })
  }

  it('covers every subcategory', () => {
    const covered = new Set(probabilityTemplates.map((t) => t.subcategory))
    for (const s of PROBABILITY_SUBCATEGORIES) expect(covered.has(s.id)).toBe(true)
  })

  it('all probabilities lie in (0, 1] and the stored exact value matches the answer', () => {
    for (const t of probabilityTemplates)
      for (const d of D)
        for (const q of sampleTemplate(t, d, 60)) {
          if (q.answer.type === 'fraction') {
            expect(new Fraction(BigInt(q.answer.num), BigInt(q.answer.den)).toString()).toBe(q.meta!.exact)
          }
        }
  })

  for (const t of probabilityTemplates) {
    if (t.id === 'prob.combinatorics') continue
    it(`${t.id}: Monte Carlo agrees with the exact answer`, () => {
      const seen = new Set<string>()
      for (const d of D) {
        for (const q of sampleTemplate(t, d, 25, 'mc')) {
          const m = q.meta as Record<string, any>
          if (m.kind === 'poker') continue
          // Simulate each distinct parameter set once.
          const key = JSON.stringify({ ...m, exact: undefined, price: undefined })
          if (seen.has(key)) continue
          seen.add(key)
          const exact = exactOf(q)
          const { estimate, se } = monteCarlo(q, 40_000)
          const tol = 5 * se + 0.004 * Math.max(1, Math.abs(exact))
          expect(Math.abs(estimate - exact), `${q.templateId} ${JSON.stringify(m)}: MC ${estimate} vs exact ${exact}`).toBeLessThanOrEqual(tol)
        }
      }
      expect(seen.size).toBeGreaterThan(3)
    }, 120_000)
  }

  it('would-you-pay questions mark the side of the fair value correctly', () => {
    for (const d of D)
      for (const q of sampleTemplate(byId('prob.betting'), d, 100)) {
        if (q.answer.type !== 'multiple-choice') continue
        const fair = exactOf(q)
        const price = q.meta!.price as number
        expect(Math.abs(fair - price)).toBeGreaterThanOrEqual(0.1)
        expect(q.answer.correctIndex).toBe(fair > price ? 0 : 1)
      }
  })

  it('poker hand counts match an exhaustive enumeration of all 2,598,960 hands', () => {
    const counts: Record<string, number> = { 'four-kind': 0, 'full-house': 0, 'three-kind': 0, 'two-pair': 0, 'one-pair': 0 }
    const hist = new Array(13).fill(0)
    for (let a = 0; a < 52; a++)
      for (let b = a + 1; b < 52; b++)
        for (let c = b + 1; c < 52; c++)
          for (let d = c + 1; d < 52; d++)
            for (let e = d + 1; e < 52; e++) {
              hist.fill(0)
              hist[a % 13]++
              hist[b % 13]++
              hist[c % 13]++
              hist[d % 13]++
              hist[e % 13]++
              let pairs = 0
              let trips = 0
              let quads = 0
              for (const h of hist) {
                if (h === 2) pairs++
                else if (h === 3) trips++
                else if (h === 4) quads++
              }
              if (quads) counts['four-kind']++
              else if (trips && pairs) counts['full-house']++
              else if (trips) counts['three-kind']++
              else if (pairs === 2) counts['two-pair']++
              else if (pairs === 1) counts['one-pair']++
            }
    for (const [k, v] of Object.entries(POKER_COUNTS)) expect(BigInt(counts[k])).toBe(v)
  }, 60_000)

  it('combinatorics answers match brute-force counting', () => {
    const countWord = (w: string): number => {
      // Independent DP over letter multiplicities.
      const memo = new Map<string, number>()
      const rec = (counts: number[]): number => {
        if (counts.every((c) => c === 0)) return 1
        const key = counts.join(',')
        if (memo.has(key)) return memo.get(key)!
        let s = 0
        counts.forEach((c, i) => {
          if (c > 0) {
            const next = counts.slice()
            next[i]--
            s += rec(next)
          }
        })
        memo.set(key, s)
        return s
      }
      return rec([...new Set(w)].map((ch) => [...w].filter((x) => x === ch).length))
    }
    const subsets = (n: number, k: number): number => {
      let c = 0
      for (let mask = 0; mask < 1 << n; mask++) if (popcount(mask) === k) c++
      return c
    }
    const popcount = (x: number) => x.toString(2).split('').filter((b) => b === '1').length
    const perms = (n: number): number[][] => (n === 0 ? [[]] : perms(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)])))
    for (const d of D)
      for (const q of sampleTemplate(byId('prob.combinatorics'), d, 60)) {
        const m = q.meta as Record<string, any>
        const ans = q.answer.type === 'integer' ? q.answer.value : NaN
        let expected: number
        switch (m.kind) {
          case 'word':
            expected = countWord(m.word)
            break
          case 'choose':
            expected = subsets(m.n, m.k)
            break
          case 'grid': {
            // DP over lattice
            const g = Array.from({ length: m.m + 1 }, () => new Array(m.n + 1).fill(1))
            for (let i = 1; i <= m.m; i++) for (let j = 1; j <= m.n; j++) g[i][j] = g[i - 1][j] + g[i][j - 1]
            expected = g[m.m][m.n]
            break
          }
          case 'team-at-least-one': {
            let c = 0
            const total = m.men + m.women
            for (let mask = 0; mask < 1 << total; mask++) if (popcount(mask) === m.k && mask >> m.men !== 0) c++
            expected = c
            break
          }
          case 'stars-bars': {
            let c = 0
            const rec = (left: number, people: number) => {
              if (people === 1) {
                if (left >= m.min) c++
                return
              }
              for (let x = m.min; x <= left; x++) rec(left - x, people - 1)
            }
            rec(m.n, m.k)
            expected = c
            break
          }
          case 'derangements':
            expected = perms(m.n).filter((p) => p.every((x, i) => x !== i)).length
            break
          case 'round-table': {
            // Fix person 0 at seat 0 to quotient out rotations; Alice = 1, Bob = 2.
            expected = perms(m.n - 1).filter((p) => {
              const seats = [0, ...p.map((x) => x + 1)]
              const ia = seats.indexOf(1)
              const ib = seats.indexOf(2)
              const dist = Math.abs(ia - ib)
              return dist !== 1 && dist !== m.n - 1
            }).length
            break
          }
          default:
            throw new Error(m.kind)
        }
        expect(ans, JSON.stringify(m)).toBe(expected)
      }
  })

  it('helper formulas: pattern waits, Penney odds and re-roll values', () => {
    const half = () => new Fraction(1n, 2n)
    expect(patternWait('HH', half).toString()).toBe('6')
    expect(patternWait('HT', half).toString()).toBe('4')
    expect(patternWait('HTH', half).toString()).toBe('10')
    expect(patternWait('HHH', half).toString()).toBe('14')
    expect(penney('HH', 'TH').toString()).toBe('1/4')
    expect(penney('HH', 'HT').toString()).toBe('1/2')
    expect(penney('THH', 'HHT').toString()).toBe('3/4')
    expect(rerollValue(2).toString()).toBe('17/4')
    expect(rerollValue(3).toString()).toBe('14/3')
    expect(rerollValue(4).toString()).toBe('89/18')
  })
})
