/**
 * Generators backed by the curated brainteaser and Fermi banks. Each bank item
 * is its own template pinned to its difficulty, so the shared registry handles
 * selection, filtering and replay exactly like the procedural generators.
 */
import { formatMagnitude } from '../core/answer'
import type { QuestionTemplate } from '../core/types'
import { BRAINTEASERS } from '../data/brainteasers'
import { FERMI } from '../data/fermi'
import { estimateAnswer } from './helpers'
import { makeGenerator } from './registry'

export const BRAINTEASER_SUBCATEGORIES = [
  { id: 'probability', label: 'Probability' },
  { id: 'logic', label: 'Logic' },
  { id: 'counting', label: 'Counting' },
  { id: 'number', label: 'Number sense' },
  { id: 'strategy', label: 'Strategy & games' },
] as const

export const FERMI_SUBCATEGORIES = [
  { id: 'everyday', label: 'Everyday life' },
  { id: 'business', label: 'Business & population' },
  { id: 'science', label: 'Science & nature' },
  { id: 'markets', label: 'Markets & energy' },
] as const

export const brainteaserTemplates: QuestionTemplate[] = BRAINTEASERS.map((b) => ({
  id: `bt.${b.id}`,
  category: 'brainteasers',
  subcategory: b.topic,
  minDifficulty: b.difficulty,
  maxDifficulty: b.difficulty,
  generate: () => ({
    title: b.title,
    prompt: b.prompt,
    answer: b.answer,
    hints: [...b.hints],
    explanation: [...b.solution],
    expectedSeconds: 45 + 30 * b.difficulty,
    unit: b.unit,
    percentUnits: b.percentUnits,
    inputHint: b.answer.type === 'fraction' ? 'Fraction or decimal' : undefined,
  }),
}))

export const fermiTemplates: QuestionTemplate[] = FERMI.map((f) => ({
  id: `fermi.${f.id}`,
  category: 'fermi',
  subcategory: f.topic,
  minDifficulty: f.difficulty,
  maxDifficulty: f.difficulty,
  generate: () => ({
    prompt: f.prompt,
    answer: estimateAnswer(f.reference),
    explanation: [...f.derivation, `Reference answer: $\\approx$ ${formatMagnitude(f.reference)} ${f.unit}`],
    expectedSeconds: 60 + 15 * f.difficulty,
    unit: { suffix: ` ${f.unit}` },
    inputHint: 'Estimate — e.g. 2.5m, 40k, 3e9',
  }),
}))

export const brainteaserGenerator = makeGenerator('brainteasers', 'Brainteasers', BRAINTEASER_SUBCATEGORIES, brainteaserTemplates)
export const fermiGenerator = makeGenerator('fermi', 'Fermi Estimation', FERMI_SUBCATEGORIES, fermiTemplates)
