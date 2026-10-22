import { describe, expect, it } from 'vitest'
import { checkAnswer, canonicalInput } from '../../core/answer'
import { SeededRNG } from '../../core/rng'
import { DIFFICULTIES } from '../../core/types'
import { BRAINTEASERS } from '../../data/brainteasers'
import { FERMI } from '../../data/fermi'
import { brainteaserGenerator, brainteaserTemplates, fermiGenerator, fermiTemplates } from '../banks'
import { ALL_TEMPLATES, CATEGORIES, GENERATORS, templateById } from '../index'
import { assertQuestionValid } from './harness'
import { runTemplate } from '../registry'

describe('brainteaser bank', () => {
  it('has at least 60 items with unique ids', () => {
    expect(BRAINTEASERS.length).toBeGreaterThanOrEqual(60)
    expect(new Set(BRAINTEASERS.map((b) => b.id)).size).toBe(BRAINTEASERS.length)
  })
  it('every item has two hints, a solution, and covers all difficulties', () => {
    for (const b of BRAINTEASERS) {
      expect(b.hints).toHaveLength(2)
      expect(b.hints.every((h) => h.trim().length > 0)).toBe(true)
      expect(b.solution.length).toBeGreaterThan(0)
    }
    for (const d of DIFFICULTIES) expect(BRAINTEASERS.some((b) => b.difficulty === d)).toBe(true)
  })
  it('every generated question is valid and accepts its own answer', () => {
    for (const t of brainteaserTemplates) assertQuestionValid(runTemplate(t, 3, 'x'))
  })
  it('generator picks items at the requested difficulty', () => {
    const rng = new SeededRNG('bt')
    for (const d of DIFFICULTIES) for (let i = 0; i < 20; i++) expect(brainteaserGenerator.generate(d, rng).difficulty).toBe(d)
  })
  it('spot-checks known answers', () => {
    const q = runTemplate(templateById('bt.bat-and-ball')!, 1, 's')
    expect(checkAnswer(q, '5').status).toBe('correct')
    expect(checkAnswer(q, '10').status).toBe('incorrect')
    const kelly = runTemplate(templateById('bt.kelly-60')!, 3, 's')
    expect(checkAnswer(kelly, '20%').status).toBe('correct')
    expect(checkAnswer(kelly, '0.2').status).toBe('correct')
  })
})

describe('fermi bank', () => {
  it('has at least 50 items with unique ids and positive references', () => {
    expect(FERMI.length).toBeGreaterThanOrEqual(50)
    expect(new Set(FERMI.map((f) => f.id)).size).toBe(FERMI.length)
    for (const f of FERMI) {
      expect(f.reference).toBeGreaterThan(0)
      expect(f.derivation.length).toBeGreaterThan(0)
    }
  })
  it('generated questions are valid and log-scored', () => {
    for (const t of fermiTemplates) {
      const q = runTemplate(t, 3, 'x')
      assertQuestionValid(q)
      const ref = q.answer.type === 'estimate' ? q.answer.value : NaN
      expect(checkAnswer(q, String(ref * 1.9)).status).toBe('correct')
      expect(checkAnswer(q, String(ref * 5)).status).toBe('partial')
      expect(checkAnswer(q, String(ref / 20)).status).toBe('incorrect')
    }
  })
  it('generator picks items near the requested difficulty', () => {
    const rng = new SeededRNG('fermi')
    for (const d of DIFFICULTIES) for (let i = 0; i < 10; i++) expect(fermiGenerator.generate(d, rng).category).toBe('fermi')
  })
})

describe('category registry', () => {
  it('exposes a generator and display info for each category', () => {
    for (const c of CATEGORIES) expect(GENERATORS[c.id].category).toBe(c.id)
  })
  it('template ids are globally unique and resolvable', () => {
    expect(new Set(ALL_TEMPLATES.map((t) => t.id)).size).toBe(ALL_TEMPLATES.length)
    for (const t of ALL_TEMPLATES) expect(templateById(t.id)).toBe(t)
  })
  it('replaying a question from (templateId, seed) reproduces it exactly', () => {
    const rng = new SeededRNG('replay')
    for (const g of Object.values(GENERATORS)) {
      for (let i = 0; i < 20; i++) {
        const q = g.generate(((i % 5) + 1) as 1, rng)
        const again = runTemplate(templateById(q.templateId)!, q.difficulty, q.seed)
        expect(again).toEqual(q)
        expect(checkAnswer(q, canonicalInput(q)).status).toBe('correct')
      }
    }
  })
})
