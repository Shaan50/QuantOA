/**
 * Session engine: a framework-agnostic state machine that runs every
 * question-based mode (OA Simulation, Sprint, Survival, Drill, Zen, Daily,
 * Review). The React layer renders its state and forwards key presses; all
 * timing, scoring, sectioning and question selection happens here.
 *
 * Questions are generated from `seed|section|index`, so a session with a
 * fixed difficulty is fully reproducible from its seed.
 */
import { checkAnswer, type CheckResult } from '../core/answer'
import { SeededRNG } from '../core/rng'
import type { CategoryId, Difficulty, Question } from '../core/types'
import { GENERATORS, templateById } from '../generators'
import { runTemplate } from '../generators/registry'
import { pickDifficulty, updateRating, type Ratings } from './elo'
import { pointsFor, type AttemptStatus, type MarkingScheme } from './scoring'

export type ModeId = 'oa' | 'sprint' | 'survival' | 'drill' | 'zen' | 'daily' | 'review'

export interface CategoryFilter {
  category: CategoryId
  /** Empty or missing = all subcategories. */
  subcategories?: string[]
}

export type DifficultySetting = Difficulty | 'adaptive' | [Difficulty, Difficulty]

export interface SectionConfig {
  label: string
  filters: CategoryFilter[]
  /** null = unlimited (ends on time or lives). */
  questionCount: number | null
  /** null = untimed. */
  timeLimitSec: number | null
  difficulty: DifficultySetting
}

export interface QuestionRef {
  templateId: string
  difficulty: Difficulty
  seed: string
}

export type FeedbackMode = 'instant' | 'off' | 'explain'

export interface SessionConfig {
  mode: ModeId
  title: string
  /** Groups sessions for personal bests, e.g. "sprint:120:mental-math". */
  variantKey: string
  seed: string
  sections: SectionConfig[]
  marking: MarkingScheme
  feedback: FeedbackMode
  perQuestionSec: number | null
  lives: number | null
  /** Survival: difficulty rises by one every `rampEvery` correct answers. */
  rampEvery: number | null
  startDifficulty?: Difficulty
  /** Pre-chosen questions (Daily, Review). Overrides generation. */
  fixed?: QuestionRef[]
  hints: boolean
  /** Can the player skip with Tab? */
  allowSkip: boolean
}

export interface AttemptRecord {
  question: Question
  input: string
  status: AttemptStatus
  credit: number
  points: number
  timeMs: number
  hintsUsed: number
  section: number
  answeredAt: number
}

export type EndReason = 'complete' | 'time' | 'lives' | 'quit'

export type Phase = 'question' | 'feedback' | 'section-break' | 'finished'

export class SessionEngine {
  readonly config: SessionConfig
  ratings: Ratings
  records: AttemptRecord[] = []
  phase: Phase = 'question'
  section = 0
  indexInSection = 0
  current: Question | null = null
  lastRecord: AttemptRecord | null = null
  lastCheck: CheckResult | null = null
  startedAt: number
  sectionStartedAt: number
  questionStartedAt: number
  endedAt: number | null = null
  endReason: EndReason | null = null
  lives: number | null
  hintsUsed = 0
  private seen = new Set<string>()
  private globalIndex = 0

  constructor(config: SessionConfig, ratings: Ratings, now: number) {
    if (config.sections.length === 0) throw new Error('Session needs at least one section')
    this.config = config
    this.ratings = { ...ratings }
    this.lives = config.lives
    this.startedAt = now
    this.sectionStartedAt = now
    this.questionStartedAt = now
    this.current = this.buildQuestion()
    if (!this.current) this.finish(now, 'complete')
  }

  get sectionConfig(): SectionConfig {
    return this.config.sections[this.section]
  }

  get score(): number {
    return this.records.reduce((s, r) => s + r.points, 0)
  }

  get correctCount(): number {
    return this.records.filter((r) => r.status === 'correct').length
  }

  /** Number of questions planned in the current section (null if unlimited). */
  get sectionTotal(): number | null {
    if (this.config.fixed) return this.config.fixed.length
    return this.sectionConfig.questionCount
  }

  /** Milliseconds left in the section, or null if untimed. */
  sectionTimeRemaining(now: number): number | null {
    const lim = this.sectionConfig.timeLimitSec
    if (lim === null) return null
    return Math.max(0, lim * 1000 - (now - this.sectionStartedAt))
  }

  questionTimeRemaining(now: number): number | null {
    if (this.config.perQuestionSec === null || this.phase !== 'question') return null
    return Math.max(0, this.config.perQuestionSec * 1000 - (now - this.questionStartedAt))
  }

  /** Difficulty used for survival ramps. */
  survivalDifficulty(): Difficulty {
    const start = this.config.startDifficulty ?? 1
    const ramp = this.config.rampEvery ?? 5
    return Math.min(5, start + Math.floor(this.correctCount / ramp)) as Difficulty
  }

  private chooseDifficulty(category: CategoryId, rng: SeededRNG): Difficulty {
    if (this.config.rampEvery) return this.survivalDifficulty()
    const d = this.sectionConfig.difficulty
    if (d === 'adaptive') return pickDifficulty(this.ratings[category]?.rating, rng)
    if (Array.isArray(d)) return rng.int(d[0], d[1]) as Difficulty
    return d
  }

