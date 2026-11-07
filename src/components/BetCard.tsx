import { Link, useNavigate } from 'react-router-dom'
import type { Bet, BetOption, Profile } from '../lib/types'
import { effectiveStatus, MODE_LABEL, statusLabel } from '../lib/labels'
import { formatDateTime, relative } from '../lib/dates'
import { Avatar, Badge, formatCota, Money, type Tone } from './ui'
import { optionOdds, settleBet } from '../lib/settlement'
import { toOddsContext, toSettleable } from '../lib/api'
import { useOpenSlip } from './BetSlip'

export function statusTone(bet: Bet): Tone {
  switch (effectiveStatus(bet)) {
    case 'open': return 'live'
    case 'closed': return 'waiting'
    case 'resolved': return 'done'
    default: return 'muted'
  }
}

const MODE_ICON: Record<Bet['mode'], string> = { one_v_one: '🥊', pool: '👥', odds: '📈', multi: '🔢' }

/** Pode o utilizador entrar nesta opção? */
export function canJoin(bet: Bet, meId: string, optionId: string): boolean {
  if (effectiveStatus(bet) !== 'open') return false
  if (bet.bet_entries.some((e) => e.user_id === meId)) return false
  if (bet.mode === 'one_v_one' || bet.mode === 'odds') {
    const creator = bet.bet_entries.find((e) => e.user_id === bet.creator_id)
    return bet.bet_entries.length < 2 && !!creator && creator.option_id !== optionId
  }
  return true
}

/** Botão de cota de uma opção (estilo casa de apostas). */
export function OptionButton({ bet, option, meId, large }: { bet: Bet; option: BetOption; meId: string; large?: boolean }) {
  const openSlip = useOpenSlip()
  const cota = optionOdds(toOddsContext(bet), option.id)
  const mine = bet.bet_entries.some((e) => e.user_id === meId && e.option_id === option.id)
  const decided = (bet.status === 'resolved' || bet.status === 'void') && !!bet.winning_option_id
  const won = decided && bet.winning_option_id === option.id
  const joinable = canJoin(bet, meId, option.id)
  const count = bet.bet_entries.filter((e) => e.option_id === option.id).length

  let cls = 'bg-paper text-ink'
  if (won) cls = 'bg-volt text-ink'
  else if (decided) cls = 'bg-paper text-ink/40'
  else if (mine) cls = 'bg-pitch-700 text-white'
  if (joinable) cls += ' ring-1 ring-pitch-200 hover:bg-pitch-50 active:bg-pitch-100'

  return (
    <button
      type="button"
      disabled={!joinable}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        openSlip({ bet, optionId: option.id })
      }}
      className={`flex min-w-0 flex-col items-center justify-center rounded-lg px-2 text-center transition disabled:cursor-default ${large ? 'min-h-16 py-2' : 'min-h-12 py-1.5'} ${cls}`}
    >
      <span className={`line-clamp-1 w-full font-medium ${large ? 'text-sm' : 'text-xs'} ${mine && !decided ? 'text-white/80' : 'opacity-70'}`}>
        {won && '🏆 '}{option.label}
      </span>
      <span className={`font-display font-extrabold leading-tight ${large ? 'text-xl' : 'text-[17px]'}`}>
        {cota ? formatCota(cota) : count > 0 ? '—' : joinable ? 'Entrar' : '—'}
      </span>
      {large && <span className="text-[11px] font-medium opacity-60">{count} {count === 1 ? 'jogador' : 'jogadores'}{mine && ' · tu'}</span>}
    </button>
  )
}

export function BetCard({ bet, byId, meId }: { bet: Bet; byId: Map<string, Profile>; meId: string }) {
  const navigate = useNavigate()
  const status = effectiveStatus(bet)
  const pot = bet.bet_entries.reduce((a, e) => a + Number(e.amount_cents), 0)
  const myNet = status === 'resolved' ? settleBet(toSettleable(bet)).get(meId) : undefined
  const creator = byId.get(bet.creator_id)
  const faded = status === 'void' || status === 'cancelled'
  const cols = bet.bet_options.length === 2 ? 'grid-cols-2' : bet.bet_options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'

  let when: string
  if (status === 'open') when = `Fecha ${relative(bet.closes_at)}`
  else if (status === 'closed') when = `Resultado ${relative(bet.resolve_by)}`
  else when = formatDateTime(bet.resolved_at ?? bet.cancelled_at ?? bet.closed_at ?? bet.created_at)

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/aposta/${bet.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/aposta/${bet.id}`)}
      className={`cursor-pointer rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(13,27,18,0.06)] transition active:bg-white/70 ${faded ? 'opacity-60' : ''}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-ink/50">
        <span className="flex min-w-0 items-center gap-1.5">
          {bet.is_secret && <span title="Aposta secreta" aria-label="Aposta secreta">🔒</span>}
          <span aria-hidden>{MODE_ICON[bet.mode]}</span>
          <span className="truncate uppercase tracking-wide">{MODE_LABEL[bet.mode]} · {creator?.display_name ?? '—'}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <Badge tone={statusTone(bet)}>{statusLabel(bet)}</Badge>
        </span>
      </div>

      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-ink">{bet.title}</h3>
        <span className="shrink-0 pt-0.5 text-[11px] font-semibold text-ink/50">{when}</span>
      </div>

      <div className={`mt-2.5 grid gap-1.5 ${cols}`}>
        {bet.bet_options.map((o) => <OptionButton key={o.id} bet={bet} option={o} meId={meId} />)}
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-1.5">
            {bet.bet_entries.slice(0, 5).map((e) => <Avatar key={e.id} profile={byId.get(e.user_id)} size={20} ring />)}
          </div>
          <span className="text-[11px] font-semibold text-ink/50">
            {bet.bet_entries.length} {bet.bet_entries.length === 1 ? 'jogador' : 'jogadores'}
          </span>
        </div>
        {myNet !== undefined ? (
          <Money cents={myNet} signed className="font-display text-lg font-extrabold" />
        ) : (
          <span className="text-[11px] font-semibold uppercase text-ink/50">
            Pote <Money cents={pot} className="font-display text-base font-extrabold text-ink" />
          </span>
        )}
      </div>
    </div>
  )
}

export function ResolveBanner({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <Link to="/minhas?tab=resolver" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-volt px-4 py-3 font-semibold text-ink shadow-[0_2px_0_var(--color-volt-dark)]">
      <span>🏁 Tens {count} {count === 1 ? 'aposta' : 'apostas'} para marcar o resultado</span>
      <span aria-hidden className="text-xl">›</span>
    </Link>
  )
}

