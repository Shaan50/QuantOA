/** Category registry: one QuestionGenerator per category plus display metadata. */
import type { CategoryId, CategoryInfo, QuestionGenerator, QuestionTemplate } from '../core/types'
import { arbitrageGenerator } from './arbitrage'
import { brainteaserGenerator, fermiGenerator } from './banks'
import { mentalMathGenerator } from './mentalMath'
import { probabilityGenerator } from './probability'
import { sequencesGenerator } from './sequences'

export const GENERATORS: Record<CategoryId, QuestionGenerator> = {
  'mental-math': mentalMathGenerator,
  sequences: sequencesGenerator,
  probability: probabilityGenerator,
  arbitrage: arbitrageGenerator,
  brainteasers: brainteaserGenerator,
  fermi: fermiGenerator,
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'mental-math', label: 'Mental Math', short: 'Math', description: 'Arithmetic, decimals, fractions, powers and percentages — fast, no calculator.', accent: 'sky' },
  { id: 'sequences', label: 'Sequences', short: 'Seq', description: 'Find the next term: arithmetic, geometric, interleaved, Fibonacci-like and prime patterns.', accent: 'violet' },
  { id: 'probability', label: 'Probability & EV', short: 'Prob', description: 'Dice, cards, urns, Bayes, stopping problems, fair prices and variance — exact answers.', accent: 'emerald' },
  { id: 'arbitrage', label: 'Arbitrage', short: 'Arb', description: 'Triangular FX, Dutch books, put–call parity, crossed venues and forwards.', accent: 'amber' },
  { id: 'brainteasers', label: 'Brainteasers', short: 'Teaser', description: 'Curated interview classics with progressive hints.', accent: 'rose' },
  { id: 'fermi', label: 'Fermi Estimation', short: 'Fermi', description: 'Order-of-magnitude estimates scored on a log scale.', accent: 'cyan' },
]

export const CATEGORY_BY_ID: Record<CategoryId, CategoryInfo> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<CategoryId, CategoryInfo>

export const ALL_TEMPLATES: QuestionTemplate[] = Object.values(GENERATORS).flatMap((g) => g.templates)

const TEMPLATE_BY_ID = new Map(ALL_TEMPLATES.map((t) => [t.id, t]))

export function templateById(id: string): QuestionTemplate | undefined {
  return TEMPLATE_BY_ID.get(id)
}

export function subcategoryLabel(category: CategoryId, sub: string): string {
  return GENERATORS[category].subcategories.find((s) => s.id === sub)?.label ?? sub
}

/** Categories that are procedurally generated (infinite supply). */
export const PROCEDURAL: CategoryId[] = ['mental-math', 'sequences', 'probability', 'arbitrage']
