/**
 * Shared invariants every generated question must satisfy. Each generator's
 * test file calls `checkTemplateInvariants` across all difficulties and many
 * seeds, then adds its own independent correctness checks.
 */
import katex from 'katex'
import { expect } from 'vitest'
import { canonicalInput, checkAnswer, formatAnswer, normalizeInput } from '../../core/answer'
import { splitMath } from '../../core/mathText'
import { DIFFICULTIES, type Difficulty, type Question, type QuestionTemplate } from '../../core/types'
import { runTemplate } from '../registry'

const BAD_TEXT = /NaN|undefined|Infinity|\[object|null/

export function assertRenderable(text: string, where: string): void {
  expect(text, where).not.toMatch(BAD_TEXT)
  // Escaped dollars are literal; any other $ outside math means unbalanced delimiters.
  for (const seg of splitMath(text.replace(/\\\$/g, 'USD'))) {
    if (seg.kind === 'text') {
      expect(seg.value.includes('$'), `stray $ in ${where}: ${text}`).toBe(false)
      continue
    }
    try {
      katex.renderToString(seg.value, { throwOnError: true, displayMode: seg.kind === 'display' })
    } catch (e) {
      throw new Error(`KaTeX failed in ${where}: "${seg.value}" — ${(e as Error).message}`)
    }
  }
}

export function assertQuestionValid(q: Question): void {
  const where = `${q.templateId} d${q.difficulty} seed=${q.seed}`
  expect(q.prompt.trim().length, where).toBeGreaterThan(0)
  expect(q.explanation.length, where).toBeGreaterThan(0)
  expect(q.expectedSeconds, where).toBeGreaterThan(0)
  expect(q.answerType, where).toBe(q.answer.type)
  assertRenderable(q.prompt, `${where} prompt`)
  q.explanation.forEach((s, i) => assertRenderable(s, `${where} explanation[${i}]`))
  q.hints?.forEach((s, i) => assertRenderable(s, `${where} hint[${i}]`))

  const a = q.answer
  switch (a.type) {
    case 'integer':
      expect(Number.isSafeInteger(a.value), where).toBe(true)
      break
    case 'decimal':
      expect(Number.isFinite(a.value), where).toBe(true)
      break
    case 'fraction':
      expect(BigInt(a.den) > 0n, where).toBe(true)
      break
    case 'multiple-choice': {
      expect(a.choices.length, where).toBeGreaterThanOrEqual(2)
      expect(a.choices.length, where).toBeLessThanOrEqual(6)
      expect(a.correctIndex, where).toBeGreaterThanOrEqual(0)
      expect(a.correctIndex, where).toBeLessThan(a.choices.length)
      const norm = a.choices.map((c) => normalizeInput(c).toLowerCase())
      expect(new Set(norm).size, `${where} duplicate choices ${JSON.stringify(a.choices)}`).toBe(a.choices.length)
      a.choices.forEach((c, i) => assertRenderable(c, `${where} choice[${i}]`))
      break
    }
    case 'estimate':
      expect(a.value, where).toBeGreaterThan(0)
  }
  // The canonical answer must be accepted by the checker.
  const res = checkAnswer(q, canonicalInput(q))
  expect(res.status, `${where} canonical "${canonicalInput(q)}" rejected`).toBe('correct')
  expect(formatAnswer(q).length).toBeGreaterThan(0)
}

/** Generate `n` questions per difficulty for a template and validate them all. */
export function checkTemplateInvariants(t: QuestionTemplate, n = 150): Question[] {
  const out: Question[] = []
  for (const d of DIFFICULTIES) {
    for (let i = 0; i < n; i++) {
      const seed = `${t.id}-inv-${d}-${i}`
      const q = runTemplate(t, d as Difficulty, seed)
      assertQuestionValid(q)
      out.push(q)
    }
  }
  // Determinism: the same seed reproduces the same question.
  const a = runTemplate(t, 3, 'determinism')
  const b = runTemplate(t, 3, 'determinism')
  expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  return out
}

/** Generate questions for a template at a difficulty. */
export function sampleTemplate(t: QuestionTemplate, d: Difficulty, n: number, tag = 's'): Question[] {
  return Array.from({ length: n }, (_, i) => runTemplate(t, d, `${t.id}-${tag}-${d}-${i}`))
}
