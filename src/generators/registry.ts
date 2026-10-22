import { SeededRNG } from '../core/rng'
import type {
  CategoryId,
  Difficulty,
  GenerateOptions,
  Question,
  QuestionGenerator,
  QuestionTemplate,
  SubcategoryInfo,
} from '../core/types'

function clampDifficulty(t: QuestionTemplate, d: Difficulty): Difficulty {
  const lo = t.minDifficulty ?? 1
  const hi = t.maxDifficulty ?? 5
  return Math.max(lo, Math.min(hi, d)) as Difficulty
}

/** Run one template with a dedicated RNG so the question can be replayed from (templateId, seed). */
export function runTemplate(t: QuestionTemplate, difficulty: Difficulty, seed: string): Question {
  const d = clampDifficulty(t, difficulty)
  const rng = new SeededRNG(seed)
  const draft = t.generate(d, rng)
  return {
    ...draft,
    id: `${t.id}#${seed}`,
    templateId: t.id,
    seed,
    category: t.category,
    subcategory: t.subcategory,
    difficulty: d,
    answerType: draft.answer.type,
  }
}

export function makeGenerator(
  category: CategoryId,
  label: string,
  subcategories: readonly SubcategoryInfo[],
  templates: readonly QuestionTemplate[],
): QuestionGenerator {
  return {
    category,
    label,
    subcategories,
    templates,
    generate(difficulty: Difficulty, rng: SeededRNG, opts: GenerateOptions = {}): Question {
      let pool = templates
      if (opts.templateId) pool = templates.filter((t) => t.id === opts.templateId)
      else if (opts.subcategories?.length) pool = templates.filter((t) => opts.subcategories!.includes(t.subcategory))
      if (pool.length === 0) throw new Error(`No templates in ${category} for ${JSON.stringify(opts)}`)
      // Prefer templates whose range covers the difficulty; fall back to clamping.
      const fitting = pool.filter((t) => (t.minDifficulty ?? 1) <= difficulty && difficulty <= (t.maxDifficulty ?? 5))
      const candidates = fitting.length ? fitting : pool
      const t = rng.weighted(
        candidates,
        candidates.map((c) => c.weight ?? 1),
      )
      return runTemplate(t, difficulty, `${rng.seed}/${t.id}/${rng.int(0, 1e9)}`)
    },
  }
}
