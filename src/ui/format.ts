import type { CategoryId } from '../core/types'

/** 125000 ms -> "2:05"; negative clamps to 0. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function secs(ms: number, digits = 1): string {
  return `${(ms / 1000).toFixed(digits)}s`
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`
}

export function compact(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`
  return n.toLocaleString()
}

export function signed(n: number, digits = 2): string {
  const s = Math.abs(n).toFixed(digits).replace(/\.?0+$/, '') || '0'
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s
}

export function relativeDay(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 86_400_000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d} days ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const catVar = (c: CategoryId) => `var(--cat-${c})`

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}
