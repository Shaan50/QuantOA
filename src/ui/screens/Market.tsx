import { useEffect, useReducer, useRef, useState } from 'react'
import { randomSeed } from '../../core/rng'
import { INFORMED_PROB, MarketGame, SCENARIOS, SPREAD_PENALTY, TRADERS_PER_ROUND, type RoundLog, type Scenario } from '../../engine/marketMaking'
import { Icon } from '../components/Icon'
import { Button, Card, Empty, Kbd, PageHeader, SectionTitle, Toggle, cx } from '../components/ui'
import { signed, uid } from '../format'
import { sfx } from '../sound'
import { useRepo } from '../store'
import { isTypingTarget } from '../useStart'

const fmt = (x: number, d = 2) => (Number.isInteger(x) ? String(x) : x.toFixed(d).replace(/0+$/, '').replace(/\.$/, ''))

export function Market() {
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [seed, setSeed] = useState(randomSeed)
  if (!scenario) return <Picker onPick={(s) => { setScenario(s); setSeed(randomSeed()) }} />
  return (
    <Game
      key={scenario.id + seed}
      scenario={scenario}
      seed={seed}
      onBack={() => setScenario(null)}
      onAgain={() => setSeed(randomSeed())}
    />
  )
}

function Picker({ onPick }: { onPick(s: Scenario): void }) {
  const repo = useRepo()
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Interactive"
        title="Market Making"
        subtitle="Quote a two-sided market on a hidden quantity. Counterparties trade against you when your price is off — some are just noisy, some already know the next reveal. Make money from the spread without getting picked off."
      />
      <div className="grid gap-3 md:grid-cols-2">
        {SCENARIOS.map((s, i) => {
          const games = repo.market.filter((m) => m.scenarioId === s.id)
          const best = games.length ? Math.max(...games.map((g) => g.score)) : null
          return (
            <button
              key={s.id}
              onClick={() => onPick(s)}
              style={{ animationDelay: `${i * 40}ms` }}
              className="group animate-rise cursor-pointer rounded-2xl border border-line bg-surface p-5 text-left shadow-[var(--shadow)] transition-all hover:-translate-y-0.5 hover:border-line-strong"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-brand ring-1 ring-line">
                  <Icon name={s.id.includes('dice') ? 'dice' : s.id === 'card-sum' ? 'layers' : s.id === 'coin-heads' ? 'target' : 'hash'} size={19} />
                </div>
                <div className="text-[16px] font-semibold text-ink">{s.title}</div>
                <Icon name="arrowRight" size={16} className="ml-auto text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{s.description}</p>
              <div className="num mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-[12px] text-muted">
                <span>{s.rounds} rounds</span>
                <span>max spread {s.maxSpread}</span>
                <span>range {s.range[0]}–{s.range[1]}</span>
                <span className="ml-auto">{best !== null ? <>best <span className="text-ink">{fmt(best)}</span></> : 'not played'}</span>
              </div>
            </button>
          )
        })}
      </div>
      <Card className="p-6">
        <SectionTitle title="How it works" />
        <ul className="grid gap-3 text-[13px] leading-relaxed text-ink-2 md:grid-cols-2">
          <li className="flex gap-2.5"><Icon name="scale" size={16} className="mt-0.5 shrink-0 text-brand" />Each round you post a bid and an ask (ask − bid ≤ the max spread). You buy at your bid and sell at your ask.</li>
          <li className="flex gap-2.5"><Icon name="dice" size={16} className="mt-0.5 shrink-0 text-brand" />{TRADERS_PER_ROUND} traders arrive per round. About {Math.round(INFORMED_PROB * 100)}% are informed: they already know what will be revealed next.</li>
          <li className="flex gap-2.5"><Icon name="layers" size={16} className="mt-0.5 shrink-0 text-brand" />After each round more information is revealed. At the end, every position settles at the true value.</li>
          <li className="flex gap-2.5"><Icon name="trophy" size={16} className="mt-0.5 shrink-0 text-brand" />Score = P&L − {SPREAD_PENALTY} × the sum of your spreads. Tight, well-centred quotes win.</li>
        </ul>
      </Card>
    </div>
  )
}

