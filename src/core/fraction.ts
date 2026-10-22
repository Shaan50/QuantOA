/**
 * Exact rational arithmetic on BigInt numerators/denominators.
 *
 * Probability and arbitrage generators compute every canonical answer with
 * Fractions so that answers are exact — floating point never decides whether
 * a player's "3/8" is right.
 */

function bigAbs(x: bigint): bigint {
  return x < 0n ? -x : x
}

export function bigGcd(a: bigint, b: bigint): bigint {
  a = bigAbs(a)
  b = bigAbs(b)
  while (b !== 0n) {
    ;[a, b] = [b, a % b]
  }
  return a
}

export type FractionLike = Fraction | number | bigint | string

export class Fraction {
  readonly num: bigint
  readonly den: bigint

  /** Always stored reduced, with a positive denominator. */
  constructor(num: bigint | number, den: bigint | number = 1n) {
    let n = typeof num === 'bigint' ? num : toBigIntStrict(num)
    let d = typeof den === 'bigint' ? den : toBigIntStrict(den)
    if (d === 0n) throw new Error('Fraction: zero denominator')
    if (d < 0n) {
      n = -n
      d = -d
    }
    const g = bigGcd(n, d)
    this.num = g === 0n ? 0n : n / g
    this.den = g === 0n ? 1n : d / g
  }

  static from(x: FractionLike): Fraction {
    if (x instanceof Fraction) return x
    if (typeof x === 'bigint') return new Fraction(x, 1n)
    if (typeof x === 'string') {
      const parsed = Fraction.parseDecimal(x)
      if (!parsed) throw new Error(`Fraction.from: cannot parse "${x}"`)
      return parsed
    }
    if (Number.isInteger(x)) return new Fraction(x, 1)
    // Finite decimal number -> exact via its shortest decimal representation.
    const parsed = Fraction.parseDecimal(String(x))
    if (!parsed) throw new Error(`Fraction.from: cannot represent ${x}`)
    return parsed
  }

  /** Parse "12", "-3.75", ".5", "1e-3", "2.5E4" exactly. Returns null if not a plain decimal. */
  static parseDecimal(s: string): Fraction | null {
    const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(s.trim())
    if (!m) return null
    const [, sign, intPart, fracPart = '', expPart] = m
    if (intPart === '' && fracPart === '') return null
    let num = BigInt((intPart || '0') + fracPart)
    let den = 10n ** BigInt(fracPart.length)
    if (expPart !== undefined) {
      const e = Number(expPart)
      if (Math.abs(e) > 400) return null
      if (e >= 0) num *= 10n ** BigInt(e)
      else den *= 10n ** BigInt(-e)
    }
    if (sign === '-') num = -num
    return new Fraction(num, den)
  }

  add(o: FractionLike): Fraction {
    const b = Fraction.from(o)
    return new Fraction(this.num * b.den + b.num * this.den, this.den * b.den)
  }
  sub(o: FractionLike): Fraction {
    const b = Fraction.from(o)
    return new Fraction(this.num * b.den - b.num * this.den, this.den * b.den)
  }
  mul(o: FractionLike): Fraction {
    const b = Fraction.from(o)
    return new Fraction(this.num * b.num, this.den * b.den)
  }
  div(o: FractionLike): Fraction {
    const b = Fraction.from(o)
    if (b.num === 0n) throw new Error('Fraction: division by zero')
    return new Fraction(this.num * b.den, this.den * b.num)
  }
  neg(): Fraction {
    return new Fraction(-this.num, this.den)
  }
  inv(): Fraction {
    return new Fraction(this.den, this.num)
  }
  pow(k: number): Fraction {
    if (!Number.isInteger(k)) throw new Error('Fraction.pow: integer exponent required')
    if (k < 0) return this.inv().pow(-k)
    return new Fraction(this.num ** BigInt(k), this.den ** BigInt(k))
  }
  abs(): Fraction {
    return this.num < 0n ? this.neg() : this
  }

