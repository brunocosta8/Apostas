import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMe } from '../auth'
import {
  toSettleable, useBets, useCancelBet, useCloseBet, useProfiles, useReopenBet, useResolveBet,
} from '../lib/api'
import { effectiveStatus, formatOdds, MODE_LABEL, statusLabel } from '../lib/labels'
import { formatDateTime, isPast, relative } from '../lib/dates'
import { settleBet } from '../lib/settlement'
import type { Bet } from '../lib/types'
import { canJoin, OptionButton, statusTone } from '../components/BetCard'
import { Avatar, Badge, Button, Card, ErrorBox, Loading, Money, Section, SubHeader } from '../components/ui'

export function BetDetail() {
  const { id } = useParams()
  const bets = useBets()
  const { byId } = useProfiles()
  const { me, isAdmin } = useMe()

  if (bets.isPending) return <><SubHeader back="/" title="Aposta" /><Loading /></>
  if (bets.error) return <><SubHeader back="/" title="Aposta" /><ErrorBox error={bets.error} /></>
  const bet = bets.data.find((b) => b.id === id)
  if (!bet) {
    return (
      <>
        <SubHeader back="/" title="Não encontrada" />
        <p className="text-center text-ink/60">Esta aposta não existe. <Link className="font-semibold text-pitch-700" to="/">Voltar ao início</Link></p>
      </>
    )
  }

  const status = effectiveStatus(bet)
  const isCreator = bet.creator_id === me.id
  const pot = bet.bet_entries.reduce((a, e) => a + Number(e.amount_cents), 0)
  const result = settleBet(toSettleable(bet))
  const creator = byId.get(bet.creator_id)
  const active = status === 'open' || status === 'closed'
  const late = active && isPast(bet.resolve_by)
  const anyJoinable = bet.bet_options.some((o) => canJoin(bet, me.id, o.id))
  const cols = bet.bet_options.length === 2 ? 'grid-cols-2' : bet.bet_options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'

  return (
    <>
      <SubHeader back="/" title={MODE_LABEL[bet.mode]} action={<Badge tone={statusTone(bet)}>{statusLabel(bet)}</Badge>} />

      <div className="space-y-3">
        <Card>
          <h1 className="text-xl font-bold leading-snug text-ink">{bet.title}</h1>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-ink/55">
            <Avatar profile={creator} size={18} /> {creator?.display_name ?? '—'} · criada {formatDateTime(bet.created_at)}
            {bet.mode === 'odds' && <> · odds <b className="text-ink">{formatOdds(bet.odds_creator, bet.odds_taker)}</b></>}
          </p>
          {bet.description && <p className="mt-3 whitespace-pre-wrap text-sm text-ink/75">{bet.description}</p>}

          <dl className="mt-4 grid grid-cols-3 divide-x divide-ink/10 rounded-lg bg-paper py-2.5 text-center">
            <div className="px-1">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-ink/45">Entradas até</dt>
              <dd className="text-sm font-bold text-ink">{formatDateTime(bet.closes_at)}</dd>
              <dd className={`text-[11px] font-semibold ${status === 'open' ? 'text-pitch-600' : 'text-ink/40'}`}>{relative(bet.closes_at)}</dd>
            </div>
            <div className="px-1">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-ink/45">Resultado</dt>
              <dd className="text-sm font-bold text-ink">{formatDateTime(bet.resolve_by)}</dd>
              <dd className={`text-[11px] font-semibold ${late ? 'text-red-600' : 'text-ink/40'}`}>{late ? 'atrasado' : relative(bet.resolve_by)}</dd>
            </div>
            <div className="px-1">
              <dt className="text-[10px] font-bold uppercase tracking-wide text-ink/45">Pote</dt>
              <dd><Money cents={pot} className="font-display text-xl font-extrabold text-pitch-700" /></dd>
            </div>
          </dl>
        </Card>

        <Card>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink/60">Mercado</h2>
            {anyJoinable && <span className="text-xs font-semibold text-pitch-700">Toca numa cota para apostar</span>}
          </div>
          <div className={`grid gap-2 ${cols}`}>
            {bet.bet_options.map((o) => <OptionButton key={o.id} bet={bet} option={o} meId={me.id} large />)}
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-ink/60">Jogadores</h2>
          <ul className="divide-y divide-ink/5">
            {bet.bet_entries.map((e) => {
              const opt = bet.bet_options.find((o) => o.id === e.option_id)
              const net = result.get(e.user_id)
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar profile={byId.get(e.user_id)} size={30} />
                    <span className="min-w-0">
                      <span className={`block truncate text-sm font-semibold ${e.user_id === me.id ? 'text-pitch-700' : 'text-ink'}`}>
                        {e.user_id === me.id ? 'Tu' : byId.get(e.user_id)?.display_name ?? '—'}
                        {e.user_id === bet.creator_id && <span className="ml-1 text-[11px] font-medium text-ink/40">criador</span>}
                      </span>
                      <span className="block truncate text-xs text-ink/50">{opt?.label}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Money cents={Number(e.amount_cents)} className="block text-sm font-bold" />
                    {net !== undefined && <Money cents={net} signed className="block text-xs font-bold" />}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>

        {status === 'void' && <Notice>Aposta anulada — ninguém ganha nem perde.</Notice>}
        {status === 'cancelled' && <Notice>Aposta cancelada — tudo anulado.</Notice>}

        {(isCreator || isAdmin) && (
          <div className="pt-3">
            <Section title={isCreator ? 'Gerir a aposta' : 'Admin'}>
              <CreatorActions bet={bet} isCreator={isCreator} />
            </Section>
          </div>
        )}
      </div>
    </>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-white px-4 py-3 text-sm font-medium text-ink/60">{children}</p>
}

function CreatorActions({ bet, isCreator }: { bet: Bet; isCreator: boolean }) {
  const close = useCloseBet()
  const resolve = useResolveBet()
  const reopen = useReopenBet()
  const cancel = useCancelBet()
  const [picking, setPicking] = useState(false)
  const status = effectiveStatus(bet)
  const err = close.error ?? resolve.error ?? reopen.error ?? cancel.error
  const canReopen = bet.status === 'resolved' || (bet.status === 'void' && (bet.void_reason === 'empate' || bet.void_reason === 'ninguem_acertou'))

  return (
    <div className="space-y-3">
      <ErrorBox error={err} />

      {isCreator && (status === 'open' || status === 'closed') && (
        picking ? (
          <Card className="space-y-2">
            <p className="font-bold">Quem ganhou?</p>
            {bet.bet_options.map((o) => (
              <Button key={o.id} variant="light" className="w-full justify-start text-base!" loading={resolve.isPending}
                onClick={() => {
                  if (confirm(`Confirmas que ganhou «${o.label}»?`)) resolve.mutate({ betId: bet.id, winningOptionId: o.id }, { onSuccess: () => setPicking(false) })
                }}>
                🏆 {o.label}
              </Button>
            ))}
            <Button variant="light" className="w-full justify-start text-base!" loading={resolve.isPending}
              onClick={() => {
                if (confirm('Marcar como empate? A aposta fica anulada e ninguém ganha nem perde.')) resolve.mutate({ betId: bet.id, winningOptionId: null }, { onSuccess: () => setPicking(false) })
              }}>
              🤝 Empate / sem vencedor
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setPicking(false)}>Voltar</Button>
          </Card>
        ) : (
          <Button className="w-full text-lg!" onClick={() => setPicking(true)}>🏁 Marcar resultado</Button>
        )
      )}

      {isCreator && bet.status === 'open' && status === 'open' && (
        <Button variant="secondary" className="w-full" loading={close.isPending}
          onClick={() => { if (confirm('Fechar já as entradas? Se ninguém tiver aceitado, a aposta fica anulada.')) close.mutate(bet.id) }}>
          Fechar entradas agora
        </Button>
      )}

      {canReopen && (
        <Button variant="secondary" className="w-full" loading={reopen.isPending}
          onClick={() => { if (confirm('Desfazer o resultado? A aposta volta a ficar à espera de resultado.')) reopen.mutate(bet.id) }}>
          Desfazer resultado
        </Button>
      )}

      {bet.status !== 'cancelled' && (
        <Button variant="danger" className="w-full" loading={cancel.isPending}
          onClick={() => { if (confirm('Cancelar a aposta? Fica tudo anulado e isto não se pode desfazer.')) cancel.mutate(bet.id) }}>
          Cancelar aposta
        </Button>
      )}
    </div>
  )
}
