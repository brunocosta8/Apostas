import { Link } from 'react-router-dom'
import { useMe } from '../auth'
import { useBets, useProfiles } from '../lib/api'
import { effectiveStatus } from '../lib/labels'
import { BetCard } from '../components/BetCard'
import { Button, ErrorBox, Loading, PageTitle, Section } from '../components/ui'

export function Home() {
  const { me } = useMe()
  const bets = useBets()
  const { byId } = useProfiles()

  if (bets.isPending) return <Loading />
  if (bets.error) return <ErrorBox error={bets.error} />

  const active = bets.data.filter((b) => ['open', 'closed'].includes(effectiveStatus(b)))
  const isIn = (b: (typeof active)[number]) => b.bet_entries.some((e) => e.user_id === me.id)

  const toResolve = active.filter((b) => b.creator_id === me.id && effectiveStatus(b) === 'closed')
  const toJoin = active.filter((b) => effectiveStatus(b) === 'open' && !isIn(b))
  const mine = active.filter((b) => isIn(b) && !toResolve.includes(b))
  const others = active.filter((b) => !isIn(b) && !toJoin.includes(b))

  const card = (b: (typeof active)[number]) => <BetCard key={b.id} bet={b} byId={byId} meId={me.id} />

  return (
    <>
      <PageTitle>Olá, {me.display_name.split(' ')[0]}</PageTitle>
      {active.length === 0 && (
        <div className="mt-16 text-center">
          <p className="text-slate-400">Não há apostas em curso.</p>
          <Link to="/nova"><Button className="mt-4">Criar a primeira aposta</Button></Link>
        </div>
      )}
      <Section title="Tens de marcar o resultado">{toResolve.map(card)}</Section>
      <Section title="Abertas para entrar">{toJoin.map(card)}</Section>
      <Section title="As minhas apostas em curso">{mine.map(card)}</Section>
      <Section title="Outras em curso">{others.map(card)}</Section>
    </>
  )
}
