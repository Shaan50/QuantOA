/**
 * ProgressRepository: the single source of truth for persisted progress.
 *
 * Reads are synchronous from an in-memory cache (loaded once by `init()`),
 * writes update the cache immediately and are written through to the
 * backend asynchronously. Components subscribe for change notifications.
 */
import type { Attempt } from '../engine/analytics'
import { EMPTY_DAILY, type DailyState } from '../engine/daily'
import type { Ratings } from '../engine/elo'
import type { SessionSummary } from '../engine/results'
import type { ReviewQueue } from '../engine/review'
import { withDefaults, type Settings } from '../engine/settings'
import type { MarketResult } from '../engine/marketMaking'
import type { PersistenceBackend } from './backend'

export const MAX_ATTEMPTS = 8000
export const MAX_SESSIONS = 600
export const SCHEMA_VERSION = 1

export interface ProgressData {
  version: number
  attempts: Attempt[]
  sessions: SessionSummary[]
  settings: Settings
  ratings: Ratings
  review: ReviewQueue
  daily: DailyState
  market: MarketResult[]
}

type Key = Exclude<keyof ProgressData, 'version'>
const KEYS: Key[] = ['attempts', 'sessions', 'settings', 'ratings', 'review', 'daily', 'market']

function emptyData(): ProgressData {
  return {
    version: SCHEMA_VERSION,
    attempts: [],
    sessions: [],
    settings: withDefaults(undefined),
    ratings: {},
    review: {},
    daily: EMPTY_DAILY,
    market: [],
  }
}

export class ProgressRepository {
  private data: ProgressData = emptyData()
  private listeners = new Set<() => void>()
  private readonly backend: PersistenceBackend
  private pending: Promise<unknown> = Promise.resolve()
  /** Bumps on every change; handy for useSyncExternalStore snapshots. */
  revision = 0

  constructor(backend: PersistenceBackend) {
    this.backend = backend
  }

  async init(): Promise<void> {
    const loaded: Partial<ProgressData> = {}
    for (const k of KEYS) {
      const v = await this.backend.load<unknown>(k)
      if (v !== undefined) (loaded as Record<string, unknown>)[k] = v
    }
    const base = emptyData()
    this.data = {
      ...base,
      ...loaded,
      settings: withDefaults(loaded.settings),
      daily: { ...EMPTY_DAILY, ...loaded.daily },
    }
    this.emit()
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    this.revision++
    for (const fn of this.listeners) fn()
  }

  private set<K extends Key>(key: K, value: ProgressData[K]) {
    this.data = { ...this.data, [key]: value }
    this.pending = this.pending.then(() => this.backend.save(key, value))
    this.emit()
  }

  /** Resolves once all queued writes have reached the backend. */
  flush(): Promise<unknown> {
    return this.pending
  }

  // ---- reads
  get attempts() {
    return this.data.attempts
  }
  get sessions() {
    return this.data.sessions
  }
  get settings() {
    return this.data.settings
  }
  get ratings() {
    return this.data.ratings
  }
  get review() {
    return this.data.review
  }
  get daily() {
    return this.data.daily
  }
  get market() {
    return this.data.market
  }

  // ---- writes
  addAttempts(xs: Attempt[]) {
    if (!xs.length) return
    this.set('attempts', [...this.data.attempts, ...xs].slice(-MAX_ATTEMPTS))
  }
  addSession(s: SessionSummary) {
    this.set('sessions', [...this.data.sessions.filter((x) => x.id !== s.id), s].slice(-MAX_SESSIONS))
  }
  updateSettings(patch: Partial<Settings>) {
    this.set('settings', withDefaults({ ...this.data.settings, ...patch }))
  }
  setRatings(r: Ratings) {
    this.set('ratings', r)
  }
  setReview(q: ReviewQueue) {
    this.set('review', q)
  }
  setDaily(d: DailyState) {
    this.set('daily', d)
  }
  addMarketResult(r: MarketResult) {
    this.set('market', [...this.data.market, r].slice(-200))
  }

  /** Full export for backups / migration to another backend. */
  exportAll(): ProgressData {
    return structuredClone(this.data)
  }

  async importAll(d: Partial<ProgressData>): Promise<void> {
    const merged = { ...emptyData(), ...d, settings: withDefaults(d.settings), version: SCHEMA_VERSION }
    this.data = merged
    for (const k of KEYS) await this.backend.save(k, merged[k])
    this.emit()
  }

  async reset(): Promise<void> {
    for (const k of KEYS) await this.backend.remove(k)
    this.data = emptyData()
    this.emit()
  }
}
