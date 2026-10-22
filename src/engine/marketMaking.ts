/**
 * Market Making mode.
 *
 * Each scenario hides a quantity (e.g. the sum of three dice). Over several
 * rounds the player quotes a two-sided market (bid/ask, spread capped);
 * simulated counterparties trade against mispriced quotes, then more
 * information is revealed. At the end the true value settles all positions.
 *
 * Counterparties:
 *  - noise traders value the quantity at fair value + Gaussian noise, so a
 *    tight, well-centred quote earns the spread from them;
 *  - informed traders already know the *next* piece of information, so a
 *    quote that ignores what could be revealed gets picked off.
 *
 * Score = P&L − 0.25 × (sum of quoted spreads), rewarding tight markets.
 */
import { SeededRNG } from '../core/rng'

export interface MMState {
  /** Hidden components (dice, cards, flips, or the hidden number). */
  hidden: number[]
  /** Scenario-specific extra data (e.g. hint texts). */
  extra?: { hints: { text: string; ok: (n: number) => boolean }[] }
}

export interface Scenario {
  id: string
  title: string
  description: string
  /** Quoting rounds (information is revealed between rounds). */
  rounds: number
  maxSpread: number
  /** Price increment for quotes. */
  tick: number
  noiseSd: number
  range: [number, number]
  sample(rng: SeededRNG): MMState
  /** Human-readable information available when quoting round r (0-based). */
  info(s: MMState, r: number): string[]
  /** E[X | information at round r]. r === rounds means everything is known. */
  fair(s: MMState, r: number): number
  trueValue(s: MMState): number
  /** Draw a full state consistent with the information at round r (for validation). */
  resample(s: MMState, r: number, rng: SeededRNG): MMState
}

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

// ---------------------------------------------------------------------------

const diceSum: Scenario = {
  id: 'dice-sum',
  title: 'Sum of three dice',
  description: 'Three fair dice are rolled in secret. Make a market on their total. One die is revealed after each round.',
  rounds: 3,
  maxSpread: 2,
  tick: 0.5,
  noiseSd: 1.5,
  range: [3, 18],
  sample: (rng) => ({ hidden: [rng.int(1, 6), rng.int(1, 6), rng.int(1, 6)] }),
  info: (s, r) => (r === 0 ? ['Nothing revealed yet.'] : s.hidden.slice(0, r).map((d, i) => `Die ${i + 1}: ${DIE_FACES[d - 1]} ${d}`)),
  fair: (s, r) => sum(s.hidden.slice(0, r)) + 3.5 * (3 - Math.min(r, 3)),
  trueValue: (s) => sum(s.hidden),
  resample: (s, r, rng) => ({ hidden: s.hidden.map((d, i) => (i < r ? d : rng.int(1, 6))) }),
}

const DECK_TOTAL = 4 * 91

const cardSum: Scenario = {
  id: 'card-sum',
  title: 'Sum of five cards',
  description: 'Five cards are dealt face down from a standard deck (A = 1, J = 11, Q = 12, K = 13). Make a market on their total. One card is turned over after each round.',
  rounds: 5,
  maxSpread: 6,
  tick: 0.5,
  noiseSd: 5,
  range: [5, 63],
  sample: (rng) => {
    const deck = Array.from({ length: 52 }, (_, i) => (i % 13) + 1)
    return { hidden: rng.sample(deck, 5) }
  },
  info: (s, r) => (r === 0 ? ['Nothing revealed yet.'] : s.hidden.slice(0, r).map((c, i) => `Card ${i + 1}: ${RANKS[c - 1]} (${c})`)),
  fair: (s, r) => {
    const k = Math.min(r, 5)
    const seen = sum(s.hidden.slice(0, k))
    return seen + ((5 - k) * (DECK_TOTAL - seen)) / (52 - k)
  },
  trueValue: (s) => sum(s.hidden),
  resample: (s, r, rng) => {
    const deck = Array.from({ length: 52 }, (_, i) => (i % 13) + 1)
    for (const c of s.hidden.slice(0, r)) deck.splice(deck.indexOf(c), 1)
    return { hidden: [...s.hidden.slice(0, r), ...rng.sample(deck, 5 - r)] }
  },
}