function Game({ scenario, seed, onBack, onAgain }: { scenario: Scenario; seed: string; onBack(): void; onAgain(): void }) {
  const repo = useRepo()
  const [game] = useState(() => new MarketGame(scenario, seed))
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const [bid, setBid] = useState('')
  const [ask, setAsk] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [showFair, setShowFair] = useState(true)
  const [last, setLast] = useState<RoundLog | null>(null)
  const bidRef = useRef<HTMLInputElement>(null)
  const askRef = useRef<HTMLInputElement>(null)
  const saved = useRef(false)

  useEffect(() => {
    if (!game.finished) bidRef.current?.focus()
  }, [game.round, game.finished])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore the Enter that submitted the final quote from the ask field.
      if (game.finished && e.key === 'Enter' && !isTypingTarget(e)) onAgain()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const submit = () => {
    const b = Number(bid)
    const a = Number(ask)
    const v = bid.trim() === '' || ask.trim() === '' ? 'Enter a bid and an ask.' : game.validate(b, a)
    if (v) {
      setErr(v)
      return
    }
    setErr(null)
    const log = game.quote(b, a)
    setLast(log)
    if (log.trades.length) sfx.trade()
    if (game.finished && !saved.current) {
      saved.current = true
      const res = game.result(uid(), Date.now())
      repo.addMarketResult(res)
      if (res.score > 0) sfx.finish()
      else sfx.wrong()
    }
    rerender()
  }

  const spread = Number(ask) - Number(bid)
  const spreadOk = Number.isFinite(spread) && bid !== '' && ask !== ''
  const fairNow = scenario.fair(game.state, game.round)
  const markPnl = game.cash + game.position * (game.finished ? game.trueValue : fairNow)

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <Icon name="arrowLeft" size={14} /> All games
      </button>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[12px] font-semibold tracking-[0.14em] text-brand uppercase">Market Making</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink">{scenario.title}</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-ink-2">{scenario.description}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: scenario.rounds }, (_, i) => (
            <span key={i} className={cx('h-2 w-8 rounded-full', i < game.round ? 'bg-brand' : i === game.round && !game.finished ? 'bg-brand/40' : 'bg-surface-3')} />
          ))}
          <span className="num ml-2 text-[13px] text-muted">{game.finished ? 'Settled' : `Round ${game.round + 1}/${scenario.rounds}`}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">What you know</span>
              <span className="num text-[12px] text-faint">possible range {scenario.range[0]}–{scenario.range[1]}</span>
            </div>
            <ul className="space-y-1.5">
              {scenario.info(game.state, Math.min(game.round, scenario.rounds)).map((line, i) => (
                <li key={i} className="animate-rise num text-[17px] text-ink">
                  {line}
                </li>
              ))}
              {game.finished && (
                <li className="animate-pop mt-3 inline-flex items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-[17px] font-semibold text-brand">
                  True value: <span className="num">{fmt(game.trueValue)}</span>
                </li>
              )}
            </ul>
          </Card>

          {!game.finished ? (
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">Your quote</span>
                <span className="num text-[12px] text-faint">tick {scenario.tick} · max spread {scenario.maxSpread}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <QuoteInput label="Bid" hint="you buy here" tone="good" inputRef={bidRef} value={bid} onChange={setBid} onEnter={() => askRef.current?.focus()} />
                <QuoteInput label="Ask" hint="you sell here" tone="bad" inputRef={askRef} value={ask} onChange={setAsk} onEnter={submit} />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className={cx('h-full rounded-full transition-all', spreadOk && spread > scenario.maxSpread ? 'bg-bad' : 'bg-brand')} style={{ width: `${spreadOk ? Math.min(100, Math.max(0, (spread / scenario.maxSpread) * 100)) : 0}%` }} />
                </div>
                <span className="num text-[12px] text-muted">spread {spreadOk ? fmt(spread) : '—'} / {scenario.maxSpread}</span>
              </div>
              {err && <div className="mt-2 text-[13px] text-bad">{err}</div>}
              <div className="mt-5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[12px] text-muted">
                  <Kbd>↵</Kbd> next field / submit
                </span>
                <Button variant="primary" kbd="↵" onClick={submit}>
                  Post quote
                </Button>
              </div>
            </Card>
          ) : (
            <Settlement game={game} onAgain={onAgain} />
          )}

          {last && <RoundResult log={last} showFair={showFair} scenario={scenario} />}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Position" value={`${game.position > 0 ? '+' : ''}${game.position}`} tone={game.position > 0 ? 'good' : game.position < 0 ? 'bad' : undefined} />
              <Metric label="Cash" value={signed(game.cash)} />
              <Metric label={game.finished ? 'Final P&L' : 'Mark P&L'} value={showFair || game.finished ? signed(markPnl) : '—'} tone={markPnl > 0 ? 'good' : markPnl < 0 ? 'bad' : undefined} />
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <Toggle checked={showFair} onChange={setShowFair} label="Learning mode" description="Reveal the fair value (expected value given what's known) after each round." />
            </div>
          </Card>
          <Card className="p-5">
            <SectionTitle title="Round history" />
            {game.log.length === 0 ? (
              <Empty icon="candles" title="No quotes yet">Post your first market.</Empty>
            ) : (
              <table className="w-full text-[13px]">
                <thead className="text-[11px] text-muted">
                  <tr>
                    <th className="pb-2 text-left font-medium">Rd</th>
                    <th className="pb-2 text-right font-medium">Bid / Ask</th>
                    <th className="pb-2 text-right font-medium">Trades</th>
                    {showFair && <th className="pb-2 text-right font-medium">Fair</th>}
                    <th className="pb-2 text-right font-medium">Pos</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {game.log.map((l) => (
                    <tr key={l.round} className="border-t border-line">
                      <td className="py-2 text-muted">{l.round + 1}</td>
                      <td className="py-2 text-right text-ink">
                        {fmt(l.bid)} / {fmt(l.ask)}
                      </td>
                      <td className="py-2 text-right">
                        {l.trades.length === 0 ? (
                          <span className="text-faint">—</span>
                        ) : (
                          l.trades.map((t, i) => (
                            <span key={i} className={cx('ml-1 inline-block rounded px-1 text-[11px] font-semibold', t.side > 0 ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad')} title={`${t.trader} trader`}>
                              {t.side > 0 ? 'B' : 'S'}
                              {t.trader === 'informed' ? '*' : ''}
                            </span>
                          ))
                        )}
                      </td>
                      {showFair && <td className="py-2 text-right text-ink-2">{fmt(l.fairBefore)}</td>}
                      <td className="py-2 text-right text-ink-2">{l.positionAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-[11px] text-faint">B = you bought, S = you sold, * = informed trader</p>
          </Card>
          {game.log.length > 0 && <QuoteChart game={game} showFair={showFair || game.finished} />}
        </div>
      </div>
    </div>
  )
}

function QuoteInput({ label, hint, tone, value, onChange, onEnter, inputRef }: { label: string; hint: string; tone: 'good' | 'bad'; value: string; onChange(v: string): void; onEnter(): void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  return (
    <label className="block rounded-2xl border-2 border-line bg-surface-2 px-4 pt-2.5 pb-1 focus-within:border-brand">
      <span className="flex items-center justify-between text-[12px]">
        <span className={cx('font-semibold', tone === 'good' ? 'text-good' : 'text-bad')}>{label}</span>
        <span className="text-faint">{hint}</span>
      </span>
      <input
        ref={inputRef}
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value.replace(/[^\d.-]/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onEnter()
          }
        }}
        className="num h-12 w-full bg-transparent focus-visible:outline-none text-[28px] font-medium text-ink outline-none placeholder:text-faint"
        placeholder="0"
        aria-label={label}
      />
    </label>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className={cx('num mt-0.5 text-[20px] font-semibold', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink')}>{value}</div>
    </div>
  )
}

function RoundResult({ log, showFair, scenario }: { log: RoundLog; showFair: boolean; scenario: Scenario }) {
  return (
    <Card className="animate-rise p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase">Round {log.round + 1} fills</span>
        <span className="num text-[12px] text-muted">
          {fmt(log.bid)} / {fmt(log.ask)}
        </span>
      </div>
      {log.trades.length === 0 ? (
        <div className="text-[14px] text-muted">Nobody traded — your market was too wide (or perfectly priced).</div>
      ) : (
        <ul className="space-y-1.5">
          {log.trades.map((t, i) => (
            <li key={i} className="flex items-center gap-2.5 text-[14px]">
              <span className={cx('grid h-6 w-6 place-items-center rounded-md text-[11px] font-bold', t.side > 0 ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad')}>{t.side > 0 ? 'B' : 'S'}</span>
              <span className="text-ink">
                {t.trader === 'informed' ? 'An informed trader' : 'A noise trader'} {t.side > 0 ? 'sold to you' : 'bought from you'} at <span className="num font-semibold">{fmt(t.price)}</span>
              </span>
              {t.trader === 'informed' && <span className="ml-auto rounded-full bg-warn/15 px-2 text-[11px] font-medium text-warn">informed</span>}
            </li>
          ))}
        </ul>
      )}
      {showFair && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-[13px] text-muted">
          <span>
            Fair when quoting <span className="num text-ink">{fmt(log.fairBefore)}</span>
          </span>
          <span>
            Fair after reveal <span className="num text-ink">{fmt(log.fairAfter)}</span>
          </span>
          {Math.abs((log.bid + log.ask) / 2 - log.fairBefore) > scenario.maxSpread / 2 && <span className="text-warn">Your mid was far from fair value.</span>}
        </div>
      )}
    </Card>
  )
}

function Settlement({ game, onAgain }: { game: MarketGame; onAgain(): void }) {
  const res = game.result('preview', 0)
  const trades = game.log.flatMap((l) => l.trades)
  const pnlBy = (who: 'informed' | 'noise') => trades.filter((t) => t.trader === who).reduce((s, t) => s + t.side * (game.trueValue - t.price), 0)
  const informed = trades.filter((t) => t.trader === 'informed').length
  return (
    <Card className="animate-pop overflow-hidden">
      <div className="grid grid-cols-3 gap-4 p-5">
        <Metric label="P&L" value={signed(res.pnl)} tone={res.pnl > 0 ? 'good' : res.pnl < 0 ? 'bad' : undefined} />
        <Metric label="Spread penalty" value={`−${fmt(res.penalty)}`} />
        <div>
          <div className="text-[11px] text-muted">Score</div>
          <div className={cx('num mt-0.5 text-[30px] leading-none font-semibold', res.score > 0 ? 'text-good' : res.score < 0 ? 'text-bad' : 'text-ink')}>{signed(res.score)}</div>
        </div>
      </div>
      <div className="space-y-1.5 border-t border-line px-5 py-4 text-[13px] text-ink-2">
        <div>
          Vs noise traders: <span className="num font-semibold text-ink">{signed(pnlBy('noise'))}</span> — uninformed flow should pay you the spread when your mid is near fair value.
        </div>
        <div>
          Vs informed traders ({informed} fill{informed === 1 ? '' : 's'}): <span className="num font-semibold text-ink">{signed(pnlBy('informed'))}</span> — adverse selection: they only trade when the next reveal moves against you.
        </div>
        <div className="text-muted">Average spread {fmt(res.avgSpread)} · {res.trades} trades</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line bg-surface-2/50 px-5 py-3">
        <Button variant="primary" icon="rotate" kbd="↵" onClick={onAgain}>
          Play again
        </Button>
      </div>
    </Card>
  )
}

/** Quote band per round vs the fair value line (single y-axis). */
function QuoteChart({ game, showFair }: { game: MarketGame; showFair: boolean }) {
  const W = 360
  const H = 150
  const pad = { l: 34, r: 12, t: 10, b: 22 }
  const log = game.log
  const vals = log.flatMap((l) => [l.bid, l.ask, l.fairBefore, l.fairAfter])
  if (game.finished) vals.push(game.trueValue)
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const span = hi - lo || 1
  const y = (v: number) => pad.t + (1 - (v - lo + span * 0.1) / (span * 1.2)) * (H - pad.t - pad.b)
  const n = game.scenario.rounds
  const x = (i: number) => pad.l + ((i + 0.5) / n) * (W - pad.l - pad.r)
  const bw = Math.min(24, ((W - pad.l - pad.r) / n) * 0.5)
  return (
    <Card className="p-5">
      <SectionTitle title="Your quotes vs fair value" subtitle={showFair ? 'Bars: your bid–ask band. Line: fair value when you quoted.' : 'Bars: your bid–ask band.'} />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Quote bands by round compared with fair value">
        {[0, 0.5, 1].map((t) => {
          const v = lo - span * 0.1 + t * span * 1.2
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
              <text x={pad.l - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--muted)" className="num">
                {fmt(v, 1)}
              </text>
            </g>
          )
        })}
        {log.map((l, i) => (
          <g key={i}>
            <rect x={x(i) - bw / 2} y={y(l.ask)} width={bw} height={Math.max(2, y(l.bid) - y(l.ask))} rx={4} fill="var(--cat-mental-math)" opacity={0.85}>
              <title>{`Round ${i + 1}: ${fmt(l.bid)} / ${fmt(l.ask)}`}</title>
            </rect>
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--muted)">
              R{i + 1}
            </text>
          </g>
        ))}
        {showFair && (
          <>
            <path d={log.map((l, i) => `${i ? 'L' : 'M'}${x(i)},${y(l.fairBefore)}`).join('')} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {log.map((l, i) => (
              <circle key={i} cx={x(i)} cy={y(l.fairBefore)} r={4} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2}>
                <title>{`Fair ${fmt(l.fairBefore)}`}</title>
              </circle>
            ))}
          </>
        )}
        {game.finished && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(game.trueValue)} y2={y(game.trueValue)} stroke="var(--good)" strokeWidth={1.5} strokeDasharray="0" opacity={0.8} />
            <text x={W - pad.r} y={y(game.trueValue) - 5} textAnchor="end" fontSize={10} fill="var(--text-2)">
              true {fmt(game.trueValue)}
            </text>
          </g>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--cat-mental-math)' }} /> Your bid–ask</span>
        {showFair && <span className="flex items-center gap-1.5"><span className="h-[2px] w-3.5 rounded-full bg-brand" /> Fair value</span>}
        {game.finished && <span className="flex items-center gap-1.5"><span className="h-[2px] w-3.5 rounded-full bg-good" /> True value</span>}
      </div>
    </Card>
  )
}
