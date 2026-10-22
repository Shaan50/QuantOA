/**
 * Mode presets: build a SessionConfig for each game mode from user options
 * and settings. Also handles encoding configs into shareable links.
 */
import { randomSeed, SeededRNG } from '../core/rng'
import { GENERATORS } from '../generators'
import type { CategoryId, Difficulty } from '../core/types'
import { DAILY_PLAN, dailySeed } from './daily'
import { DEFAULT_MARKING } from './scoring'
import type { ReviewItem } from './review'
import type { CategoryFilter, DifficultySetting, ModeId, SessionConfig } from './session'
import type { Settings } from './settings'

export interface ModeInfo {
  id: ModeId | 'market'
  label: string
  tagline: string
  description: string
  hotkey: string
}

export const MODES: ModeInfo[] = [
  { id: 'oa', label: 'OA Simulation', tagline: '80 questions · 8 minutes', description: 'The classic mental-math sprint with negative marking — or chain a full multi-section OA.', hotkey: '1' },
  { id: 'sprint', label: 'Sprint', tagline: '60 · 120 · 300 seconds', description: 'As many correct answers as you can before the clock hits zero.', hotkey: '2' },
  { id: 'survival', label: 'Survival', tagline: '3 lives · rising difficulty', description: 'Difficulty climbs every 5 correct answers. Three mistakes and you are out.', hotkey: '3' },
  { id: 'drill', label: 'Focus Drill', tagline: 'Pick topics & difficulty', description: 'Target specific categories and subcategories, untimed or with a per-question clock.', hotkey: '4' },
  { id: 'zen', label: 'Zen / Learn', tagline: 'Untimed · full solutions', description: 'No clock. A worked explanation after every question.', hotkey: '5' },
  { id: 'daily', label: 'Daily Challenge', tagline: '20 questions · same for everyone', description: 'A date-seeded mixed set. Keep your streak alive.', hotkey: '6' },
  { id: 'review', label: 'Review Mistakes', tagline: 'Spaced repetition', description: 'Questions you missed come back with fresh numbers until you master them.', hotkey: '7' },
  { id: 'market', label: 'Market Making', tagline: 'Quote · trade · manage risk', description: 'Make two-sided markets on hidden quantities against informed and noise traders.', hotkey: '8' },
]

const filtersFor = (cats: CategoryId[]): CategoryFilter[] => cats.map((category) => ({ category }))

function difficultyFor(settings: Settings): DifficultySetting {
  return settings.adaptive ? 'adaptive' : settings.defaultDifficulty
}

export type OAPreset = 'classic' | 'full' | 'custom'

export interface OAOptions {
  preset: OAPreset
  categories?: CategoryId[]
  timeLimitSec?: number
  questionCount?: number
  penalty?: number
  feedback?: boolean
  seed?: string
}

export function oaConfig(o: OAOptions, settings: Settings): SessionConfig {
  const marking = { correct: 1, wrong: o.penalty !== undefined ? -Math.abs(o.penalty) : settings.oaMarking.wrong, skip: settings.oaMarking.skip }
  const feedback = (o.feedback ?? settings.oaFeedback) ? 'instant' : 'off'
  const seed = o.seed ?? randomSeed()
  if (o.preset === 'full') {
    return {
      mode: 'oa',
      title: 'Full OA',
      variantKey: 'oa:full',
      seed,
      sections: [
        { label: 'Mental Math', filters: filtersFor(['mental-math']), questionCount: 40, timeLimitSec: 360, difficulty: [1, 3] },
        { label: 'Sequences', filters: filtersFor(['sequences']), questionCount: 15, timeLimitSec: 360, difficulty: [2, 4] },
        { label: 'Probability', filters: filtersFor(['probability']), questionCount: 12, timeLimitSec: 600, difficulty: [2, 4] },
        { label: 'Arbitrage', filters: filtersFor(['arbitrage']), questionCount: 8, timeLimitSec: 480, difficulty: [2, 4] },
      ],
      marking,
      feedback,
      perQuestionSec: null,
      lives: null,
      rampEvery: null,
      hints: false,
      allowSkip: true,
    }
  }
  const cats: CategoryId[] = o.preset === 'classic' ? ['mental-math'] : o.categories?.length ? o.categories : ['mental-math']
  const time = o.preset === 'classic' ? settings.oaTimeLimitSec : (o.timeLimitSec ?? settings.oaTimeLimitSec)
  const count = o.preset === 'classic' ? settings.oaQuestionCount : (o.questionCount ?? settings.oaQuestionCount)
  return {
    mode: 'oa',
    title: o.preset === 'classic' ? `OA: ${count} in ${Math.round(time / 60)}` : 'Custom OA',
    variantKey: o.preset === 'classic' ? `oa:classic:${count}:${time}` : `oa:custom:${[...cats].sort().join('+')}:${count}:${time}`,
    seed,
    sections: [{ label: 'Section', filters: filtersFor(cats), questionCount: count, timeLimitSec: time, difficulty: [1, 3] }],
    marking,
    feedback,
    perQuestionSec: null,
    lives: null,
    rampEvery: null,
    hints: false,
    allowSkip: true,
  }
}

export interface SprintOptions {
  seconds: 60 | 120 | 300
  categories: CategoryId[]
  seed?: string
}

