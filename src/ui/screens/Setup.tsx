import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CategoryId, Difficulty } from '../../core/types'
import { MODES, drillConfig, oaConfig, sprintConfig, survivalConfig, zenConfig, type OAPreset } from '../../engine/modes'
import type { CategoryFilter, DifficultySetting, SessionConfig } from '../../engine/session'
import { CATEGORY_BY_ID, GENERATORS } from '../../generators'
import { Icon } from '../components/Icon'
import { Button, Card, CategoryDot, Field, NumberInput, PageHeader, Segmented, Toggle, cx } from '../components/ui'
import { catVar, clock } from '../format'
import { MODE_ICON } from '../icons'
import { navigate, useRoute } from '../router'
import { useRepo } from '../store'
import { isTypingTarget, useStartSession } from '../useStart'

const QUESTION_CATS: CategoryId[] = ['mental-math', 'sequences', 'probability', 'arbitrage', 'brainteasers', 'fermi']

export function Setup({ mode }: { mode: string }) {
  const info = MODES.find((m) => m.id === mode)
  if (!info) {
    navigate('/')
    return null
  }
  return (
    <div>
      <a href="#/" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <Icon name="arrowLeft" size={14} /> All modes
      </a>
      <PageHeader
        eyebrow={info.tagline}
        title={info.label}
        subtitle={info.description}
        right={
          <div className="hidden h-14 w-14 place-items-center rounded-2xl border border-line bg-surface text-brand shadow-[var(--shadow)] sm:grid">
            <Icon name={MODE_ICON[info.id]} size={26} />
          </div>
        }
      />
      {mode === 'oa' && <OASetup />}
      {mode === 'sprint' && <SprintSetup />}
      {mode === 'survival' && <SurvivalSetup />}
      {mode === 'drill' && <DrillSetup zen={false} />}
      {mode === 'zen' && <DrillSetup zen />}
    </div>
  )
}

/** Two-column layout: options on the left, summary + start on the right. Enter starts. */
function SetupLayout({ children, summary, build }: { children: ReactNode; summary: ReactNode; build: () => SessionConfig | null }) {
  const start = useStartSession()
  const [seed, setSeed] = useState('')
  const go = () => {
    const cfg = build()
    if (!cfg) return
    start(seed.trim() ? { ...cfg, seed: seed.trim() } : cfg)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !(isTypingTarget(e) && (e.target as HTMLElement).id !== 'seed-input')) {
        e.preventDefault()
        go()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const ok = build() !== null
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card className="animate-rise space-y-7 p-6">{children}</Card>
      <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
        <Card className="animate-rise p-5 [animation-delay:60ms]">
          <div className="mb-4 text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">Session</div>
          <div className="space-y-2.5 text-[13px]">{summary}</div>
          <div className="mt-5 border-t border-line pt-4">
            <Field label="Seed" hint="optional — replay or share a set">
              <input
                id="seed-input"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="random"
                className="num h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-ink outline-none placeholder:text-faint focus:border-brand focus-visible:outline-none"
              />
            </Field>
          </div>
          <Button variant="primary" size="lg" icon="play" kbd="↵" className="mt-5 w-full" disabled={!ok} onClick={go}>
            Start
          </Button>
          {!ok && <p className="mt-2 text-center text-[12px] text-bad">Pick at least one category.</p>}
        </Card>
        <p className="px-1 text-[12px] leading-relaxed text-faint">
          The cursor stays in the answer box. <span className="text-muted">Enter</span> submits, <span className="text-muted">Tab</span> skips, number keys pick multiple-choice options, <span className="text-muted">Esc</span> quits.
        </p>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className="num text-right text-ink">{v}</span>
    </div>
  )
}

