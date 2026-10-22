import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { formatAnswer } from '../../core/answer'
import type { Question } from '../../core/types'
import type { SessionEngine } from '../../engine/session'
import { CATEGORY_BY_ID, subcategoryLabel } from '../../generators'
import { Logo } from '../../App'
import { Icon } from '../components/Icon'
import { MathText } from '../components/MathText'
import { Button, CategoryChip, DifficultyPips, Kbd, cx } from '../components/ui'
import { clock, signed } from '../format'
import { navigate } from '../router'
import { finalizeSession } from '../sessionFlow'
import { sfx } from '../sound'
import { useRepo, useSession } from '../store'

type Flash = 'good' | 'bad' | 'partial' | null

export function Player({ engine }: { engine: SessionEngine }) {
  const repo = useRepo()
  const { setLast } = useSession()
  const settings = repo.settings
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const [now, setNow] = useState(() => Date.now())
  const [value, setValue] = useState('')
  const [shakeKey, setShakeKey] = useState(0)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [hints, setHints] = useState<string[]>([])
  const [confirmQuit, setConfirmQuit] = useState(false)
  const [flash, setFlash] = useState<Flash>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const advanceTimer = useRef<number | null>(null)
  const finalized = useRef(false)
  const warned = useRef<number>(-1)

  const q = engine.current
  const phase = engine.phase
  const isMC = q?.answer.type === 'multiple-choice'
  const fb = engine.config.feedback
  // Fermi answers always show their reference breakdown (unless feedback is off entirely).
  const waitsForEnter = fb === 'explain' || (fb !== 'off' && engine.lastRecord?.question.category === 'fermi')

  const finish = useCallback(() => {
    if (finalized.current) return
    finalized.current = true
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    const result = finalizeSession(engine, repo)
    setLast(result)
    sfx.finish()
    navigate('/results')
  }, [engine, repo, setLast])

  const resetForNext = () => {
    setValue('')
    setHints([])
    setInvalid(null)
    setFlash(null)
  }

  const advanceNow = useCallback(() => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
    advanceTimer.current = null
    engine.advance(Date.now())
    resetForNext()
    rerender()
    if (engine.phase === 'finished') finish()
  }, [engine, finish])

  /** React to a newly recorded attempt according to the feedback mode. */
  const afterRecord = useCallback(() => {
    const rec = engine.lastRecord!
    const good = rec.status === 'correct'
    const partial = rec.status === 'partial'
    if (fb === 'off') {
      sfx.skip()
      advanceNow()
      return
    }
    if (rec.status === 'skipped' && fb === 'instant') {
      sfx.skip()
      advanceNow()
      return
    }
    if (good) sfx.correct()
    else if (rec.status !== 'skipped') sfx.wrong()
    setFlash(good ? 'good' : partial ? 'partial' : 'bad')
    rerender()
    const explain = fb === 'explain' || rec.question.category === 'fermi'
    if (!explain) advanceTimer.current = window.setTimeout(advanceNow, good ? 450 : settings.feedbackMs)
  }, [engine, fb, advanceNow, settings.feedbackMs])

  const submit = useCallback(
    (input: string) => {
      if (engine.phase !== 'question') return
      const res = engine.submit(input, Date.now())
      if (res.status === 'invalid') {
        setInvalid(res.message ?? 'Invalid answer')
        setShakeKey((k) => k + 1)
        return
      }
      setInvalid(null)
      afterRecord()
    },
    [engine, afterRecord],
  )

  // Clock: 10 Hz tick drives timers and timeouts.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (phase !== 'question' && phase !== 'feedback') return
    const rem = engine.sectionTimeRemaining(now)
    const lim = engine.sectionConfig.timeLimitSec
    if (rem !== null && lim && rem <= lim * 100 && warned.current !== engine.section) {
      warned.current = engine.section
      sfx.warn()
    }
    if (rem !== null && rem <= 0) {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
      engine.sectionTimeUp(now)
      // The section clock is an external timer; syncing UI state to it here is intended.
      // eslint-disable-next-line react/set-state-in-effect
      resetForNext()
      rerender()
      if (engine.phase === 'finished') finish()
      return
    }
    const qrem = engine.questionTimeRemaining(now)
    if (qrem !== null && qrem <= 0 && engine.phase === 'question') {
      engine.timeout(now)
      afterRecord()
    }
  }, [now, engine, phase, finish, afterRecord])

  // Keep the cursor in the answer box.
  useLayoutEffect(() => {
    if (phase === 'question' && !isMC && !confirmQuit) inputRef.current?.focus()
    else if (phase === 'feedback') inputRef.current?.blur()
  })

  // Keyboard-first controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmQuit) {
        if (e.key === 'Enter') {
          e.preventDefault()
          engine.quit(Date.now())
          finish()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setConfirmQuit(false)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setConfirmQuit(true)
        return
      }
      if (engine.phase === 'section-break') {
        if (e.key === 'Enter') {
          e.preventDefault()
          engine.startNextSection(Date.now())
          resetForNext()
          rerender()
        }
        return
      }
      if (engine.phase === 'feedback') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          advanceNow()
        }
        if (e.key === 'Tab') e.preventDefault()
        return
      }
      if (engine.phase !== 'question' || !engine.current) return
      if (e.key === 'Tab') {
        e.preventDefault()
        if (engine.skip(Date.now())) afterRecord()
        return
      }
      if (e.key === '?') {
        e.preventDefault()
        const h = engine.useHint()
        if (h) setHints((xs) => [...xs, h])
        return
      }
      const a = engine.current.answer
      if (a.type === 'multiple-choice' && /^[1-9]$/.test(e.key) && Number(e.key) <= a.choices.length && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        submit(e.key)
        return
      }
      if (e.key === 'Enter' && a.type !== 'multiple-choice') {
        e.preventDefault()
        submit(inputRef.current?.value ?? '')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [engine, confirmQuit, submit, advanceNow, afterRecord, finish])

  // Dev-only handle for the end-to-end/screenshot scripts.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __quantoa?: SessionEngine }).__quantoa = engine
  }, [engine])

  // Persist progress if the tab closes mid-session.
  useEffect(() => {
    const onUnload = () => {
      if (!finalized.current && engine.records.length) {
        engine.quit(Date.now())
        finalizeSession(engine, repo)
        finalized.current = true
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [engine, repo])

  useEffect(() => () => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current)
  }, [])

  const secRem = engine.sectionTimeRemaining(now)
  const secLim = engine.sectionConfig.timeLimitSec
  const qRem = engine.questionTimeRemaining(now)
  const total = engine.sectionTotal
  const sectionRecords = engine.records.filter((r) => r.section === engine.section).length
  const qNumber = engine.config.fixed ? engine.records.length + (phase === 'question' ? 1 : 0) : sectionRecords + (phase === 'question' ? 1 : 0)

  return (
    <div className="flex min-h-screen flex-col">
      {/* HUD */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-4 px-4 md:px-6">
          <button onClick={() => setConfirmQuit(true)} className="flex cursor-pointer items-center gap-2 rounded-lg py-1 pr-2 text-muted hover:text-ink" aria-label="Quit session">
            <Logo size={26} />
            <Kbd>Esc</Kbd>
          </button>
          <div className="hidden min-w-0 sm:block">
            <div className="truncate text-[14px] font-semibold text-ink">{engine.config.title}</div>
            {engine.config.sections.length > 1 && (
              <div className="text-[12px] text-muted">
                Section {engine.section + 1}/{engine.config.sections.length} · {engine.sectionConfig.label}
              </div>
            )}
          </div>
          <div className="ml-auto flex items-center gap-5 md:gap-7">
            {engine.lives !== null && (
              <div className="flex items-center gap-1" aria-label={`${engine.lives} lives left`}>
                {Array.from({ length: engine.config.lives ?? 0 }, (_, i) => (
                  <Icon key={i} name="heart" size={18} className={cx('transition-all', i < (engine.lives ?? 0) ? 'fill-bad text-bad' : 'text-faint opacity-50')} />
                ))}
              </div>
            )}
            <HudStat label={total ? 'Question' : 'Answered'} value={total ? `${Math.min(qNumber, total)}/${total}` : String(engine.records.length)} />
            <HudStat label="Score" value={signed(engine.score, 2).replace('+', '')} />
            {engine.config.rampEvery && <HudStat label="Level" value={String(engine.survivalDifficulty())} />}
            {secRem !== null && secLim && <Countdown remaining={secRem} limit={secLim * 1000} />}
          </div>
        </div>
        {secRem !== null && secLim && (
          <div className="h-[3px] w-full bg-surface-2">
            <div className={cx('h-full transition-[width] duration-100 ease-linear', secRem < secLim * 100 ? 'bg-bad' : 'bg-brand')} style={{ width: `${(secRem / (secLim * 1000)) * 100}%` }} />
          </div>
        )}
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-10 pb-24 md:items-center md:pt-0">
        {phase === 'section-break' ? (
          <SectionBreak engine={engine} />
        ) : q ? (
          <QuestionCard
            key={q.id}
            q={q}
            engine={engine}
            value={value}
            setValue={(v) => {
              setValue(v)
              setInvalid(null)
            }}
            inputRef={inputRef}
            shakeKey={shakeKey}
            invalid={invalid}
            hints={hints}
            flash={flash}
            onChoose={(i) => submit(String(i + 1))}
            onHint={() => {
              const h = engine.useHint()
              if (h) setHints((xs) => [...xs, h])
            }}
            qRemaining={qRem}
            waitsForEnter={waitsForEnter}
            onContinue={advanceNow}
          />
        ) : null}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-11 max-w-5xl items-center gap-5 overflow-x-auto px-4 text-[12px] text-muted md:px-6">
          <span className="flex shrink-0 items-center gap-1.5">
            <Kbd>↵</Kbd> {phase === 'feedback' ? 'continue' : 'submit'}
          </span>
          {engine.config.allowSkip && (
            <span className="flex shrink-0 items-center gap-1.5">
              <Kbd>Tab</Kbd> skip
            </span>
          )}
          {isMC && (
            <span className="flex shrink-0 items-center gap-1.5">
              <Kbd>1</Kbd>–<Kbd>{q?.answer.type === 'multiple-choice' ? q.answer.choices.length : 4}</Kbd> choose
            </span>
          )}
          {engine.config.hints && (q?.hints?.length ?? 0) > 0 && (
            <span className="flex shrink-0 items-center gap-1.5">
              <Kbd>?</Kbd> hint (−25%)
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1.5">
            <Kbd>Esc</Kbd> quit
          </span>
          <span className="num ml-auto shrink-0 text-faint">seed {engine.config.seed}</span>
        </div>
      </footer>

      {confirmQuit && (
        <div data-modal className="animate-fade fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setConfirmQuit(false)}>
          <div className="animate-pop w-full max-w-sm rounded-2xl border border-line-strong bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-lg font-semibold text-ink">End this session?</div>
            <p className="mt-1.5 text-[14px] text-muted">Answers so far are saved and you'll see your results.</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" kbd="Esc" onClick={() => setConfirmQuit(false)}>
                Keep going
              </Button>
              <Button
                variant="danger"
                kbd="↵"
                onClick={() => {
                  engine.quit(Date.now())
                  finish()
                }}
              >
                End session
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HudStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right leading-tight">
      <div className="text-[10.5px] font-medium tracking-wider text-faint uppercase">{label}</div>
      <div className="num text-[17px] font-semibold text-ink">{value}</div>
    </div>
  )
}

function Countdown({ remaining, limit }: { remaining: number; limit: number }) {
  const low = remaining < limit * 0.1
  return (
    <div className={cx('num flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[20px] font-semibold tabular-nums', low ? 'animate-pulse-red border-bad/40 bg-bad/10 text-bad' : 'border-line bg-surface text-ink')} role="timer" aria-label={`${clock(remaining)} remaining`}>
      <Icon name="timer" size={17} className={low ? '' : 'text-muted'} />
      {clock(remaining)}
    </div>
  )
}

function QuestionCard({
  q,
  engine,
  value,
  setValue,
  inputRef,
  shakeKey,
  invalid,
  hints,
  flash,
  onChoose,
  onHint,
  qRemaining,
  waitsForEnter,
  onContinue,
}: {
  q: Question
  engine: SessionEngine
  value: string
  setValue(v: string): void
  inputRef: React.RefObject<HTMLInputElement | null>
  shakeKey: number
  invalid: string | null
  hints: string[]
  flash: Flash
  onChoose(i: number): void
  onHint(): void
  qRemaining: number | null
  waitsForEnter: boolean
  onContinue(): void
}) {
  const inFeedback = engine.phase === 'feedback'
  const rec = inFeedback ? engine.lastRecord : null
  const long = q.prompt.length > 240
  const a = q.answer
  const perQ = engine.config.perQuestionSec
  const showFeedback = inFeedback && engine.config.feedback !== 'off'

  return (
    <div className="w-full max-w-3xl animate-rise">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <CategoryChip category={q.category} sub={subcategoryLabel(q.category, q.subcategory)} />
        <DifficultyPips d={q.difficulty} />
        {q.title && <span className="text-[13px] font-semibold text-ink-2">{q.title}</span>}
        {perQ && qRemaining !== null && (
          <div className="ml-auto flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-3">
              <div className={cx('h-full rounded-full transition-[width] duration-100 ease-linear', qRemaining < perQ * 250 ? 'bg-bad' : 'bg-ink-2')} style={{ width: `${(qRemaining / (perQ * 1000)) * 100}%` }} />
            </div>
            <span className={cx('num text-[13px]', qRemaining < perQ * 250 ? 'text-bad' : 'text-muted')}>{Math.ceil(qRemaining / 1000)}s</span>
          </div>
        )}
      </div>

      <div
        className={cx(
          'rounded-3xl border bg-surface p-6 shadow-[var(--shadow)] transition-colors md:p-9',
          flash === 'good' && showFeedback ? 'animate-flash-good border-good/60' : flash === 'bad' && showFeedback ? 'border-bad/50' : flash === 'partial' && showFeedback ? 'border-warn/50' : 'border-line',
        )}
      >
        <div className={cx('prompt leading-relaxed text-ink', long ? 'text-[16px] md:text-[17px]' : 'text-[20px] md:text-[24px]')}>
          <MathText text={q.prompt} />
        </div>

        {hints.length > 0 && (
          <div className="mt-5 space-y-2">
            {hints.map((h, i) => (
              <div key={i} className="animate-rise flex gap-2.5 rounded-xl border border-brand/25 bg-brand/[0.06] px-3.5 py-2.5 text-[14px] text-ink-2">
                <Icon name="bulb" size={16} className="mt-0.5 shrink-0 text-brand" />
                <MathText text={h} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-7">
          {a.type === 'multiple-choice' ? (
            <div className={cx('grid gap-2.5', a.choices.every((c) => c.length < 16) && a.choices.length >= 4 ? (a.choices.length === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-5') : 'grid-cols-1')}>
              {a.choices.map((c, i) => {
                const chosen = rec && rec.input === String(i + 1)
                const correct = showFeedback && i === a.correctIndex
                const wrongPick = showFeedback && chosen && i !== a.correctIndex
                return (
                  <button
                    key={i}
                    disabled={engine.phase !== 'question'}
                    onClick={() => onChoose(i)}
                    className={cx(
                      'group flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition-all disabled:cursor-default',
                      correct ? 'border-good/60 bg-good/10 text-ink' : wrongPick ? 'animate-shake border-bad/60 bg-bad/10 text-ink' : 'border-line bg-surface-2 text-ink hover:border-line-strong hover:bg-surface-3',
                    )}
                  >
                    <span className={cx('num grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[13px] font-semibold', correct ? 'bg-good text-white' : wrongPick ? 'bg-bad text-white' : 'bg-surface-3 text-ink-2 group-hover:text-ink')}>{i + 1}</span>
                    <span className="num">
                      <MathText text={c} />
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div key={shakeKey} className={cx(shakeKey > 0 && 'animate-shake')}>
              <div
                className={cx(
                  'flex items-center rounded-2xl border-2 bg-surface-2 px-5 transition-colors',
                  engine.phase === 'question' && 'focus-within:border-brand',
                  showFeedback && flash === 'good' ? 'border-good' : showFeedback && flash === 'bad' ? 'border-bad' : showFeedback && flash === 'partial' ? 'border-warn' : invalid ? 'border-bad/60' : 'border-line',
                )}
              >
                {q.unit?.prefix && <span className="num mr-1 text-[28px] text-muted">{q.unit.prefix}</span>}
                <input
                  ref={inputRef}
                  value={inFeedback ? (rec?.input ?? value) : value}
                  onChange={(e) => setValue(e.target.value)}
                  onBlur={() => {
                    if (engine.phase === 'question' && !document.querySelector('[data-modal]')) window.setTimeout(() => inputRef.current?.focus(), 0)
                  }}
                  readOnly={engine.phase !== 'question'}
                  placeholder={q.inputHint ?? 'Answer'}
                  inputMode="decimal"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Answer"
                  className="num h-[72px] min-w-0 flex-1 bg-transparent focus-visible:outline-none text-[32px] font-medium text-ink outline-none placeholder:text-[18px] placeholder:font-normal placeholder:text-faint md:text-[36px]"
                />
                {q.unit?.suffix && <span className="num ml-2 shrink-0 text-[18px] text-muted">{q.unit.suffix.trim()}</span>}
                {engine.config.hints && (q.hints?.length ?? 0) > hints.length && engine.phase === 'question' && (
                  <button onClick={onHint} className="ml-3 flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-muted hover:border-brand/50 hover:text-brand">
                    <Icon name="bulb" size={14} /> Hint {hints.length + 1}/{q.hints!.length}
                  </button>
                )}
              </div>
              <div className="mt-2 h-5 px-1 text-[13px] text-bad">{invalid}</div>
            </div>
          )}
        </div>

        {showFeedback && rec && <FeedbackBanner q={q} rec={rec} />}
      </div>

      {showFeedback && waitsForEnter && rec && (
        <div className="animate-rise mt-5 rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow)]">
          <div className="mb-3 flex items-center gap-2 text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">
            <Icon name="book" size={14} /> {q.category === 'fermi' ? 'Reference breakdown' : 'Solution'}
          </div>
          <ol className="space-y-2.5">
            {q.explanation.map((step, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ink-2">
                <span className="num mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-surface-3 text-[11px] text-muted">{i + 1}</span>
                <MathText text={step} />
              </li>
            ))}
          </ol>
          <div className="mt-5 flex justify-end">
            <Button variant="primary" kbd="↵" onClick={onContinue}>
              Next question
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function FeedbackBanner({ q, rec }: { q: Question; rec: NonNullable<SessionEngine['lastRecord']> }) {
  const good = rec.status === 'correct'
  const partial = rec.status === 'partial'
  const label = good ? 'Correct' : partial ? 'Partial credit' : rec.status === 'timeout' ? "Time's up" : rec.status === 'skipped' ? 'Skipped' : 'Not quite'
  const ratio = q.answer.type === 'estimate' && rec.input ? estimateRatioText(q, rec.input) : null
  return (
    <div className={cx('animate-rise mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3', good ? 'bg-good/10' : partial ? 'bg-warn/10' : 'bg-bad/10')}>
      <span className={cx('flex items-center gap-2 text-[15px] font-semibold', good ? 'text-good' : partial ? 'text-warn' : 'text-bad')}>
        <Icon name={good ? 'check' : partial ? 'target' : 'x'} size={18} strokeWidth={2.4} />
        {label}
      </span>
      {!good && (
        <span className="text-[14px] text-ink-2">
          {q.answer.type === 'estimate' ? 'Reference' : 'Answer'}: <span className="num font-semibold text-ink">{formatAnswer(q)}</span>
        </span>
      )}
      {ratio && <span className="text-[13px] text-muted">{ratio}</span>}
      <span className={cx('num ml-auto text-[14px] font-semibold', rec.points > 0 ? 'text-good' : rec.points < 0 ? 'text-bad' : 'text-muted')}>{signed(rec.points, 2)}</span>
    </div>
  )
}

function estimateRatioText(q: Question, input: string): string | null {
  if (q.answer.type !== 'estimate') return null
  const v = Number(input.replace(/[, ]/g, ''))
  const ref = q.answer.value
  const parsed = Number.isFinite(v) && v > 0 ? v : null
  if (!parsed) return `Full credit within 2×, partial within 10×`
  const r = Math.max(parsed / ref, ref / parsed)
  return `${r < 10 ? r.toFixed(1) : Math.round(r)}× ${parsed > ref ? 'too high' : 'too low'}`
}

function SectionBreak({ engine }: { engine: SessionEngine }) {
  const prev = engine.config.sections[engine.section]
  const next = engine.config.sections[engine.section + 1]
  const recs = engine.records.filter((r) => r.section === engine.section)
  const correct = recs.filter((r) => r.status === 'correct').length
  return (
    <div className="animate-pop w-full max-w-lg rounded-3xl border border-line bg-surface p-8 text-center shadow-[var(--shadow)]">
      <div className="text-[12px] font-semibold tracking-[0.14em] text-muted uppercase">
        Section {engine.section + 1} complete · {prev.label}
      </div>
      <div className="num mt-3 text-[40px] font-semibold text-ink">
        {correct}
        <span className="text-faint">/{recs.length}</span>
      </div>
      <div className="text-[13px] text-muted">correct answers</div>
      <div className="my-7 h-px bg-line" />
      <div className="text-[12px] font-semibold tracking-[0.14em] text-brand uppercase">Up next</div>
      <div className="mt-2 text-2xl font-semibold text-ink">{next.label}</div>
      <div className="num mt-1 text-[14px] text-muted">
        {next.questionCount} questions · {clock((next.timeLimitSec ?? 0) * 1000)} · {CATEGORY_BY_ID[next.filters[0].category].label}
      </div>
      <Button
        variant="primary"
        size="lg"
        kbd="↵"
        className="mt-7"
        onClick={() => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
        }}
      >
        Begin section {engine.section + 2}
      </Button>
    </div>
  )
}
