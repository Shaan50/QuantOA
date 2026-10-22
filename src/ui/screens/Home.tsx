import { useEffect } from 'react'
import { categoryTotals } from '../../engine/analytics'
import { currentStreak } from '../../engine/daily'
import { INITIAL_RATING, ratingTier } from '../../engine/elo'
import { MODES, oaConfig } from '../../engine/modes'
import { dueItems } from '../../engine/review'
import { BRAINTEASERS } from '../../data/brainteasers'
import { FERMI } from '../../data/fermi'
import { CATEGORIES, PROCEDURAL } from '../../generators'
import { Icon } from '../components/Icon'
import { Button, Card, Kbd, SectionTitle } from '../components/ui'
import { catVar, pct } from '../format'
import { CATEGORY_ICON, MODE_ICON, MODE_ROUTE } from '../icons'
import { href, navigate } from '../router'
import { useRepo } from '../store'
import { isTypingTarget, useClock, useStartSession } from '../useStart'

export function Home() {
  const repo = useRepo()
  const start = useStartSession()
  const totals = categoryTotals(repo.attempts, CATEGORIES.map((c) => c.id))
  const { now, today } = useClock()
  const due = dueItems(repo.review, now).length
  const streak = currentStreak(repo.daily, today)
  const s = repo.settings

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return
      const m = MODES.find((x) => x.hotkey === e.key)
      if (m) navigate(MODE_ROUTE[m.id])
      if (e.key === 'Enter') start(oaConfig({ preset: 'classic' }, repo.settings))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [start, repo])

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-stretch">
        <div className="animate-rise">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-[12px] font-medium text-ink-2 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-good" /> Optiver · SIG · Jane Street · IMC style
          </div>
          <h1 className="text-[34px] leading-[1.05] font-semibold tracking-tight text-ink sm:text-[42px] md:text-[52px]">
            Train for the trading OA
            <br />
            <span className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-transparent">like it's the real thing.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[16px] leading-relaxed text-ink-2">
            Timed, calculator-free and keyboard-first. Questions are generated with randomized parameters, so you never run out — and the marking punishes guessing, just like the real test.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" icon="play" kbd="↵" onClick={() => start(oaConfig({ preset: 'classic' }, s))}>
              Start {s.oaQuestionCount} in {Math.round(s.oaTimeLimitSec / 60)}
            </Button>
            <Button size="lg" icon="calendar" onClick={() => navigate('/daily')}>
              Daily challenge
            </Button>
          </div>
        </div>
        <Card className="animate-rise flex flex-col justify-between gap-5 p-5 [animation-delay:80ms]">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-muted">Today</span>
            <span className="text-[12px] text-faint">{new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat icon="flame" label="Streak" value={`${streak}d`} hot={streak > 0} />
            <MiniStat icon="repeat" label="Due reviews" value={String(due)} hot={due > 0} />
            <MiniStat icon="target" label="Attempts" value={repo.attempts.length.toLocaleString()} />
          </div>
          <div className="space-y-2">
            {CATEGORIES.slice(0, 4).map((c) => {
              const r = repo.ratings[c.id]?.rating ?? INITIAL_RATING
              return (
                <div key={c.id} className="flex items-center gap-3 text-[13px]">
                  <span className="h-2 w-2 rounded-full" style={{ background: catVar(c.id) }} />
                  <span className="w-28 text-ink-2">{c.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((r - 800) / 1200) * 100)}%`, background: catVar(c.id) }} />
                  </div>
                  <span className="num w-11 text-right text-ink">{r}</span>
                </div>
              )
            })}
          </div>
          <a href={href('/dashboard')} className="inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:underline">
            Open dashboard <Icon name="arrowRight" size={14} />
          </a>
        </Card>
      </section>

      {/* Modes */}
      <section>
        <SectionTitle title="Game modes" subtitle="Press a number key to jump straight in." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MODES.map((m, i) => (
            <a
              key={m.id}
              href={href(MODE_ROUTE[m.id])}
              style={{ animationDelay: `${i * 35}ms` }}
              className="group animate-rise relative flex flex-col rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)] transition-all hover:-translate-y-0.5 hover:border-line-strong"
            >
              <div className="mb-4 flex items-start justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-2 ring-1 ring-line transition-colors group-hover:text-brand">
                  <Icon name={MODE_ICON[m.id]} size={19} />
                </div>
                <Kbd>{m.hotkey}</Kbd>
              </div>
              <div className="text-[15px] font-semibold text-ink">{m.label}</div>
              <div className="num mt-0.5 text-[12px] text-brand">{m.tagline}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{m.description}</p>
              {m.id === 'review' && due > 0 && <span className="num absolute top-4 right-12 rounded-full bg-brand/15 px-2 text-[11px] leading-5 font-semibold text-brand">{due} due</span>}
            </a>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section>
        <SectionTitle title="Question categories" subtitle="Click a category to drill it. Procedural categories never run out." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c, i) => {
            const t = totals.find((x) => x.category === c.id)!
            const r = repo.ratings[c.id]?.rating ?? INITIAL_RATING
            const bank = c.id === 'brainteasers' ? `${BRAINTEASERS.length} curated` : c.id === 'fermi' ? `${FERMI.length} curated` : '∞ generated'
            return (
              <a
                key={c.id}
                href={href(`/mode/drill?cat=${c.id}`)}
                style={{ animationDelay: `${i * 35}ms` }}
                className="group animate-rise relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)] transition-all hover:-translate-y-0.5 hover:border-line-strong"
              >
                <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: catVar(c.id) }} />
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 ring-1 ring-line" style={{ color: catVar(c.id) }}>
                    <Icon name={CATEGORY_ICON[c.id]} size={18} />
                  </div>
                  <div>
                    <div className="text-[15px] font-semibold text-ink">{c.label}</div>
                    <div className="text-[12px] text-muted">{bank}{PROCEDURAL.includes(c.id) ? '' : ' · hints'}</div>
                  </div>
                  <Icon name="chevronRight" size={16} className="ml-auto text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-muted">{c.description}</p>
                <div className="mt-4 flex items-center gap-4 border-t border-line pt-3 text-[12px]">
                  <span className="text-muted">
                    Rating <span className="num font-semibold text-ink">{r}</span>
                  </span>
                  <span className="text-faint">{ratingTier(r)}</span>
                  <span className="ml-auto text-muted">
                    {t.n ? (
                      <>
                        <span className="num text-ink">{pct(t.accuracy)}</span> of {t.n}
                      </>
                    ) : (
                      'Not tried yet'
                    )}
                  </span>
                </div>
              </a>
            )
          })}
        </div>
      </section>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-6 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> submit
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Tab</Kbd> skip
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>1</Kbd>–<Kbd>6</Kbd> pick a choice
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>?</Kbd> hint
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd> quit
        </span>
        <span className="ml-auto">Progress is stored locally in your browser.</span>
      </footer>
    </div>
  )
}

function MiniStat({ icon, label, value, hot }: { icon: 'flame' | 'repeat' | 'target'; label: string; value: string; hot?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <Icon name={icon} size={15} className={hot ? 'text-brand' : 'text-faint'} />
      <div className="num mt-2 text-xl font-semibold text-ink">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  )
}