const coinHeads: Scenario = {
  id: 'coin-heads',
  title: 'Heads in 20 flips',
  description: 'A fair coin is flipped 20 times in secret. Make a market on the number of heads. Five flips are revealed after each round.',
  rounds: 4,
  maxSpread: 3,
  tick: 0.5,
  noiseSd: 1.5,
  range: [0, 20],
  sample: (rng) => ({ hidden: Array.from({ length: 20 }, () => (rng.chance(0.5) ? 1 : 0)) }),
  info: (s, r) => {
    if (r === 0) return ['Nothing revealed yet.']
    const shown = s.hidden.slice(0, 5 * r)
    return [`Flips 1–${5 * r}: ${shown.map((x) => (x ? 'H' : 'T')).join(' ')}`, `Heads so far: ${sum(shown)}`]
  },
  fair: (s, r) => {
    const k = Math.min(5 * r, 20)
    return sum(s.hidden.slice(0, k)) + 0.5 * (20 - k)
  },
  trueValue: (s) => sum(s.hidden),
  resample: (s, r, rng) => ({ hidden: s.hidden.map((x, i) => (i < 5 * r ? x : rng.chance(0.5) ? 1 : 0)) }),
}

/** E[max(m, Y)] where Y is the max of k fair dice. */
export function expectedMaxWith(m: number, k: number): number {
  let e = 0
  for (let v = 1; v <= 6; v++) e += v <= m ? 1 : 1 - ((v - 1) / 6) ** k
  return e
}

const maxDice: Scenario = {
  id: 'max-dice',
  title: 'Highest of four dice',
  description: 'Four fair dice are rolled in secret. Make a market on the highest value. One die is revealed after each round.',
  rounds: 4,
  maxSpread: 1,
  tick: 0.1,
  noiseSd: 0.6,
  range: [1, 6],
  sample: (rng) => ({ hidden: Array.from({ length: 4 }, () => rng.int(1, 6)) }),
  info: (s, r) => (r === 0 ? ['Nothing revealed yet.'] : s.hidden.slice(0, r).map((d, i) => `Die ${i + 1}: ${DIE_FACES[d - 1]} ${d}`)),
  fair: (s, r) => {
    const k = Math.min(r, 4)
    const m = k ? Math.max(...s.hidden.slice(0, k)) : 0
    return expectedMaxWith(m, 4 - k)
  },
  trueValue: (s) => Math.max(...s.hidden),
  resample: (s, r, rng) => ({ hidden: s.hidden.map((d, i) => (i < r ? d : rng.int(1, 6))) }),
}

function numberHints(n: number, rng: SeededRNG): { text: string; ok: (x: number) => boolean }[] {
  const t = rng.pick([30, 40, 50, 60, 70])
  const parity = n % 2 === 0
  const above = n > t
  const div3 = n % 3 === 0
  const tens = Math.floor(n / 10) % 10
  return [
    { text: `The number is ${parity ? 'even' : 'odd'}.`, ok: (x) => (x % 2 === 0) === parity },
    { text: above ? `The number is greater than ${t}.` : `The number is at most ${t}.`, ok: (x) => x > t === above },
    { text: `The number is ${div3 ? '' : 'not '}divisible by 3.`, ok: (x) => (x % 3 === 0) === div3 },
    { text: `Its tens digit is ${tens}${n === 100 ? ' (it may be 100)' : ''}.`, ok: (x) => Math.floor(x / 10) % 10 === tens },
  ]
}

const candidates = (s: MMState, r: number) => {
  const hints = s.extra!.hints.slice(0, r)
  const out: number[] = []
  for (let x = 1; x <= 100; x++) if (hints.every((h) => h.ok(x))) out.push(x)
  return out
}

const hiddenNumber: Scenario = {
  id: 'hidden-number',
  title: 'The hidden number',
  description: 'A whole number from 1 to 100 is chosen uniformly at random. Make a market on it. A true clue is revealed after each round.',
  rounds: 4,
  maxSpread: 10,
  tick: 0.5,
  noiseSd: 8,
  range: [1, 100],
  sample: (rng) => {
    const n = rng.int(1, 100)
    return { hidden: [n], extra: { hints: numberHints(n, rng) } }
  },
  info: (s, r) => (r === 0 ? ['No clues yet.'] : s.extra!.hints.slice(0, r).map((h) => h.text)),
  fair: (s, r) => {
    if (r >= 5) return s.hidden[0]
    const c = candidates(s, Math.min(r, 4))
    return sum(c) / c.length
  },
  trueValue: (s) => s.hidden[0],
  resample: (s, r, rng) => ({ hidden: [rng.pick(candidates(s, r))], extra: s.extra }),
}

export const SCENARIOS: Scenario[] = [diceSum, cardSum, coinHeads, maxDice, hiddenNumber]
export const SCENARIO_BY_ID = Object.fromEntries(SCENARIOS.map((s) => [s.id, s])) as Record<string, Scenario>

