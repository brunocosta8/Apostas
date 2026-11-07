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
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink/5 ${className}`}>{children}</div>
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
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-display text-[13px] font-bold uppercase tracking-wide ${tones[tone]}`}>
      {tone === 'live' && <span className="live-dot h-1.5 w-1.5 rounded-full bg-volt" />}
      {children}
    </span>
  )
}

/** Faixa verde (relvado) no topo de cada ecrã. */
export function Hero({ title, back, action, children }: { title?: ReactNode; back?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <header className="pitch pt-safe -mx-4 mb-5 rounded-b-[28px] px-4 pb-6 text-white shadow-[0_6px_0_var(--color-volt)]">
      <div className="pt-4">
        {back && (
          <Link to={back} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-white/80">
            <span aria-hidden>←</span> Voltar
          </Link>
        )}
        {(title || action) && (
          <div className="flex items-center justify-between gap-3">
            {title && <h1 className="font-display text-4xl font-extrabold uppercase italic leading-[0.95] tracking-tight">{title}</h1>}
            {action}
          </div>
        )}
        {children}
      </div>
    </header>
  )
}

export function Section({ title, children, empty }: { title: string; children: ReactNode[] | ReactNode; empty?: string }) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children
  if (isEmpty && !empty) return null
  return (
    <section className="mb-7">
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-extrabold uppercase italic tracking-wide text-ink">
        <span className="h-4 w-1.5 -skew-x-12 rounded-sm bg-volt" />
        {title}
      </h2>
      {isEmpty ? <p className="text-sm text-ink/50">{empty}</p> : <div className="space-y-3">{children}</div>}
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-display text-sm font-bold uppercase tracking-wide text-ink/70">{label}</span>
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
