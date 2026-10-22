import { useEffect } from 'react'
import { BOX_INTERVAL_DAYS, dueItems, nextDue, type ReviewItem } from '../../engine/review'
import { reviewConfig } from '../../engine/modes'
import { CATEGORY_BY_ID, subcategoryLabel } from '../../generators'
import { Icon } from '../components/Icon'
import { MathText } from '../components/MathText'
import { Button, Card, CategoryDot, DifficultyPips, Empty, PageHeader, SectionTitle, cx } from '../components/ui'
import { useRepo } from '../store'
import { isTypingTarget, useClock, useStartSession } from '../useStart'

function dueText(ts: number, now: number): string {
  const d = ts - now
  if (d <= 0) return 'due now'
  const h = Math.round(d / 3_600_000)
  if (h < 24) return `in ${Math.max(1, h)}h`
  return `in ${Math.round(h / 24)}d`
}

export function Review() {
  const repo = useRepo()
  const start = useStartSession()
  const { now } = useClock()
  const due = dueItems(repo.review, now)
  const all = Object.values(repo.review).sort((a, b) => a.due - b.due)
  const next = nextDue(repo.review, now)
  const go = () => due.length && start(reviewConfig(due, now))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isTypingTarget(e) && e.key === 'Enter') go()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const remove = (key: string) => {
    const q = { ...repo.review }
    delete q[key]
    repo.setReview(q)
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Spaced repetition"
        title="Review Mistakes"
        subtitle="Every question you miss is queued by its template. Reviews regenerate it with fresh numbers; each correct answer pushes it further out (same day → 1 → 3 → 7 → 14 → 30 days) until it graduates."
      />
      <Card className="animate-rise flex flex-wrap items-center gap-6 p-6">
        <div>
          <div className="num text-[44px] leading-none font-semibold text-ink">{due.length}</div>
          <div className="mt-1 text-[13px] text-muted">due now · {all.length} in queue</div>
        </div>
        <div className="hidden h-12 w-px bg-line sm:block" />
        <div className="text-[13px] text-muted">
          {due.length ? `A session reviews up to 20 items, weakest boxes first.` : next ? `Next item comes due ${dueText(next, now)}.` : 'Your queue is empty — mistakes from any mode land here automatically.'}
        </div>
        <Button variant="primary" size="lg" icon="play" kbd="↵" className="ml-auto" disabled={!due.length} onClick={go}>
          Review {Math.min(20, due.length) || ''} now
        </Button>
      </Card>

      <section>
        <SectionTitle title="Queue" subtitle="Box = how many times in a row you've got it right since the last miss." />
        {all.length === 0 ? (
          <Empty icon="repeat" title="Nothing to review">Questions you answer incorrectly will appear here.</Empty>
        ) : (
          <div className="space-y-2">
            {all.map((it) => (
              <QueueRow key={it.key} it={it} now={now} onRemove={() => remove(it.key)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function QueueRow({ it, now, onRemove }: { it: ReviewItem; now: number; onRemove(): void }) {
  const isDue = it.due <= now
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <CategoryDot category={it.category} />
          {CATEGORY_BY_ID[it.category].label} / {subcategoryLabel(it.category, it.subcategory)}
          <DifficultyPips d={it.difficulty} />
          {it.lapses > 1 && <span className="text-bad">missed {it.lapses}×</span>}
        </div>
        <div className="prompt prompt-left line-clamp-2 text-[14px] text-ink-2">
          <MathText text={it.sample} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="flex justify-end gap-[3px]" title={`Box ${it.box} of ${BOX_INTERVAL_DAYS.length - 1}`}>
          {BOX_INTERVAL_DAYS.map((_, i) => (
            <span key={i} className={cx('h-2 w-2 rounded-full', i <= it.box ? 'bg-brand' : 'bg-surface-3')} />
          ))}
        </div>
        <div className={cx('mt-1.5 text-[12px]', isDue ? 'font-medium text-brand' : 'text-muted')}>{dueText(it.due, now)}</div>
      </div>
      <button onClick={onRemove} aria-label="Remove from queue" title="Remove from queue" className="cursor-pointer rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-bad">
        <Icon name="trash" size={15} />
      </button>
    </div>
  )
}
