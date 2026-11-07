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
import { Avatar, Badge, Button, Card, ErrorBox, Hero, inputClass, Loading, Money, Section, Vs } from '../components/ui'

type ById = ReturnType<typeof useProfiles>['byId']

export function BetDetail() {
  const { id } = useParams()
  const bets = useBets()
  const { byId } = useProfiles()
  const { me, isAdmin } = useMe()

  if (bets.isPending) return <><Hero back="/" /><Loading /></>
  if (bets.error) return <><Hero back="/" /><ErrorBox error={bets.error} /></>
  const bet = bets.data.find((b) => b.id === id)
  if (!bet) {
    return (
      <>
        <Hero back="/" title="Não encontrada" />
        <p className="text-center text-ink/60">Esta aposta não existe. <Link className="font-semibold text-pitch-700" to="/">Voltar ao início</Link></p>
      </>
    )
  }

  const status = effectiveStatus(bet)
  const isCreator = bet.creator_id === me.id
  const myEntry = bet.bet_entries.find((e) => e.user_id === me.id)
  const pot = bet.bet_entries.reduce((a, e) => a + Number(e.amount_cents), 0)
  const result = settleBet(toSettleable(bet))
  const creator = byId.get(bet.creator_id)
  const active = status === 'open' || status === 'closed'
  const late = active && isPast(bet.resolve_by)

  return (
    <>
      <Hero back="/">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Badge tone={statusTone(bet)}>{statusLabel(bet)}</Badge>
          <Badge tone="volt">{MODE_LABEL[bet.mode]}</Badge>
          {bet.mode === 'odds' && <Badge tone="volt">Odds {formatOdds(bet.odds_creator, bet.odds_taker)}</Badge>}
        </div>
        <h1 className="font-display text-[34px] font-extrabold uppercase italic leading-[0.95] tracking-tight">{bet.title}</h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-white/75">
          <Avatar profile={creator} size={22} ring /> {creator?.display_name ?? '—'} · {formatDateTime(bet.created_at)}
        </p>
        <div className="mt-4 flex items-end justify-between">
          <div>
            <div className="font-display text-xs font-bold uppercase tracking-wider text-white/60">Pote total</div>
            <Money cents={pot} className="font-display text-4xl font-extrabold leading-none text-volt" />
          </div>
          <div className="text-right font-display text-sm font-bold uppercase text-white/70">
            {bet.bet_entries.length} {bet.bet_entries.length === 1 ? 'jogador' : 'jogadores'}
          </div>
        </div>
      </Hero>

      <div className="space-y-4">
        {bet.description && <p className="whitespace-pre-wrap px-1 text-ink/75">{bet.description}</p>}

        <div className="grid grid-cols-2 gap-3">
          <DeadlineTile label="Entradas até" iso={bet.closes_at} highlight={status === 'open' ? 'live' : undefined} />
          <DeadlineTile label="Resultado previsto" iso={bet.resolve_by} highlight={late ? 'late' : undefined} />
        </div>

        {bet.bet_options.length === 2 ? (
          <Scoreboard bet={bet} meId={me.id} byId={byId} showPreview={active && !!myEntry} />
        ) : (
          <div className="space-y-3">
            {bet.bet_options.map((opt) => (
              <OptionBlock key={opt.id} bet={bet} option={opt} meId={me.id} byId={byId} showPreview={active && !!myEntry} />
            ))}
          </div>
        )}

        {status === 'resolved' && (
          <Card className="border-t-[6px] border-ink">
            <h2 className="mb-3 font-display text-xl font-extrabold uppercase italic">Resultado final</h2>
            <ul className="space-y-2.5">
              {[...result].sort((a, b) => b[1] - a[1]).map(([uid, net]) => (
                <li key={uid} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-semibold"><Avatar profile={byId.get(uid)} size={28} />{byId.get(uid)?.display_name ?? '—'}</span>
                  <Money cents={net} signed className="font-display text-2xl font-extrabold" />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink/50">Já conta nos <Link to="/saldos" className="font-semibold text-pitch-700">saldos</Link>.</p>
          </Card>
        )}
        {status === 'void' && <Notice>Aposta anulada — ninguém ganha nem perde.</Notice>}
        {status === 'cancelled' && <Notice>Aposta cancelada — tudo anulado.</Notice>}

        {status === 'open' && !myEntry && <JoinPanel bet={bet} />}
        {(isCreator || isAdmin) && (
          <div className="pt-2">
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
  return <p className="rounded-xl border-l-4 border-ink/30 bg-white px-3 py-2.5 text-sm font-medium text-ink/70">{children}</p>
}

function DeadlineTile({ label, iso, highlight }: { label: string; iso: string; highlight?: 'live' | 'late' }) {
  const color = highlight === 'live' ? 'text-pitch-600' : highlight === 'late' ? 'text-red-600' : 'text-ink/45'
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-ink/5">
      <div className="font-display text-xs font-bold uppercase tracking-wider text-ink/50">{label}</div>
      <div className="mt-0.5 font-display text-lg font-bold leading-tight text-ink">{formatDateTime(iso)}</div>
      <div className={`text-xs font-semibold ${color}`}>{highlight === 'late' ? `Atrasado · ${relative(iso)}` : relative(iso)}</div>
    </div>
  )
}

/** Marcador "A vs B" para apostas de duas opções. */
function Scoreboard({ bet, meId, byId, showPreview }: { bet: Bet; meId: string; byId: ById; showPreview: boolean }) {
  const decided = ['resolved', 'void'].includes(bet.status) && bet.winning_option_id
  return (
    <div className="relative grid grid-cols-2 gap-2">
      {bet.bet_options.map((opt) => {
        const entries = bet.bet_entries.filter((e) => e.option_id === opt.id)
        const total = entries.reduce((a, e) => a + Number(e.amount_cents), 0)
        const won = decided && bet.winning_option_id === opt.id
        const lost = decided && !won
        const preview = showPreview ? netForOutcome(toSettleable(bet).entries, opt.id).get(meId) : undefined
        return (
          <div key={opt.id}
            className={`flex flex-col rounded-2xl p-3 shadow-sm ring-1 ${won ? 'bg-volt ring-volt-dark' : 'bg-white ring-ink/5'} ${lost ? 'opacity-60' : ''}`}>
            <div className="min-h-12 font-display text-lg font-extrabold uppercase leading-tight text-ink">{won && '🏆 '}{opt.label}</div>
            <Money cents={total} className="font-display text-2xl font-extrabold text-ink" />
            <ul className="mt-2 flex-1 space-y-1.5">
              {entries.length === 0 && <li className="text-xs font-semibold text-pitch-700">À espera de adversário…</li>}
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-1.5 text-sm">
                  <Avatar profile={byId.get(e.user_id)} size={22} />
                  <span className={`truncate ${e.user_id === meId ? 'font-bold text-pitch-700' : 'font-medium text-ink/80'}`}>
                    {e.user_id === meId ? 'Tu' : byId.get(e.user_id)?.display_name ?? '—'}
                  </span>
                </li>
              ))}
            </ul>
            {preview !== undefined && preview !== 0 && (
              <div className="mt-2 border-t border-dashed border-ink/10 pt-1.5 text-xs font-semibold text-ink/55">
                Se ganhar: <Money cents={preview} signed className="font-bold" />
              </div>
            )}
          </div>
        )
      })}
      <div className="pointer-events-none absolute left-1/2 top-9 -translate-x-1/2"><Vs size={38} /></div>
    </div>
  )
}

function OptionBlock({ bet, option, meId, byId, showPreview }: {
  bet: Bet; option: BetOption; meId: string; byId: ById; showPreview: boolean
}) {
  const entries = bet.bet_entries.filter((e) => e.option_id === option.id)
  const total = entries.reduce((a, e) => a + Number(e.amount_cents), 0)
  const isWinner = bet.winning_option_id === option.id && ['resolved', 'void'].includes(bet.status)
  const preview = showPreview ? netForOutcome(toSettleable(bet).entries, option.id).get(meId) : undefined

  return (
    <Card className={isWinner ? 'bg-volt! ring-volt-dark!' : ''}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-extrabold uppercase">{isWinner && '🏆 '}{option.label}</h3>
        <Money cents={total} className="font-display text-xl font-extrabold" />
      </div>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-ink/50">Ninguém ainda.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Avatar profile={byId.get(e.user_id)} size={22} />
                <span className={e.user_id === meId ? 'font-bold text-pitch-700' : 'font-medium'}>{byId.get(e.user_id)?.display_name ?? '—'}</span>
              </span>
              <Money cents={Number(e.amount_cents)} className="font-semibold" />
            </li>
          ))}
        </ul>
      )}
      {preview !== undefined && preview !== 0 && (
        <p className="mt-2 text-xs font-semibold text-ink/55">Se esta ganhar: <Money cents={preview} signed /></p>
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
      <div className="pitch space-y-3 rounded-2xl p-4 text-white shadow-[0_4px_0_var(--color-volt)]">
        <div className="font-display text-xl font-extrabold uppercase italic">Aceitas o desafio?</div>
        <p className="text-sm text-white/85">
          Ficas com <b className="text-volt">«{other.label}»</b> e entras com <Money cents={myAmount} className="font-bold" />.
          Se ganhares, levas <Money cents={Number(creatorEntry.amount_cents)} className="font-bold text-volt" />.
        </p>
        <ErrorBox error={join.error} />
        <Button
          className="w-full text-lg!"
          loading={join.isPending}
          onClick={() => {
            if (confirm(`Aceitar a aposta «${bet.title}»?`)) join.mutate({ betId: bet.id, optionId: other.id })
          }}
        >
          Aceitar aposta
        </Button>
      </div>
    )
  }

  // Aberta a vários / escolha múltipla: escolher opção e valor
  const cents = parseEuros(amount)
  return (
    <Card className="space-y-3 border-t-[6px] border-pitch-600">
      <h2 className="font-display text-xl font-extrabold uppercase italic">Entrar na aposta</h2>
      <div className="flex flex-wrap gap-2">
        {bet.bet_options.map((o) => (
          <button key={o.id} type="button" onClick={() => setOptionId(o.id)}
            className={`rounded-xl border-2 px-3 py-1.5 text-sm font-bold ${optionId === o.id ? 'border-pitch-600 bg-pitch-50 text-pitch-800' : 'border-ink/10 text-ink/70'}`}>
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
    <div className="space-y-3">
      <ErrorBox error={err} />

      {isCreator && (status === 'open' || status === 'closed') && (
        picking ? (
          <Card className="space-y-2">
            <p className="font-display text-lg font-extrabold uppercase italic">Quem ganhou?</p>
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
