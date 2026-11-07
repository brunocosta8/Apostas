import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Profile } from '../lib/types'
import { formatEuros, formatSigned } from '../lib/money'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'light'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-volt text-ink shadow-[0_3px_0_var(--color-volt-dark)] hover:brightness-105 font-display font-bold uppercase tracking-wide text-base',
  secondary: 'bg-pitch-700 text-white shadow-[0_3px_0_var(--color-pitch-900)] hover:bg-pitch-600 font-display font-bold uppercase tracking-wide text-base',
  light: 'bg-white text-ink ring-1 ring-ink/10 hover:bg-pitch-50 font-semibold text-sm',
  danger: 'bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50 font-semibold text-sm',
  ghost: 'text-ink/70 hover:bg-ink/5 font-semibold text-sm',
}

export function Button({
  variant = 'primary',
  loading,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-2.5 transition active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:active:translate-y-0 ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(13,27,18,0.06)] ${className}`}>{children}</div>
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-[3px] border-current border-t-transparent ${small ? 'h-4 w-4' : 'h-9 w-9 text-pitch-600'}`}
      aria-label="A carregar"
    />
  )
}

export function Loading() {
  return (
    <div className="flex justify-center py-20">
      <Spinner />
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error && typeof error === 'object' && 'message' in error ? String((error as { message: string }).message) : String(error)
  return <div className="rounded-xl border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{msg}</div>
}

export function Avatar({ profile, size = 32, ring }: { profile?: Profile; size?: number; ring?: boolean }) {
  const name = profile?.display_name ?? '?'
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const style = { width: size, height: size, fontSize: size * 0.4 }
  const ringCls = ring ? 'ring-2 ring-white' : ''
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt={name} style={style} referrerPolicy="no-referrer" className={`shrink-0 rounded-full bg-pitch-100 object-cover ${ringCls}`} />
  }
  return (
    <span style={style} className={`inline-flex shrink-0 items-center justify-center rounded-full bg-pitch-100 font-display font-bold text-pitch-800 ${ringCls}`}>
      {initials}
    </span>
  )
}

export type Tone = 'live' | 'waiting' | 'done' | 'muted' | 'mode' | 'volt'
export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    live: 'bg-pitch-600 text-white',
    waiting: 'bg-volt text-ink',
    done: 'bg-ink text-white',
    muted: 'bg-ink/8 text-ink/60',
    mode: 'bg-pitch-50 text-pitch-800 ring-1 ring-pitch-200',
    volt: 'bg-volt/90 text-ink',
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${tones[tone]}`}>
      {tone === 'live' && <span className="live-dot h-1.5 w-1.5 rounded-full bg-volt" />}
      {children}
    </span>
  )
}

/** Cabeçalho de página (por baixo da barra de topo): título, voltar e separadores. */
export function SubHeader({ title, back, action, children }: { title?: ReactNode; back?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-10 -mx-4 mb-4 border-b border-ink/10 bg-white px-4">
      {(title || back || action) && (
        <div className="flex min-h-12 items-center gap-2 py-2">
          {back && (
            <Link to={back} aria-label="Voltar" className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-xl text-ink/70 hover:bg-ink/5">
              ‹
            </Link>
          )}
          {title && <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-ink">{title}</h1>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

/** Separadores horizontais com sublinhado (estilo casa de apostas). */
export function Tabs<T extends string>({ value, onChange, items }: {
  value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[]
}) {
  return (
    <div className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]">
      {items.map((it) => {
        const active = it.value === value
        return (
          <button key={it.value} onClick={() => onChange(it.value)}
            className={`relative shrink-0 px-3 pb-2.5 pt-1 text-sm font-semibold transition ${active ? 'text-pitch-700' : 'text-ink/50'}`}>
            {it.label}
            {it.count !== undefined && it.count > 0 && (
              <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold ${active ? 'bg-pitch-700 text-white' : 'bg-ink/10 text-ink/60'}`}>{it.count}</span>
            )}
            {active && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-volt" />}
          </button>
        )
      })}
    </div>
  )
}

export function Section({ title, children, empty, action }: { title: string; children: ReactNode[] | ReactNode; empty?: string; action?: ReactNode }) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children
  if (isEmpty && !empty) return null
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-ink/60">
          <span className="h-3.5 w-1 rounded-sm bg-volt" />
          {title}
        </h2>
        {action}
      </div>
      {isEmpty ? <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-ink/50">{empty}</p> : <div className="space-y-2.5">{children}</div>}
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink/70">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink/55">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border-2 border-ink/10 bg-white px-3 py-2.5 text-ink placeholder:text-ink/35 focus:border-pitch-600 focus:outline-none'

export function Money({ cents, signed, className = '' }: { cents: number; signed?: boolean; className?: string }) {
  const text = signed ? formatSigned(cents) : formatEuros(cents)
  const color = signed ? (cents > 0 ? 'text-pitch-600' : cents < 0 ? 'text-red-600' : 'text-ink/50') : ''
  return <span className={`tabular-nums ${color} ${className}`}>{text}</span>
}

/** Marca circular "VS" amarela. */
export function Vs({ size = 34 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className="inline-flex shrink-0 -skew-x-6 items-center justify-center rounded-full bg-volt font-display font-extrabold italic text-ink shadow-[0_2px_0_var(--color-volt-dark)]"
    >
      VS
    </span>
  )
}

/** 2 → "2,00" */
export function formatCota(x: number): string {
  return x.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