function CategoryPicker({ value, onChange, allowed = QUESTION_CATS, single }: { value: CategoryId[]; onChange(v: CategoryId[]): void; allowed?: CategoryId[]; single?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {allowed.map((id) => {
        const on = value.includes(id)
        return (
          <button
            key={id}
            aria-pressed={on}
            onClick={() => onChange(single ? [id] : on ? value.filter((x) => x !== id) : [...value, id])}
            className={cx(
              'inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[13px] font-medium transition-all',
              on ? 'border-transparent bg-surface-3 text-ink ring-1 ring-line-strong' : 'border-line text-muted hover:border-line-strong hover:text-ink',
            )}
          >
            <CategoryDot category={id} />
            {CATEGORY_BY_ID[id].label}
            {on && !single && <Icon name="check" size={13} className="text-brand" />}
          </button>
        )
      })}
    </div>
  )
}

function DifficultyPicker({ value, onChange, allowAdaptive = true }: { value: DifficultySetting; onChange(v: DifficultySetting): void; allowAdaptive?: boolean }) {
  const key = Array.isArray(value) ? 'mixed' : String(value)
  const options = [
    ...(allowAdaptive ? [{ value: 'adaptive', label: 'Adaptive', hint: 'Elo picks the next difficulty' }] : []),
    ...[1, 2, 3, 4, 5].map((d) => ({ value: String(d), label: String(d) })),
    { value: 'mixed', label: 'Mixed 1–5' },
  ]
  return (
    <Segmented
      options={options}
      value={key}
      onChange={(v) => onChange(v === 'adaptive' ? 'adaptive' : v === 'mixed' ? [1, 5] : (Number(v) as Difficulty))}
    />
  )
}

const diffLabel = (d: DifficultySetting) => (d === 'adaptive' ? 'Adaptive (Elo)' : Array.isArray(d) ? `Mixed ${d[0]}–${d[1]}` : `Level ${d}`)

// ---------------------------------------------------------------------------

