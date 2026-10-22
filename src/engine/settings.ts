/** User settings with defaults. */
import type { MarkingScheme } from './scoring'

export interface Settings {
  /** OA Simulation defaults (the classic 80 questions in 8 minutes). */
  oaTimeLimitSec: number
  oaQuestionCount: number
  oaMarking: MarkingScheme
  oaFeedback: boolean
  sprintSeconds: 60 | 120 | 300
  sound: boolean
  adaptive: boolean
  /** Default fixed difficulty when adaptive is off. */
  defaultDifficulty: 1 | 2 | 3 | 4 | 5
  /** Milliseconds a wrong answer's correction stays on screen. */
  feedbackMs: number
  theme: 'dark' | 'light'
  reduceMotion: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  oaTimeLimitSec: 480,
  oaQuestionCount: 80,
  oaMarking: { correct: 1, wrong: -1, skip: 0 },
  oaFeedback: false,
  sprintSeconds: 120,
  sound: true,
  adaptive: true,
  defaultDifficulty: 2,
  feedbackMs: 1400,
  theme: 'dark',
  reduceMotion: false,
}

export function withDefaults(partial: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...partial, oaMarking: { ...DEFAULT_SETTINGS.oaMarking, ...partial?.oaMarking } }
}
