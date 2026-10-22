import { useMemo, useState } from 'react'
import type { CategoryId } from '../../core/types'
import { categoryTotals, dailySeries, heatmap, personalBests, weakSpots } from '../../engine/analytics'
import { currentStreak } from '../../engine/daily'
import { INITIAL_RATING, ratingTier } from '../../engine/elo'
import { dueItems } from '../../engine/review'
import { SCENARIO_BY_ID } from '../../engine/marketMaking'
import { CATEGORIES, CATEGORY_BY_ID, GENERATORS, subcategoryLabel } from '../../generators'
import { Heatmap, LineChart, Sparkline, type Series } from '../components/charts'
import { Icon } from '../components/Icon'
import { Card, CategoryDot, Empty, PageHeader, Segmented, SectionTitle, Stat, cx } from '../components/ui'
import { catVar, pct, relativeDay, secs } from '../format'
import { MODE_ICON } from '../icons'
import { useRepo } from '../store'
import { useClock } from '../useStart'

type Range = 7 | 30 | 90 | 0

export function Dashboard() {
  const repo = useRepo()
  const [range, setRange] = useState<Range>(30)
  const [cat, setCat] = useState<CategoryId | 'all'>('all')
  const [heatCat, setHeatCat] = useState<CategoryId>('mental-math')

  const { now, today } = useClock()
  const since = range ? now - range * 86_400_000 : 0
  const attempts = useMemo(() => repo.attempts.filter((a) => a.ts >= since && (cat === 'all' || a.category === cat)), [repo.attempts, since, cat])
  const sessions = useMemo(() => repo.sessions.filter((s) => s.endedAt >= since), [repo.sessions, since])
  const answered = attempts.filter((a) => a.status !== 'skipped')
  const accuracy = answered.length ? answered.reduce((s, a) => s + a.credit, 0) / answered.length : 0
  const avgTime = answered.length ? answered.reduce((s, a) => s + a.timeMs, 0) / answered.length : 0
  const due = dueItems(repo.review, now).length
  const streak = currentStreak(repo.daily, today)
  const totals = categoryTotals(repo.attempts.filter((a) => a.ts >= since), CATEGORIES.map((c) => c.id))

  const mainColor = cat === 'all' ? 'var(--brand)' : catVar(cat)
  const mainLabel = cat === 'all' ? 'All categories' : CATEGORY_BY_ID[cat].label
  const overall = dailySeries(attempts, null)
  const accSeries: Series[] = [{ id: 'acc', label: mainLabel, color: mainColor, points: overall.map((p) => ({ x: p.day, y: p.accuracy, n: p.n })) }]
  const speedSeries: Series[] = [{ id: 'speed', label: mainLabel, color: mainColor, points: overall.map((p) => ({ x: p.day, y: p.avgTimeSec, n: p.n })) }]
  const multiples = CATEGORIES.map((c) => ({ c, points: dailySeries(attempts, c.id) })).filter((m) => m.points.length > 0)

  const hc = cat === 'all' ? heatCat : cat
  const cells = heatmap(attempts, hc)
  const heatRows = GENERATORS[hc].subcategories.map((s) => ({
    id: s.id,
    label: s.label,
    cells: [1, 2, 3, 4, 5].map((d) => {
      const c = cells.find((x) => x.subcategory === s.id && x.difficulty === d)
      return c ? { n: c.n, accuracy: c.accuracy } : null
    }),
  }))
  const weak = weakSpots(attempts)
  const pbs = personalBests(repo.sessions)
  const mm = repo.market

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Analytics" title="Dashboard" subtitle="Accuracy and speed over time, weak spots by subcategory and difficulty, and your personal bests." />

      {/* Filters scope everything below */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: 7, label: '7 days' },
            { value: 30, label: '30 days' },
            { value: 90, label: '90 days' },
            { value: 0, label: 'All time' },
          ]}
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value as CategoryId | 'all')}
          className="h-10 cursor-pointer rounded-xl border border-line bg-surface-2 px-3 text-[13px] text-ink outline-none focus:border-brand"
          aria-label="Category filter"
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon="target" label="Attempts" value={attempts.length.toLocaleString()} sub={`${sessions.length} sessions`} />
        <Stat icon="check" label="Accuracy" value={answered.length ? pct(accuracy) : '—'} sub="partial credit counted" />
        <Stat icon="timer" label="Avg time / question" value={answered.length ? secs(avgTime) : '—'} />
        <Stat icon="flame" label="Daily streak" value={`${streak}d`} sub={`best ${repo.daily.bestStreak}d`} />
        <Stat icon="repeat" label="Reviews due" value={due} sub={`${Object.keys(repo.review).length} in queue`} />
      </div>

      {/* Ratings */}
      <section>
        <SectionTitle title="Ratings" subtitle="Elo-style rating per category. Adaptive mode aims for ~70% success at your level." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => {
            const r = repo.ratings[c.id]
            const rating = r?.rating ?? INITIAL_RATING
            const t = totals.find((x) => x.category === c.id)!
            const spark = dailySeries(repo.attempts, c.id).slice(-14).map((p) => p.accuracy)
            return (
              <Card key={c.id} className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13px] text-ink-2">
                    <CategoryDot category={c.id} /> {c.label}
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-2">
                    <span className="text-[26px] leading-none font-semibold tracking-tight text-ink">{rating}</span>
                    <span className="text-[12px] text-muted">{ratingTier(rating)}</span>
                  </div>
                  <div className="mt-1 text-[12px] text-muted">{t.n ? `${pct(t.accuracy)} · ${t.n} attempts · ${t.avgTimeSec.toFixed(1)}s avg` : 'No attempts yet'}</div>
                </div>
                <Sparkline values={spark} color={catVar(c.id)} />
              </Card>
            )
          })}
        </div>
      </section>

      {/* Over time */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Accuracy over time" subtitle={`${mainLabel} · daily share of credit earned`} />
          <LineChart title="Accuracy over time" series={accSeries} yDomain={[0, 1]} yFormat={(v) => `${Math.round(v * 100)}%`} emptyText="Answer a few questions to see your accuracy trend." />
        </Card>
        <Card className="p-5">
          <SectionTitle title="Speed over time" subtitle={`${mainLabel} · average seconds per answered question`} />
          <LineChart title="Speed over time" series={speedSeries} yFormat={(v) => `${v.toFixed(v < 10 ? 1 : 0)}s`} emptyText="Speed appears after your first session." />
        </Card>
      </section>

      {cat === 'all' && multiples.length > 1 && (
        <section>
          <SectionTitle title="By category" subtitle="Daily accuracy (line) and average time per question for each category" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {multiples.map(({ c, points }) => {
              const acc = points.reduce((s, p) => s + p.accuracy * p.n, 0) / points.reduce((s, p) => s + p.n, 0)
              const t = points.reduce((s, p) => s + p.avgTimeSec * p.n, 0) / points.reduce((s, p) => s + p.n, 0)
              return (
                <Card key={c.id} className="p-4">
                  <div className="mb-1 flex items-center gap-2 text-[13px] font-medium text-ink">
                    <CategoryDot category={c.id} /> {c.label}
                    <span className="num ml-auto text-[12px] text-muted">
                      {pct(acc)} · {t.toFixed(1)}s
                    </span>
                  </div>
                  <LineChart title={`${c.label} accuracy over time`} series={[{ id: c.id, label: c.label, color: catVar(c.id), points: points.map((p) => ({ x: p.day, y: p.accuracy, n: p.n })) }]} yDomain={[0, 1]} yFormat={(v) => `${Math.round(v * 100)}%`} height={130} />
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* Heatmap + weak spots */}
      <section className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-5">
          <SectionTitle
            title="Weak-spots heatmap"
            subtitle={`${CATEGORY_BY_ID[hc].label}: subcategory × difficulty`}
            right={
              cat === 'all' ? (
                <select value={heatCat} onChange={(e) => setHeatCat(e.target.value as CategoryId)} className="h-8 cursor-pointer rounded-lg border border-line bg-surface-2 px-2 text-[12px] text-ink outline-none" aria-label="Heatmap category">
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              ) : undefined
            }
          />
          <Heatmap title={`${CATEGORY_BY_ID[hc].label} accuracy by subcategory and difficulty`} rows={heatRows} columns={['D1', 'D2', 'D3', 'D4', 'D5']} />
        </Card>
        <Card className="p-5">
          <SectionTitle title="Biggest weak spots" subtitle="Lowest accuracy with at least 3 attempts" />
          {weak.length === 0 ? (
            <Empty icon="target" title="Not enough data yet">Weak spots appear after a few attempts per subcategory.</Empty>
          ) : (
            <ul className="space-y-2">
              {weak.map((w) => (
                <li key={w.category + w.subcategory + w.difficulty} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                  <CategoryDot category={w.category} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink">{subcategoryLabel(w.category, w.subcategory)}</div>
                    <div className="text-[11px] text-muted">
                      {CATEGORY_BY_ID[w.category].label} · difficulty {w.difficulty} · {w.n} attempts
                    </div>
                  </div>
                  <span className="num text-[14px] font-semibold text-ink">{pct(w.accuracy)}</span>
                  <a href={`#/mode/drill?cat=${w.category}`} className="text-[12px] text-brand hover:underline">
                    Drill
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Personal bests + recent */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Personal bests" subtitle="Best score per mode & variant (all time)" />
          {pbs.length === 0 ? (
            <Empty icon="trophy" title="No personal bests yet">Finish a session and it shows up here.</Empty>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="text-[12px] text-muted">
                <tr>
                  <th className="pb-2 text-left font-medium">Mode</th>
                  <th className="pb-2 text-right font-medium">Best</th>
                  <th className="pb-2 text-right font-medium">Best acc.</th>
                  <th className="pb-2 text-right font-medium">Plays</th>
                </tr>
              </thead>
              <tbody>
                {pbs.slice(0, 10).map((p) => (
                  <tr key={p.variantKey} className="border-t border-line">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2 text-ink">
                        <Icon name={MODE_ICON[p.mode]} size={14} className="text-muted" />
                        {p.title}
                      </div>
                      <div className="pl-[22px] text-[11px] text-faint">{variantDetail(p.variantKey)}</div>
                    </td>
                    <td className="num py-2.5 text-right font-semibold text-ink">{p.bestScore}</td>
                    <td className="num py-2.5 text-right text-ink-2">{pct(p.bestAccuracy)}</td>
                    <td className="num py-2.5 text-right text-muted">{p.plays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="p-5">
          <SectionTitle title="Recent sessions" />
          {repo.sessions.length === 0 ? (
            <Empty icon="calendar" title="No sessions yet" />
          ) : (
            <ul className="divide-y divide-line">
              {[...repo.sessions].reverse().slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                  <Icon name={MODE_ICON[s.mode]} size={15} className="text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-ink">{s.title}</div>
                    <div className="text-[11px] text-muted">
                      {relativeDay(s.endedAt)} · {s.correct}/{s.total} correct · {secs(s.avgTimeMs)} avg
                    </div>
                  </div>
                  <span className={cx('num font-semibold', s.score < 0 ? 'text-bad' : 'text-ink')}>{s.score}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {mm.length > 0 && (
        <section>
          <SectionTitle title="Market making" subtitle={`${mm.length} games played`} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon="candles" label="Best score" value={Math.max(...mm.map((m) => m.score)).toFixed(2)} />
            <Stat icon="chart" label="Average P&L" value={(mm.reduce((s, m) => s + m.pnl, 0) / mm.length).toFixed(2)} />
            <Stat icon="layers" label="Average spread" value={(mm.reduce((s, m) => s + m.avgSpread, 0) / mm.length).toFixed(2)} />
            <Stat icon="dice" label="Favourite game" value={<span className="text-[17px]">{SCENARIO_BY_ID[mode(mm.map((m) => m.scenarioId))]?.title ?? '—'}</span>} />
          </div>
        </section>
      )}
    </div>
  )
}

function mode(xs: string[]): string {
  const c = new Map<string, number>()
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1)
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
}

function variantDetail(key: string): string {
  const named: Record<string, string> = { mix: 'Mixed categories', classic: 'Classic', full: 'Four sections', custom: 'Custom' }
  return key
    .split(':')
    .slice(1)
    .flatMap((p) => p.split('+'))
    .filter((p) => !/^\d+s?$/.test(p))
    .map((p) => CATEGORY_BY_ID[p as CategoryId]?.short ?? named[p] ?? p)
    .join(' · ')
}
