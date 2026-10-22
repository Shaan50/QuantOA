import { useEffect } from 'react'
import { dueItems } from './engine/review'
import { currentStreak, dateKey } from './engine/daily'
import { Icon, type IconName } from './ui/components/Icon'
import { cx } from './ui/components/ui'
import { href, navigate, useRoute } from './ui/router'
import { useRepo, useSession } from './ui/store'
import { Home } from './ui/screens/Home'
import { Setup } from './ui/screens/Setup'
import { Player } from './ui/screens/Player'
import { Results } from './ui/screens/Results'
import { Dashboard } from './ui/screens/Dashboard'
import { Daily } from './ui/screens/Daily'
import { Review } from './ui/screens/Review'
import { Market } from './ui/screens/Market'
import { SettingsScreen } from './ui/screens/Settings'
import { decodeConfig } from './engine/modes'
import { SessionEngine } from './engine/session'

const NAV: { to: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { to: '/', label: 'Play', icon: 'zap', match: (p) => p === '/' || p.startsWith('/mode') },
  { to: '/daily', label: 'Daily', icon: 'calendar', match: (p) => p === '/daily' },
  { to: '/review', label: 'Review', icon: 'repeat', match: (p) => p === '/review' },
  { to: '/market', label: 'Market Making', icon: 'candles', match: (p) => p === '/market' },
  { to: '/dashboard', label: 'Dashboard', icon: 'chart', match: (p) => p === '/dashboard' },
  { to: '/settings', label: 'Settings', icon: 'settings', match: (p) => p === '/settings' },
]

export default function App() {
  const route = useRoute()
  const repo = useRepo()
  const { active, setActive } = useSession()
  const focus = route.path === '/play'

  // Shared challenge links: #/play?c=<encoded config>
  const shared = route.path === '/play' ? route.query.get('c') : null
  useEffect(() => {
    if (!shared) return
    const cfg = decodeConfig(shared)
    if (cfg) setActive(new SessionEngine(cfg, repo.ratings, Date.now()))
    else navigate('/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared])

  const due = dueItems(repo.review, Date.now()).length
  const streak = currentStreak(repo.daily, dateKey(new Date()))
  const doneToday = repo.daily.lastCompleted === dateKey(new Date())

  let screen: React.ReactNode
  const p = route.path
  if (p === '/') screen = <Home />
  else if (p.startsWith('/mode/')) screen = <Setup mode={p.slice(6)} />
  else if (p === '/play')
    screen =
      active && active.phase !== 'finished' ? <Player key={active.config.seed + active.startedAt} engine={active} /> : shared ? null : <Redirect to={active ? '/results' : '/'} />
  else if (p === '/results') screen = <Results />
  else if (p === '/dashboard') screen = <Dashboard />
  else if (p === '/daily') screen = <Daily />
  else if (p === '/review') screen = <Review />
  else if (p === '/market') screen = <Market />
  else if (p === '/settings') screen = <SettingsScreen />
  else screen = <Redirect to="/" />

  if (focus) return <div className="app-backdrop min-h-full">{screen}</div>

  return (
    <div className="min-h-full md:flex">
      <aside className="sticky top-0 z-30 border-b border-line bg-bg-elev/90 backdrop-blur md:h-screen md:w-[232px] md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center gap-3 px-4 py-3 md:px-5 md:pt-6 md:pb-7">
          <a href={href('/')} className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[17px] font-semibold tracking-tight text-ink">
              Quant<span className="text-brand">OA</span>
            </span>
          </a>
          <div className="ml-auto flex items-center gap-1 md:hidden">
            <QuickToggles />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 md:flex-col md:px-3 md:pb-0">
          {NAV.map((n) => {
            const on = n.match(p)
            const badge = n.to === '/review' && due > 0 ? due : n.to === '/daily' && !doneToday ? '•' : null
            return (
              <a
                key={n.to}
                href={href(n.to)}
                className={cx(
                  'group flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors',
                  on ? 'bg-surface-2 text-ink ring-1 ring-line' : 'text-muted hover:bg-surface-2/60 hover:text-ink',
                )}
              >
                <Icon name={n.icon} size={17} className={on ? 'text-brand' : ''} />
                <span>{n.label}</span>
                {badge !== null && (
                  <span className={cx('num ml-auto rounded-full px-1.5 text-[11px] leading-[18px] font-semibold', badge === '•' ? 'text-brand' : 'bg-brand/15 text-brand')}>{badge}</span>
                )}
              </a>
            )
          })}
        </nav>
        <div className="absolute right-0 bottom-0 left-0 hidden p-4 md:block">
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5">
            <Icon name="flame" size={17} className={streak > 0 ? 'text-brand' : 'text-faint'} />
            <div className="leading-tight">
              <div className="num text-[13px] font-semibold text-ink">{streak} day streak</div>
              <div className="text-[11px] text-muted">{doneToday ? 'Daily done ✓' : 'Daily not done yet'}</div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <QuickToggles />
            <span className="text-[11px] text-faint">v1.0</span>
          </div>
        </div>
      </aside>
      <main className="app-backdrop relative min-w-0 flex-1">
        <div className="relative mx-auto max-w-[1180px] px-4 py-8 md:px-10 md:py-12">{screen}</div>
      </main>
    </div>
  )
}

function QuickToggles() {
  const repo = useRepo()
  const s = repo.settings
  return (
    <div className="flex items-center gap-1">
      <button aria-label="Toggle theme" title="Toggle theme" onClick={() => repo.updateSettings({ theme: s.theme === 'dark' ? 'light' : 'dark' })} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
        <Icon name={s.theme === 'dark' ? 'sun' : 'moon'} size={16} />
      </button>
      <button aria-label="Toggle sound" title="Toggle sound" onClick={() => repo.updateSettings({ sound: !s.sound })} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
        <Icon name={s.sound ? 'volume' : 'mute'} size={16} />
      </button>
    </div>
  )
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand)" />
          <stop offset="1" stopColor="var(--brand-2)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="var(--surface-2)" stroke="var(--border-strong)" />
      <path d="M7 21.5 12.5 15l4 3.5L25 9" fill="none" stroke="url(#lg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="9" r="2.6" fill="var(--brand)" />
    </svg>
  )
}

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to), [to])
  return null
}
