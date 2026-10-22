import { describe, expect, it } from 'vitest'
import {
  canonicalInput,
  checkAnswer,
  estimateCredit,
  formatAnswer,
  formatNumber,
  parseChoice,
  parseNumber,
} from '../answer'
import type { Answer, Question } from '../types'

const q = (answer: Answer, extra: Partial<Question> = {}) => ({ answer, ...extra })
const frac = (num: number, den: number, form?: 'fraction' | 'decimal'): Answer => ({
  type: 'fraction',
  num: String(num),
  den: String(den),
  form,
})

describe('parseNumber', () => {
  it.each([
    ['42', 42],
    ['  -17 ', -17],
    ['+5', 5],
    ['1,234,567', 1234567],
    ['3.25', 3.25],
    ['.5', 0.5],
    ['3/8', 0.375],
    [' 3 / 8 ', 0.375],
    ['-3/8', -0.375],
    ['1 1/2', 1.5],
    ['37.5%', 0.375],
    ['37.5 %', 0.375],
    ['$1,200', 1200],
    ['2.5m', 2.5e6],
    ['3 billion', 3e9],
    ['40k', 40000],
    ['1e6', 1e6],
    ['2x10^6', 2e6],
    ['10^9', 1e9],
    ['−5', -5],
  ])('parses %j', (input, value) => {
    expect(parseNumber(input)!.value).toBeCloseTo(value, 9)
  })

  it.each(['', 'abc', '1/0', '3//4', '5%%', '1.2.3', '12 apples'])('rejects %j', (input) => {
    expect(parseNumber(input)).toBeNull()
  })

  it('keeps exact values', () => {
    expect(parseNumber('0.1')!.exact!.toString()).toBe('1/10')
    expect(parseNumber('12.5%')!.exact!.toString()).toBe('1/8')
  })

  it('respects percentUnits', () => {
    expect(parseNumber('12.5%', { percentUnits: true })!.value).toBe(12.5)
  })

  it('tracks decimals and significant figures', () => {
    const p = parseNumber('0.333')!
    expect(p.decimals).toBe(3)
    expect(p.sigFigs).toBe(3)
    expect(parseNumber('33.3%')!.decimals).toBe(3)
  })
})

describe('checkAnswer: integer', () => {
  it('accepts equivalent forms', () => {
    expect(checkAnswer(q({ type: 'integer', value: 12 }), '12').status).toBe('correct')
    expect(checkAnswer(q({ type: 'integer', value: 12 }), '12.0').status).toBe('correct')
    expect(checkAnswer(q({ type: 'integer', value: 12 }), '24/2').status).toBe('correct')
    expect(checkAnswer(q({ type: 'integer', value: 1200 }), '1,200').status).toBe('correct')
  })
  it('rejects wrong answers and flags garbage as invalid', () => {
    expect(checkAnswer(q({ type: 'integer', value: 12 }), '13').status).toBe('incorrect')
    expect(checkAnswer(q({ type: 'integer', value: 12 }), '12.01').status).toBe('incorrect')
    expect(checkAnswer(q({ type: 'integer', value: 12 }), 'twelve').status).toBe('invalid')
    expect(checkAnswer(q({ type: 'integer', value: 12 }), '   ').status).toBe('invalid')
  })
})

describe('checkAnswer: decimal', () => {
  const a: Answer = { type: 'decimal', value: 52.63, tolerance: { rel: 0.01 } }
  it('uses tolerance', () => {
    expect(checkAnswer(q(a), '52.6').status).toBe('correct')
    expect(checkAnswer(q(a), '53').status).toBe('correct')
    expect(checkAnswer(q(a), '54').status).toBe('incorrect')
  })
  it('absolute tolerance', () => {
    const b: Answer = { type: 'decimal', value: 3.16, tolerance: { abs: 0.05 } }
    expect(checkAnswer(q(b), '3.2').status).toBe('correct')
    expect(checkAnswer(q(b), '3.1').status).toBe('incorrect')
  })
  it('percent units', () => {
    const c: Answer = { type: 'decimal', value: 15, tolerance: { abs: 0.01 } }
    expect(checkAnswer(q(c, { percentUnits: true }), '15%').status).toBe('correct')
    expect(checkAnswer(q(c, { percentUnits: true }), '15').status).toBe('correct')
  })
})

