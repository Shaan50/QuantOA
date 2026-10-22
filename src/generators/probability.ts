/**
 * Probability & expected value. Every answer is computed as an exact Fraction.
 * Each question stores its parameters in `meta` (with a `kind`), which the
 * test-suite uses to run an independent Monte Carlo simulation.
 */
import { Fraction, frac, ONE, ZERO } from '../core/fraction'
import type { Difficulty, QuestionDraft, QuestionTemplate } from '../core/types'
import { choose, diceSumCounts, factorial, harmonic } from '../core/math'
import { assert, byDifficulty, expectedTime, fracAnswer, intAnswer, tex, usd } from './helpers'
import { makeGenerator } from './registry'

const CAT = 'probability' as const

export const PROBABILITY_SUBCATEGORIES = [
  { id: 'dice', label: 'Dice' },
  { id: 'coins', label: 'Coins' },
  { id: 'cards', label: 'Cards' },
  { id: 'urns', label: 'Urns' },
  { id: 'conditional', label: 'Conditional & Bayes' },
  { id: 'combinatorics', label: 'Combinatorics' },
  { id: 'geometric', label: 'Geometric & negative binomial' },
  { id: 'expectation', label: 'Linearity of expectation' },
  { id: 'stopping', label: 'Stopping problems' },
  { id: 'betting', label: 'Betting games & fair price' },
  { id: 'variance', label: 'Variance & std. dev.' },
] as const

const PROB_HINT = 'Fraction or decimal'

function P(f: Fraction, meta: Record<string, unknown>, prompt: string, explanation: string[], d: Difficulty, base = 25): QuestionDraft {
  assert(f.sign() > 0 && f.cmp(1) <= 0, `probability in (0, 1]: ${f}`)
  return {
    prompt,
    answer: fracAnswer(f),
    explanation: [...explanation, `Answer: $${fracLatex(f)}$`],
    expectedSeconds: expectedTime(base, d),
    inputHint: PROB_HINT,
    meta: { ...meta, exact: f.toString() },
  }
}

/** Expectation-style answer (any positive or negative rational). */
function E(f: Fraction, meta: Record<string, unknown>, prompt: string, explanation: string[], d: Difficulty, base = 30, money = false): QuestionDraft {
  return {
    prompt,
    answer: fracAnswer(f),
    explanation: [...explanation, `Answer: $${money ? '\\$' : ''}${fracLatex(f)}$`],
    expectedSeconds: expectedTime(base, d),
    inputHint: 'Fraction or decimal',
    unit: money ? { prefix: '$' } : undefined,
    meta: { ...meta, exact: f.toString() },
  }
}

export function fracLatex(f: Fraction): string {
  if (f.isInteger()) return f.toString()
  return `${f.toLatex()} ${f.isTerminating() ? '=' : '\\approx'} ${f.toDecimalString(4)}`
}

const ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const word = (n: number) => NUMBER_WORDS[n] ?? String(n)

// ---------------------------------------------------------------------------
// Dice
// ---------------------------------------------------------------------------

function diceSumProb(n: number, pred: (s: number) => boolean): { f: Fraction; ways: bigint } {
  const counts = diceSumCounts(n)
  let ways = 0n
  counts.forEach((c, s) => {
    if (pred(s)) ways += c
  })
  return { f: new Fraction(ways, 6n ** BigInt(n)), ways }
}

const dice: QuestionTemplate = {
  id: 'prob.dice',
  category: CAT,
  subcategory: 'dice',
  generate(d, rng) {
    const kind = byDifficulty(d, [
      ['die-set', 'sum-eq'],
      ['sum-ge', 'all-same', 'at-least-one'],
      ['sum-eq', 'all-different', 'at-least-one'],
      ['max-eq', 'max-le', 'sum-ge'],
      ['sum-eq', 'exactly-k', 'sum-ge', 'all-different'],
    ] as const)
    const k = rng.pick(kind)
    const nDice = byDifficulty(d, [2, 2, 3, 3, 4])
    switch (k) {
      case 'die-set': {
        const events: [string, number[]][] = [
          ['an even number', [2, 4, 6]],
          ['a prime number', [2, 3, 5]],
          ['a multiple of 3', [3, 6]],
          ...[1, 2, 3, 4].map((t): [string, number[]] => [`a number greater than ${t}`, [1, 2, 3, 4, 5, 6].filter((x) => x > t)]),
          ...[2, 3, 4].map((t): [string, number[]] => [`a number at most ${t}`, [1, 2, 3, 4, 5, 6].filter((x) => x <= t)]),
        ]
        const [desc, set] = rng.pick(events)
        const f = frac(set.length, 6)
        return P(f, { kind: 'die-set', set }, `You roll a fair six-sided die. What is the probability of rolling ${desc}?`, [`Favourable faces: $\\{${set.join(', ')}\\}$ — ${set.length} of 6`], d, 10)
      }
      case 'sum-eq': {
        const lo = nDice
        const hi = 6 * nDice
        const mid = (lo + hi) / 2
        const s = rng.int(lo + (d >= 3 ? 1 : 0), Math.floor(mid) + (d >= 3 ? 0 : 3))
        const { f, ways } = diceSumProb(nDice, (x) => x === s)
        return P(
          f,
          { kind: 'sum-eq', n: nDice, s },
          `You roll ${word(nDice)} fair dice. What is the probability that the total is exactly $${s}$?`,
          [
            `There are $6^{${nDice}} = ${tex(6 ** nDice)}$ equally likely outcomes.`,
            nDice === 2 ? `Pairs summing to $${s}$: ${pairsSumming(s)}` : `Counting compositions of $${s}$ into ${nDice} parts each between 1 and 6 gives $${ways}$ ways.`,
          ],
          d,
        )
      }
      case 'sum-ge': {
        const s = rng.int(nDice + 2, 6 * nDice - 1)
        const { f, ways } = diceSumProb(nDice, (x) => x >= s)
        return P(
          f,
          { kind: 'sum-ge', n: nDice, s },
          `You roll ${word(nDice)} fair dice. What is the probability that the total is at least $${s}$?`,
          [`Count outcomes with total $\\ge ${s}$: $${ways}$ of $${tex(6 ** nDice)}$ (use symmetry: total $t$ and $${7 * nDice} - t$ are equally likely).`],
          d,
        )
      }
      case 'all-same': {
        return P(frac(1, 6), { kind: 'all-same', n: 2 }, 'You roll two fair dice. What is the probability of rolling doubles?', ['Whatever the first die shows, the second matches it with probability $\\frac{1}{6}$.'], d, 10)
      }
      case 'all-different': {
        const n = nDice
        const f = new Fraction(BigInt(6 * 5 * 4 * (n === 4 ? 3 : 1)), 6n ** BigInt(n))
        return P(
          f,
          { kind: 'all-different', n },
          `You roll ${word(n)} fair dice. What is the probability that all of them show different numbers?`,
          [`$\\frac{6 \\cdot 5 \\cdot 4${n === 4 ? ' \\cdot 3' : ''}}{6^{${n}}}$`],
          d,
        )
      }
      case 'at-least-one': {
        const n = d === 2 ? rng.int(2, 3) : rng.int(3, 5)
        const f = ONE.sub(frac(5, 6).pow(n))
        return P(
          f,
          { kind: 'at-least-one', n, face: 6 },
          `You roll a fair die ${word(n)} times. What is the probability of getting at least one six?`,
          [`Complement: $P(\\text{no six}) = \\left(\\frac{5}{6}\\right)^{${n}} = ${frac(5, 6).pow(n).toLatex()}$`, `$1 - ${frac(5, 6).pow(n).toLatex()} = ${f.toLatex()}$`],
          d,
        )
      }
      case 'max-eq': {
        const m = rng.int(2, 6)
        const f = frac(2 * m - 1, 36)
        return P(
          f,
          { kind: 'max-eq', n: 2, k: m },
          `You roll two fair dice. What is the probability that the larger of the two numbers is exactly $${m}$?`,
          [`$P(\\max \\le ${m}) - P(\\max \\le ${m - 1}) = \\frac{${m * m}}{36} - \\frac{${(m - 1) ** 2}}{36} = \\frac{${2 * m - 1}}{36}$`],
          d,
        )
      }
      case 'max-le': {
        const m = rng.int(2, 5)
        const f = frac(m, 6).pow(3)
        return P(
          f,
          { kind: 'max-le', n: 3, k: m },
          `You roll three fair dice. What is the probability that none of them shows more than $${m}$?`,
          [`Each die independently: $\\left(\\frac{${m}}{6}\\right)^3$`],
          d,
        )
      }
      case 'exactly-k': {
        const n = 4
        const j = rng.int(1, 3)
        const f = new Fraction(choose(n, j)).mul(frac(1, 6).pow(j)).mul(frac(5, 6).pow(n - j))
        return P(
          f,
          { kind: 'exactly-k', n, j, face: 6 },
          `You roll a fair die four times. What is the probability of getting exactly ${word(j)} six${j > 1 ? 'es' : ''}?`,
          [`Binomial: $\\binom{4}{${j}} \\left(\\frac16\\right)^{${j}} \\left(\\frac56\\right)^{${n - j}}$`],
          d,
        )
      }
    }
  },
}

