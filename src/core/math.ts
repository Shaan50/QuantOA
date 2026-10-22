import { Fraction, frac } from './fraction'

export function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a
}

export function lcm(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : Math.abs((a / gcd(a, b)) * b)
}

/** Exact binomial coefficient as a BigInt. */
export function choose(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n
  k = Math.min(k, n - k)
  let r = 1n
  for (let i = 1; i <= k; i++) {
    r = (r * BigInt(n - k + i)) / BigInt(i)
  }
  return r
}

export function chooseN(n: number, k: number): number {
  return Number(choose(n, k))
}

export function factorial(n: number): bigint {
  let r = 1n
  for (let i = 2; i <= n; i++) r *= BigInt(i)
  return r
}

/** Falling factorial n (n-1) ... (n-k+1). */
export function perm(n: number, k: number): bigint {
  if (k < 0 || k > n) return 0n
  let r = 1n
  for (let i = 0; i < k; i++) r *= BigInt(n - i)
  return r
}

export function isPrime(n: number): boolean {
  if (n < 2 || !Number.isInteger(n)) return false
  if (n < 4) return true
  if (n % 2 === 0 || n % 3 === 0) return false
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false
  }
  return true
}

/** The first `count` primes. */
export function primes(count: number): number[] {
  const out: number[] = []
  for (let n = 2; out.length < count; n++) if (isPrime(n)) out.push(n)
  return out
}

/** Harmonic number H_n as an exact fraction. */
export function harmonic(n: number): Fraction {
  let h = frac(0)
  for (let i = 1; i <= n; i++) h = h.add(frac(1, i))
  return h
}

/**
 * Probability mass function of the sum of `n` fair `sides`-sided dice, as exact
 * counts. Returns counts[s] = number of outcomes with sum s; total = sides^n.
 */
export function diceSumCounts(n: number, sides = 6): bigint[] {
  let counts: bigint[] = [1n]
  for (let i = 0; i < n; i++) {
    const next: bigint[] = new Array(counts.length + sides).fill(0n)
    counts.forEach((c, s) => {
      if (c === 0n) return
      for (let f = 1; f <= sides; f++) next[s + f] += c
    })
    counts = next
  }
  return counts
}

export function roundTo(x: number, places: number): number {
  const m = 10 ** places
  return Math.round(x * m) / m
}

/** Round to `sig` significant figures. */
export function roundSig(x: number, sig: number): number {
  if (x === 0 || !Number.isFinite(x)) return x
  const p = Math.floor(Math.log10(Math.abs(x))) - sig + 1
  const m = 10 ** p
  // Avoid float noise like 0.30000000000000004 by rounding through toPrecision.
  return Number((Math.round(x / m) * m).toPrecision(Math.max(sig, 1) + 2))
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

export function range(start: number, endInclusive: number): number[] {
  const out: number[] = []
  for (let i = start; i <= endInclusive; i++) out.push(i)
  return out
}

export function sum(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0)
}

export function mean(xs: readonly number[]): number {
  return xs.length ? sum(xs) / xs.length : 0
}
