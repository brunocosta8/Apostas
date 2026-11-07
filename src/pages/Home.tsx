import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '../auth'
import { useBets, useProfiles } from '../lib/api'
import { effectiveStatus } from '../lib/labels'
import { BetCard, canJoin, ResolveBanner } from '../components/BetCard'
import { Button, ErrorBox, Loading, SubHeader, Tabs } from '../components/ui'
import type { Bet } from '../lib/types'

type Tab = 'todas' | 'entrar' | 'minhas' | 'aguardar'

export function Home() {
  const { me } = useMe()
  const bets = useBets()
  const { byId } = useProfiles()
  const [tab, setTab] = useState<Tab>('todas')

  if (bets.isPending) return <Loading />
  if (bets.error) return <div className="pt-4"><ErrorBox error={bets.error} /></div>

  const active = bets.data
    .filter((b) => ['open', 'closed'].includes(effectiveStatus(b)))
    .sort((a, b) => a.closes_at.localeCompare(b.closes_at))
  const isIn = (b: Bet) => b.bet_entries.some((e) => e.user_id === me.id)
  const joinable = (b: Bet) => b.bet_options.some((o) => canJoin(b, me.id, o.id))
  const toResolve = active.filter((b) => b.creator_id === me.id && effectiveStatus(b) === 'closed')

  const lists: Record<Tab, Bet[]> = {
    todas: active,
    entrar: active.filter(joinable),
    minhas: active.filter(isIn),
    aguardar: active.filter((b) => effectiveStatus(b) === 'closed'),
  }
  const list = lists[tab]

  return (
    <>
      <SubHeader>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'todas', label: 'Em jogo', count: lists.todas.length },
            { value: 'entrar', label: 'Para entrar', count: lists.entrar.length },
            { value: 'minhas', label: 'As minhas', count: lists.minhas.length },
            { value: 'aguardar', label: 'À espera de resultado', count: lists.aguardar.length },
          ]}
        />
      </SubHeader>

      <ResolveBanner count={toResolve.length} />

      {list.length === 0 ? (
        <div className="mt-10 rounded-xl bg-white px-6 py-10 text-center">
          <div className="text-4xl">⚽</div>
          <p className="mt-2 font-bold text-ink">Nada por aqui</p>
          <p className="mt-1 text-sm text-ink/55">{tab === 'todas' ? 'Lança a primeira aposta ao grupo.' : 'Não há apostas neste separador.'}</p>
          {tab === 'todas' && <Link to="/nova"><Button className="mt-5">Criar aposta</Button></Link>}
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map((b) => <BetCard key={b.id} bet={b} byId={byId} meId={me.id} />)}
        </div>
      )}
    </>
  )
}