// ---------------------------------------------------------------------------
// Game engine
// ---------------------------------------------------------------------------

export const SPREAD_PENALTY = 0.25
export const TRADERS_PER_ROUND = 3
export const INFORMED_PROB = 0.3

export interface Trade {
  round: number
  trader: 'informed' | 'noise'
  /** From the player's perspective: +1 = player bought (hit on bid), -1 = player sold (lifted on ask). */
  side: 1 | -1
  price: number
  qty: number
}

export interface RoundLog {
  round: number
  bid: number
  ask: number
  info: string[]
  fairBefore: number
  trades: Trade[]
  positionAfter: number
  cashAfter: number
  /** Mark-to-fair P&L after the next reveal. */
  markAfter: number
  /** Fair value with the information revealed after this round. */
  fairAfter: number
}

export interface MarketResult {
  id: string
  scenarioId: string
  seed: string
  ts: number
  pnl: number
  penalty: number
  score: number
  trades: number
  avgSpread: number
  trueValue: number
}

export class MarketGame {
  readonly scenario: Scenario
  readonly seed: string
  readonly state: MMState
  private readonly rng: SeededRNG
  round = 0
  position = 0
  cash = 0
  log: RoundLog[] = []

  constructor(scenario: Scenario, seed: string) {
    this.scenario = scenario
    this.seed = seed
    this.rng = new SeededRNG(`mm|${scenario.id}|${seed}`)
    this.state = scenario.sample(this.rng.fork('state'))
  }

  get finished(): boolean {
    return this.round >= this.scenario.rounds
  }

  info(): string[] {
    return this.scenario.info(this.state, this.round)
  }

  /** Returns an error message, or null if the quote is acceptable. */
  validate(bid: number, ask: number): string | null {
    if (!Number.isFinite(bid) || !Number.isFinite(ask)) return 'Enter a bid and an ask.'
    if (ask <= bid) return 'The ask must be above the bid.'
    if (ask - bid > this.scenario.maxSpread + 1e-9) return `Spread is capped at ${this.scenario.maxSpread}.`
    return null
  }

  quote(bid: number, ask: number): RoundLog {
    if (this.finished) throw new Error('Game over')
    const err = this.validate(bid, ask)
    if (err) throw new Error(err)
    const r = this.round
    const sc = this.scenario
    const fairNow = sc.fair(this.state, r)
    // Informed traders see the information that will be revealed after this round.
    const insiderValue = sc.fair(this.state, r + 1)
    const trng = this.rng.fork(`round-${r}`)
    const trades: Trade[] = []
    for (let i = 0; i < TRADERS_PER_ROUND; i++) {
      const informed = trng.chance(INFORMED_PROB)
      const value = informed ? insiderValue + trng.normal(0, sc.noiseSd * 0.15) : fairNow + trng.normal(0, sc.noiseSd)
      if (value > ask) trades.push({ round: r, trader: informed ? 'informed' : 'noise', side: -1, price: ask, qty: 1 })
      else if (value < bid) trades.push({ round: r, trader: informed ? 'informed' : 'noise', side: 1, price: bid, qty: 1 })
    }
    for (const t of trades) {
      this.position += t.side * t.qty
      this.cash -= t.side * t.qty * t.price
    }
    this.round++
    const fairAfter = this.finished ? sc.trueValue(this.state) : sc.fair(this.state, this.round)
    const entry: RoundLog = {
      round: r,
      bid,
      ask,
      info: sc.info(this.state, r),
      fairBefore: fairNow,
      trades,
      positionAfter: this.position,
      cashAfter: this.cash,
      markAfter: this.cash + this.position * fairAfter,
      fairAfter,
    }
    this.log.push(entry)
    return entry
  }

  get trueValue(): number {
    return this.scenario.trueValue(this.state)
  }

  /** Final P&L once every position settles at the true value. */
  get pnl(): number {
    return this.cash + this.position * this.trueValue
  }

  get penalty(): number {
    return SPREAD_PENALTY * this.log.reduce((s, l) => s + (l.ask - l.bid), 0)
  }

  result(id: string, ts: number): MarketResult {
    const trades = this.log.reduce((s, l) => s + l.trades.length, 0)
    const pnl = round2(this.pnl)
    const penalty = round2(this.penalty)
    return {
      id,
      scenarioId: this.scenario.id,
      seed: this.seed,
      ts,
      pnl,
      penalty,
      score: round2(pnl - penalty),
      trades,
      avgSpread: round2(this.log.reduce((s, l) => s + (l.ask - l.bid), 0) / Math.max(1, this.log.length)),
      trueValue: this.trueValue,
    }
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}
