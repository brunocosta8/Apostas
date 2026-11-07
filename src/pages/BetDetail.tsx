import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMe } from '../auth'
import {
  toSettleable, useBets, useCancelBet, useCloseBet, useJoinBet, useProfiles, useReopenBet, useResolveBet,
} from '../lib/api'
import { effectiveStatus, formatOdds, MODE_LABEL, statusLabel } from '../lib/labels'
import { formatDateTime, isPast, relative } from '../lib/dates'
import { netForOutcome, oddsTakerAmount, settleBet } from '../lib/settlement'
import { parseEuros } from '../lib/money'
import type { Bet, BetOption } from '../lib/types'
import { statusTone } from '../components/BetCard'
import { Avatar, Badge, Button, Card, ErrorBox, inputClass, Loading, Money } from '../components/ui'

export function BetDetail() {
  const { id } = useParams()
  const bets = useBets()
  const { byId } = useProfiles()
  const { me, isAdmin } = useMe()

  if (bets.isPending) return <Loading />
  if (bets.error) return <ErrorBox error={bets.error} />
  const bet = bets.data.find((b) => b.id === id)
  if (!bet) return <p className="py-16 text-center text-slate-400">Aposta não encontrada. <Link className="text-emerald-400" to="/">Voltar</Link></p>

  const status = effectiveStatus(bet)
  const isCreator = bet.creator_id === me.id
  const myEntry = bet.bet_entries.find((e) => e.user_id === me.id)
  const pot = bet.bet_entries.reduce((a, e) => a + Number(e.amount_cents), 0)
  const result = settleBet(toSettleable(bet))
  const creator = byId.get(bet.creator_id)

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-slate-400">← Voltar</Link>

      <div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge tone={statusTone(bet)}>{statusLabel(bet)}</Badge>
          <Badge>{MODE_LABEL[bet.mode]}</Badge>
          {bet.mode === 'odds' && <Badge tone="amber">Odds {formatOdds(bet.odds_creator, bet.odds_taker)}</Badge>}
        </div>
        <h1 className="text-2xl font-bold leading-tight text-white">{bet.title}</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
          <Avatar profile={creator} size={20} /> Criada por {creator?.display_name ?? '—'} · {formatDateTime(bet.created_at)}
        </p>
        {bet.description && <p className="mt-3 whitespace-pre-wrap text-slate-300">{bet.description}</p>}
      </div>

      <Card className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-slate-400">Entradas até</div>
          <div className="font-medium text-slate-100">{formatDateTime(bet.closes_at)}</div>
          <div className={`text-xs ${status === 'open' ? 'text-emerald-400' : 'text-slate-500'}`}>{relative(bet.closes_at)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Resolução prevista</div>
          <div className="font-medium text-slate-100">{formatDateTime(bet.resolve_by)}</div>
          <div className={`text-xs ${['open', 'closed'].includes(status) && isPast(bet.resolve_by) ? 'text-amber-400' : 'text-slate-500'}`}>
            {['open', 'closed'].includes(status) && isPast(bet.resolve_by) ? `Atrasada · ${relative(bet.resolve_by)}` : relative(bet.resolve_by)}
          </div>
        </div>
        <div className="col-span-2 flex items-center justify-between border-t border-slate-800 pt-3">
          <span className="text-slate-400">Pote total</span>
          <Money cents={pot} className="text-lg font-semibold text-white" />
        </div>
      </Card>

      <div className="space-y-3">
        {bet.bet_options.map((opt) => (
          <OptionBlock key={opt.id} bet={bet} option={opt} meId={me.id} byId={byId} showPreview={['open', 'closed'].includes(status) && !!myEntry} />
        ))}
      </div>

      {(status === 'resolved') && (
        <Card>
          <h2 className="mb-3 font-semibold text-white">Resultado</h2>
          <ul className="space-y-2">
            {[...result].sort((a, b) => b[1] - a[1]).map(([uid, net]) => (
              <li key={uid} className="flex items-center justify-between">
                <span className="flex items-center gap-2"><Avatar profile={byId.get(uid)} size={24} />{byId.get(uid)?.display_name ?? '—'}</span>
                <Money cents={net} signed className="font-semibold" />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Os valores já contam nos <Link to="/saldos" className="text-emerald-400">saldos</Link>.</p>
        </Card>
      )}
      {status === 'void' && (
        <p className="rounded-xl bg-slate-800/60 px-3 py-2 text-sm text-slate-300">Aposta anulada: ninguém ganha nem perde.</p>
      )}
      {status === 'cancelled' && (
        <p className="rounded-xl bg-slate-800/60 px-3 py-2 text-sm text-slate-300">Aposta cancelada: tudo anulado.</p>
      )}

      {status === 'open' && !myEntry && <JoinPanel bet={bet} />}
      {(isCreator || isAdmin) && <CreatorActions bet={bet} isCreator={isCreator} />}
    </div>
  )
}

function OptionBlock({ bet, option, meId, byId, showPreview }: {
  bet: Bet; option: BetOption; meId: string; byId: ReturnType<typeof useProfiles>['byId']; showPreview: boolean
}) {
  const entries = bet.bet_entries.filter((e) => e.option_id === option.id)
  const total = entries.reduce((a, e) => a + Number(e.amount_cents), 0)
  const isWinner = bet.winning_option_id === option.id && ['resolved', 'void'].includes(bet.status)
  const preview = showPreview ? netForOutcome(toSettleable(bet).entries, option.id).get(meId) : undefined

  return (
    <Card className={isWinner ? 'border-emerald-500/60 bg-emerald-500/5' : ''}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-white">
          {isWinner && <span className="mr-1">🏆</span>}{option.label}
        </h3>
        <Money cents={total} className="text-sm text-slate-300" />
      </div>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Ninguém ainda.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Avatar profile={byId.get(e.user_id)} size={22} />
                <span className={e.user_id === meId ? 'font-semibold text-emerald-300' : 'text-slate-200'}>
                  {byId.get(e.user_id)?.display_name ?? '—'}{e.user_id === bet.creator_id && ' (criador)'}
                </span>
              </span>
              <Money cents={Number(e.amount_cents)} className="text-slate-300" />
            </li>
          ))}
        </ul>
      )}
      {preview !== undefined && preview !== 0 && (
        <p className="mt-2 text-xs text-slate-400">Se esta ganhar: <Money cents={preview} signed /></p>
      )}
    </Card>
  )
}