  private buildQuestion(): Question | null {
    const { fixed } = this.config
    if (fixed) {
      const ref = fixed[this.globalIndex]
      if (!ref) return null
      const t = templateById(ref.templateId)
      if (!t) throw new Error(`Unknown template ${ref.templateId}`)
      return runTemplate(t, ref.difficulty, ref.seed)
    }
    const total = this.sectionConfig.questionCount
    if (total !== null && this.indexInSection >= total) return null
    const base = new SeededRNG(`${this.config.seed}|s${this.section}|q${this.indexInSection}`)
    let q: Question | null = null
    for (let attempt = 0; attempt < 12; attempt++) {
      const rng = attempt === 0 ? base : base.fork(attempt)
      const filter = rng.pick(this.sectionConfig.filters)
      const difficulty = this.chooseDifficulty(filter.category, rng)
      q = GENERATORS[filter.category].generate(difficulty, rng, { subcategories: filter.subcategories })
      if (!this.seen.has(q.id) && !this.seen.has(`${q.templateId}|${q.prompt}`)) break
    }
    this.seen.add(q!.id)
    this.seen.add(`${q!.templateId}|${q!.prompt}`)
    return q
  }

  private record(status: AttemptStatus, input: string, credit: number, now: number): AttemptRecord {
    const q = this.current!
    const rec: AttemptRecord = {
      question: q,
      input,
      status,
      credit,
      points: pointsFor(status, credit, this.config.marking, this.hintsUsed),
      timeMs: now - this.questionStartedAt,
      hintsUsed: this.hintsUsed,
      section: this.section,
      answeredAt: now,
    }
    this.records.push(rec)
    this.lastRecord = rec
    if (status !== 'skipped') {
      const speedRatio = rec.timeMs / 1000 / q.expectedSeconds
      this.ratings = { ...this.ratings, [q.category]: updateRating(this.ratings[q.category], q.difficulty, credit, speedRatio) }
    }
    if (this.lives !== null && (status === 'incorrect' || status === 'timeout' || status === 'skipped')) this.lives -= 1
    this.phase = 'feedback'
    return rec
  }

  /** Submit an answer. Invalid input returns the check result without consuming the question. */
  submit(input: string, now: number): CheckResult {
    if (this.phase !== 'question' || !this.current) return { status: 'invalid', credit: 0, message: 'Not accepting answers' }
    const res = checkAnswer(this.current, input)
    this.lastCheck = res
    if (res.status === 'invalid') return res
    this.record(res.status, input, res.credit, now)
    return res
  }

  skip(now: number): AttemptRecord | null {
    if (this.phase !== 'question' || !this.current || !this.config.allowSkip) return null
    this.lastCheck = null
    return this.record('skipped', '', 0, now)
  }

  /** Per-question timer expired. */
  timeout(now: number): AttemptRecord | null {
    if (this.phase !== 'question' || !this.current) return null
    this.lastCheck = null
    return this.record('timeout', '', 0, now)
  }

  useHint(): string | null {
    const hints = this.current?.hints ?? []
    if (!this.config.hints || this.phase !== 'question' || this.hintsUsed >= hints.length) return null
    return hints[this.hintsUsed++]
  }

  /** Move past feedback to the next question (or section break / finish). */
  advance(now: number): void {
    if (this.phase !== 'feedback') return
    if (this.lives !== null && this.lives <= 0) return this.finish(now, 'lives')
    this.indexInSection++
    this.globalIndex++
    this.hintsUsed = 0
    this.lastCheck = null
    const timeLeft = this.sectionTimeRemaining(now)
    if (timeLeft !== null && timeLeft <= 0) return this.endSection(now)
    const next = this.buildQuestion()
    if (!next) return this.endSection(now)
    this.current = next
    this.phase = 'question'
    this.questionStartedAt = now
  }

  /** Section clock ran out (the current unanswered question is not scored). */
  sectionTimeUp(now: number): void {
    if (this.phase === 'finished' || this.phase === 'section-break') return
    this.endSection(now)
  }

  private endSection(now: number): void {
    const isLast = this.section >= this.config.sections.length - 1 || !!this.config.fixed
    if (isLast) {
      const timed = this.sectionConfig.timeLimitSec !== null && (this.sectionTimeRemaining(now) ?? 1) <= 0
      return this.finish(now, timed ? 'time' : 'complete')
    }
    this.phase = 'section-break'
    this.current = null
  }

  startNextSection(now: number): void {
    if (this.phase !== 'section-break') return
    this.section++
    this.indexInSection = 0
    this.hintsUsed = 0
    this.sectionStartedAt = now
    this.questionStartedAt = now
    this.current = this.buildQuestion()
    this.phase = this.current ? 'question' : 'finished'
    if (!this.current) this.finish(now, 'complete')
  }

  quit(now: number): void {
    if (this.phase !== 'finished') this.finish(now, 'quit')
  }

  private finish(now: number, reason: EndReason): void {
    this.phase = 'finished'
    this.endReason = reason
    this.endedAt = now
    this.current = null
  }
}
