import { Link } from 'react-router-dom'
import type { Bet, Profile } from '../lib/types'
import { effectiveStatus, MODE_LABEL, statusLabel } from '../lib/labels'
import { formatDateTime, relative } from '../lib/dates'
import { Avatar, Badge, Money, Vs, type Tone } from './ui'
import { settleBet } from '../lib/settlement'
import { toSettleable } from '../lib/api'

export function statusTone(bet: Bet): Tone {
  switch (effectiveStatus(bet)) {
    case 'open': return 'live'
    case 'closed': return 'waiting'
    case 'resolved': return 'done'
    default: return 'muted'
  }
}

const ACCENT: Record<Tone, string> = {
  live: 'border-l-pitch-500',
  waiting: 'border-l-volt',
  done: 'border-l-ink',
  muted: 'border-l-ink/15',
  mode: 'border-l-pitch-200',
  volt: 'border-l-volt',
}

type ById = Map<string, Profile>

export function BetCard({ bet, byId, meId }: { bet: Bet; byId: ById; meId: string }) {
  const status = effectiveStatus(bet)
  const pot = bet.bet_entries.reduce((a, e) => a + Number(e.amount_cents), 0)
  const myNet = status === 'resolved' ? settleBet(toSettleable(bet)).get(meId) : undefined
  const creator = byId.get(bet.creator_id)
  const tone = statusTone(bet)
  const faded = status === 'void' || status === 'cancelled'

  let deadline: string
  if (status === 'open') deadline = `Fecha ${relative(bet.closes_at)} · ${formatDateTime(bet.closes_at)}`
  else if (status === 'closed') deadline = `Resultado previsto ${relative(bet.resolve_by)}`
  else deadline = formatDateTime(bet.resolved_at ?? bet.cancelled_at ?? bet.closed_at ?? bet.created_at)

  return (
    <Link
      to={`/aposta/${bet.id}`}
      className={`block overflow-hidden rounded-2xl border-l-[6px] bg-white shadow-sm ring-1 ring-ink/5 transition active:scale-[0.99] ${ACCENT[tone]} ${faded ? 'opacity-70' : ''}`}
    >
      <div className="p-4 pb-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={tone}>{statusLabel(bet)}</Badge>
          <Badge tone="mode">{MODE_LABEL[bet.mode]}</Badge>
        </div>
        <h3 className="font-display text-[22px] font-extrabold uppercase leading-tight text-ink">{bet.title}</h3>
        <p className="mt-0.5 text-xs font-medium text-ink/50">por {creator?.display_name ?? '—'}</p>

        <div className="mt-3">
          {bet.bet_options.length === 2 ? <Matchup bet={bet} byId={byId} /> : <OptionsSummary bet={bet} />}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-dashed border-ink/10 bg-paper/60 px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-ink/60">
          <ClockIcon />
          <span className="truncate">{deadline}</span>
        </span>
        {myNet !== undefined ? (
          <Money cents={myNet} signed className="shrink-0 font-display text-xl font-extrabold" />
        ) : (
          <span className="shrink-0 font-display text-sm font-bold uppercase text-ink/50">
            Pote <Money cents={pot} className="text-xl font-extrabold text-ink" />
          </span>
        )}
      </div>
    </Link>
  )
}

/** Duas opções: "Lado A  VS  Lado B" com os apostadores de cada lado. */
function Matchup({ bet, byId }: { bet: Bet; byId: ById }) {
  const [a, b] = bet.bet_options
  const side = (optId: string) => bet.bet_entries.filter((e) => e.option_id === optId)
  const won = (optId: string) => bet.status === 'resolved' && bet.winning_option_id === optId
  const Col = ({ optId, label, align }: { optId: string; label: string; align: 'left' | 'right' }) => {
    const entries = side(optId)
    return (
      <div className={`min-w-0 flex-1 rounded-xl px-3 py-2 ${won(optId) ? 'bg-volt/35' : 'bg-pitch-50'} ${align === 'right' ? 'text-right' : ''}`}>
        <div className="line-clamp-2 text-sm font-bold leading-snug text-ink">{won(optId) && '🏆 '}{label}</div>
        <div className={`mt-1.5 flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
          {entries.length === 0 ? (
            <span className="text-xs font-semibold text-pitch-700">À espera…</span>
          ) : (
            <div className="flex -space-x-1.5">
              {entries.slice(0, 4).map((e) => <Avatar key={e.id} profile={byId.get(e.user_id)} size={22} ring />)}
            </div>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-stretch gap-2">
      <Col optId={a.id} label={a.label} align="left" />
      <div className="flex items-center"><Vs size={30} /></div>
      <Col optId={b.id} label={b.label} align="right" />
    </div>
  )
}

function OptionsSummary({ bet }: { bet: Bet }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {bet.bet_options.map((o) => {
        const n = bet.bet_entries.filter((e) => e.option_id === o.id).length
        const won = bet.status === 'resolved' && bet.winning_option_id === o.id
        return (
          <span key={o.id} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${won ? 'bg-volt text-ink' : 'bg-pitch-50 text-pitch-800'}`}>
            {won && '🏆 '}{o.label} · {n}
          </span>
        )
      })}
    </div>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  )
}
