import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Profile } from '../lib/types'
import { formatEuros, formatSigned } from '../lib/money'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-semibold',
  secondary: 'bg-slate-700 text-slate-100 hover:bg-slate-600',
  danger: 'bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-500/40',
  ghost: 'text-slate-300 hover:bg-slate-800',
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
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-800 bg-slate-900/70 p-4 ${className}`}>{children}</div>
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-4 w-4' : 'h-8 w-8 text-emerald-400'}`}
      aria-label="A carregar"
    />
  )
}

export function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  )
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null
  const msg = error instanceof Error || (error && typeof error === 'object' && 'message' in error)
    ? String((error as { message: string }).message)
    : String(error)
  return <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{msg}</div>
}

export function Avatar({ profile, size = 32 }: { profile?: Profile; size?: number }) {
  const name = profile?.display_name ?? '?'
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  const style = { width: size, height: size, fontSize: size * 0.4 }
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt={name} style={style} referrerPolicy="no-referrer" className="shrink-0 rounded-full bg-slate-700 object-cover" />
  }
  return (
    <span style={style} className="inline-flex shrink-0 items-center justify-center rounded-full bg-slate-700 font-semibold text-slate-200">
      {initials}
    </span>
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky' }) {
  const tones = {
    slate: 'bg-slate-800 text-slate-300',
    emerald: 'bg-emerald-500/15 text-emerald-300',
    amber: 'bg-amber-500/15 text-amber-300',
    rose: 'bg-rose-500/15 text-rose-300',
    sky: 'bg-sky-500/15 text-sky-300',
  }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight text-white">{children}</h1>
      {action}
    </div>
  )
}

export function Section({ title, children, empty }: { title: string; children: ReactNode[] | ReactNode; empty?: string }) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children
  if (isEmpty && !empty) return null
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
      {isEmpty ? <p className="text-sm text-slate-500">{empty}</p> : <div className="space-y-3">{children}</div>}
    </section>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500'

export function Money({ cents, signed, className = '' }: { cents: number; signed?: boolean; className?: string }) {
  const text = signed ? formatSigned(cents) : formatEuros(cents)
  const color = signed ? (cents > 0 ? 'text-emerald-400' : cents < 0 ? 'text-rose-400' : 'text-slate-400') : ''
  return <span className={`tabular-nums ${color} ${className}`}>{text}</span>
}