function pairsSumming(s: number): string {
  const pairs: string[] = []
  for (let a = 1; a <= 6; a++) {
    const b = s - a
    if (b >= 1 && b <= 6) pairs.push(`(${a},${b})`)
  }
  return `$${pairs.join(', ')}$ — ${pairs.length} of 36`
}

// ---------------------------------------------------------------------------
// Coins
// ---------------------------------------------------------------------------

function binomPmf(n: number, k: number, p: Fraction): Fraction {
  return new Fraction(choose(n, k)).mul(p.pow(k)).mul(ONE.sub(p).pow(n - k))
}

const coins: QuestionTemplate = {
  id: 'prob.coins',
  category: CAT,
  subcategory: 'coins',
  generate(d, rng) {
    const half = frac(1, 2)
    switch (d) {
      case 1: {
        if (rng.chance(0.5)) {
          const n = rng.int(2, 5)
          return P(half.pow(n), { kind: 'binom-eq', n, k: n, p: '1/2' }, `You flip a fair coin ${word(n)} times. What is the probability that every flip is heads?`, [`$\\left(\\frac12\\right)^{${n}}$`], d, 10)
        }
        const n = rng.int(2, 4)
        const k = rng.int(1, n - 1)
        const f = binomPmf(n, k, half)
        return P(f, { kind: 'binom-eq', n, k, p: '1/2' }, `You flip a fair coin ${word(n)} times. What is the probability of exactly ${word(k)} head${k > 1 ? 's' : ''}?`, [`$\\binom{${n}}{${k}} / 2^{${n}} = \\frac{${choose(n, k)}}{${2 ** n}}$`], d, 15)
      }
      case 2: {
        if (rng.chance(0.5)) {
          const n = rng.int(3, 6)
          const f = ONE.sub(half.pow(n))
          return P(f, { kind: 'binom-ge', n, k: 1, p: '1/2' }, `You flip a fair coin ${word(n)} times. What is the probability of at least one head?`, [`Complement of all tails: $1 - \\frac{1}{${2 ** n}}$`], d, 15)
        }
        const n = rng.int(5, 6)
        const k = rng.int(1, n - 1)
        return P(binomPmf(n, k, half), { kind: 'binom-eq', n, k, p: '1/2' }, `You flip a fair coin ${word(n)} times. What is the probability of exactly ${word(k)} head${k > 1 ? 's' : ''}?`, [`$\\binom{${n}}{${k}} / 2^{${n}} = \\frac{${choose(n, k)}}{${2 ** n}}$`], d)
      }
      case 3: {
        if (rng.chance(0.3)) {
          const n = rng.pick([4, 6, 8])
          const f = ONE.sub(new Fraction(choose(n, n / 2), 2n ** BigInt(n))).div(2)
          return P(
            f,
            { kind: 'more-heads', n },
            `You flip a fair coin ${word(n)} times. What is the probability of getting strictly more heads than tails?`,
            [`By symmetry $P(H > T) = P(T > H)$, so $P(H > T) = \\frac{1 - P(H = T)}{2}$`, `$P(H = T) = \\binom{${n}}{${n / 2}} / 2^{${n}} = \\frac{${choose(n, n / 2)}}{${2 ** n}}$`],
            d,
          )
        }
        const n = rng.int(5, 8)
        const k = rng.int(2, n - 1)
        let ways = 0n
        for (let j = k; j <= n; j++) ways += choose(n, j)
        const f = new Fraction(ways, 2n ** BigInt(n))
        return P(f, { kind: 'binom-ge', n, k, p: '1/2' }, `You flip a fair coin ${word(n)} times. What is the probability of at least ${word(k)} heads?`, [`$\\sum_{j=${k}}^{${n}} \\binom{${n}}{j} = ${ways}$ outcomes out of $2^{${n}} = ${2 ** n}$`], d)
      }
      case 4: {
        const p = rng.pick([frac(1, 3), frac(2, 3), frac(1, 4), frac(3, 4), frac(2, 5)])
        const n = rng.int(3, 5)
        const k = rng.int(1, n - 1)
        return P(
          binomPmf(n, k, p),
          { kind: 'binom-eq', n, k, p: p.toString() },
          `A biased coin lands heads with probability $${p.toLatex()}$. In ${word(n)} flips, what is the probability of exactly ${word(k)} head${k > 1 ? 's' : ''}?`,
          [`$\\binom{${n}}{${k}} \\left(${p.toLatex()}\\right)^{${k}} \\left(${ONE.sub(p).toLatex()}\\right)^{${n - k}}$`],
          d,
        )
      }
      default: {
        if (rng.chance(0.5)) {
          const n = rng.int(5, 10)
          // Strings with no HH are counted by Fibonacci numbers: a(n) = F(n+2).
          const fib = [1, 1]
          while (fib.length < n + 3) fib.push(fib.at(-1)! + fib.at(-2)!)
          const ways = fib[n + 1]
          const f = frac(ways, 2 ** n)
          return P(
            f,
            { kind: 'no-hh', n },
            `You flip a fair coin ${word(n)} times. What is the probability that no two consecutive flips are both heads?`,
            [`Let $a_n$ count valid strings: a valid string ends in T (any valid $a_{n-1}$) or in TH (any valid $a_{n-2}$), so $a_n = a_{n-1} + a_{n-2}$ with $a_1 = 2, a_2 = 3$.`, `$a_{${n}} = ${ways}$, out of $2^{${n}} = ${2 ** n}$`],
            d,
          )
        }
        const n = rng.int(5, 8)
        const ways = countRuns(n, 3)
        const f = frac(ways, 2 ** n)
        return P(
          f,
          { kind: 'run', n, r: 3 },
          `You flip a fair coin ${word(n)} times. What is the probability of seeing at least three heads in a row somewhere?`,
          [`Count strings with no HHH: $b_n = b_{n-1} + b_{n-2} + b_{n-3}$ (end in T, TH, THH), $b_0=1, b_1=2, b_2=4$.`, `$b_{${n}} = ${2 ** n - ways}$, so $P = 1 - \\frac{${2 ** n - ways}}{${2 ** n}}$`],
          d,
        )
      }
    }
  },
}

