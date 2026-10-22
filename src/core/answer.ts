/**
 * The single answer-checking module.
 *
 * Responsibilities:
 *  - parse whatever the player typed ("3/8", " 0.375 ", "37.5%", "1 1/2",
 *    "-1,250", "2.5m", "3e6", "b") into a normalized number;
 *  - compare it with a Question's canonical answer according to its type;
 *  - format canonical answers for display.
 */
import { Fraction } from './fraction'
import type { Answer, Question } from './types'

export type NumberForm = 'integer' | 'decimal' | 'fraction' | 'mixed' | 'percent' | 'scientific' | 'suffixed'

export interface ParsedNumber {
  value: number
  /** Exact rational value when the input is a finite decimal / fraction. */
  exact: Fraction | null
  form: NumberForm
  /** Decimal places expressed in the answer's own units (percent adds 2). */
  decimals: number
  /** Significant figures typed. */
  sigFigs: number
}

const SUFFIXES: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  mil: 1e6,
  million: 1e6,
  millions: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  billions: 1e9,
  t: 1e12,
  tn: 1e12,
  trillion: 1e12,
  trillions: 1e12,
}

/** Normalize unicode and strip cosmetic characters, keeping meaningful spaces. */
export function normalizeInput(raw: string): string {
  return raw
    .replace(/[−–—]/g, '-') // unicode minus / dashes
    .replace(/[×]/g, 'x')
    .replace(/[⁄∕]/g, '/') // fraction slashes
    .replace(/[$€£¥≈~]/g, '')
    .replace(/(\d)[,_'](?=\d{3}(?!\d))/g, '$1') // thousands separators
    .replace(/\s+/g, ' ')
    .trim()
}

function countDecimals(s: string): number {
  const m = /\.(\d*)/.exec(s)
  return m ? m[1].length : 0
}

function countSigFigs(s: string): number {
  const digits = s.replace(/^[+-]/, '').replace(/[eE].*$/, '')
  const [intPart, fracPart = ''] = digits.split('.')
  const all = (intPart + fracPart).replace(/^0+/, '')
  if (fracPart.length > 0) return Math.max(all.length, 1)
  // Integer: trailing zeros are ambiguous; count them (generous).
  return Math.max(all.length, 1)
}

function parsePlain(s: string): Fraction | null {
  return Fraction.parseDecimal(s)
}

/**
 * Parse a player's numeric input. With `percentUnits`, a trailing "%" is
 * ignored instead of dividing by 100 (the answer is already in percent).
 */
export function parseNumber(raw: string, opts: { percentUnits?: boolean } = {}): ParsedNumber | null {
  let s = normalizeInput(raw)
  if (!s) return null
  if (s.startsWith('+')) s = s.slice(1).trim()

  // Percent: "37.5%", "37.5 %"
  const pct = /^(.*?)\s*%$/.exec(s)
  if (pct) {
    const inner = parseNumber(pct[1], {})
    if (!inner || inner.form === 'percent') return null
    if (opts.percentUnits) return { ...inner, form: 'percent' }
    return {
      value: inner.value / 100,
      exact: inner.exact ? inner.exact.div(100) : null,
      form: 'percent',
      decimals: inner.decimals + 2,
      sigFigs: inner.sigFigs,
    }
  }

  // Mixed number: "1 1/2", "-2 3/4"
  const mixed = /^(-?)(\d+) (\d+) ?\/ ?(\d+)$/.exec(s)
  if (mixed) {
    const [, sign, whole, n, d] = mixed
    if (Number(d) === 0) return null
    let f = new Fraction(BigInt(whole)).add(new Fraction(BigInt(n), BigInt(d)))
    if (sign === '-') f = f.neg()
    return { value: f.toNumber(), exact: f, form: 'mixed', decimals: 0, sigFigs: 99 }
  }

  // Fraction: "3/8", "-3 / 8", "1.5/4"
  const fr = /^(-?[\d.]+) ?\/ ?(-?[\d.]+)$/.exec(s)
  if (fr) {
    const n = parsePlain(fr[1])
    const d = parsePlain(fr[2])
    if (!n || !d || d.isZero()) return null
    const f = n.div(d)
    return { value: f.toNumber(), exact: f, form: 'fraction', decimals: 0, sigFigs: 99 }
  }

  // Scientific with "x10^k" / "*10^k" / "10^k"
  const sci = /^(-?[\d.]+)? ?(?:x|\*)? ?10 ?\^ ?(-?\d+)$/i.exec(s)
  if (sci) {
    const mant = sci[1] !== undefined ? parsePlain(sci[1]) : new Fraction(1n)
    const e = Number(sci[2])
    if (!mant || Math.abs(e) > 300) return null
    const f = mant.mul(new Fraction(10n).pow(e))
    return {
      value: f.toNumber(),
      exact: f,
      form: 'scientific',
      decimals: Math.max(0, countDecimals(sci[1] ?? '') - e),
      sigFigs: sci[1] ? countSigFigs(sci[1]) : 1,
    }
  }

  // Suffixed magnitudes: "2.5m", "3 billion", "40k"
  const suf = /^(-?[\d.]+(?:e-?\d+)?) ?([a-z]+)$/i.exec(s)
  if (suf && !/^e/i.test(suf[2])) {
    const mult = SUFFIXES[suf[2].toLowerCase()]
    const base = parsePlain(suf[1])
    if (!mult || !base) return null
    const f = base.mul(Fraction.from(mult))
    return { value: f.toNumber(), exact: f, form: 'suffixed', decimals: 0, sigFigs: countSigFigs(suf[1]) }
  }

  // Plain integer / decimal / e-notation
  const plain = parsePlain(s)
  if (plain) {
    const isSci = /e/i.test(s)
    return {
      value: plain.toNumber(),
      exact: plain,
      form: isSci ? 'scientific' : s.includes('.') ? 'decimal' : 'integer',
      decimals: isSci ? countDecimals(s) : countDecimals(s),
      sigFigs: countSigFigs(s),
    }
  }
  return null
}

/** Fermi credit on a log scale: 1 within 2x, decaying from 0.5 to 0 between 2x and 10x. */
export function estimateCredit(guess: number, reference: number): number {
  if (!(guess > 0) || !(reference > 0)) return 0
  const ratio = Math.max(guess / reference, reference / guess)
  if (ratio <= 2 + 1e-12) return 1
  if (ratio >= 10) return 0
  const t = (Math.log(ratio) - Math.log(2)) / (Math.log(10) - Math.log(2))
  return 0.5 * (1 - t)
}

export function estimateRatio(guess: number, reference: number): number {
  return Math.max(guess / reference, reference / guess)
}

export type CheckStatus = 'correct' | 'incorrect' | 'partial' | 'invalid'

export interface CheckResult {
  status: CheckStatus
  /** 0..1 credit (Fermi can be fractional). */
  credit: number
  /** Explains why an input was rejected (invalid) or how close it was. */
  message?: string
}

function withinTolerance(x: number, target: number, tol: { abs?: number; rel?: number }): boolean {
  const diff = Math.abs(x - target)
  const absTol = tol.abs ?? 0
  const relTol = (tol.rel ?? 0) * Math.abs(target)
  return diff <= Math.max(absTol, relTol) + 1e-9 * Math.max(1, Math.abs(target))
}

/** Interpret a multiple-choice input: "2", "b", "B)", or the option text itself. */
export function parseChoice(raw: string, choices: readonly string[]): number | null {
  const s = normalizeInput(raw).toLowerCase().replace(/[).:]$/, '')
  if (/^[1-9]$/.test(s)) {
    const i = Number(s) - 1
    return i < choices.length ? i : null
  }
  if (/^[a-z]$/.test(s)) {
    const i = s.charCodeAt(0) - 97
    return i < choices.length ? i : null
  }
  const compact = (x: string) => normalizeInput(x).toLowerCase().replace(/\s+/g, '')
  const byText = choices.findIndex((c) => compact(c) === compact(s))
  if (byText >= 0) return byText
  const asNum = parseNumber(s)
  if (asNum?.exact) {
    const idx = choices.findIndex((c) => {
      const p = parseNumber(c)
      return p?.exact ? p.exact.eq(asNum.exact!) : false
    })
    if (idx >= 0) return idx
  }
  return null
}

const INVALID: CheckResult = { status: 'invalid', credit: 0, message: 'Could not read that as a number' }

export function checkAnswer(q: Pick<Question, 'answer' | 'percentUnits'>, raw: string): CheckResult {
  const a = q.answer
  if (!normalizeInput(raw)) return { status: 'invalid', credit: 0, message: 'Empty answer' }

  if (a.type === 'multiple-choice') {
    const idx = parseChoice(raw, a.choices)
    if (idx === null) return { status: 'invalid', credit: 0, message: `Pick 1–${a.choices.length}` }
    return idx === a.correctIndex ? { status: 'correct', credit: 1 } : { status: 'incorrect', credit: 0 }
  }

  const p = parseNumber(raw, { percentUnits: q.percentUnits })
  if (!p || !Number.isFinite(p.value)) return INVALID

  switch (a.type) {
    case 'integer': {
      const ok = p.exact ? p.exact.eq(a.value) : Math.abs(p.value - a.value) < 1e-9
      return ok ? { status: 'correct', credit: 1 } : { status: 'incorrect', credit: 0 }
    }
    case 'decimal': {
      return withinTolerance(p.value, a.value, a.tolerance)
        ? { status: 'correct', credit: 1 }
        : { status: 'incorrect', credit: 0 }
    }
    case 'fraction': {
      const target = new Fraction(BigInt(a.num), BigInt(a.den))
      if (a.form === 'fraction' && !['fraction', 'mixed'].includes(p.form) && !target.isInteger()) {
        return { status: 'invalid', credit: 0, message: 'Answer as a fraction, e.g. 3/8' }
      }
      if (a.form === 'decimal' && ['fraction', 'mixed'].includes(p.form)) {
        return { status: 'invalid', credit: 0, message: 'Answer as a decimal' }
      }
      if (p.exact && p.exact.eq(target)) return { status: 'correct', credit: 1 }
      // Accept a decimal approximation of a non-terminating fraction given to
      // >= 3 significant figures, either rounded or truncated at the typed precision.
      if (!target.isTerminating() && ['decimal', 'percent'].includes(p.form) && p.sigFigs >= 3) {
        const ulp = 10 ** -p.decimals
        const v = target.toNumber()
        const rounded = Math.abs(p.value - v) <= ulp / 2 + 1e-12
        const truncated = Math.sign(p.value) === Math.sign(v) && Math.abs(p.value) < Math.abs(v) && Math.abs(v) - Math.abs(p.value) < ulp
        if (rounded || truncated) return { status: 'correct', credit: 1 }
      }
      return { status: 'incorrect', credit: 0 }
    }
    case 'estimate': {
      if (p.value <= 0) return { status: 'invalid', credit: 0, message: 'Estimates must be positive' }
      const credit = estimateCredit(p.value, a.value)
      const ratio = estimateRatio(p.value, a.value)
      const message = `Off by ${ratio < 10 ? ratio.toFixed(2) : Math.round(ratio).toLocaleString()}×`
      if (credit >= 1) return { status: 'correct', credit, message }
      if (credit > 0) return { status: 'partial', credit, message }
      return { status: 'incorrect', credit: 0, message }
    }
  }
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** 1234567.5 -> "1,234,567.5" (keeps up to `maxDecimals` places, trims zeros). */
export function formatNumber(x: number, maxDecimals = 6): string {
  if (!Number.isFinite(x)) return String(x)
  const neg = x < 0
  const fixed = Math.abs(x).toFixed(maxDecimals)
  let [i, f = ''] = fixed.split('.')
  f = f.replace(/0+$/, '')
  i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const s = f ? `${i}.${f}` : i
  return neg && s !== '0' ? `-${s}` : s
}

/** Compact human magnitude: 2.4e6 -> "2.4 million". */
export function formatMagnitude(x: number): string {
  const abs = Math.abs(x)
  const units: [number, string][] = [
    [1e12, 'trillion'],
    [1e9, 'billion'],
    [1e6, 'million'],
  ]
  for (const [v, name] of units) {
    if (abs >= v) return `${formatNumber(Number((x / v).toPrecision(3)))} ${name}`
  }
  if (abs >= 1000) return formatNumber(Number(x.toPrecision(3)), 0)
  return formatNumber(Number(x.toPrecision(3)))
}

export function answerToFraction(a: Extract<Answer, { type: 'fraction' }>): Fraction {
  return new Fraction(BigInt(a.num), BigInt(a.den))
}

/** Human-readable canonical answer (plain text). */
export function formatAnswer(q: Pick<Question, 'answer' | 'unit'>): string {
  const a = q.answer
  const pre = q.unit?.prefix ?? ''
  const suf = q.unit?.suffix ?? ''
  const wrap = (s: string) => {
    if (pre && s.startsWith('-')) return `-${pre}${s.slice(1)}${suf}`
    return `${pre}${s}${suf}`
  }
  switch (a.type) {
    case 'integer':
      return wrap(formatNumber(a.value, 0))
    case 'decimal':
      return wrap(formatNumber(a.value, a.display ?? 4))
    case 'fraction': {
      const f = answerToFraction(a)
      if (f.isInteger()) return wrap(f.toString())
      const dec = f.isTerminating() ? f.toDecimalString(8) : `≈ ${f.toDecimalString(4)}`
      if (a.form === 'decimal') return wrap(f.isTerminating() ? f.toDecimalString(8) : `≈ ${f.toDecimalString(4)}  (${f.toString()})`)
      return wrap(`${f.toString()}  (${dec})`)
    }
    case 'multiple-choice':
      return `${a.correctIndex + 1}) ${a.choices[a.correctIndex]}`
    case 'estimate':
      return wrap(formatMagnitude(a.value))
  }
}

/** A string the checker is guaranteed to accept (used by tests and "reveal"). */
export function canonicalInput(q: Pick<Question, 'answer'>): string {
  const a = q.answer
  switch (a.type) {
    case 'integer':
      return String(a.value)
    case 'decimal':
      return String(a.value)
    case 'fraction': {
      const f = answerToFraction(a)
      if (a.form === 'decimal') return f.toDecimalString(12)
      return f.toString()
    }
    case 'multiple-choice':
      return String(a.correctIndex + 1)
    case 'estimate':
      return String(a.value)
  }
}
