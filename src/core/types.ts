import type { SeededRNG } from './rng'

export type Difficulty = 1 | 2 | 3 | 4 | 5
export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4, 5]

export type CategoryId = 'mental-math' | 'sequences' | 'probability' | 'arbitrage' | 'brainteasers' | 'fermi'

export type AnswerType = 'integer' | 'decimal' | 'fraction' | 'multiple-choice' | 'estimate'

/** Absolute and/or relative tolerance. A value passes if it satisfies either bound. */
export interface Tolerance {
  abs?: number
  rel?: number
}

/**
 * The canonical answer. Fractions store their numerator/denominator as strings
 * so a Question is plain JSON (it is persisted for review and results).
 */
export type Answer =
  | { type: 'integer'; value: number }
  | { type: 'decimal'; value: number; tolerance: Tolerance; /** digits to show */ display?: number }
  | {
      type: 'fraction'
      num: string
      den: string
      /** If set, the player must answer in this form (e.g. "convert 0.375 to a fraction"). */
      form?: 'fraction' | 'decimal'
    }
  | { type: 'multiple-choice'; choices: string[]; correctIndex: number }
  | { type: 'estimate'; value: number }

export interface Question {
  /** Stable identifier: templateId + seed. */
  id: string
  /** The template that produced this question; used to regenerate with new numbers. */
  templateId: string
  seed: string
  category: CategoryId
  subcategory: string
  difficulty: Difficulty
  /** Short title (used by curated banks). */
  title?: string
  /** Prompt text. Inline math with $...$, display math with $$...$$, literal dollar as \$. */
  prompt: string
  answerType: AnswerType
  answer: Answer
  /** Ordered solution steps; may contain LaTeX. */
  explanation: string[]
  /** Progressive hints (brainteasers). */
  hints?: string[]
  /** Seconds a strong candidate should need. */
  expectedSeconds: number
  /** Units shown around the answer box, e.g. { prefix: '$' } or { suffix: '%' }. */
  unit?: { prefix?: string; suffix?: string }
  /** When true, a typed "%" is ignored: the canonical value is already in percent units. */
  percentUnits?: boolean
  /** Placeholder for the answer box. */
  inputHint?: string
  /** Generator parameters, kept for validation (Monte Carlo tests) and debugging. */
  meta?: Record<string, unknown>
}

/** What a template returns; the registry fills in identity fields. */
export type QuestionDraft = Omit<
  Question,
  'id' | 'templateId' | 'seed' | 'category' | 'subcategory' | 'difficulty' | 'answerType'
>

export interface QuestionTemplate {
  id: string
  category: CategoryId
  subcategory: string
  /** Lowest difficulty this template makes sense at (default 1). */
  minDifficulty?: Difficulty
  /** Highest difficulty (default 5). Requests above are clamped. */
  maxDifficulty?: Difficulty
  /** Relative frequency inside its category. */
  weight?: number
  generate(difficulty: Difficulty, rng: SeededRNG): QuestionDraft
}

export interface SubcategoryInfo {
  id: string
  label: string
}

export interface GenerateOptions {
  subcategories?: readonly string[]
  templateId?: string
}

export interface QuestionGenerator {
  category: CategoryId
  label: string
  subcategories: readonly SubcategoryInfo[]
  templates: readonly QuestionTemplate[]
  generate(difficulty: Difficulty, rng: SeededRNG, opts?: GenerateOptions): Question
}

export interface CategoryInfo {
  id: CategoryId
  label: string
  short: string
  description: string
  /** Tailwind-friendly accent token name used across the UI. */
  accent: string
}
