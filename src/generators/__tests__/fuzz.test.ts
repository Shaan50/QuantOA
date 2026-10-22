/**
 * Fuzz: every template, every difficulty, thousands of seeds. Generators must
 * never throw, must never emit NaN/Infinity, and the checker must accept the
 * canonical answer. (The heavier rendering checks live in the per-category
 * suites with fewer seeds.)
 */
import { describe, expect, it } from 'vitest'
import { canonicalInput, checkAnswer } from '../../core/answer'
import { DIFFICULTIES } from '../../core/types'
import { ALL_TEMPLATES } from '../index'
import { runTemplate } from '../registry'

const SEEDS = 1500

describe('generator fuzz', () => {
  for (const t of ALL_TEMPLATES.filter((x) => !x.id.startsWith('bt.') && !x.id.startsWith('fermi.'))) {
    it(`${t.id}: ${SEEDS} seeds x 5 difficulties`, () => {
      for (const d of DIFFICULTIES) {
        for (let i = 0; i < SEEDS; i++) {
          const seed = `fuzz-${d}-${i}`
          let q
          try {
            q = runTemplate(t, d, seed)
          } catch (e) {
            throw new Error(`${t.id} d${d} seed=${seed} threw: ${(e as Error).message}`)
          }
          expect(q.prompt).not.toMatch(/NaN|Infinity|undefined/)
          const a = q.answer
          if (a.type === 'integer' || a.type === 'decimal' || a.type === 'estimate') expect(Number.isFinite(a.value)).toBe(true)
          if (a.type === 'multiple-choice') expect(new Set(a.choices).size).toBe(a.choices.length)
          const r = checkAnswer(q, canonicalInput(q))
          if (r.status !== 'correct') throw new Error(`${t.id} d${d} seed=${seed}: canonical rejected`)
        }
      }
    }, 120_000)
  }
})
