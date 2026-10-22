/* eslint-disable react-refresh/only-export-components */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { CategoryId, Difficulty } from '../../core/types'
import { CATEGORY_BY_ID } from '../../generators'
import { catVar } from '../format'
import { Icon, type IconName } from './Icon'

export function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  kbd,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; icon?: IconName; kbd?: string }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 select-none disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] cursor-pointer'
  const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]' }
  const variants: Record<Variant, string> = {
    primary: 'bg-brand text-brand-ink hover:brightness-110 shadow-[0_8px_24px_-10px_var(--brand)]',
    secondary: 'bg-surface-2 text-ink border border-line hover:border-line-strong hover:bg-surface-3',
    ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
    danger: 'bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20',
  }
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} {...rest}>
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
      {kbd && <Kbd className={variant === 'primary' ? 'bg-black/15 border-black/10 text-current' : ''}>{kbd}</Kbd>}
    </button>
  )
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cx('num inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line-strong bg-surface-3 px-1.5 text-[11px] font-medium text-ink-2', className)}>
      {children}
    </kbd>
  )
}

export function Card({ children, className, as: As = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' }) {
  return <As className={cx('rounded-2xl border border-line bg-surface shadow-[var(--shadow)]', className)}>{children}</As>
}

export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function PageHeader({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-rise">
      <div>
        {eyebrow && <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-brand">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-2">{subtitle}</p>}
      </div>
      {right}
    </header>
  )
}

export function CategoryDot({ category, size = 8 }: { category: CategoryId; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: catVar(category) }} />
}

export function CategoryChip({ category, sub }: { category: CategoryId; sub?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pr-3 pl-2.5 text-[12px] font-medium text-ink-2">
      <CategoryDot category={category} />
      {CATEGORY_BY_ID[category].label}
      {sub && (
        <>
          <span className="text-faint">/</span>
          <span className="text-muted">{sub}</span>
        </>
      )}
    </span>
  )
}

export function DifficultyPips({ d, className }: { d: Difficulty | number; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-[3px]', className)} title={`Difficulty ${d} / 5`} aria-label={`Difficulty ${d} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cx('h-[7px] w-[7px] rounded-[2px] transition-colors', i <= d ? 'bg-brand' : 'bg-surface-3')} />
      ))}
    </span>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: NoInfer<T>; label: ReactNode; hint?: string }[]
  value: T
  onChange(v: NoInfer<T>): void
  className?: string
}) {
  return (
    <div role="radiogroup" className={cx('inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1', className)}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={on}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cx(
              'h-8 cursor-pointer rounded-lg px-3 text-[13px] font-medium transition-all',
              on ? 'bg-surface text-ink shadow-sm ring-1 ring-line-strong' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange(v: boolean): void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-6 py-1">
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted">{description}</span>}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 h-6 w-10 shrink-0 cursor-pointer rounded-full transition-colors', checked ? 'bg-brand' : 'bg-surface-3 ring-1 ring-line-strong')}
      >
        <span className={cx('absolute top-1 left-1 h-4 w-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
      </button>
    </label>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        {hint && <span className="text-[12px] text-faint">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export function Stat({ label, value, sub, accent, icon }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string; icon?: IconName }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow)]">
      <div className="flex items-center gap-2 text-[12px] font-medium text-muted">
        {icon && <Icon name={icon} size={14} />}
        {label}
      </div>
      <div className="mt-2 text-[26px] leading-none font-semibold tracking-tight text-ink" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[12px] text-muted">{sub}</div>}
    </div>
  )
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  className,
}: {
  value: number
  onChange(v: number): void
  min?: number
  max?: number
  step?: number
  suffix?: string
  className?: string
}) {
  return (
    <div className={cx('inline-flex h-10 items-center rounded-xl border border-line bg-surface-2 focus-within:border-brand', className)}>
      <input
        type="number"
        className="num h-full w-20 bg-transparent px-3 text-sm text-ink outline-none focus-visible:outline-none"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, v)))
        }}
      />
      {suffix && <span className="pr-3 text-[13px] text-muted">{suffix}</span>}
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-muted">
        <Icon name={icon} size={20} />
      </div>
      <div className="text-sm font-semibold text-ink">{title}</div>
      {children && <div className="mt-1 max-w-sm text-[13px] text-muted">{children}</div>}
    </div>
  )
}
