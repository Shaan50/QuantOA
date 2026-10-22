/**
 * Seeded pseudo-random number generation.
 *
 * Every question, session and market-making game is driven by a SeededRNG so
 * that a seed string fully determines what the player sees. The generator is
 * sfc32 (Small Fast Counting), seeded by the cyrb128 string hash — both are
 * tiny, fast, and have good statistical quality for a game.
 */

/** Hash an arbitrary string into four 32-bit words (cyrb128). */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

export class SeededRNG {
  readonly seed: string
  private a: number
  private b: number
  private c: number
  private d: number

  constructor(seed: string) {
    this.seed = seed
    ;[this.a, this.b, this.c, this.d] = cyrb128(seed)
    // Warm up so that similar seeds diverge immediately.
    for (let i = 0; i < 15; i++) this.nextUint32()
  }

  private nextUint32(): number {
    this.a >>>= 0
    this.b >>>= 0
    this.c >>>= 0
    this.d >>>= 0
    let t = (this.a + this.b) | 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) | 0
    this.c = (this.c << 21) | (this.c >>> 11)
    this.d = (this.d + 1) | 0
    t = (t + this.d) | 0
    this.c = (this.c + t) | 0
    return t >>> 0
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextUint32() / 4294967296
  }

  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new Error(`SeededRNG.int: invalid range [${min}, ${max}]`)
    }
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** Uniform float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p
  }

  /** +1 or -1 with equal probability. */
  sign(): 1 | -1 {
    return this.next() < 0.5 ? 1 : -1
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('SeededRNG.pick: empty array')
    return items[Math.floor(this.next() * items.length)]
  }

  /** Pick with relative weights. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((s, w) => s + w, 0)
    if (items.length === 0 || total <= 0) throw new Error('SeededRNG.weighted: nothing to pick')
    let r = this.next() * total
    for (let i = 0; i < items.length; i++) {
      r -= weights[i]
      if (r < 0) return items[i]
    }
    return items[items.length - 1]
  }

  /** Fisher–Yates shuffle into a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  /** k distinct items, in random order. */
  sample<T>(items: readonly T[], k: number): T[] {
    if (k > items.length) throw new Error('SeededRNG.sample: k larger than population')
    return this.shuffle(items).slice(0, k)
  }

  /** Standard normal via Box–Muller. */
  normal(mean = 0, sd = 1): number {
    let u = 0
    while (u === 0) u = this.next()
    const v = this.next()
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  /** Derive an independent child generator from this seed plus a label. */
  fork(label: string | number): SeededRNG {
    return new SeededRNG(`${this.seed}/${label}`)
  }
}

const SEED_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** A short, human-shareable random seed like "k7xq-m2pa". Uses Math.random. */
export function randomSeed(): string {
  let s = ''
  for (let i = 0; i < 8; i++) {
    if (i === 4) s += '-'
    s += SEED_ALPHABET[Math.floor(Math.random() * SEED_ALPHABET.length)]
  }
  return s
}