  cmp(o: FractionLike): -1 | 0 | 1 {
    const b = Fraction.from(o)
    const l = this.num * b.den
    const r = b.num * this.den
    return l < r ? -1 : l > r ? 1 : 0
  }
  eq(o: FractionLike): boolean {
    return this.cmp(o) === 0
  }
  lt(o: FractionLike): boolean {
    return this.cmp(o) < 0
  }
  gt(o: FractionLike): boolean {
    return this.cmp(o) > 0
  }
  isZero(): boolean {
    return this.num === 0n
  }
  isInteger(): boolean {
    return this.den === 1n
  }
  sign(): -1 | 0 | 1 {
    return this.num < 0n ? -1 : this.num > 0n ? 1 : 0
  }

  toNumber(): number {
    const n = this.num
    const d = this.den
    if (bigAbs(n) < 2n ** 53n && d < 2n ** 53n) return Number(n) / Number(d)
    // Align magnitudes so the quotient carries ~20 significant digits, then let
    // the string parser do the correctly-rounded conversion.
    const shift = d.toString().length - bigAbs(n).toString().length + 20
    const q = shift >= 0 ? (n * 10n ** BigInt(shift)) / d : n / (d * 10n ** BigInt(-shift))
    return Number(`${q}e${-shift}`)
  }

  /** True if this fraction has a terminating decimal expansion. */
  isTerminating(): boolean {
    let d = this.den
    while (d % 2n === 0n) d /= 2n
    while (d % 5n === 0n) d /= 5n
    return d === 1n
  }

  /** Exact decimal string when terminating (up to maxDigits places), else rounded. */
  toDecimalString(maxDigits = 6): string {
    if (this.isTerminating()) {
      let digits = 0
      let d = this.den
      while (d !== 1n && digits < 60) {
        if (d % 10n === 0n) d /= 10n
        else if (d % 2n === 0n) d /= 2n
        else d /= 5n
        digits++
      }
      // digits is an upper bound; compute exact value with that many places.
      if (digits <= maxDigits) return formatScaled(this, digits)
    }
    return trimZeros(formatScaled(this, maxDigits, true))
  }

  /** "3/8", "-5", "7/2". */
  toString(): string {
    return this.den === 1n ? this.num.toString() : `${this.num}/${this.den}`
  }

  /** LaTeX form: \frac{3}{8}. */
  toLatex(): string {
    if (this.den === 1n) return this.num.toString()
    const sign = this.num < 0n ? '-' : ''
    return `${sign}\\frac{${bigAbs(this.num)}}{${this.den}}`
  }
}

function toBigIntStrict(x: number): bigint {
  if (!Number.isInteger(x)) throw new Error(`Fraction: non-integer component ${x}`)
  if (!Number.isSafeInteger(x)) throw new Error(`Fraction: unsafe integer ${x}`)
  return BigInt(x)
}

function trimZeros(s: string): string {
  if (!s.includes('.')) return s
  return s.replace(/\.?0+$/, '')
}

function formatScaled(f: Fraction, places: number, round = false): string {
  const scale = 10n ** BigInt(places)
  const neg = f.num < 0n
  const n = bigAbs(f.num) * scale
  let q = n / f.den
  if (round) {
    const r = n % f.den
    if (r * 2n >= f.den) q += 1n
  }
  let s = q.toString()
  if (places > 0) {
    s = s.padStart(places + 1, '0')
    s = `${s.slice(0, -places)}.${s.slice(-places)}`
    s = trimZeros(s)
  }
  if (neg && s !== '0') s = `-${s}`
  return s
}

/** Convenience constructor: frac(3, 8). */
export function frac(num: number | bigint, den: number | bigint = 1): Fraction {
  return new Fraction(num, den)
}

export const ZERO = frac(0)
export const ONE = frac(1)

export function sumFractions(items: readonly Fraction[]): Fraction {
  return items.reduce((acc, x) => acc.add(x), ZERO)
}
