import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '../auth'
import { toSettleable, useBets, usePayments, useProfiles } from '../lib/api'
import { effectiveStatus } from '../lib/labels'
import { computeBalances } from '../lib/settlement'
import { BetCard } from '../components/BetCard'
import { Avatar, Button, ErrorBox, Hero, Loading, Money, Section } from '../components/ui'
import type { Bet } from '../lib/types'

export function Home() {
  const { me } = useMe()
  const bets = useBets()
  const payments = usePayments()
  const { byId } = useProfiles()

  const stats = useMemo(() => {
    if (!bets.data || !payments.data) return null
    const balance = computeBalances(
      bets.data.map(toSettleable),
      payments.data.map((p) => ({ fromUser: p.from_user, toUser: p.to_user, amountCents: Number(p.amount_cents) })),
    ).get(me.id) ?? 0
    const active = bets.data.filter((b) => ['open', 'closed'].includes(effectiveStatus(b)))
    const inPlay = active.reduce(
      (a, b) => a + b.bet_entries.filter((e) => e.user_id === me.id).reduce((x, e) => x + Number(e.amount_cents), 0),
      0,
    )
    return { balance, inPlay, active: active.length }
  }, [bets.data, payments.data, me.id])

  const firstName = (byId.get(me.id)?.display_name ?? me.display_name).split(' ')[0]

  const hero = (
    <Hero>
      <div className="flex items-center gap-3">
        <Avatar profile={byId.get(me.id) ?? me} size={44} ring />
        <div>
          <div className="text-sm font-semibold text-white/70">Bem-vindo de volta</div>
          <h1 className="font-display text-3xl font-extrabold uppercase italic leading-none">Olá, {firstName}</h1>
        </div>
      </div>
      {stats && (
        <div className="mt-5 grid grid-cols-3 divide-x divide-white/15 rounded-2xl bg-black/20 py-3 text-center">
          <Stat label="Saldo"><Money cents={stats.balance} signed className={stats.balance > 0 ? 'text-volt!' : stats.balance < 0 ? 'text-red-300!' : 'text-white!'} /></Stat>
          <Stat label="Em jogo"><Money cents={stats.inPlay} /></Stat>
          <Stat label="Ativas">{stats.active}</Stat>
        </div>
      )}
    </Hero>
  )

  if (bets.isPending || payments.isPending) return <>{hero}<Loading /></>
  if (bets.error) return <>{hero}<ErrorBox error={bets.error} /></>

  const active = bets.data.filter((b) => ['open', 'closed'].includes(effectiveStatus(b)))
  const isIn = (b: Bet) => b.bet_entries.some((e) => e.user_id === me.id)

  const toResolve = active.filter((b) => b.creator_id === me.id && effectiveStatus(b) === 'closed')
  const toJoin = active.filter((b) => effectiveStatus(b) === 'open' && !isIn(b))
  const mine = active.filter((b) => isIn(b) && !toResolve.includes(b))
  const others = active.filter((b) => !isIn(b) && !toJoin.includes(b))

  const card = (b: Bet) => <BetCard key={b.id} bet={b} byId={byId} meId={me.id} />

  return (
    <>
      {hero}
      {active.length === 0 && (
        <div className="mt-12 text-center">
          <div className="text-5xl">⚽</div>
          <p className="mt-3 font-display text-2xl font-extrabold uppercase italic text-ink">Nada em jogo</p>
          <p className="mt-1 text-sm text-ink/55">Lança a primeira aposta ao grupo.</p>
          <Link to="/nova"><Button className="mt-5">Criar aposta</Button></Link>
        </div>
      )}
      <Section title="Marca o resultado">{toResolve.map(card)}</Section>
      <Section title="Abertas para entrar">{toJoin.map(card)}</Section>
      <Section title="As minhas em jogo">{mine.map(card)}</Section>
      <Section title="Outras em jogo">{others.map(card)}</Section>
    </>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-2">
      <div className="font-display text-[22px] font-extrabold leading-tight text-white">{children}</div>
      <div className="font-display text-xs font-bold uppercase tracking-wider text-white/60">{label}</div>
    </div>
  )
}