function JoinPanel({ bet }: { bet: Bet }) {
  const join = useJoinBet()
  const creatorEntry = bet.bet_entries.find((e) => e.user_id === bet.creator_id)
  const [optionId, setOptionId] = useState<string>('')
  const [amount, setAmount] = useState('')

  if (bet.mode === 'one_v_one' || bet.mode === 'odds') {
    if (bet.bet_entries.length >= 2 || !creatorEntry) return null
    const other = bet.bet_options.find((o) => o.id !== creatorEntry.option_id)!
    const myAmount = bet.mode === 'odds'
      ? oddsTakerAmount(Number(creatorEntry.amount_cents), Number(bet.odds_creator), Number(bet.odds_taker))
      : Number(creatorEntry.amount_cents)
    return (
      <Card className="space-y-3 border-emerald-500/40">
        <p className="text-sm text-slate-300">
          Ficas com <span className="font-semibold text-white">«{other.label}»</span> e apostas <Money cents={myAmount} className="font-semibold text-white" />.
          Se ganhares, recebes <Money cents={Number(creatorEntry.amount_cents)} className="font-semibold text-emerald-400" />.
        </p>
        <ErrorBox error={join.error} />
        <Button
          className="w-full"
          loading={join.isPending}
          onClick={() => {
            if (confirm(`Aceitar a aposta «${bet.title}»?`)) join.mutate({ betId: bet.id, optionId: other.id })
          }}
        >
          Aceitar aposta
        </Button>
      </Card>
    )
  }

  // Aberta a vários / escolha múltipla: escolher opção e valor
  const cents = parseEuros(amount)
  return (
    <Card className="space-y-3 border-emerald-500/40">
      <h2 className="font-semibold text-white">Entrar na aposta</h2>
      <div className="flex flex-wrap gap-2">
        {bet.bet_options.map((o) => (
          <button key={o.id} type="button" onClick={() => setOptionId(o.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${optionId === o.id ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200' : 'border-slate-700 text-slate-300'}`}>
            {o.label}
          </button>
        ))}
      </div>
      <input className={inputClass} inputMode="decimal" placeholder="Valor (€)" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <ErrorBox error={join.error} />
      <Button className="w-full" disabled={!optionId || !cents} loading={join.isPending}
        onClick={() => cents && join.mutate({ betId: bet.id, optionId, amountCents: cents })}>
        Entrar
      </Button>
    </Card>
  )
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
    <Card className="space-y-3">
      <h2 className="font-semibold text-white">{isCreator ? 'Gerir a aposta' : 'Admin'}</h2>
      <ErrorBox error={err} />

      {isCreator && (status === 'open' || status === 'closed') && (
        picking ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-300">Qual foi o resultado?</p>
            {bet.bet_options.map((o) => (
              <Button key={o.id} variant="secondary" className="w-full justify-start" loading={resolve.isPending}
                onClick={() => {
                  if (confirm(`Confirmas que ganhou «${o.label}»?`)) resolve.mutate({ betId: bet.id, winningOptionId: o.id }, { onSuccess: () => setPicking(false) })
                }}>
                🏆 {o.label}
              </Button>
            ))}
            <Button variant="secondary" className="w-full justify-start" loading={resolve.isPending}
              onClick={() => {
                if (confirm('Marcar como empate? A aposta fica anulada e ninguém ganha nem perde.')) resolve.mutate({ betId: bet.id, winningOptionId: null }, { onSuccess: () => setPicking(false) })
              }}>
              🤝 Empate / sem vencedor
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setPicking(false)}>Voltar</Button>
          </div>
        ) : (
          <Button className="w-full" onClick={() => setPicking(true)}>Marcar resultado</Button>
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
    </Card>
  )
}
