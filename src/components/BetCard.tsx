import { Link } from 'react-router-dom'
import type { Bet, Profile } from '../lib/types'
import { effectiveStatus, MODE_LABEL, statusLabel } from '../lib/labels'
import { formatDateTime, relative } from '../lib/dates'
import { Avatar, Badge, Money } from './ui'
import { settleBet } from '../lib/settlement'
import { toSettleable } from '../lib/api'

export function statusTone(bet: Bet) {
  switch (effectiveStatus(bet)) {
    case 'open': return 'emerald' as const
    case 'closed': return 'amber' as const
    case 'resolved': return 'sky' as const
    default: return 'slate' as const
  }
}

export function BetCard({ bet, byId, meId }: { bet: Bet; byId: Map<string, Profile>; meId: string }) {
  const status = effectiveStatus(bet)
  const pot = bet.bet_entries.reduce((a, e) => a + Number(e.amount_cents), 0)
  const myNet = status === 'resolved' ? settleBet(toSettleable(bet)).get(meId) : undefined
  const creator = byId.get(bet.creator_id)

  let deadline: string
  if (status === 'open') deadline = `Entradas até ${formatDateTime(bet.closes_at)} (${relative(bet.closes_at)})`
  else if (status === 'closed') deadline = `Resolução prevista ${relative(bet.resolve_by)}`
  else deadline = formatDateTime(bet.resolved_at ?? bet.cancelled_at ?? bet.closed_at ?? bet.created_at)

  return (
    <Link to={`/aposta/${bet.id}`} className="block rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition active:bg-slate-800/80">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone={statusTone(bet)}>{statusLabel(bet)}</Badge>
        <Badge>{MODE_LABEL[bet.mode]}</Badge>
      </div>
      <h3 className="text-base font-semibold leading-snug text-white">{bet.title}</h3>
      <p className="mt-1 text-xs text-slate-400">
        por {creator?.display_name ?? '—'} · {deadline}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex -space-x-2">
          {bet.bet_entries.slice(0, 6).map((e) => (
            <span key={e.id} className="rounded-full ring-2 ring-slate-900">
              <Avatar profile={byId.get(e.user_id)} size={26} />
            </span>
          ))}
        </div>
        <div className="text-right text-sm">
          {myNet !== undefined ? (
            <Money cents={myNet} signed className="font-semibold" />
          ) : (
            <span className="text-slate-400">
              Pote <Money cents={pot} className="font-semibold text-slate-200" />
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
