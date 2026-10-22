/* eslint-disable react-refresh/only-export-components */
/**
 * Hand-rolled SVG charts following the dataviz mark specs: 2px lines, ≥8px
 * end markers with a 2px surface ring, hairline recessive grid, legend for
 * ≥2 series, crosshair + tooltip on hover/focus, and a table view so no
 * value is gated behind hover or color.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from './ui'
import { Icon } from './Icon'

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.floor(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export interface Series {
  id: string
  label: string
  color: string
  points: { x: string; y: number; n?: number }[]
}

const shortDay = (d: string) => {
  const [, m, day] = d.split('-').map(Number)
  return new Date(2000, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const m = v / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}

export function LineChart({
  series,
  yFormat,
  yDomain,
  height = 220,
  emptyText = 'No data yet',
  title,
}: {
  series: Series[]
  yFormat(v: number): string
  yDomain?: [number, number]
  height?: number
  emptyText?: string
  title: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(), [series])
  const maxY = yDomain ? yDomain[1] : niceMax(Math.max(0, ...series.flatMap((s) => s.points.map((p) => p.y))))
  const minY = yDomain ? yDomain[0] : 0
  const pad = { l: 44, r: 16, t: 12, b: 26 }
  const iw = width - pad.l - pad.r
  const ih = height - pad.t - pad.b
  const xAt = (i: number) => pad.l + (xs.length <= 1 ? iw / 2 : (i / (xs.length - 1)) * iw)
  const yAt = (v: number) => pad.t + ih - ((v - minY) / (maxY - minY || 1)) * ih
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => minY + t * (maxY - minY))
  const empty = xs.length === 0

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left + pad.l
    let best = 0
    xs.forEach((_, i) => {
      if (Math.abs(xAt(i) - px) < Math.abs(xAt(best) - px)) best = i
    })
    setHover(best)
  }

  return (
    <div ref={ref} className="relative">
      <div className="mb-2 flex min-h-6 flex-wrap items-center justify-between gap-3">
        {series.length > 1 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legend">
            {series.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <span className="h-[2px] w-3.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        {!empty && (
          <button onClick={() => setTable((t) => !t)} className="inline-flex cursor-pointer items-center gap-1 text-[12px] text-muted hover:text-ink">
            <Icon name={table ? 'chart' : 'table'} size={13} /> {table ? 'Chart' : 'Table'}
          </button>
        )}
      </div>
      {empty ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-line text-[13px] text-muted" style={{ height }}>
          {emptyText}
        </div>
      ) : table ? (
        <div className="max-h-[260px] overflow-auto rounded-xl border border-line">
          <table className="w-full text-[12px]">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-surface-2 text-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Day</th>
                {series.map((s) => (
                  <th key={s.id} className="px-3 py-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="num">
              {xs.map((x) => (
                <tr key={x} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink-2">{shortDay(x)}</td>
                  {series.map((s) => {
                    const p = s.points.find((q) => q.x === x)
                    return (
                      <td key={s.id} className="px-3 py-1.5 text-right text-ink">
                        {p ? yFormat(p.y) : '–'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <svg width={width} height={height} role="img" aria-label={title} className="block overflow-visible">
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={width - pad.r} y1={yAt(t)} y2={yAt(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={pad.l - 8} y={yAt(t)} dy="0.32em" textAnchor="end" className="num" fontSize={10.5} fill="var(--muted)">
                {yFormat(t)}
              </text>
            </g>
          ))}
          {[0, Math.floor((xs.length - 1) / 2), xs.length - 1]
            .filter((v, i, a) => a.indexOf(v) === i)
            .map((i) => (
              <text key={i} x={xAt(i)} y={height - 6} textAnchor={xs.length === 1 ? 'middle' : i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle'} fontSize={10.5} fill="var(--muted)">
                {shortDay(xs[i])}
              </text>
            ))}
          {hover !== null && <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--border-strong)" strokeWidth={1} />}
          {series.map((s) => {
            const pts = xs.map((x, i) => {
              const p = s.points.find((q) => q.x === x)
              return p ? [xAt(i), yAt(p.y)] : null
            })
            const segs: string[] = []
            let cur = ''
            for (const p of pts) {
              if (!p) {
                if (cur) segs.push(cur)
                cur = ''
                continue
              }
              cur += `${cur ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`
            }
            if (cur) segs.push(cur)
            const lastIdx = pts.map((p, i) => (p ? i : -1)).filter((i) => i >= 0).pop()
            return (
              <g key={s.id}>
                {segs.map((d, i) => (
                  <path key={i} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                ))}
                {pts.map((p, i) =>
                  p && (i === lastIdx || i === hover || segs.length > 1 || xs.length < 3) ? (
                    <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                  ) : null,
                )}
              </g>
            )
          })}
          <rect
            x={pad.l}
            y={pad.t}
            width={iw}
            height={ih}
            fill="transparent"
            tabIndex={0}
            aria-label={`${title}: use arrow keys to inspect values`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(xs.length - 1)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? 0) - 1))
              if (e.key === 'ArrowRight') setHover((h) => Math.min(xs.length - 1, (h ?? 0) + 1))
            }}
            style={{ outline: 'none' }}
          />
        </svg>
      )}
      {hover !== null && !table && !empty && (
        <ChartTooltip x={xAt(hover)} width={width}>
          <div className="mb-1 text-[11px] text-muted">{shortDay(xs[hover])}</div>
          {series.map((s) => {
            const p = s.points.find((q) => q.x === xs[hover])
            return (
              <div key={s.id} className="flex items-center gap-2 text-[12px]">
                <span className="h-[2px] w-3 rounded-full" style={{ background: s.color }} />
                <span className="num font-semibold text-ink">{p ? yFormat(p.y) : '–'}</span>
                <span className="text-muted">{s.label}</span>
                {p?.n !== undefined && <span className="text-faint">n={p.n}</span>}
              </div>
            )
          })}
        </ChartTooltip>
      )}
    </div>
  )
}

function ChartTooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x + 12, 0), width - 190)
  return (
    <div className="pointer-events-none absolute top-8 z-10 min-w-[150px] rounded-xl border border-line-strong bg-surface/95 px-3 py-2 shadow-xl backdrop-blur" style={{ left }}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Heatmap (diverging around a target accuracy)
// ---------------------------------------------------------------------------

export interface HeatRow {
  id: string
  label: string
  cells: ({ n: number; accuracy: number } | null)[]
}

export const HEAT_TARGET = 0.7

/** Diverging fill: red below the target, blue above, neutral gray at the target. */
export function heatFill(acc: number): { bg: string; ink: string } {
  const t = acc < HEAT_TARGET ? (HEAT_TARGET - acc) / HEAT_TARGET : (acc - HEAT_TARGET) / (1 - HEAT_TARGET)
  const pole = acc < HEAT_TARGET ? 'var(--div-low)' : 'var(--div-high)'
  const pctMix = Math.round(25 + 75 * Math.min(1, t))
  return { bg: `color-mix(in oklab, ${pole} ${pctMix}%, var(--div-mid))`, ink: pctMix > 60 ? '#ffffff' : 'var(--text)' }
}