/** Number of length-n H/T strings containing a run of at least r heads. */
function countRuns(n: number, r: number): number {
  // b[i] = strings of length i with no run of r heads: b[i] = b[i-1] + ... + b[i-r] for i >= r.
  const b: number[] = []
  for (let i = 0; i <= n; i++) {
    if (i < r) b.push(2 ** i)
    else {
      let s = 0
      for (let j = 1; j <= r; j++) s += b[i - j]
      b.push(s)
    }
  }
  return 2 ** n - b[n]
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

const C = (n: number, k: number) => new Fraction(choose(n, k))

export const POKER_COUNTS = {
  'four-kind': 624n,
  'full-house': 3744n,
  'three-kind': 54912n,
  'two-pair': 123552n,
  'one-pair': 1098240n,
} as const

const cards: QuestionTemplate = {
  id: 'prob.cards',
  category: CAT,
  subcategory: 'cards',
  generate(d, rng) {
    const deck = 'From a well-shuffled standard 52-card deck'
    switch (d) {
      case 1: {
        const events: [string, string, Fraction, string][] = [
          ['heart', 'a heart', frac(13, 52), '13 hearts'],
          ['face', 'a face card (J, Q, K)', frac(12, 52), '12 face cards'],
          ['ace-or-heart', 'an ace or a heart', frac(16, 52), '13 hearts + 3 non-heart aces = 16'],
          ['red-king', 'a red king', frac(2, 52), '2 red kings'],
          ['number', 'a numbered card (2 through 10)', frac(36, 52), '9 ranks × 4 suits = 36'],
          ['black-face', 'a black face card', frac(6, 52), '3 ranks × 2 black suits = 6'],
        ]
        const [pred, desc, f, why] = rng.pick(events)
        return P(f, { kind: 'one-card', pred }, `${deck} you draw one card. What is the probability it is ${desc}?`, [`${why} out of 52`], d, 10)
      }
      case 2: {
        const events: [string, string, Fraction, string[]][] = [
          ['both-aces', 'both are aces', frac(4, 52).mul(frac(3, 51)), ['$\\frac{4}{52} \\cdot \\frac{3}{51}$']],
          ['both-hearts', 'both are hearts', frac(13, 52).mul(frac(12, 51)), ['$\\frac{13}{52} \\cdot \\frac{12}{51}$']],
          ['same-suit', 'they are the same suit', frac(12, 51), ['The second card must match the first card\'s suit: 12 of the remaining 51.']],
          ['pair', 'they form a pair (same rank)', frac(3, 51), ['The second card must match the first card\'s rank: 3 of the remaining 51.']],
          ['diff-color', 'they are different colours', frac(26, 51), ['26 of the remaining 51 cards are the other colour.']],
          ['at-least-one-ace', 'at least one is an ace', ONE.sub(frac(48, 52).mul(frac(47, 51))), ['Complement: $1 - \\frac{48}{52} \\cdot \\frac{47}{51}$']],
        ]
        const [pred, desc, f, why] = rng.pick(events)
        return P(f, { kind: 'two-cards', pred }, `${deck} you draw two cards without replacement. What is the probability that ${desc}?`, why, d, 20)
      }
      case 3: {
        const events: [string, string, number, Fraction, string][] = [
          ['no-aces', 'contains no aces', 5, C(48, 5).div(C(52, 5)), '$\\binom{48}{5} / \\binom{52}{5}$'],
          ['one-ace', 'contains exactly one ace', 5, C(4, 1).mul(C(48, 4)).div(C(52, 5)), '$\\binom{4}{1}\\binom{48}{4} / \\binom{52}{5}$'],
          ['all-hearts', 'is all hearts', 3, C(13, 3).div(C(52, 3)), '$\\binom{13}{3} / \\binom{52}{3}$'],
          ['same-color', 'is all one colour', 3, C(26, 3).mul(2).div(C(52, 3)), '$2\\binom{26}{3} / \\binom{52}{3}$'],
        ]
        const [pred, desc, n, f, why] = rng.pick(events)
        return P(f, { kind: 'hand', pred, n }, `${deck} you are dealt ${word(n)} cards. What is the probability the hand ${desc}?`, [why], d)
      }
      case 4: {
        const events: [string, string, number, Fraction, string][] = [
          ['flush', 'is all one suit', 5, C(13, 5).mul(4).div(C(52, 5)), '$4\\binom{13}{5} / \\binom{52}{5}$'],
          ['two-aces', 'contains exactly two aces', 5, C(4, 2).mul(C(48, 3)).div(C(52, 5)), '$\\binom{4}{2}\\binom{48}{3} / \\binom{52}{5}$'],
          ['some-ace', 'contains at least one ace', 5, ONE.sub(C(48, 5).div(C(52, 5))), '$1 - \\binom{48}{5} / \\binom{52}{5}$'],
          ['four-suits', 'contains one card of each suit', 4, frac(13 ** 4).div(C(52, 4)), '$13^4 / \\binom{52}{4}$'],
        ]
        const [pred, desc, n, f, why] = rng.pick(events)
        return P(f, { kind: 'hand', pred, n }, `${deck} you are dealt ${word(n)} cards. What is the probability the hand ${desc}?`, [why], d)
      }
      default: {
        const events: [keyof typeof POKER_COUNTS, string, string][] = [
          ['four-kind', 'four of a kind', '$13 \\cdot 48 = 624$ hands'],
          ['full-house', 'a full house', '$13 \\binom{4}{3} \\cdot 12 \\binom{4}{2} = 3{,}744$ hands'],
          ['three-kind', 'exactly three of a kind (not a full house)', '$13\\binom{4}{3} \\cdot \\binom{12}{2} 4^2 = 54{,}912$ hands'],
          ['two-pair', 'exactly two pair', '$\\binom{13}{2}\\binom{4}{2}^2 \\cdot 11 \\cdot 4 = 123{,}552$ hands'],
          ['one-pair', 'exactly one pair', '$13\\binom{4}{2} \\cdot \\binom{12}{3} 4^3 = 1{,}098{,}240$ hands'],
        ]
        const [pred, desc, why] = rng.pick(events)
        const f = new Fraction(POKER_COUNTS[pred], choose(52, 5))
        return P(f, { kind: 'poker', pred }, `In a 5-card poker hand dealt from a standard deck, what is the probability of ${desc}?`, [why, `Divide by $\\binom{52}{5} = 2{,}598{,}960$`], d, 45)
      }
    }
  },
}

// ---------------------------------------------------------------------------
// Urns
// ---------------------------------------------------------------------------

const urns: QuestionTemplate = {
  id: 'prob.urns',
  category: CAT,
  subcategory: 'urns',
  generate(d, rng) {
    const r = rng.int(2, d >= 3 ? 8 : 6)
    const b = rng.int(2, d >= 3 ? 8 : 6)
    const N = r + b
    const urn = `An urn contains ${word(r)} red and ${word(b)} blue balls.`
    switch (d) {
      case 1: {
        if (rng.chance(0.5)) {
          const f = frac(r, N).pow(2)
          return P(f, { kind: 'urn-replace-both-red', r, b }, `${urn} You draw a ball, put it back, and draw again. What is the probability both draws are red?`, [`Independent draws: $\\left(\\frac{${r}}{${N}}\\right)^2$`], d, 15)
        }
        const f = frac(r * (r - 1), N * (N - 1))
        return P(f, { kind: 'urn-draw', r, b, n: 2, j: 2 }, `${urn} You draw two balls without replacement. What is the probability both are red?`, [`$\\frac{${r}}{${N}} \\cdot \\frac{${r - 1}}{${N - 1}}$`], d, 15)
      }
      case 2: {
        const f = frac(2 * r * b, N * (N - 1))
        return P(f, { kind: 'urn-draw', r, b, n: 2, j: 1 }, `${urn} You draw two balls without replacement. What is the probability you get one of each colour?`, [`Red then blue or blue then red: $2 \\cdot \\frac{${r}}{${N}} \\cdot \\frac{${b}}{${N - 1}}$`], d)
      }
      case 3: {
        const n = 3
        const j = rng.int(Math.max(0, n - b), Math.min(n, r))
        const f = C(r, j).mul(C(b, n - j)).div(C(N, n))
        return P(f, { kind: 'urn-draw', r, b, n, j }, `${urn} You draw three balls without replacement. What is the probability exactly ${word(j)} ${j === 1 ? 'is' : 'are'} red?`, [`Hypergeometric: $\\binom{${r}}{${j}}\\binom{${b}}{${n - j}} / \\binom{${N}}{${n}}$`], d)
      }
      case 4: {
        if (rng.chance(0.5)) {
          const k = rng.int(2, Math.min(N, 6))
          return P(
            frac(r, N),
            { kind: 'urn-kth-red', r, b, k },
            `${urn} You draw balls one at a time without replacement. What is the probability that the ${ORD[k]} ball drawn is red?`,
            [`By symmetry every position is equally likely to hold any particular ball, so the answer is just $\\frac{${r}}{${N}}$ — earlier draws don't matter when unobserved.`],
            d,
          )
        }
        const g = rng.int(2, 6)
        const T = N + g
        const f = new Fraction(BigInt(r * g * b), choose(T, 3))
        return P(
          f,
          { kind: 'urn-three-colors', r, b, g },
          `An urn contains ${word(r)} red, ${word(g)} green and ${word(b)} blue balls. You draw three without replacement. What is the probability you get one of each colour?`,
          [`$\\frac{${r} \\cdot ${g} \\cdot ${b}}{\\binom{${T}}{3}}$`],
          d,
        )
      }
      default: {
        if (rng.chance(0.5)) {
          const g = rng.int(2, 7)
          const f = frac(r, r + g)
          return P(
            f,
            { kind: 'urn-red-before-green', r, b, g },
            `An urn contains ${word(r)} red, ${word(g)} green and ${word(b)} blue balls, drawn one at a time without replacement. What is the probability that a red ball appears before any green ball?`,
            ['Blue balls are irrelevant: only the relative order of red and green matters.', `The first of the ${r + g} red/green balls is red with probability $\\frac{${r}}{${r + g}}$`],
            d,
          )
        }
        const f = frac(N + 1, r + 1)
        return E(
          f,
          { kind: 'urn-first-red-index', r, b },
          `${urn} You draw without replacement until you get a red ball. What is the expected number of draws?`,
          [`The ${r} red balls split the ${b} blue balls into ${r + 1} gaps; each blue ball lands in the first gap with probability $\\frac{1}{${r + 1}}$.`, `$E = 1 + \\frac{${b}}{${r + 1}} = \\frac{${N + 1}}{${r + 1}}$`],
          d,
        )
      }
    }
  },
}

// ---------------------------------------------------------------------------
// Conditional probability & Bayes
// ---------------------------------------------------------------------------

const conditional: QuestionTemplate = {
  id: 'prob.conditional',
  category: CAT,
  subcategory: 'conditional',
  generate(d, rng) {
    switch (d) {
      case 1: {
        if (rng.chance(0.4)) {
          return P(frac(1, 2), { kind: 'children-older-boy' }, 'A family has two children. Given that the older child is a boy, what is the probability both are boys? (Assume each child is a boy or girl independently with probability 1/2.)', ['The younger child is independent of the older one: $\\frac12$'], d, 10)
        }
        const k = rng.int(1, 6)
        const s = rng.int(k + 2, k + 6)
        const ways = [1, 2, 3, 4, 5, 6].filter((x) => x + k >= s).length
        return P(frac(ways, 6), { kind: 'dice-sum-ge-given-first', k, s }, `Two fair dice are rolled. The first shows $${k}$. What is the probability the total is at least $${s}$?`, [`The second die must be at least $${s - k}$: ${ways} of 6 faces.`], d, 12)
      }
      case 2: {
        if (rng.chance(0.4)) {
          return P(frac(1, 3), { kind: 'children-at-least-one-boy' }, 'A family has two children, and at least one of them is a boy. What is the probability that both are boys?', ['Equally likely: BB, BG, GB, GG. Conditioning removes GG.', 'One of the three remaining cases is BB: $\\frac13$'], d, 15)
        }
        const s = rng.int(7, 12)
        const ways = s === 12 ? 1 : 2
        return P(frac(ways, 11), { kind: 'dice-sum-given-six', s }, `Two fair dice are rolled and at least one shows a six. What is the probability the total is exactly $${s}$?`, ['11 outcomes contain a six (36 − 25).', s === 12 ? 'Only (6,6) totals 12.' : `$(6, ${s - 6})$ and $(${s - 6}, 6)$ total $${s}$.`], d)
      }
      case 3: {
        const prev = rng.pick([frac(1, 100), frac(1, 50), frac(1, 20), frac(1, 10), frac(1, 1000), frac(1, 200)])
        const sens = rng.pick([frac(9, 10), frac(95, 100), frac(99, 100), frac(4, 5)])
        const fpr = rng.pick([frac(1, 10), frac(1, 20), frac(1, 100), frac(5, 100), frac(2, 100)])
        const tp = prev.mul(sens)
        const fp = ONE.sub(prev).mul(fpr)
        const f = tp.div(tp.add(fp))
        const pctS = (x: Fraction) => `${x.mul(100).toDecimalString(2)}\\%`
        return P(
          f,
          { kind: 'bayes-test', prev: prev.toString(), sens: sens.toString(), fpr: fpr.toString() },
          `A disease affects $${pctS(prev)}$ of people. A test detects it $${pctS(sens)}$ of the time, but also gives a positive result for $${pctS(fpr)}$ of healthy people. A random person tests positive. What is the probability they have the disease?`,
          [
            `$P(+ \\cap D) = ${prev.toLatex()} \\cdot ${sens.toLatex()} = ${tp.toLatex()}$`,
            `$P(+ \\cap \\bar D) = ${ONE.sub(prev).toLatex()} \\cdot ${fpr.toLatex()} = ${fp.toLatex()}$`,
            `$P(D \\mid +) = \\frac{${tp.toLatex()}}{${tp.toLatex()} + ${fp.toLatex()}}$`,
          ],
          d,
          40,
        )
      }
      case 4: {
        const n = rng.int(3, 10)
        const k = rng.int(2, 5)
        const f = frac(2 ** k, 2 ** k + n - 1)
        return P(
          f,
          { kind: 'double-headed', n, k },
          `A bag holds ${word(n)} coins: one is double-headed, the rest are fair. You pick one at random and flip it ${word(k)} times, getting ${word(k)} heads. What is the probability you picked the double-headed coin?`,
          [`Prior odds double : fair $= 1 : ${n - 1}$`, `Likelihood ratio $= 1 : 2^{-${k}}$, so posterior odds $= 2^{${k}} : ${n - 1}$`, `$P = \\frac{${2 ** k}}{${2 ** k} + ${n - 1}}$`],
          d,
          35,
        )
      }
      default: {
        if (rng.chance(0.5)) {
          const n = rng.int(4, 10)
          const f = frac(n - 1, n * (n - 2))
          return P(
            f,
            { kind: 'monty', n },
            `Monty Hall with ${word(n)} doors: one hides a car. You pick a door; the host, who knows where the car is, opens one other door with a goat. You switch to one of the remaining unopened doors chosen at random. What is the probability you win the car?`,
            [`Your first pick is wrong with probability $\\frac{${n - 1}}{${n}}$; then the car is among the $${n - 2}$ doors you might switch to.`, `$\\frac{${n - 1}}{${n}} \\cdot \\frac{1}{${n - 2}} = \\frac{${n - 1}}{${n * (n - 2)}}$`],
            d,
            40,
          )
        }
        const prev = rng.pick([frac(1, 100), frac(1, 50), frac(1, 20), frac(1, 10)])
        const sens = rng.pick([frac(9, 10), frac(4, 5), frac(19, 20)])
        const fpr = rng.pick([frac(1, 10), frac(1, 20), frac(1, 5)])
        const tp = prev.mul(sens.pow(2))
        const fp = ONE.sub(prev).mul(fpr.pow(2))
        const f = tp.div(tp.add(fp))
        const pctS = (x: Fraction) => `${x.mul(100).toDecimalString(2)}\\%`
        return P(
          f,
          { kind: 'bayes-two-tests', prev: prev.toString(), sens: sens.toString(), fpr: fpr.toString() },
          `A disease has prevalence $${pctS(prev)}$. A test has sensitivity $${pctS(sens)}$ and false-positive rate $${pctS(fpr)}$, with results independent given disease status. A person tests positive twice. What is the probability they have the disease?`,
          [`$P(++ \\mid D) = (${sens.toLatex()})^2$, $P(++ \\mid \\bar D) = (${fpr.toLatex()})^2$`, `$P(D \\mid ++) = \\frac{${tp.toLatex()}}{${tp.toLatex()} + ${fp.toLatex()}}$`],
          d,
          50,
        )
      }
    }
  },
}

// ---------------------------------------------------------------------------
// Combinatorics (integer counts)
// ---------------------------------------------------------------------------

const WORDS: Record<number, string[]> = {
  1: ['BOND', 'QUANT', 'DELTA', 'TRADE', 'HEDGE'],
  2: ['ALPHA', 'GAMMA', 'HEDGE', 'MARKET', 'SPREAD', 'LEVEL'],
  3: ['STREET', 'OPTIONS', 'BANANA', 'LETTER', 'COFFEE'],
  4: ['ARBITRAGE', 'STATISTICS', 'TRADING', 'VOLATILITY'],
  5: ['MISSISSIPPI', 'VOLATILITY', 'STATISTICS', 'ARBITRAGE'],
}

export function multisetPermutations(w: string): bigint {
  const counts = new Map<string, number>()
  for (const ch of w) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let r = factorial(w.length)
  for (const c of counts.values()) r /= factorial(c)
  return r
}

function derangements(n: number): bigint {
  const D = [1n, 0n]
  for (let i = 2; i <= n; i++) D.push(BigInt(i - 1) * (D[i - 1] + D[i - 2]))
  return D[n]
}

const combinatorics: QuestionTemplate = {
  id: 'prob.combinatorics',
  category: CAT,
  subcategory: 'combinatorics',
  generate(d, rng): QuestionDraft {
    const intQ = (value: bigint, prompt: string, explanation: string[], meta: Record<string, unknown>): QuestionDraft => ({
      prompt,
      answer: intAnswer(Number(value)),
      explanation: [...explanation, `Answer: $${tex(Number(value))}$`],
      expectedSeconds: expectedTime(20, d),
      meta,
    })
    const pick = rng.int(0, 2)
    if (pick === 0) {
      const w = rng.pick(WORDS[d])
      const v = multisetPermutations(w)
      const counts = [...new Set(w)].map((ch) => [ch, [...w].filter((x) => x === ch).length] as const).filter(([, c]) => c > 1)
      return intQ(
        v,
        `How many distinct arrangements are there of the letters in $\\text{${w}}$?`,
        [counts.length ? `$\\frac{${w.length}!}{${counts.map(([, c]) => `${c}!`).join('\\,')}}$ — divide by the repeats (${counts.map(([ch, c]) => `${ch}×${c}`).join(', ')})` : `All ${w.length} letters are distinct: $${w.length}!$`],
        { kind: 'word', word: w },
      )
    }
    switch (d) {
      case 1: {
        const n = rng.int(5, 10)
        const k = rng.int(2, 3)
        return intQ(choose(n, k), `How many ways can you choose a committee of ${word(k)} from ${word(n)} people?`, [`$\\binom{${n}}{${k}}$`], { kind: 'choose', n, k })
      }
      case 2: {
        const n = rng.int(6, 20)
        return pick === 1
          ? intQ(choose(n, 2), `${word(n)[0].toUpperCase() + word(n).slice(1)} traders each shake hands with every other trader once. How many handshakes?`, [`$\\binom{${n}}{2} = \\frac{${n} \\cdot ${n - 1}}{2}$`], { kind: 'choose', n, k: 2 })
          : intQ(choose(n, 3), `How many ways can you choose 3 stocks from a list of ${n}?`, [`$\\binom{${n}}{3}$`], { kind: 'choose', n, k: 3 })
      }
      case 3: {
        if (pick === 1) {
          const m = rng.int(3, 6)
          const n = rng.int(3, 6)
          return intQ(choose(m + n, m), `On a ${m} × ${n} grid of blocks, how many shortest paths go from the bottom-left corner to the top-right corner (moving only right or up)?`, [`Choose which ${m} of the ${m + n} moves are "right": $\\binom{${m + n}}{${m}}$`], { kind: 'grid', m, n })
        }
        const men = rng.int(4, 8)
        const women = rng.int(3, 6)
        const k = rng.int(3, 4)
        const v = choose(men + women, k) - choose(men, k)
        return intQ(v, `A desk has ${men} men and ${women} women. How many ${k}-person teams include at least one woman?`, [`All teams minus all-male teams: $\\binom{${men + women}}{${k}} - \\binom{${men}}{${k}}$`], { kind: 'team-at-least-one', men, women, k })
      }
      case 4: {
        const n = rng.int(5, 12)
        const k = rng.int(3, 4)
        if (pick === 1) {
          return intQ(choose(n + k - 1, k - 1), `How many ways can ${n} identical coins be split among ${k} people (some may get none)?`, [`Stars and bars: $\\binom{${n} + ${k} - 1}{${k} - 1} = \\binom{${n + k - 1}}{${k - 1}}$`], { kind: 'stars-bars', n, k, min: 0 })
        }
        return intQ(choose(n - 1, k - 1), `How many ways can ${n} identical coins be split among ${k} people if everyone gets at least one?`, [`Give each person one coin first, then stars and bars: $\\binom{${n} - 1}{${k} - 1}$`], { kind: 'stars-bars', n, k, min: 1 })
      }
      default: {
        if (pick === 1) {
          const n = rng.int(4, 7)
          return intQ(derangements(n), `${word(n)[0].toUpperCase() + word(n).slice(1)} traders put their badges in a box and each draws one at random. In how many of the $${n}!$ outcomes does nobody get their own badge?`, [`Derangements: $D_n = (n-1)(D_{n-1} + D_{n-2})$, $D_1 = 0, D_2 = 1$`, `$D_{${n}} = ${derangements(n)}$`], { kind: 'derangements', n })
        }
        const n = rng.int(5, 8)
        const v = factorial(n - 1) - 2n * factorial(n - 2)
        return intQ(v, `${word(n)[0].toUpperCase() + word(n).slice(1)} people sit around a round table (rotations are the same seating). Alice and Bob refuse to sit next to each other. How many seatings are possible?`, [`Round table: $(${n}-1)! = ${factorial(n - 1)}$ seatings.`, `Alice and Bob together: treat them as a block, $(${n}-2)! \\cdot 2 = ${2n * factorial(n - 2)}$`, `$${factorial(n - 1)} - ${2n * factorial(n - 2)}$`], { kind: 'round-table', n })
      }
    }
  },
}

// ---------------------------------------------------------------------------
// Geometric & negative binomial
// ---------------------------------------------------------------------------

const TRIALS: { desc: string; p: Fraction; trial: string; sim: string; mean: string }[] = [
  { desc: 'roll a six', p: frac(1, 6), trial: 'roll', sim: 'die-6', mean: 'rolls of a fair die does it take to get a six' },
  { desc: 'roll a 5 or a 6', p: frac(1, 3), trial: 'roll', sim: 'die-56', mean: 'rolls of a fair die does it take to get a 5 or a 6' },
  { desc: 'flip heads', p: frac(1, 2), trial: 'flip', sim: 'coin', mean: 'flips of a fair coin does it take to get heads' },
  { desc: 'roll a total of 7 with two dice', p: frac(1, 6), trial: 'roll', sim: 'two-dice-7', mean: 'rolls of a pair of dice does it take to get a total of 7' },
  { desc: 'draw an ace (with replacement)', p: frac(1, 13), trial: 'draw', sim: 'ace', mean: 'draws (with replacement) from a deck does it take to get an ace' },
]

const geometric: QuestionTemplate = {
  id: 'prob.geometric',
  category: CAT,
  subcategory: 'geometric',
  generate(d, rng) {
    const t = rng.pick(d <= 2 ? TRIALS.slice(0, 4) : TRIALS)
    const p = t.p
    const q = ONE.sub(p)
    const meta = { trial: t.sim, p: p.toString() }
    switch (d) {
      case 1:
        return E(p.inv(), { kind: 'geo-mean', ...meta }, `On average, how many ${t.mean}? (Count the successful ${t.trial}.)`, [`Geometric with $p = ${p.toLatex()}$: $E = \\frac{1}{p}$`], d, 10)
      case 2: {
        const k = rng.int(2, 5)
        const f = q.pow(k - 1).mul(p)
        return P(f, { kind: 'geo-first-at', k, ...meta }, `What is the probability that the first time you ${t.desc} is on ${t.trial} number ${k}?`, [`$k-1$ failures then a success: $\\left(${q.toLatex()}\\right)^{${k - 1}} \\cdot ${p.toLatex()}$`], d, 20)
      }
      case 3: {
        if (rng.chance(0.5)) {
          const k = rng.int(2, 6)
          const f = q.pow(k)
          return P(f, { kind: 'geo-more-than', k, ...meta }, `What is the probability that you need more than ${word(k)} ${t.trial}s to ${t.desc} for the first time?`, [`The first ${k} ${t.trial}s must all fail: $\\left(${q.toLatex()}\\right)^{${k}}$`], d)
        }
        const r = rng.int(2, 5)
        return E(frac(r).div(p), { kind: 'nb-mean', r, ...meta }, `On average, how many ${t.trial}s does it take to ${t.desc} ${word(r)} times?`, [`Sum of ${r} independent geometric waits: $\\frac{r}{p} = \\frac{${r}}{${p.toLatex()}}$`], d)
      }
      default: {
        const r = d === 4 ? 2 : rng.int(2, 3)
        const n = rng.int(r + 1, r + 4)
        const f = new Fraction(choose(n - 1, r - 1)).mul(p.pow(r)).mul(q.pow(n - r))
        if (d === 5 && rng.chance(0.4)) {
          return E(frac(r).mul(q).div(p), { kind: 'nb-failures-mean', r, ...meta }, `On average, how many failed ${t.trial}s occur before you ${t.desc} for the ${ORD[r]} time?`, [`Each success takes $\\frac{1}{p}$ ${t.trial}s, of which $\\frac{1-p}{p}$ fail: $r \\cdot \\frac{1-p}{p}$`], d)
        }
        return P(
          f,
          { kind: 'nb-at', r, n, ...meta },
          `What is the probability that you ${t.desc} for the ${ORD[r]} time on exactly ${t.trial} number ${n}?`,
          [`The last ${t.trial} is a success and exactly ${r - 1} of the first ${n - 1} succeed:`, `$\\binom{${n - 1}}{${r - 1}} \\left(${p.toLatex()}\\right)^{${r}} \\left(${q.toLatex()}\\right)^{${n - r}}$`],
          d,
          40,
        )
      }
    }
  },
}

// ---------------------------------------------------------------------------
// Linearity of expectation
// ---------------------------------------------------------------------------

const expectation: QuestionTemplate = {
  id: 'prob.expectation',
  category: CAT,
  subcategory: 'expectation',
  generate(d, rng) {
    const alt = rng.chance(0.5)
    switch (d) {
      case 1: {
        const n = rng.int(2, 10)
        return alt
          ? E(frac(7 * n, 2), { kind: 'sum-dice-mean', n }, `What is the expected total when you roll ${word(n)} fair dice?`, [`Each die averages $3.5$; by linearity $${n} \\times 3.5$`], d, 10)
          : E(frac(n, 2), { kind: 'heads-mean', n }, `What is the expected number of heads in ${word(n)} fair coin flips?`, [`Each flip contributes $\\frac12$: $\\frac{${n}}{2}$`], d, 8)
      }
      case 2: {
        if (alt) {
          const n = rng.int(3, 12)
          return E(frac(n, 6), { kind: 'count-sixes-mean', n }, `You roll a die ${word(n)} times. What is the expected number of sixes?`, [`Indicator for each roll: $${n} \\cdot \\frac16$`], d, 12)
        }
        const n = rng.int(2, 5)
        return E(frac(7 * n), { kind: 'card-values-mean', n }, `Cards are worth their rank (A = 1, J = 11, Q = 12, K = 13). You draw ${word(n)} cards without replacement from a standard deck. What is the expected total value?`, ['Each card individually averages $\\frac{1 + 13}{2} = 7$ — drawing without replacement does not change that.', `$${n} \\times 7$`], d, 15)
      }
      case 3: {
        if (alt) {
          const n = rng.int(3, 12)
          return E(ONE, { kind: 'fixed-points-mean', n }, `${word(n)[0].toUpperCase() + word(n).slice(1)} people throw their hats in a pile and each takes a random hat. What is the expected number of people who get their own hat?`, ['Each person gets their own hat with probability $\\frac{1}{n}$.', `$n \\cdot \\frac1n = 1$, whatever $n$ is.`], d, 15)
        }
        const n = rng.int(2, 6)
        const f = frac(6).mul(ONE.sub(frac(5, 6).pow(n)))
        return E(f, { kind: 'distinct-faces-mean', n }, `You roll a fair die ${word(n)} times. What is the expected number of distinct faces that appear?`, [`Face $i$ appears with probability $1 - (\\frac56)^{${n}}$`, `$6\\left(1 - \\left(\\frac56\\right)^{${n}}\\right)$`], d)
      }
      case 4: {
        if (alt) {
          const n = rng.int(4, 20)
          return E(frac(n - 1, 4), { kind: 'hh-pairs-mean', n }, `You flip a fair coin ${word(n)} times. What is the expected number of times two consecutive flips are both heads (overlaps count, e.g. HHH has two)?`, [`${n - 1} adjacent pairs, each HH with probability $\\frac14$`, `$\\frac{${n - 1}}{4}$`], d)
        }
        const balls = rng.int(3, 6)
        const boxes = rng.int(3, 5)
        const f = frac(boxes).mul(frac(boxes - 1, boxes).pow(balls))
        return E(f, { kind: 'empty-boxes-mean', balls, boxes }, `${word(balls)[0].toUpperCase() + word(balls).slice(1)} balls are each thrown into one of ${word(boxes)} boxes uniformly at random. What is the expected number of empty boxes?`, [`Box $i$ stays empty with probability $\\left(\\frac{${boxes - 1}}{${boxes}}\\right)^{${balls}}$`, `Multiply by ${boxes} boxes`], d)
      }
      default: {
        const v = rng.int(0, 2)
        if (v === 0) {
          const n = rng.int(5, 20)
          return E(frac(n + 1, 2), { kind: 'runs-mean', n }, `You flip a fair coin ${word(n)} times. What is the expected number of runs (maximal blocks of identical outcomes; HHTHH has 3 runs)?`, ['Runs = 1 + number of positions where the outcome changes.', `Each of the ${n - 1} boundaries changes with probability $\\frac12$: $1 + \\frac{${n - 1}}{2}$`], d)
        }
        if (v === 1) {
          const b = rng.int(2, 6)
          const g = rng.int(2, 6)
          return E(frac(2 * b * g, b + g), { kind: 'adjacent-mixed-mean', b, g }, `${word(b)[0].toUpperCase() + word(b).slice(1)} buyers and ${word(g)} sellers stand in a random line. What is the expected number of adjacent buyer–seller pairs?`, [`Each of the ${b + g - 1} adjacent slots is mixed with probability $\\frac{2 \\cdot ${b} \\cdot ${g}}{${b + g} \\cdot ${b + g - 1}}$`, `$\\frac{2 \\cdot ${b} \\cdot ${g}}{${b + g}}$`], d)
        }
        const n = rng.int(3, 8)
        return E(harmonic(n), { kind: 'cycles-mean', n }, `A random permutation of ${word(n)} elements is chosen uniformly. What is the expected number of cycles?`, [`Element $k$ closes a new cycle with probability $\\frac1k$ (Chinese-restaurant argument), so $E = H_{${n}} = \\sum_{k=1}^{${n}} \\frac1k$`], d, 45)
      }
    }
  },
}

// ---------------------------------------------------------------------------
// Stopping problems (pattern waiting times, coupon collector, Penney's game)
// ---------------------------------------------------------------------------

/** Expected waiting time for a pattern in i.i.d. symbols: sum over self-overlaps of 1/P(prefix). */
export function patternWait(pattern: string, prob: (ch: string) => Fraction): Fraction {
  let e = ZERO
  for (let k = 1; k <= pattern.length; k++) {
    if (pattern.slice(0, k) === pattern.slice(pattern.length - k)) {
      let pk = ONE
      for (const ch of pattern.slice(0, k)) pk = pk.mul(prob(ch))
      e = e.add(pk.inv())
    }
  }
  return e
}

/** Conway correlation: sum of 2^(k-1) over k where suffix_k(a) == prefix_k(b). */
function conway(a: string, b: string): number {
  let s = 0
  for (let k = 1; k <= Math.min(a.length, b.length); k++) {
    if (a.slice(a.length - k) === b.slice(0, k)) s += 2 ** (k - 1)
  }
  return s
}

/** Probability that pattern A appears before pattern B in fair coin flips. */
export function penney(a: string, b: string): Fraction {
  // Odds of B beating A are (AA - AB) : (BB - BA)
  const bBeatsA = conway(a, a) - conway(a, b)
  const aBeatsB = conway(b, b) - conway(b, a)
  return frac(aBeatsB, aBeatsB + bBeatsA)
}

const stopping: QuestionTemplate = {
  id: 'prob.stopping',
  category: CAT,
  subcategory: 'stopping',
  generate(d, rng) {
    const fair = () => frac(1, 2)
    const patternQ = (pat: string) => {
      const f = patternWait(pat, fair)
      const overlaps = [...Array(pat.length).keys()].map((i) => i + 1).filter((k) => pat.slice(0, k) === pat.slice(pat.length - k))
      return E(
        f,
        { kind: 'pattern-wait', pattern: pat, p: '1/2' },
        `You flip a fair coin until the sequence $\\text{${pat}}$ appears (consecutively). What is the expected number of flips?`,
        [`Self-overlaps of ${pat} occur at lengths ${overlaps.join(', ')}.`, `$E = ${overlaps.map((k) => `2^{${k}}`).join(' + ')} = ${f.toString()}$`],
        d,
      )
    }
    switch (d) {
      case 1: {
        if (rng.chance(0.5)) {
          const k = rng.int(2, 5)
          return E(frac(2 * k), { kind: 'k-heads-total', k }, `You flip a fair coin until you have seen ${word(k)} heads in total (not necessarily in a row). Expected number of flips?`, [`Each head takes 2 flips on average: $${k} \\times 2$`], d, 12)
        }
        return patternQ(rng.pick(['HT', 'TH']))
      }
      case 2:
        return patternQ(rng.pick(['HH', 'TT', 'HT']))
      case 3: {
        const v = rng.int(0, 2)
        if (v === 0) return patternQ(rng.pick(['HHH', 'HTH', 'HHT', 'THH', 'TTT']))
        const n = rng.int(3, 6)
        const f = frac(n).mul(harmonic(n))
        return E(f, { kind: 'coupon', n }, `You roll a fair ${n}-sided die until every face has appeared at least once. What is the expected number of rolls?`, [`After seeing $i$ faces, the next new face takes $\\frac{${n}}{${n} - i}$ rolls on average.`, `$E = ${n} \\left(1 + \\frac12 + \\dots + \\frac1{${n}}\\right) = ${n} H_{${n}}$`], d, 40)
      }
      case 4: {
        const v = rng.int(0, 2)
        if (v === 0) {
          const f = patternWait('66', (ch) => (ch === '6' ? frac(1, 6) : frac(5, 6)))
          return E(f, { kind: 'dice-66' }, 'You roll a fair die until you get two sixes in a row. What is the expected number of rolls?', ['Let $E$ be the answer. Overlap argument: $E = 6 + 6^2$.', 'Or: $E = \\frac{1}{p} + \\frac{1}{p^2}$ with $p = \\frac16$'], d, 40)
        }
        const t = rng.int(4, 6)
        const p = frac(7 - t, 6)
        const nonStopMean = frac(t, 2) // mean of 1..t-1 = t/2
        const stopMean = frac(t + 6, 2)
        const sum = ONE.sub(p).div(p).mul(nonStopMean).add(stopMean)
        return E(
          sum,
          { kind: 'sum-until-ge', t },
          `You roll a fair die repeatedly and stop as soon as you roll ${t === 6 ? 'a six' : `a ${t} or higher`}. What is the expected sum of all your rolls, including the last one?`,
          [`Expected non-stopping rolls: $\\frac{1-p}{p}$ with $p = ${p.toLatex()}$, each averaging $${nonStopMean.toDecimalString()}$`, `The final roll averages $${stopMean.toDecimalString()}$`, `$${ONE.sub(p).div(p).toLatex()} \\cdot ${nonStopMean.toDecimalString()} + ${stopMean.toDecimalString()}$`],
          d,
          45,
        )
      }
      default: {
        if (rng.chance(0.5)) {
          const k = rng.int(4, 6)
          return E(frac(2 ** (k + 1) - 2), { kind: 'pattern-wait', pattern: 'H'.repeat(k), p: '1/2' }, `You flip a fair coin until you get ${word(k)} heads in a row. What is the expected number of flips?`, [`$E_k = 2E_{k-1} + 2$ with $E_0 = 0$, so $E_k = 2^{k+1} - 2$`], d, 30)
        }
        const pairs: [string, string][] = [
          ['HH', 'TH'],
          ['HHT', 'HTT'],
          ['THH', 'HHT'],
          ['HTH', 'HHT'],
          ['TTH', 'HTT'],
          ['HH', 'HT'],
        ]
        const [a, b] = rng.pick(pairs)
        const f = penney(a, b)
        return P(
          f,
          { kind: 'penney', a, b },
          `A fair coin is flipped until either $\\text{${a}}$ or $\\text{${b}}$ appears. What is the probability that $\\text{${a}}$ appears first?`,
          ["Conway's algorithm: odds that $A$ beats $B$ are $(BB - BA) : (AA - AB)$, where $XY$ sums $2^{k-1}$ over overlaps of a suffix of $X$ with a prefix of $Y$.", `Result: $${f.toLatex()}$`],
          d,
          50,
        )
      }
    }
  },
}

// ---------------------------------------------------------------------------
// Betting games: fair price, would-you-pay
// ---------------------------------------------------------------------------

/** Optimal expected value of a die game where you may roll up to `rolls` times and keep the last. */
export function rerollValue(rolls: number, sides = 6): Fraction {
  let v = frac(sides + 1, 2)
  for (let i = 1; i < rolls; i++) {
    let total = ZERO
    for (let f = 1; f <= sides; f++) total = total.add(frac(f).gt(v) ? frac(f) : v)
    v = total.div(sides)
  }
  return v
}

const betting: QuestionTemplate = {
  id: 'prob.betting',
  category: CAT,
  subcategory: 'betting',
  generate(d, rng): QuestionDraft {
    type Game = { desc: string; fair: Fraction; why: string[]; meta: Record<string, unknown> }
    const scale = rng.pick([1, 1, 2, 10])
    const games: Game[][] = [
      [
        {
          desc: scale === 1 ? 'You roll a fair die and receive the face value in dollars.' : `You roll a fair die and receive ${scale} times the face value in dollars.`,
          fair: frac(7, 2).mul(scale),
          why: scale === 1 ? ['$E[\\text{die}] = 3.5$'] : ['$E[\\text{die}] = 3.5$', `$${scale} \\times 3.5$`],
          meta: { game: 'die', scale },
        },
        { desc: `You win \\$${12 * scale} if a fair die shows a six, nothing otherwise.`, fair: frac(2 * scale), why: [`$\\frac16 \\times ${12 * scale}$`], meta: { game: 'six-pays', prize: 12 * scale } },
      ],
      [
        { desc: 'You roll two fair dice and receive the larger number in dollars.', fair: frac(161, 36), why: ['$P(\\max = k) = \\frac{2k-1}{36}$', '$\\sum k \\cdot \\frac{2k-1}{36} = \\frac{161}{36}$'], meta: { game: 'max2' } },
        { desc: 'You roll two fair dice and receive their product in dollars.', fair: frac(49, 4), why: ['Independent: $E[XY] = E[X]E[Y] = 3.5^2$'], meta: { game: 'product2' } },
        { desc: 'You draw a card and receive its rank in dollars (A = 1, …, K = 13).', fair: frac(7), why: ['Average of 1..13 is 7'], meta: { game: 'card' } },
      ],
      [
        { desc: 'You roll a fair die. You may accept the face value in dollars, or re-roll once and take the second result.', fair: rerollValue(2), why: ['Re-roll if the first roll is below 3.5 (i.e. 1–3).', '$\\frac12 \\cdot 5 + \\frac12 \\cdot 3.5 = 4.25$'], meta: { game: 'reroll', rolls: 2 } },
        { desc: 'You flip a fair coin until it lands tails, and receive \\$1 for every head before the first tail.', fair: ONE, why: ['Number of heads is geometric: $E = \\frac{1-p}{p} = 1$'], meta: { game: 'heads-before-tail' } },
        { desc: 'You roll a fair die and receive the square of the face value in dollars.', fair: frac(91, 6), why: ['$\\frac{1 + 4 + 9 + 16 + 25 + 36}{6} = \\frac{91}{6}$'], meta: { game: 'square' } },
      ],
      [
        { desc: 'You may roll a fair die up to three times, stopping whenever you like; you receive the last roll in dollars.', fair: rerollValue(3), why: ['With two rolls left the game is worth 4.25, so keep a first roll of 5 or 6.', '$\\frac26 \\cdot 5.5 + \\frac46 \\cdot 4.25 = \\frac{14}{3}$'], meta: { game: 'reroll', rolls: 3 } },
        { desc: 'A fair coin is flipped up to 5 times; you receive \\$2^k where k is the number of heads before the first tail (all 5 heads pays \\$32).', fair: stPetersburg(5), why: ['$\\sum_{k=0}^{4} 2^k \\cdot 2^{-(k+1)} + 32 \\cdot 2^{-5}$', '$= 5 \\times \\frac12 + 1 = 3.5$'], meta: { game: 'st-petersburg', cap: 5 } },
      ],
      [
        { desc: 'You may roll a fair die up to four times, stopping whenever you like; you receive the last roll in dollars.', fair: rerollValue(4), why: ['Backward induction: values 3.5 → 4.25 → 4.667 → $\\frac{89}{18}$', 'With three rolls left, keep a first roll of 5 or 6.'], meta: { game: 'reroll', rolls: 4 } },
        { desc: 'You roll two fair dice and may re-roll both dice once (keeping the new pair). You receive the total in dollars.', fair: rerollTotal(), why: ['Re-roll if the total is below 7 (the value of a fresh roll).', 'Keep totals 7–12: $E = \\sum_{t \\ge 7} t \\cdot P(t) + P(t < 7) \\cdot 7$'], meta: { game: 'reroll-pair' } },
        { desc: 'A number is drawn uniformly from 1 to 10. You may keep it, or draw once more (independently) and keep the second. You receive the number in dollars.', fair: rerollValue(2, 10), why: ['A redraw is worth 5.5, so keep 6–10.', '$\\frac{5}{10} \\cdot 8 + \\frac{5}{10} \\cdot 5.5 = 6.75$'], meta: { game: 'reroll', rolls: 2, sides: 10 } },
      ],
    ]
    const g = rng.pick(games[d - 1])
    const fair = g.fair
    if (rng.chance(0.4)) {
      // Would-you-pay variant: price strictly away from fair value.
      const fv = fair.toNumber()
      let price: number
      do price = Math.round((fv + rng.pick([-1, 1]) * rng.float(0.15, 0.9) * Math.max(1, fv * 0.25)) * 4) / 4
      while (Math.abs(price - fv) < 0.1 || price <= 0)
      const yes = 'Yes — the fair value is higher'
      const no = 'No — the fair value is lower'
      return {
        prompt: `${g.desc} Would you pay ${usd(price, 2)} to play?`,
        answer: { type: 'multiple-choice', choices: [yes, no], correctIndex: fv > price ? 0 : 1 },
        explanation: [...g.why, `Fair value $= \\$${fracLatex(fair)}$ vs price $\\$${price.toFixed(2)}$`],
        expectedSeconds: expectedTime(25, d),
        meta: { kind: 'bet-mc', ...g.meta, price, exact: fair.toString() },
      }
    }
    return E(fair, { kind: 'bet-fair', ...g.meta }, `${g.desc} What is the fair price to play this game?`, g.why, d, 30, true)
  },
}

function stPetersburg(cap: number): Fraction {
  let e = ZERO
  for (let k = 0; k < cap; k++) e = e.add(frac(2 ** k, 2 ** (k + 1)))
  return e.add(frac(2 ** cap, 2 ** cap))
}

function rerollTotal(): Fraction {
  const counts = diceSumCounts(2)
  let e = ZERO
  counts.forEach((c, t) => {
    if (c === 0n) return
    e = e.add(new Fraction(c, 36n).mul(t >= 7 ? t : 7))
  })
  return e
}

// ---------------------------------------------------------------------------
// Variance & standard deviation
// ---------------------------------------------------------------------------

const variance: QuestionTemplate = {
  id: 'prob.variance',
  category: CAT,
  subcategory: 'variance',
  minDifficulty: 3,
  generate(d, rng) {
    const v = rng.int(0, 2)
    switch (d) {
      case 1:
      case 2:
      case 3: {
        if (v === 0) return E(frac(35, 12), { kind: 'var-die' }, 'What is the variance of a single fair die roll?', ['$E[X^2] = \\frac{91}{6}$, $E[X]^2 = \\frac{49}{4}$', '$\\frac{91}{6} - \\frac{49}{4} = \\frac{35}{12}$'], d)
        if (v === 1) {
          const n = rng.int(2, 20)
          return E(frac(n, 4), { kind: 'var-heads', n }, `What is the variance of the number of heads in ${word(n)} fair coin flips?`, [`Binomial: $np(1-p) = ${n} \\cdot \\frac14$`], d)
        }
        const n = rng.pick([4, 16, 36, 64, 100, 144])
        return E(frac(Math.sqrt(n), 2), { kind: 'sd-heads', n }, `What is the standard deviation of the number of heads in ${tex(n)} fair coin flips?`, [`Variance $= \\frac{${n}}{4}$, so SD $= \\frac{\\sqrt{${n}}}{2}$`], d)
      }
      case 4: {
        if (v === 0) {
          const n = rng.int(2, 10)
          return E(frac(35 * n, 12), { kind: 'var-sum-dice', n }, `What is the variance of the total of ${word(n)} fair dice?`, [`Independent: $${n} \\times \\frac{35}{12}$`], d)
        }
        if (v === 1) {
          const n = rng.int(3, 30)
          const p = rng.pick([frac(1, 3), frac(1, 4), frac(1, 5), frac(1, 6), frac(2, 5)])
          return E(frac(n).mul(p).mul(ONE.sub(p)), { kind: 'var-binom', n, p: p.toString() }, `$X \\sim \\text{Binomial}(n = ${n},\\ p = ${p.toLatex()})$. What is $\\text{Var}(X)$?`, [`$np(1-p) = ${n} \\cdot ${p.toLatex()} \\cdot ${ONE.sub(p).toLatex()}$`], d)
        }
        const vx = rng.int(2, 9)
        const vy = rng.int(2, 9)
        const a = rng.int(2, 4)
        const b = rng.int(1, 3)
        return E(frac(a * a * vx + b * b * vy), { kind: 'var-linear', vx, vy, a, b }, `$X$ and $Y$ are independent with $\\text{Var}(X) = ${vx}$ and $\\text{Var}(Y) = ${vy}$. What is $\\text{Var}(${a}X - ${b}Y + 7)$?`, [`$\\text{Var}(aX - bY + c) = a^2\\text{Var}(X) + b^2\\text{Var}(Y)$`, `$${a * a} \\cdot ${vx} + ${b * b} \\cdot ${vy}$`], d)
      }
      default: {
        if (v === 0) {
          const p = rng.pick([frac(1, 6), frac(1, 2), frac(1, 3), frac(1, 4)])
          const desc = p.eq(frac(1, 2)) ? 'flips of a fair coin until the first head' : p.eq(frac(1, 6)) ? 'rolls of a fair die until the first six' : p.eq(frac(1, 3)) ? 'rolls of a fair die until the first 5 or 6' : 'draws (with replacement) until the first heart'
          return E(ONE.sub(p).div(p.pow(2)), { kind: 'var-geo', p: p.toString() }, `What is the variance of the number of ${desc} (counting the successful one)?`, [`Geometric: $\\text{Var} = \\frac{1-p}{p^2}$ with $p = ${p.toLatex()}$`], d)
        }
        if (v === 1) {
          return E(frac(35, 6), { kind: 'var-sum-dice', n: 2 }, 'What is the variance of the total of two fair dice?', ['$2 \\times \\frac{35}{12} = \\frac{35}{6}$'], d)
        }
        return E(frac(2555, 1296), { kind: 'var-max2' }, 'What is the variance of the larger of two fair dice?', ['$E[M] = \\frac{161}{36}$, $E[M^2] = \\sum k^2 \\frac{2k-1}{36} = \\frac{791}{36}$', '$\\frac{791}{36} - \\left(\\frac{161}{36}\\right)^2 = \\frac{2555}{1296}$'], d, 60)
      }
    }
  },
}

export const probabilityTemplates: QuestionTemplate[] = [
  dice,
  coins,
  cards,
  urns,
  conditional,
  combinatorics,
  geometric,
  expectation,
  stopping,
  betting,
  variance,
]

export const probabilityGenerator = makeGenerator(CAT, 'Probability & EV', PROBABILITY_SUBCATEGORIES, probabilityTemplates)