export function sprintConfig(o: SprintOptions, settings: Settings): SessionConfig {
  const cats = o.categories.length ? o.categories : (['mental-math'] as CategoryId[])
  const key = cats.length > 1 ? 'mix' : cats[0]
  return {
    mode: 'sprint',
    title: `Sprint · ${o.seconds}s`,
    variantKey: `sprint:${o.seconds}:${key}`,
    seed: o.seed ?? randomSeed(),
    sections: [{ label: 'Sprint', filters: filtersFor(cats), questionCount: null, timeLimitSec: o.seconds, difficulty: difficultyFor(settings) }],
    marking: DEFAULT_MARKING,
    feedback: 'instant',
    perQuestionSec: null,
    lives: null,
    rampEvery: null,
    hints: false,
    allowSkip: true,
  }
}

export interface SurvivalOptions {
  categories: CategoryId[]
  perQuestionSec: number | null
  startDifficulty?: Difficulty
  seed?: string
}

export function survivalConfig(o: SurvivalOptions): SessionConfig {
  const cats = o.categories.length ? o.categories : (['mental-math'] as CategoryId[])
  const key = cats.length > 1 ? 'mix' : cats[0]
  return {
    mode: 'survival',
    title: 'Survival',
    variantKey: `survival:${key}${o.perQuestionSec ? `:${o.perQuestionSec}s` : ''}`,
    seed: o.seed ?? randomSeed(),
    sections: [{ label: 'Survival', filters: filtersFor(cats), questionCount: null, timeLimitSec: null, difficulty: o.startDifficulty ?? 1 }],
    marking: DEFAULT_MARKING,
    feedback: 'instant',
    perQuestionSec: o.perQuestionSec,
    lives: 3,
    rampEvery: 5,
    startDifficulty: o.startDifficulty ?? 1,
    hints: false,
    allowSkip: false,
  }
}

export interface DrillOptions {
  filters: CategoryFilter[]
  difficulty: DifficultySetting
  count: number
  perQuestionSec: number | null
  seed?: string
}

export function drillConfig(o: DrillOptions): SessionConfig {
  return {
    mode: 'drill',
    title: 'Focus Drill',
    variantKey: `drill:${o.filters.map((f) => f.category).sort().join('+')}`,
    seed: o.seed ?? randomSeed(),
    sections: [{ label: 'Drill', filters: o.filters, questionCount: o.count, timeLimitSec: null, difficulty: o.difficulty }],
    marking: DEFAULT_MARKING,
    feedback: 'instant',
    perQuestionSec: o.perQuestionSec,
    lives: null,
    rampEvery: null,
    hints: true,
    allowSkip: true,
  }
}

export interface ZenOptions {
  filters: CategoryFilter[]
  difficulty: DifficultySetting
  seed?: string
}

export function zenConfig(o: ZenOptions): SessionConfig {
  return {
    mode: 'zen',
    title: 'Zen',
    variantKey: 'zen',
    seed: o.seed ?? randomSeed(),
    sections: [{ label: 'Zen', filters: o.filters, questionCount: null, timeLimitSec: null, difficulty: o.difficulty }],
    marking: DEFAULT_MARKING,
    feedback: 'explain',
    perQuestionSec: null,
    lives: null,
    rampEvery: null,
    hints: true,
    allowSkip: true,
  }
}

/** The daily set: same 20 questions for everyone on a given date. */
export function dailyConfig(dateKeyStr: string): SessionConfig {
  const seed = dailySeed(dateKeyStr)
  return {
    mode: 'daily',
    title: 'Daily Challenge',
    variantKey: 'daily',
    seed,
    sections: [{ label: 'Daily', filters: filtersFor(['mental-math']), questionCount: DAILY_PLAN.length, timeLimitSec: null, difficulty: 3 }],
    marking: DEFAULT_MARKING,
    feedback: 'instant',
    perQuestionSec: null,
    lives: null,
    rampEvery: null,
    fixed: dailyRefs(seed),
    hints: false,
    allowSkip: true,
  }
}

export function dailyRefs(seed: string) {
  return DAILY_PLAN.map((slot, i) => {
    const q = GENERATORS[slot.category].generate(slot.difficulty, new SeededRNG(`${seed}|${i}`))
    return { templateId: q.templateId, difficulty: q.difficulty, seed: q.seed }
  })
}

/** Review session: due items regenerated from their template with fresh seeds. */
export function reviewConfig(items: ReviewItem[], now: number, limit = 20): SessionConfig {
  const seed = `review-${now}`
  return {
    mode: 'review',
    title: 'Review Mistakes',
    variantKey: 'review',
    seed,
    sections: [{ label: 'Review', filters: filtersFor(['mental-math']), questionCount: Math.min(limit, items.length), timeLimitSec: null, difficulty: 3 }],
    marking: DEFAULT_MARKING,
    feedback: 'explain',
    perQuestionSec: null,
    lives: null,
    rampEvery: null,
    fixed: items.slice(0, limit).map((it, i) => ({ templateId: it.templateId, difficulty: it.difficulty, seed: `${seed}|${i}|${it.key}` })),
    hints: true,
    allowSkip: true,
  }
}

// ---------------------------------------------------------------------------
// Shareable links: the config (minus fixed question lists) as URL-safe base64.
// ---------------------------------------------------------------------------

export function encodeConfig(c: SessionConfig): string {
  const json = JSON.stringify({ ...c, fixed: c.mode === 'daily' ? undefined : c.fixed })
  const b64 = btoa(unescape(encodeURIComponent(json)))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeConfig(s: string): SessionConfig | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(escape(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))))
    const c = JSON.parse(json) as SessionConfig
    if (!c || !Array.isArray(c.sections) || typeof c.seed !== 'string') return null
    if (c.mode === 'daily') return dailyConfig(c.seed.replace(/^daily-/, ''))
    return c
  } catch {
    return null
  }
}
