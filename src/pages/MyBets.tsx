import { useSearchParams } from 'react-router-dom'
import { useMe } from '../auth'
import { toSettleable, useBets, useProfiles } from '../lib/api'
import { effectiveStatus } from '../lib/labels'
import { settleBet } from '../lib/settlement'
import { BetCard } from '../components/BetCard'
import { ErrorBox, Loading, Money, SubHeader, Tabs } from '../components/ui'
import type { Bet } from '../lib/types'

type Tab = 'curso' | 'resolver' | 'terminadas' | 'grupo'

/** "Boletins": as minhas apostas (em curso / terminadas) e o histórico do grupo. */
export function MyBets() {
  const { me } = useMe()
  const bets = useBets()
  const { byId } = useProfiles()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'curso'
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true })

  if (bets.isPending) return <Loading />
  if (bets.error) return <div className="pt-4"><ErrorBox error={bets.error} /></div>

  const isIn = (b: Bet) => b.bet_entries.some((e) => e.user_id === me.id)
  const finished = (b: Bet) => ['resolved', 'void', 'cancelled'].includes(b.status)
  const endDate = (b: Bet) => b.resolved_at ?? b.cancelled_at ?? b.closed_at ?? b.created_at

  const lists: Record<Tab, Bet[]> = {
    curso: bets.data.filter((b) => isIn(b) && !finished(b)),
    resolver: bets.data.filter((b) => b.creator_id === me.id && effectiveStatus(b) === 'closed'),
    terminadas: bets.data.filter((b) => isIn(b) && finished(b)).sort((a, b) => endDate(b).localeCompare(endDate(a))),
    grupo: bets.data.filter(finished).sort((a, b) => endDate(b).localeCompare(endDate(a))),
  }
  const list = lists[tab]

  const profit = lists.terminadas.reduce((a, b) => a + (settleBet(toSettleable(b)).get(me.id) ?? 0), 0)
  const won = lists.terminadas.filter((b) => (settleBet(toSettleable(b)).get(me.id) ?? 0) > 0).length
  const lost = lists.terminadas.filter((b) => (settleBet(toSettleable(b)).get(me.id) ?? 0) < 0).length

  return (
    <>
      <SubHeader title="Boletins">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'curso', label: 'Em curso', count: lists.curso.length },
            { value: 'resolver', label: 'Para resolver', count: lists.resolver.length },
            { value: 'terminadas', label: 'Terminadas' },
            { value: 'grupo', label: 'Histórico do grupo' },
          ]}
        />
      </SubHeader>

      {tab === 'terminadas' && lists.terminadas.length > 0 && (
        <div className="mb-4 grid grid-cols-3 divide-x divide-ink/10 rounded-xl bg-white py-3 text-center">
          <div><div className="font-display text-xl font-extrabold text-pitch-700">{won}</div><div className="text-[11px] font-semibold uppercase text-ink/50">Ganhas</div></div>
          <div><div className="font-display text-xl font-extrabold text-red-600">{lost}</div><div className="text-[11px] font-semibold uppercase text-ink/50">Perdidas</div></div>
          <div><Money cents={profit} signed className="font-display text-xl font-extrabold" /><div className="text-[11px] font-semibold uppercase text-ink/50">Lucro</div></div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="mt-6 rounded-xl bg-white px-6 py-10 text-center text-sm text-ink/55">
          {tab === 'curso' ? 'Não tens apostas em curso.' : tab === 'resolver' ? 'Nada para resolver. ✓' : 'Ainda não há apostas terminadas.'}
        </p>
      ) : (
        <div className="space-y-2.5">
          {list.map((b) => <BetCard key={b.id} bet={b} byId={byId} meId={me.id} />)}
        </div>
      )}
    </>
  )
}
