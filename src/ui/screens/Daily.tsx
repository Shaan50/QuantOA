import { useEffect } from 'react'
import { currentStreak, DAILY_PLAN, dateKey } from '../../engine/daily'
import { dailyConfig } from '../../engine/modes'
import { CATEGORY_BY_ID } from '../../generators'
import { Icon } from '../components/Icon'
import { Button, Card, CategoryDot, DifficultyPips, PageHeader, SectionTitle, cx } from '../components/ui'
import { useRepo } from '../store'
import { isTypingTarget, useClock, useStartSession } from '../useStart'

export function Daily() {
  const repo = useRepo()
  const start = useStartSession()
  const { now, today } = useClock()
  const done = repo.daily.history[today]
  const streak = currentStreak(repo.daily, today)
  const go = () => start(dailyConfig(today))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isTypingTarget(e) && e.key === 'Enter') go()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const days = Array.from({ length: 35 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - (34 - i))
    return dateKey(d)
  })

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} title="Daily Challenge" subtitle="Twenty mixed questions, seeded by today's date — everyone gets the same set. Complete it every day to build your streak." />
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card className="animate-rise relative overflow-hidden p-6">
          <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-brand/10 blur-3xl" />
          <div className="flex items-center gap-4">
            <div className={cx('grid h-16 w-16 place-items-center rounded-2xl', streak > 0 ? 'bg-brand/15 text-brand' : 'bg-surface-2 text-faint')}>
              <Icon name="flame" size={32} />
            </div>
            <div>
              <div className="num text-[44px] leading-none font-semibold text-ink">{streak}</div>
              <div className="text-[13px] text-muted">day streak · best {repo.daily.bestStreak}</div>
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-line bg-surface-2 p-4">
            {done ? (
              <div className="flex items-center gap-3">
                <Icon name="check" size={20} className="text-good" />
                <div>
                  <div className="text-[14px] font-semibold text-ink">Done for today</div>
                  <div className="text-[13px] text-muted">
                    Best score <span className="num text-ink">{done.score}</span> / {done.total}. Replays keep your best.
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-[14px] text-ink-2">{streak > 0 ? 'Keep the streak alive — today is not done yet.' : 'Start a streak today.'}</div>
            )}
          </div>
          <Button variant="primary" size="lg" icon="play" kbd="↵" className="mt-6 w-full" onClick={go}>
            {done ? 'Play again' : "Start today's challenge"}
          </Button>
          <div className="mt-6">
            <div className="mb-2 text-[12px] font-medium text-muted">Last 5 weeks</div>
            <div className="grid max-w-[320px] grid-cols-7 gap-1.5">
              {days.map((d) => {
                const h = repo.daily.history[d]
                const ratio = h ? h.correct / h.total : 0
                return (
                  <div
                    key={d}
                    title={h ? `${d}: ${h.correct}/${h.total}` : `${d}: not played`}
                    className={cx('aspect-square rounded-md', d === today && 'ring-2 ring-brand/60', !h && 'bg-surface-3')}
                    style={h ? { background: `color-mix(in oklab, var(--brand) ${Math.round(35 + 65 * ratio)}%, var(--surface-3))` } : undefined}
                  />
                )
              })}
            </div>
          </div>
        </Card>
        <Card className="animate-rise p-6 [animation-delay:60ms]">
          <SectionTitle title="Today's set" subtitle="A ramp from warm-up to stretch questions across every category." />
          <ol className="grid gap-1.5 sm:grid-cols-2">
            {DAILY_PLAN.map((s, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px]">
                <span className="num w-5 text-right text-[11px] text-faint">{i + 1}</span>
                <CategoryDot category={s.category} />
                <span className="flex-1 text-ink-2">{CATEGORY_BY_ID[s.category].label}</span>
                <DifficultyPips d={s.difficulty} />
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  )
}