export function Heatmap({ rows, columns, title }: { rows: HeatRow[]; columns: string[]; title: string }) {
  const [tip, setTip] = useState<{ r: number; c: number } | null>(null)
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 2 }} aria-label={title}>
        <thead>
          <tr>
            <th className="w-[38%] pb-1 text-left text-[11px] font-medium text-muted" />
            {columns.map((c) => (
              <th key={c} className="pb-1 text-center text-[11px] font-medium text-muted">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row.id}>
              <th scope="row" className="truncate pr-2 text-left text-[12px] font-normal text-ink-2">
                {row.label}
              </th>
              {row.cells.map((cell, c) => {
                const fill = cell ? heatFill(cell.accuracy) : null
                const active = tip?.r === r && tip?.c === c
                return (
                  <td key={c} className="p-0">
                    <div
                      tabIndex={cell ? 0 : -1}
                      onPointerEnter={() => setTip({ r, c })}
                      onPointerLeave={() => setTip(null)}
                      onFocus={() => setTip({ r, c })}
                      onBlur={() => setTip(null)}
                      aria-label={cell ? `${row.label}, ${columns[c]}: ${Math.round(cell.accuracy * 100)}% over ${cell.n} attempts` : `${row.label}, ${columns[c]}: no data`}
                      className={cx('relative grid h-9 place-items-center rounded-md text-[11.5px] font-medium transition-transform', cell ? 'cursor-default' : 'border border-dashed border-line', active && 'z-10 scale-[1.06] ring-2 ring-[var(--surface)]')}
                      style={fill ? { background: fill.bg, color: fill.ink } : undefined}
                    >
                      <span className="num">{cell ? `${Math.round(cell.accuracy * 100)}` : ''}</span>
                      {active && cell && (
                        <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-20 w-max -translate-x-1/2 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-left shadow-xl">
                          <div className="num text-[12px] font-semibold text-ink">{Math.round(cell.accuracy * 100)}% accuracy</div>
                          <div className="text-[11px] text-muted">
                            {row.label} · {columns[c]} · {cell.n} attempts
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
        <span>Weak</span>
        <div className="flex h-2 w-40 overflow-hidden rounded-full">
          {[0, 0.2, 0.4, 0.6, 0.7, 0.8, 0.9, 1].map((a) => (
            <div key={a} className="flex-1" style={{ background: heatFill(a).bg }} />
          ))}
        </div>
        <span>Strong</span>
        <span className="ml-2 text-faint">Gray = {Math.round(HEAT_TARGET * 100)}% target · numbers are % correct</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small figures
// ---------------------------------------------------------------------------

export function Sparkline({ values, color = 'var(--muted)', width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return <div style={{ width, height }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const x = (i: number) => 2 + (i / (values.length - 1)) * (width - 4)
  const y = (v: number) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  )
}

export function Ring({ value, size = 120, stroke = 10, color = 'var(--brand)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}
