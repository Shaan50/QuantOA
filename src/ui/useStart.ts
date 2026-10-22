import { useCallback, useState } from 'react'
import { dateKey } from '../engine/daily'
import { SessionEngine, type SessionConfig } from '../engine/session'
import { navigate } from './router'
import { useRepo, useSession } from './store'

/** Returns a function that starts a session from a config and opens the player. */
export function useStartSession() {
  const repo = useRepo()
  const { setActive } = useSession()
  return useCallback(
    (config: SessionConfig) => {
      setActive(new SessionEngine(config, repo.ratings, Date.now()))
      navigate('/play')
    },
    [repo, setActive],
  )
}

/** Global hotkeys for non-play screens; ignores keys typed into inputs. */
export function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
}

/** The clock, captured once per mount (keeps render pure). */
export function useClock(): { now: number; today: string } {
  return useState(() => ({ now: Date.now(), today: dateKey(new Date()) }))[0]
}