describe('checkAnswer: fraction', () => {
  it('accepts fraction, decimal and percent forms', () => {
    for (const s of ['3/8', '6/16', '0.375', '.375', '37.5%', ' 3/ 8']) {
      expect(checkAnswer(q(frac(3, 8)), s).status).toBe('correct')
    }
  })
  it('accepts 3+ significant-figure approximations of repeating decimals', () => {
    expect(checkAnswer(q(frac(1, 3)), '0.333').status).toBe('correct')
    expect(checkAnswer(q(frac(1, 3)), '33.3%').status).toBe('correct')
    expect(checkAnswer(q(frac(2, 3)), '0.667').status).toBe('correct')
    expect(checkAnswer(q(frac(2, 3)), '0.666').status).toBe('correct')
    expect(checkAnswer(q(frac(1, 3)), '0.33').status).toBe('incorrect')
    expect(checkAnswer(q(frac(1, 3)), '0.334').status).toBe('incorrect')
    expect(checkAnswer(q(frac(25, 216)), '0.1157').status).toBe('correct')
  })
  it('does not accept approximations of terminating fractions', () => {
    expect(checkAnswer(q(frac(3, 8)), '0.37').status).toBe('incorrect')
    expect(checkAnswer(q(frac(3, 8)), '0.376').status).toBe('incorrect')
  })
  it('enforces a requested form', () => {
    expect(checkAnswer(q(frac(7, 16, 'fraction')), '0.4375').status).toBe('invalid')
    expect(checkAnswer(q(frac(7, 16, 'fraction')), '7/16').status).toBe('correct')
    expect(checkAnswer(q(frac(7, 16, 'decimal')), '7/16').status).toBe('invalid')
    expect(checkAnswer(q(frac(7, 16, 'decimal')), '0.4375').status).toBe('correct')
  })
  it('handles negative fractions and mixed numbers', () => {
    expect(checkAnswer(q(frac(-5, 4)), '-1.25').status).toBe('correct')
    expect(checkAnswer(q(frac(3, 2)), '1 1/2').status).toBe('correct')
  })
})

describe('checkAnswer: multiple choice', () => {
  const a: Answer = { type: 'multiple-choice', choices: ['No arbitrage', 'Buy A, sell B', '12.5'], correctIndex: 1 }
  it('accepts numbers, letters and text', () => {
    expect(checkAnswer(q(a), '2').status).toBe('correct')
    expect(checkAnswer(q(a), 'b').status).toBe('correct')
    expect(checkAnswer(q(a), 'B)').status).toBe('correct')
    expect(checkAnswer(q(a), 'buy a, sell b').status).toBe('correct')
    expect(checkAnswer(q(a), '1').status).toBe('incorrect')
    expect(checkAnswer(q(a), '9').status).toBe('invalid')
  })
  it('matches numeric option text', () => {
    expect(parseChoice('25/2', a.choices)).toBe(2)
  })
})

describe('checkAnswer: estimate (Fermi)', () => {
  const a: Answer = { type: 'estimate', value: 1_000_000 }
  it('gives full credit within 2x', () => {
    expect(checkAnswer(q(a), '600k').status).toBe('correct')
    expect(checkAnswer(q(a), '2 million').status).toBe('correct')
  })
  it('gives partial credit within 10x', () => {
    const r = checkAnswer(q(a), '5m')
    expect(r.status).toBe('partial')
    expect(r.credit).toBeGreaterThan(0)
    expect(r.credit).toBeLessThan(0.5)
  })
  it('gives zero beyond 10x', () => {
    expect(checkAnswer(q(a), '20m').status).toBe('incorrect')
    expect(checkAnswer(q(a), '-5').status).toBe('invalid')
  })
  it('estimateCredit is symmetric in log space and monotone', () => {
    expect(estimateCredit(4, 1)).toBeCloseTo(estimateCredit(0.25, 1), 12)
    expect(estimateCredit(3, 1)).toBeGreaterThan(estimateCredit(5, 1))
    expect(estimateCredit(2, 1)).toBe(1)
    expect(estimateCredit(10, 1)).toBe(0)
  })
})

describe('formatting', () => {
  it('formatNumber', () => {
    expect(formatNumber(1234567.5)).toBe('1,234,567.5')
    expect(formatNumber(-0.25)).toBe('-0.25')
    expect(formatNumber(3)).toBe('3')
  })
  it('formatAnswer and canonicalInput round-trip', () => {
    const answers: Answer[] = [
      { type: 'integer', value: -42 },
      { type: 'decimal', value: 3.14, tolerance: { abs: 0.01 } },
      frac(1, 3),
      frac(7, 16, 'decimal'),
      frac(7, 16, 'fraction'),
      { type: 'multiple-choice', choices: ['a', 'b'], correctIndex: 1 },
      { type: 'estimate', value: 2.5e6 },
    ]
    for (const a of answers) {
      expect(checkAnswer(q(a), canonicalInput(q(a))).status).toBe('correct')
      expect(formatAnswer(q(a)).length).toBeGreaterThan(0)
    }
    expect(formatAnswer(q({ type: 'integer', value: -5 }, { unit: { prefix: '$' } }))).toBe('-$5')
  })
})
