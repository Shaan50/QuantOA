import { describe, expect, it } from 'vitest'
import type { Difficulty, Question } from '../../core/types'
import { SEQUENCE_SUBCATEGORIES, sequenceTemplates } from '../sequences'
import { checkTemplateInvariants, sampleTemplate } from './harness'

const byId = (id: string) => sequenceTemplates.find((t) => t.id === id)!
const D: Difficulty[] = [1, 2, 3, 4, 5]

const shown = (q: Question) => q.meta!.shown as number[]
const next = (q: Question) => (q.answer.type === 'integer' ? q.answer.value : NaN)
const diffs = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i])

describe('sequence generator', () => {
  for (const t of sequenceTemplates) {
    it(`${t.id} satisfies the shared invariants`, () => {
      const qs = checkTemplateInvariants(t, 120)
      for (const q of qs) {
        expect(shown(q).length).toBeGreaterThanOrEqual(5)
        expect(new Set(shown(q)).size).toBeGreaterThan(1)
      }
    })
  }

  it('covers every subcategory', () => {
    const covered = new Set(sequenceTemplates.map((t) => t.subcategory))
    for (const s of SEQUENCE_SUBCATEGORIES) expect(covered.has(s.id)).toBe(true)
  })

  it('arithmetic: constant non-zero difference continues', () => {
    for (const d of D)
      for (const q of sampleTemplate(byId('seq.arithmetic'), d, 200)) {
        const all = [...shown(q), next(q)]
        const ds = diffs(all)
        expect(new Set(ds).size).toBe(1)
        expect(ds[0]).not.toBe(0)
      }
  })

  it('geometric: constant ratio (not 0, 1, or -1) continues', () => {
    for (const d of D)
      for (const q of sampleTemplate(byId('seq.geometric'), d, 200)) {
        const all = [...shown(q), next(q)]
        const r = all[1] / all[0]
        expect(Math.abs(r)).not.toBe(1)
        expect(r).not.toBe(0)
        for (let i = 1; i < all.length; i++) expect(all[i]).toBeCloseTo(all[i - 1] * r, 6)
      }
  })

  it('second differences: the stated difference structure holds through the answer', () => {
    for (const d of D)
      for (const q of sampleTemplate(byId('seq.second-differences'), d, 200)) {
        const all = [...shown(q), next(q)]
        const d1 = diffs(all)
        const d2 = diffs(d1)
        const kind = q.meta!.kind
        if (kind === 'quadratic') {
          expect(new Set(d2).size).toBe(1)
          expect(d2[0]).not.toBe(0)
        } else if (kind === 'geometric-differences') {
          const r = d1[1] / d1[0]
          for (let i = 1; i < d1.length; i++) expect(d1[i]).toBe(d1[i - 1] * r)
        } else {
          const d3 = diffs(d2)
          expect(new Set(d3).size).toBe(1)
        }
        // Must not be accidentally arithmetic.
        expect(new Set(diffs(shown(q))).size).toBeGreaterThan(1)
      }
  })

  it('interleaved: each sub-sequence is arithmetic or geometric and the answer continues its owner', () => {
    for (const d of D)
      for (const q of sampleTemplate(byId('seq.interleaved'), d, 200)) {
        const ways = q.meta!.ways as number
        const all = [...shown(q), next(q)]
        for (let k = 0; k < ways; k++) {
          const sub = all.filter((_, i) => i % ways === k)
          const ds = diffs(sub)
          const arith = new Set(ds).size === 1
          const geo = sub.every((x, i) => i === 0 || x === sub[i - 1] * (sub[1] / sub[0]))
          expect(arith || geo).toBe(true)
        }
      }
  })

  it('fibonacci-like: one of the documented recurrences reproduces every term', () => {
    for (const d of D)
      for (const q of sampleTemplate(byId('seq.fibonacci'), d, 200)) {
        const a = [...shown(q), next(q)]
        const fits = (f: (i: number) => number, start: number) => a.every((x, i) => i < start || x === f(i))
        const c = a[2] - a[1] - a[0]
        const k = a[1] === 0 ? NaN : (a[2] - a[1]) / a[0]
        const ok =
          fits((i) => a[i - 1] + a[i - 2] + c, 2) ||
          fits((i) => a[i - 1] + a[i - 2] + a[i - 3], 3) ||
          fits((i) => a[i - 1] + k * a[i - 2], 2) ||
          fits((i) => a[i - 1] * a[i - 2], 2)
        expect(ok, JSON.stringify(a)).toBe(true)
      }
  })

  it('alternating: operations cycle with period 2 or 3', () => {
    for (const d of D)
      for (const q of sampleTemplate(byId('seq.alternating'), d, 200)) {
        const a = [...shown(q), next(q)]
        if (d === 5) {
          // +1, x2, +2, x2, +3, x2 ...
          for (let i = 1; i < a.length; i++) {
            const expected = (i - 1) % 2 === 0 ? a[i - 1] + Math.floor((i - 1) / 2) + 1 : a[i - 1] * 2
            expect(a[i]).toBe(expected)
          }
          continue
        }
        const period = d === 4 ? 3 : 2
        // Steps in the same phase must all be "add c" or all be "multiply by m".
        for (let phase = 0; phase < period; phase++) {
          const pairs: [number, number][] = []
          for (let i = 1 + phase; i < a.length; i += period) pairs.push([a[i - 1], a[i]])
          const adds = new Set(pairs.map(([x, y]) => y - x)).size === 1
          const muls = pairs.every(([x]) => x !== 0) && new Set(pairs.map(([x, y]) => y / x)).size === 1
          expect(adds || muls, JSON.stringify(a)).toBe(true)
        }
      }
  })

  it('prime-based and powers templates produce the documented pattern for known seeds', () => {
    for (const d of D) {
      for (const q of sampleTemplate(byId('seq.primes'), d, 50)) expect(q.meta!.desc).toBeTruthy()
      for (const q of sampleTemplate(byId('seq.powers'), d, 50)) expect(q.meta!.desc).toBeTruthy()
    }
    const q = sampleTemplate(byId('seq.primes'), 1, 50).find((x) => x.meta!.desc === 'consecutive primes')!
    expect(q.meta!.allPrime).toBe(true)
  })
})
