/** Shared building blocks for question templates. */
import { Fraction } from '../core/fraction'
import { formatNumber } from '../core/answer'
import type { Answer, Difficulty, Tolerance } from '../core/types'
import type { SeededRNG } from '../core/rng'

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export function intAnswer(value: number): Answer {
  if (!Number.isSafeInteger(value)) throw new Error(`intAnswer: not a safe integer: ${value}`)
  return { type: 'integer', value }
}

export function decAnswer(value: number, tolerance: Tolerance = { abs: 1e-9 }, display?: number): Answer {
  if (!Number.isFinite(value)) throw new Error(`decAnswer: non-finite value ${value}`)
  return { type: 'decimal', value, tolerance, display }
}

/** Exact decimal value expressed as a Fraction; still answered as a decimal with tiny tolerance. */
export function exactDecAnswer(value: Fraction): Answer {
  return decAnswer(value.toNumber(), { abs: 1e-9 }, 8)
}

export function fracAnswer(f: Fraction, form?: 'fraction' | 'decimal'): Answer {
  return { type: 'fraction', num: f.num.toString(), den: f.den.toString(), form }
}

export function estimateAnswer(value: number): Answer {
  if (!(value > 0)) throw new Error('estimateAnswer: value must be positive')
  return { type: 'estimate', value }
}

/**
 * Multiple choice from a correct option and distractors. Options are shuffled
 * unless `keepOrder`; duplicates are a generator bug and throw.
 */
export function mcAnswer(
  rng: SeededRNG,
  correct: string,
  distractors: readonly string[],
  opts: { keepOrder?: boolean; sortNumeric?: boolean } = {},
): Answer {
  const all = [correct, ...distractors]
  if (new Set(all.map((c) => c.trim().toLowerCase())).size !== all.length) {
    throw new Error(`mcAnswer: duplicate choices ${JSON.stringify(all)}`)
  }
  let choices: string[]
  if (opts.keepOrder) choices = all
  else if (opts.sortNumeric) choices = all.slice().sort((a, b) => parseFloat(a.replace(/[^\d.-]/g, '')) - parseFloat(b.replace(/[^\d.-]/g, '')))
  else choices = rng.shuffle(all)
  return { type: 'multiple-choice', choices, correctIndex: choices.indexOf(correct) }
}

// ---------------------------------------------------------------------------
// Formatting for prompts (LaTeX-aware)
// ---------------------------------------------------------------------------

/** Number for LaTeX: thousands separators as {,} so KaTeX doesn't add space. */
export function tex(n: number | Fraction, maxDecimals = 6): string {
  if (n instanceof Fraction) return n.toLatex()
  return formatNumber(n, maxDecimals).replace(/,/g, '{,}')
}

/** Plain-text number with separators. */
export function num(n: number, maxDecimals = 6): string {
  return formatNumber(n, maxDecimals)
}

/** Currency in prompt text (literal dollar escaped for the math renderer). */
export function usd(n: number, decimals?: number): string {
  const d = decimals ?? (Number.isInteger(n) ? 0 : 2)
  return `${n < 0 ? '-' : ''}\\$${money(Math.abs(n), d)}`
}

/** Money with exactly `decimals` places (e.g. option prices 4.50). */
export function money(n: number, decimals = 2): string {
  return padDecimals(formatNumber(n, decimals), decimals)
}

export function padDecimals(s: string, decimals: number): string {
  if (decimals <= 0) return s
  const [i, f = ''] = s.split('.')
  return `${i}.${f.padEnd(decimals, '0')}`
}

export function pct(x: number, decimals = 2): string {
  return `${formatNumber(x * 100, decimals)}\\%`
}

/** Fraction as LaTeX with its decimal. */
export function fracWithDecimal(f: Fraction, digits = 4): string {
  if (f.isInteger()) return f.toString()
  const dec = f.isTerminating() ? f.toDecimalString(8) : `\\approx ${f.toDecimalString(digits)}`
  return `${f.toLatex()} ${f.isTerminating() ? '=' : ''} ${dec}`
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** Random integer with exactly `digits` digits. */
export function randDigits(rng: SeededRNG, digits: number): number {
  return rng.int(10 ** (digits - 1), 10 ** digits - 1)
}

/** Random integer with `digits` digits that avoids trailing zeros (uglier numbers). */
export function uglyDigits(rng: SeededRNG, digits: number): number {
  for (;;) {
    const n = randDigits(rng, digits)
    if (n % 10 !== 0 && (digits < 2 || n % 5 !== 0 || rng.chance(0.2))) return n
  }
}

/** Expected time scaled by difficulty: base seconds at d=1 growing ~35% per level. */
export function expectedTime(base: number, d: Difficulty): number {
  return Math.round(base * 1.35 ** (d - 1))
}

/** Pick a value per difficulty from a 5-tuple. */
export function byDifficulty<T>(d: Difficulty, values: readonly [T, T, T, T, T]): T {
  return values[d - 1]
}

/** Nearly-equal float comparison for generator self-checks. */
export function approxEq(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b))
}

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Generator invariant failed: ${msg}`)
}
