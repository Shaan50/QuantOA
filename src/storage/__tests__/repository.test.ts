import { describe, expect, it } from 'vitest'
import { MemoryBackend } from '../backend'
import { MAX_ATTEMPTS, ProgressRepository } from '../repository'

describe('ProgressRepository', () => {
  it('persists through the backend and reloads', async () => {
    const backend = new MemoryBackend()
    const repo = new ProgressRepository(backend)
    await repo.init()
    expect(repo.settings.oaQuestionCount).toBe(80)
    repo.updateSettings({ sound: false, oaMarking: { correct: 1, wrong: -0.5, skip: 0 } })
    repo.setRatings({ 'mental-math': { rating: 1500, attempts: 3 } })
    await repo.flush()
    const again = new ProgressRepository(backend)
    await again.init()
    expect(again.settings.sound).toBe(false)
    expect(again.settings.oaMarking.wrong).toBe(-0.5)
    expect(again.ratings['mental-math']!.rating).toBe(1500)
  })

  it('notifies subscribers and caps the attempt log', async () => {
    const repo = new ProgressRepository(new MemoryBackend())
    await repo.init()
    let calls = 0
    const unsub = repo.subscribe(() => calls++)
    const mk = (i: number) => ({ id: String(i), sessionId: 's', mode: 'drill' as const, category: 'fermi' as const, subcategory: 'x', templateId: 't', difficulty: 1 as const, status: 'correct' as const, credit: 1, timeMs: 1, expectedMs: 1, ts: i })
    repo.addAttempts(Array.from({ length: MAX_ATTEMPTS + 50 }, (_, i) => mk(i)))
    expect(repo.attempts).toHaveLength(MAX_ATTEMPTS)
    expect(repo.attempts[0].id).toBe('50')
    expect(calls).toBe(1)
    unsub()
    repo.addAttempts([mk(1)])
    expect(calls).toBe(1)
  })

  it('exports, imports and resets', async () => {
    const repo = new ProgressRepository(new MemoryBackend())
    await repo.init()
    repo.setRatings({ fermi: { rating: 1300, attempts: 1 } })
    const dump = repo.exportAll()
    await repo.reset()
    expect(repo.ratings).toEqual({})
    await repo.importAll(dump)
    expect(repo.ratings.fermi!.rating).toBe(1300)
  })

  it('tolerates a corrupt / partial stored state', async () => {
    const backend = new MemoryBackend()
    backend.data.set('settings', JSON.stringify({ sound: false }))
    const repo = new ProgressRepository(backend)
    await repo.init()
    expect(repo.settings.sound).toBe(false)
    expect(repo.settings.oaTimeLimitSec).toBe(480)
    expect(repo.daily.streak).toBe(0)
  })
})
