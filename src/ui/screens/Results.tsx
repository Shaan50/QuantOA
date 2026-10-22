import { useEffect, useMemo, useState } from 'react'
import { formatAnswer } from '../../core/answer'
import { randomSeed } from '../../core/rng'
import { encodeConfig } from '../../engine/modes'
import { subcategoryBreakdown } from '../../engine/results'
import type { AttemptRecord } from '../../engine/session'
import { CATEGORY_BY_ID, subcategoryLabel } from '../../generators'
import { Ring } from '../components/charts'
import { Icon } from '../components/Icon'
import { MathText } from '../components/MathText'
import { Button, Card, CategoryDot, DifficultyPips, Empty, Segmented, SectionTitle, cx } from '../components/ui'
import { clock, pct, secs, signed } from '../format'
import { navigate } from '../router'
import { useSession } from '../store'
import { isTypingTarget, useStartSession } from '../useStart'

type Filter = 'all' | 'wrong' | 'skipped' | 'correct'

const END_LABEL = { complete: 'Completed', time: "Time's up", lives: 'Out of lives', quit: 'Ended early' } as const

export function Results() {
  const { last } = useSession()
  const start = useStartSession()
  const [filter, setFilter] = useState<Filter>('all')
  const [copied, setCopied] = useState(false)

  const replay = (sameSeed: boolean) => {
    if (!last) return
    const cfg = last.engine.config
    start(sameSeed || cfg.mode === 'daily' || cfg.mode === 'review' ? cfg : { ...cfg, seed: randomSeed() })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey) return
      if (e.key === 'Enter') replay(false)
      if (e.key === 'r') replay(true)
      if (e.key === 'Escape' || e.key === 'h') navigate('/')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const records = useMemo(() => last?.engine.records ?? [], [last])
  const breakdown = useMemo(() => subcategoryBreakdown(records), [records])
  if (!last) {
    return (
      <Empty icon="chart" title="No results to show">
        Finish a session to see your results here. <a className="text-brand" href="#/">Start one →</a>
      </Empty>
    )
  }
  const { summary: s, previousBest, engine } = last
  const isPB = s.total > 0 && s.endReason !== 'quit' && (previousBest === null || s.score > previousBest)
  const shown = records.filter((r) => (filter === 'all' ? true : filter === 'wrong' ? r.status === 'incorrect' || r.status === 'timeout' || r.status === 'partial' : filter === 'skipped' ? r.status === 'skipped' : r.status === 'correct'))
  const totalMs = (s.endedAt - s.startedAt)
  const maxPace = Math.max(1.5, ...breakdown.map((b) => b.paceRatio))

  const copyLink = async () => {
    const url = `${location.origin}${location.pathname}#/play?c=${encodeConfig(engine.config)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      prompt('Copy this challenge link:', url)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 animate-rise">
        <span className="rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-ink-2">{END_LABEL[s.endReason]}</span>
        <span className="text-[13px] text-muted">{new Date(s.endedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <span className="num text-[13px] text-faint">seed {s.seed}</span>
      </div>

      {/* Hero */}
      <Card className="animate-rise overflow-hidden">
        <div className="grid gap-8 p-6 md:grid-cols-[1.2fr_auto_1fr] md:items-center md:p-8">
          <div>
            <div className="text-[13px] font-medium text-muted">{s.title}</div>
            <div className="mt-2 flex items-end gap-4">
              <div className="num text-[64px] leading-none font-semibold tracking-tight text-ink md:text-[76px]">{Number.isInteger(s.score) ? s.score : s.score.toFixed(2)}</div>
              <div className="pb-2 text-[14px] text-muted">points</div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isPB ? (
                <span className="animate-pop inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-3 py-1 text-[13px] font-semibold text-brand">
                  <Icon name="trophy" size={14} /> {previousBest === null ? 'First run — personal best set' : `New personal best (prev ${previousBest})`}
                </span>
              ) : previousBest !== null ? (
                <span className="text-[13px] text-muted">
                  Personal best <span className="num text-ink">{previousBest}</span>
                </span>
              ) : null}
            </div>
          </div>
          <Ring value={s.accuracy} size={132} stroke={11} color={s.accuracy >= 0.8 ? 'var(--good)' : s.accuracy >= 0.5 ? 'var(--brand)' : 'var(--bad)'}>
            <div className="text-center">
              <div className="num text-[26px] font-semibold text-ink">{pct(s.accuracy)}</div>
              <div className="text-[11px] text-muted">accuracy</div>
            </div>
          </Ring>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Correct" value={s.correct} tone="good" />
            <MiniStat label="Wrong" value={s.incorrect} tone="bad" />
            <MiniStat label="Skipped" value={s.skipped} />
            <MiniStat label="Avg / question" value={secs(s.avgTimeMs)} />
            {s.partial > 0 && <MiniStat label="Partial" value={s.partial} />}
            <MiniStat label="Total time" value={clock(totalMs)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/50 px-6 py-4 md:px-8">
          <Button variant="primary" icon="rotate" kbd="↵" onClick={() => replay(false)}>
            {engine.config.mode === 'daily' || engine.config.mode === 'review' ? 'Play again' : 'New set'}
          </Button>
          {engine.config.mode !== 'daily' && engine.config.mode !== 'review' && (
            <Button icon="repeat" kbd="R" onClick={() => replay(true)}>
              Retry same seed
            </Button>
          )}
          <Button icon="link" onClick={copyLink}>
            {copied ? 'Link copied ✓' : 'Copy challenge link'}
          </Button>
          <Button variant="ghost" icon="home" kbd="Esc" className="ml-auto" onClick={() => navigate('/')}>
            Home
          </Button>
        </div>
      </Card>

      {/* Slowest subcategories */}
      {breakdown.length > 0 && (
        <section className="animate-rise">
          <SectionTitle title="Slowest subcategories" subtitle="Average time relative to the expected pace for those questions (1.0× = on pace)." />
          <Card className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2 text-[12px] text-muted">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Subcategory</th>
                  <th className="px-3 py-2.5 text-right font-medium">Qs</th>
                  <th className="px-3 py-2.5 text-right font-medium">Accuracy</th>
                  <th className="px-3 py-2.5 text-right font-medium">Avg time</th>
                  <th className="hidden px-4 py-2.5 text-left font-medium sm:table-cell">Pace vs expected</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.slice(0, 8).map((b) => (
                  <tr key={b.category + b.subcategory} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <CategoryDot category={b.category} />
                        <span className="text-ink">{subcategoryLabel(b.category, b.subcategory)}</span>
                        <span className="hidden text-faint md:inline">{CATEGORY_BY_ID[b.category].short}</span>
                      </div>
                    </td>
                    <td className="num px-3 py-2.5 text-right text-ink-2">{b.n}</td>
                    <td className="num px-3 py-2.5 text-right text-ink-2">{pct(b.accuracy)}</td>
                    <td className="num px-3 py-2.5 text-right text-ink">{secs(b.avgTimeMs)}</td>
                    <td className="hidden px-4 py-2.5 sm:table-cell">
                      <div className="flex items-center gap-2">
                        <div className="relative h-1.5 w-40 rounded-full bg-surface-3">
                          <div className={cx('absolute inset-y-0 left-0 rounded-full', b.paceRatio > 1 ? 'bg-bad' : 'bg-good')} style={{ width: `${Math.min(100, (b.paceRatio / maxPace) * 100)}%` }} />
                          <div className="absolute -top-1 -bottom-1 w-px bg-ink-2" style={{ left: `${(1 / maxPace) * 100}%` }} title="Expected pace" />
                        </div>
                        <span className="num w-12 text-[12px] text-muted">{b.paceRatio.toFixed(2)}×</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {/* Every question */}
      <section className="animate-rise">
        <SectionTitle
          title="Every question"
          subtitle="Click a row for the full solution."
          right={
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `All ${records.length}` },
                { value: 'wrong', label: 'Wrong' },
                { value: 'skipped', label: 'Skipped' },
                { value: 'correct', label: 'Correct' },
              ]}
            />
          }
        />
        {shown.length === 0 ? (
          <Empty icon="check" title="Nothing here">No questions match this filter.</Empty>
        ) : (
          <div className="space-y-2">
            {shown.map((r) => (
              <QuestionRow key={r.question.id + r.answeredAt} r={r} index={records.indexOf(r) + 1} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cx('num mt-0.5 text-[20px] font-semibold', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink')}>{value}</div>
    </div>
  )
}

const STATUS_META = {
  correct: { icon: 'check', cls: 'bg-good/15 text-good', label: 'Correct' },
  partial: { icon: 'target', cls: 'bg-warn/15 text-warn', label: 'Partial' },
  incorrect: { icon: 'x', cls: 'bg-bad/15 text-bad', label: 'Wrong' },
  timeout: { icon: 'timer', cls: 'bg-bad/15 text-bad', label: 'Timed out' },
  skipped: { icon: 'skip', cls: 'bg-surface-3 text-muted', label: 'Skipped' },
} as const

function QuestionRow({ r, index }: { r: AttemptRecord; index: number }) {
  const [open, setOpen] = useState(false)
  const q = r.question
  const meta = STATUS_META[r.status]
  const yours = r.status === 'skipped' ? '—' : r.status === 'timeout' ? '(no answer)' : q.answer.type === 'multiple-choice' ? `${r.input}) ${q.answer.choices[Number(r.input) - 1] ?? r.input}` : `${q.unit?.prefix ?? ''}${r.input}${q.unit?.suffix ?? ''}`
  return (
    <div className={cx('rounded-2xl border bg-surface transition-colors', open ? 'border-line-strong' : 'border-line hover:border-line-strong')}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full cursor-pointer items-start gap-3 p-4 text-left" aria-expanded={open}>
        <span className="num mt-0.5 w-6 shrink-0 text-right text-[12px] text-faint">{index}</span>
        <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-lg', meta.cls)} title={meta.label}>
          <Icon name={meta.icon} size={14} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
            <CategoryDot category={q.category} />
            {subcategoryLabel(q.category, q.subcategory)}
            <DifficultyPips d={q.difficulty} />
            {q.title && <span className="text-ink-2">{q.title}</span>}
          </div>
          <div className={cx('prompt prompt-left text-[14px] leading-relaxed text-ink', !open && 'line-clamp-2')}>
            <MathText text={q.prompt} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
            <span className="text-muted">
              You: <span className={cx('num', r.status === 'correct' ? 'text-good' : r.status === 'skipped' ? 'text-muted' : r.status === 'partial' ? 'text-warn' : 'text-bad')}>{yours}</span>
            </span>
            <span className="text-muted">
              Answer: <span className="num text-ink">{formatAnswer(q)}</span>
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[13px] text-ink-2">{secs(r.timeMs)}</div>
          <div className={cx('num text-[12px]', r.points > 0 ? 'text-good' : r.points < 0 ? 'text-bad' : 'text-faint')}>{signed(r.points, 2)}</div>
        </div>
        <Icon name="chevronDown" size={16} className={cx('mt-0.5 shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="animate-fade border-t border-line px-4 py-4 pl-[4.25rem]">
          <div className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Solution</div>
          <ol className="space-y-2">
            {q.explanation.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-2">
                <span className="num mt-0.5 text-[11px] text-faint">{i + 1}.</span>
                <MathText text={step} />
              </li>
            ))}
          </ol>
          {r.hintsUsed > 0 && <div className="mt-3 text-[12px] text-brand">Used {r.hintsUsed} hint{r.hintsUsed > 1 ? 's' : ''}</div>}
        </div>
      )}
    </div>
  )
}
