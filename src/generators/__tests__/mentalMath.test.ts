import { describe, expect, it } from 'vitest'
import { Fraction } from '../../core/fraction'
import { SeededRNG } from '../../core/rng'
import type { Difficulty, Question } from '../../core/types'
import { MENTAL_MATH_SUBCATEGORIES, mentalMathGenerator, mentalMathTemplates, nearestChoices } from '../mentalMath'
import { checkTemplateInvariants, sampleTemplate } from './harness'
import { evalLatex } from './latexEval'

const byId = (id: string) => mentalMathTemplates.find((t) => t.id === id)!

function numericAnswer(q: Question): number {
  const a = q.answer
  if (a.type === 'integer' || a.type === 'decimal') return a.value
  if (a.type === 'fraction') return new Fraction(BigInt(a.num), BigInt(a.den)).toNumber()
  throw new Error('not numeric')
}

function promptMath(q: Question): string {
  const m = /\$\$([\s\S]*?)\$\$/.exec(q.prompt)
  if (!m) throw new Error(`no display math in ${q.prompt}`)
  return m[1]
}

describe('mental math generator', () => {
  for (const t of mentalMathTemplates) {
    it(`${t.id} satisfies the shared invariants`, () => {
      checkTemplateInvariants(t, 120)
    })
  }

  it('covers every subcategory', () => {
    const covered = new Set(mentalMathTemplates.map((t) => t.subcategory))
    for (const s of MENTAL_MATH_SUBCATEGORIES) expect(covered.has(s.id)).toBe(true)
  })

  it('generator respects subcategory filters', () => {
    const rng = new SeededRNG('filter')
    for (let i = 0; i < 50; i++) {
      const q = mentalMathGenerator.generate(3, rng, { subcategories: ['division'] })
      expect(q.subcategory).toBe('division')
    }
  })

  for (const id of ['mm.add-sub', 'mm.multiplication', 'mm.division', 'mm.decimals', 'mm.expressions']) {
    it(`${id}: answer equals independent evaluation of the prompt`, () => {
      for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
        for (const q of sampleTemplate(byId(id), d, 200)) {
          const v = evalLatex(promptMath(q))
          expect(numericAnswer(q)).toBeCloseTo(v, 9)
        }
      }
    })
  }

  it('mm.powers-roots: answers match direct computation', () => {
    for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
      for (const q of sampleTemplate(byId('mm.powers-roots'), d, 200)) {
        const v = evalLatex(promptMath(q))
        if (q.answer.type === 'decimal' && q.answer.tolerance.abs! > 0.01) {
          expect(Math.abs(q.answer.value - v)).toBeLessThanOrEqual(0.05 + 1e-9)
        } else {
          expect(numericAnswer(q)).toBeCloseTo(v, 9)
        }
      }
    }
  })

  it('difficulty scales digit counts for multiplication', () => {
    const size = (d: Difficulty) =>
      sampleTemplate(byId('mm.multiplication'), d, 100).reduce((s, q) => s + Math.log10(numericAnswer(q)), 0) / 100
    expect(size(1)).toBeLessThan(size(2))
    expect(size(2)).toBeLessThan(size(3))
    expect(size(3)).toBeLessThan(size(4))
    expect(size(4)).toBeLessThan(size(5))
  })

  it('mm.division never divides by zero and quotients are exact', () => {
    for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
      for (const q of sampleTemplate(byId('mm.division'), d, 200)) {
        const [a, b] = promptMath(q).replace(/\{,\}/g, '').split('\\div').map(Number)
        expect(b).not.toBe(0)
        expect(Fraction.from(a).div(Fraction.from(b)).toNumber()).toBeCloseTo(numericAnswer(q), 12)
      }
    }
  })

  it('mm.conversions: answers agree with the fraction in the prompt', () => {
    for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
      for (const q of sampleTemplate(byId('mm.conversions'), d, 200)) {
        const fracM = /\\frac\{(\d+)\}\{(\d+)\}/.exec(q.prompt)
        const decM = /Write \$([\d.]+)(\\%)?\$ as a fraction/.exec(q.prompt)
        const target = numericAnswer(q)
        if (fracM) {
          const v = Number(fracM[1]) / Number(fracM[2])
          expect(target).toBeCloseTo(q.percentUnits ? v * 100 : v, 9)
        } else {
          expect(decM).not.toBeNull()
          const v = Number(decM![1]) / (decM![2] ? 100 : 1)
          expect(target).toBeCloseTo(v, 12)
        }
      }
    }
  })

  it('mm.percentages: recomputes every phrasing', () => {
    const num = (s: string) => Number(s.replace(/\{,\}/g, ''))
    for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
      for (const q of sampleTemplate(byId('mm.percentages'), d, 200)) {
        const p = q.prompt
        const ans = numericAnswer(q)
        let m: RegExpExecArray | null
        if ((m = /What is \$([\d.]+)\\%\$ of \$([\d{},]+)\$/.exec(p))) {
          const v = (Number(m[1]) * num(m[2])) / 100
          expect(Math.abs(ans - v)).toBeLessThanOrEqual(q.answer.type === 'decimal' ? q.answer.tolerance.abs ?? 1e-9 : 1e-9)
        } else if ((m = /from \$([\d{},]+)\$ to \$([\d{},.]+)\$/.exec(p))) {
          const v = ((num(m[2]) - num(m[1])) / num(m[1])) * 100
          expect(Math.abs(ans - v)).toBeLessThanOrEqual(0.05 + 1e-9)
        } else if ((m = /After a \$([\d.]+)\\%\$ (increase|decrease), a price is \$([\d{},.]+)\$/.exec(p))) {
          const f = 1 + (m[2] === 'increase' ? 1 : -1) * (Number(m[1]) / 100)
          expect(ans).toBeCloseTo(num(m[3]) / f, 6)
        } else if ((m = /rises \$(\d+)\\%\$, then falls \$(\d+)\\%\$/.exec(p))) {
          expect(ans).toBeCloseTo(((1 + Number(m[1]) / 100) * (1 - Number(m[2]) / 100) - 1) * 100, 9)
        } else if ((m = /\$([\d{},]+)\$ is what percent of \$([\d{},]+)\$/.exec(p))) {
          expect(ans).toBeCloseTo((num(m[1]) / num(m[2])) * 100, 9)
        } else if ((m = /grows \$(\d+)\\%\$ per year, compounded annually, for (\d) years/.exec(p))) {
          expect(Math.abs(ans - ((1 + Number(m[1]) / 100) ** Number(m[2]) - 1) * 100)).toBeLessThanOrEqual(0.05 + 1e-9)
        } else {
          throw new Error(`unrecognized percentage prompt: ${p}`)
        }
      }
    }
  })

  it('mm.nearest: the correct option is uniquely the closest to the true value', () => {
    for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
      for (const q of sampleTemplate(byId('mm.nearest'), d, 300)) {
        const a = q.answer
        if (a.type !== 'multiple-choice') throw new Error('expected MC')
        const value = q.meta!.value as number
        const exprM = /closest to \$(.*)\$\?/.exec(q.prompt)!
        expect(evalLatex(exprM[1])).toBeCloseTo(value, 6)
        const dists = a.choices.map((c) => Math.abs(Number(c.replace(/,/g, '')) - value))
        const best = dists[a.correctIndex]
        dists.forEach((dd, i) => {
          if (i !== a.correctIndex) expect(dd).toBeGreaterThan(best * 1.5)
        })
        // Options are displayed in ascending order.
        const vals = a.choices.map((c) => Number(c.replace(/,/g, '')))
        expect([...vals].sort((a, b) => a - b)).toEqual(vals)
      }
    }
  })

  it('nearestChoices never produces duplicates', () => {
    const rng = new SeededRNG('nc')
    for (let i = 0; i < 2000; i++) {
      const v = rng.float(0.5, 50000)
      const { choices, correct } = nearestChoices(rng, v, rng.pick([0.05, 0.07, 0.15]))
      expect(new Set([...choices, correct]).size).toBe(5)
    }
  })
})
