import { describe, expect, it } from 'vitest'
import { SeededRNG, randomSeed } from '../rng'

describe('SeededRNG', () => {
  it('is deterministic for a given seed', () => {
    const a = new SeededRNG('abc')
    const b = new SeededRNG('abc')
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })

  it('differs for different seeds', () => {
    const a = new SeededRNG('seed-1')
    const b = new SeededRNG('seed-2')
    const xs = Array.from({ length: 10 }, () => a.next())
    const ys = Array.from({ length: 10 }, () => b.next())
    expect(xs).not.toEqual(ys)
  })

  it('next() stays in [0, 1) and is roughly uniform', () => {
    const r = new SeededRNG('uniform')
    const buckets = new Array(10).fill(0)
    const n = 50_000
    for (let i = 0; i < n; i++) {
      const x = r.next()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
      buckets[Math.floor(x * 10)]++
    }
    for (const b of buckets) expect(Math.abs(b - n / 10)).toBeLessThan(n / 10 * 0.06)
  })

  it('int() is inclusive on both ends', () => {
    const r = new SeededRNG('ints')
    const seen = new Set<number>()
    for (let i = 0; i < 2000; i++) seen.add(r.int(3, 7))
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7])
  })

  it('rejects invalid ranges', () => {
    expect(() => new SeededRNG('x').int(5, 2)).toThrow()
    expect(() => new SeededRNG('x').int(1.5, 2)).toThrow()
  })

  it('shuffle is a permutation and sample is distinct', () => {
    const r = new SeededRNG('perm')
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(r.shuffle(items).sort()).toEqual(items)
    const s = r.sample(items, 5)
    expect(new Set(s).size).toBe(5)
  })

  it('weighted respects weights', () => {
    const r = new SeededRNG('w')
    let a = 0
    for (let i = 0; i < 10_000; i++) if (r.weighted(['a', 'b'], [3, 1]) === 'a') a++
    expect(a / 10_000).toBeGreaterThan(0.72)
    expect(a / 10_000).toBeLessThan(0.78)
  })

  it('fork produces independent but reproducible streams', () => {
    const f1 = new SeededRNG('root').fork(1)
    const f2 = new SeededRNG('root').fork(1)
    const f3 = new SeededRNG('root').fork(2)
    expect(f1.next()).toBe(f2.next())
    expect(new SeededRNG('root').fork(1).next()).not.toBe(f3.next())
  })

  it('normal() has roughly the right mean and sd', () => {
    const r = new SeededRNG('normal')
    const xs = Array.from({ length: 20_000 }, () => r.normal(5, 2))
    const m = xs.reduce((s, x) => s + x, 0) / xs.length
    const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length
    expect(Math.abs(m - 5)).toBeLessThan(0.06)
    expect(Math.abs(Math.sqrt(v) - 2)).toBeLessThan(0.06)
  })

  it('randomSeed has the shareable shape', () => {
    expect(randomSeed()).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/)
  })
})