function OASetup() {
  const repo = useRepo()
  const s = repo.settings
  const [preset, setPreset] = useState<OAPreset>('classic')
  const [cats, setCats] = useState<CategoryId[]>(['mental-math'])
  const [minutes, setMinutes] = useState(Math.round(s.oaTimeLimitSec / 60))
  const [count, setCount] = useState(s.oaQuestionCount)
  const [penalty, setPenalty] = useState(Math.abs(s.oaMarking.wrong))
  const [feedback, setFeedback] = useState(s.oaFeedback)
  const build = () => (preset === 'custom' && cats.length === 0 ? null : oaConfig({ preset, categories: cats, timeLimitSec: minutes * 60, questionCount: count, penalty, feedback }, s))
  const cfg = build()
  return (
    <SetupLayout
      build={build}
      summary={
        cfg && (
          <>
            <Row k="Format" v={cfg.title} />
            <Row k="Sections" v={cfg.sections.length} />
            <Row k="Questions" v={cfg.sections.reduce((a, x) => a + (x.questionCount ?? 0), 0)} />
            <Row k="Total time" v={clock(cfg.sections.reduce((a, x) => a + (x.timeLimitSec ?? 0), 0) * 1000)} />
            <Row k="Marking" v={`+1 / −${penalty} / 0`} />
            <Row k="Feedback" v={feedback ? 'Instant' : 'Off (real test)'} />
          </>
        )
      }
    >
      <Field label="Format">
        <Segmented
          value={preset}
          onChange={setPreset}
          options={[
            { value: 'classic', label: `Classic ${s.oaQuestionCount} in ${Math.round(s.oaTimeLimitSec / 60)}` },
            { value: 'full', label: 'Full OA · 4 sections' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      </Field>
      {preset === 'classic' && (
        <InfoBox>
          The classic mental-math screen: {s.oaQuestionCount} arithmetic questions in {Math.round(s.oaTimeLimitSec / 60)} minutes — about {(s.oaTimeLimitSec / s.oaQuestionCount).toFixed(0)} seconds each. Wrong answers cost points, so skip what you can't do quickly. Defaults are editable in Settings.
        </InfoBox>
      )}
      {preset === 'full' && (
        <div className="overflow-hidden rounded-xl border border-line">
          {oaConfig({ preset: 'full' }, s).sections.map((sec, i) => (
            <div key={sec.label} className="flex items-center gap-3 border-b border-line px-4 py-3 text-[13px] last:border-b-0">
              <span className="num grid h-6 w-6 place-items-center rounded-md bg-surface-3 text-[11px] text-ink-2">{i + 1}</span>
              <CategoryDot category={sec.filters[0].category} />
              <span className="font-medium text-ink">{sec.label}</span>
              <span className="num ml-auto text-muted">
                {sec.questionCount} q · {clock((sec.timeLimitSec ?? 0) * 1000)}
              </span>
            </div>
          ))}
        </div>
      )}
      {preset === 'custom' && (
        <>
          <Field label="Categories">
            <CategoryPicker value={cats} onChange={setCats} allowed={['mental-math', 'sequences', 'probability', 'arbitrage']} />
          </Field>
          <div className="flex flex-wrap gap-6">
            <Field label="Time limit">
              <NumberInput value={minutes} onChange={setMinutes} min={1} max={90} suffix="min" />
            </Field>
            <Field label="Questions">
              <NumberInput value={count} onChange={setCount} min={5} max={200} />
            </Field>
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-6">
        <Field label="Penalty for a wrong answer" hint="skip = 0">
          <Segmented
            value={penalty}
            onChange={setPenalty}
            options={[0, 0.25, 0.5, 1, 2].map((v) => ({ value: v, label: v === 0 ? 'None' : `−${v}` }))}
          />
        </Field>
      </div>
      <Toggle checked={feedback} onChange={setFeedback} label="Instant feedback" description="Real OAs don't tell you if you were right. Leave this off for a realistic run." />
    </SetupLayout>
  )
}

function SprintSetup() {
  const repo = useRepo()
  const [seconds, setSeconds] = useState<60 | 120 | 300>(repo.settings.sprintSeconds)
  const [cats, setCats] = useState<CategoryId[]>(['mental-math'])
  const build = () => (cats.length ? sprintConfig({ seconds, categories: cats }, repo.settings) : null)
  return (
    <SetupLayout
      build={build}
      summary={
        <>
          <Row k="Duration" v={clock(seconds * 1000)} />
          <Row k="Categories" v={cats.length > 1 ? `Mix of ${cats.length}` : cats[0] ? CATEGORY_BY_ID[cats[0]].label : '—'} />
          <Row k="Difficulty" v={repo.settings.adaptive ? 'Adaptive (Elo)' : `Level ${repo.settings.defaultDifficulty}`} />
          <Row k="Scoring" v="+1 per correct" />
        </>
      }
    >
      <Field label="Duration">
        <Segmented value={seconds} onChange={setSeconds} options={[60, 120, 300].map((v) => ({ value: v as 60 | 120 | 300, label: `${v}s` }))} />
      </Field>
      <Field label="Categories" hint="pick several for a mix">
        <CategoryPicker value={cats} onChange={setCats} />
      </Field>
      <InfoBox>Wrong answers cost nothing but time — the correct answer flashes briefly so you learn as you go. Difficulty follows the adaptive setting in Settings.</InfoBox>
    </SetupLayout>
  )
}

function SurvivalSetup() {
  const [cats, setCats] = useState<CategoryId[]>(['mental-math', 'sequences'])
  const [timer, setTimer] = useState<number>(0)
  const [startD, setStartD] = useState<Difficulty>(1)
  const build = () => (cats.length ? survivalConfig({ categories: cats, perQuestionSec: timer || null, startDifficulty: startD }) : null)
  return (
    <SetupLayout
      build={build}
      summary={
        <>
          <Row k="Lives" v="♥ ♥ ♥" />
          <Row k="Difficulty" v={`${startD} → 5, +1 every 5 correct`} />
          <Row k="Per-question clock" v={timer ? `${timer}s` : 'Off'} />
          <Row k="Skips" v="Not allowed" />
        </>
      }
    >
      <Field label="Categories">
        <CategoryPicker value={cats} onChange={setCats} />
      </Field>
      <div className="flex flex-wrap gap-6">
        <Field label="Starting difficulty">
          <Segmented value={startD} onChange={setStartD} options={[1, 2, 3].map((d) => ({ value: d as Difficulty, label: String(d) }))} />
        </Field>
        <Field label="Per-question clock" hint="timeouts cost a life">
          <Segmented value={timer} onChange={setTimer} options={[0, 15, 30, 60].map((v) => ({ value: v, label: v ? `${v}s` : 'Off' }))} />
        </Field>
      </div>
    </SetupLayout>
  )
}

function DrillSetup({ zen }: { zen: boolean }) {
  const route = useRoute()
  const repo = useRepo()
  const pre = route.query.get('cat') as CategoryId | null
  const [cats, setCats] = useState<CategoryId[]>(pre && CATEGORY_BY_ID[pre] ? [pre] : ['probability'])
  const [subs, setSubs] = useState<Record<string, string[]>>({})
  const [difficulty, setDifficulty] = useState<DifficultySetting>(repo.settings.adaptive ? 'adaptive' : repo.settings.defaultDifficulty)
  const [count, setCount] = useState(20)
  const [timer, setTimer] = useState(0)
  const filters: CategoryFilter[] = useMemo(() => cats.map((c) => ({ category: c, subcategories: subs[c]?.length ? subs[c] : undefined })), [cats, subs])
  const build = () => (cats.length ? (zen ? zenConfig({ filters, difficulty }) : drillConfig({ filters, difficulty, count, perQuestionSec: timer || null })) : null)
  return (
    <SetupLayout
      build={build}
      summary={
        <>
          <Row k="Categories" v={cats.length} />
          <Row k="Difficulty" v={diffLabel(difficulty)} />
          {zen ? <Row k="Questions" v="Unlimited" /> : <Row k="Questions" v={count} />}
          <Row k="Clock" v={zen ? 'None' : timer ? `${timer}s per question` : 'Untimed'} />
          <Row k="After each answer" v={zen ? 'Full solution' : 'Instant feedback'} />
        </>
      }
    >
      <Field label="Categories">
        <CategoryPicker value={cats} onChange={setCats} />
      </Field>
      {cats.length > 0 && (
        <Field label="Subcategories" hint="none selected = all">
          <div className="space-y-4">
            {cats.map((c) => (
              <div key={c}>
                <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: catVar(c) }} />
                  {CATEGORY_BY_ID[c].label}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {GENERATORS[c].subcategories.map((s) => {
                    const on = subs[c]?.includes(s.id) ?? false
                    return (
                      <button
                        key={s.id}
                        aria-pressed={on}
                        onClick={() => setSubs((prev) => ({ ...prev, [c]: on ? (prev[c] ?? []).filter((x) => x !== s.id) : [...(prev[c] ?? []), s.id] }))}
                        className={cx(
                          'h-7 cursor-pointer rounded-lg border px-2.5 text-[12px] transition-colors',
                          on ? 'border-brand/50 bg-brand/10 text-ink' : 'border-line text-muted hover:border-line-strong hover:text-ink',
                        )}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </Field>
      )}
      <Field label="Difficulty">
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
      </Field>
      {!zen && (
        <div className="flex flex-wrap gap-6">
          <Field label="Questions">
            <Segmented value={count} onChange={setCount} options={[10, 20, 30, 50].map((v) => ({ value: v, label: String(v) }))} />
          </Field>
          <Field label="Per-question clock">
            <Segmented value={timer} onChange={setTimer} options={[0, 20, 45, 90].map((v) => ({ value: v, label: v ? `${v}s` : 'Untimed' }))} />
          </Field>
        </div>
      )}
      {cats.some((c) => c === 'brainteasers') && <InfoBox>Brainteasers have two progressive hints (press ?). Each hint used costs a quarter of the question's points.</InfoBox>}
    </SetupLayout>
  )
}

function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
      <Icon name="info" size={16} className="mt-0.5 shrink-0 text-brand" />
      <div>{children}</div>
    </div>
  )
}

