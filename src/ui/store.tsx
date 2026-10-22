/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { SessionEngine } from '../engine/session'
import type { SessionSummary } from '../engine/results'
import type { ProgressRepository } from '../storage/repository'
import { setSoundEnabled } from './sound'

const RepoContext = createContext<ProgressRepository | null>(null)

export interface FinishedSession {
  engine: SessionEngine
  summary: SessionSummary
  previousBest: number | null
}

interface SessionCtx {
  active: SessionEngine | null
  setActive(e: SessionEngine | null): void
  last: FinishedSession | null
  setLast(f: FinishedSession | null): void
}

const SessionContext = createContext<SessionCtx | null>(null)

export function AppProviders({ repo, children }: { repo: ProgressRepository; children: ReactNode }) {
  const [active, setActive] = useState<SessionEngine | null>(null)
  const [last, setLast] = useState<FinishedSession | null>(null)
  const session = useMemo(() => ({ active, setActive, last, setLast }), [active, last])
  return (
    <RepoContext.Provider value={repo}>
      <SessionContext.Provider value={session}>
        <ThemeSync repo={repo} />
        {children}
      </SessionContext.Provider>
    </RepoContext.Provider>
  )
}

/** Keeps <html data-theme>, motion and sound in sync with settings. */
function ThemeSync({ repo }: { repo: ProgressRepository }) {
  useRevision(repo)
  const { theme, reduceMotion, sound } = repo.settings
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.motion = reduceMotion ? 'reduce' : 'full'
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#08090c' : '#f4f5f7')
    setSoundEnabled(sound)
  }, [theme, reduceMotion, sound])
  return null
}

function useRevision(repo: ProgressRepository): number {
  return useSyncExternalStore(
    (cb) => repo.subscribe(cb),
    () => repo.revision,
  )
}

/** The repository, re-rendering the caller whenever persisted data changes. */
export function useRepo(): ProgressRepository {
  const repo = useContext(RepoContext)
  if (!repo) throw new Error('useRepo outside provider')
  useRevision(repo)
  return repo
}

export function useSession(): SessionCtx {
  const s = useContext(SessionContext)
  if (!s) throw new Error('useSession outside provider')
  return s
}
