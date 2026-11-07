import { useState } from 'react'
import { useMe } from '../auth'
import { useBets, useProfiles } from '../lib/api'
import { BetCard } from '../components/BetCard'
import { ErrorBox, Hero, Loading } from '../components/ui'

export function History() {
  const { me } = useMe()
  const bets = useBets()
  const { byId } = useProfiles()
  const [onlyMine, setOnlyMine] = useState(false)

  if (bets.isPending) return <><Hero title="Histórico" /><Loading /></>
  if (bets.error) return <><Hero title="Histórico" /><ErrorBox error={bets.error} /></>

  const done = bets.data
    .filter((b) => ['resolved', 'void', 'cancelled'].includes(b.status))
    .filter((b) => !onlyMine || b.bet_entries.some((e) => e.user_id === me.id))
    .sort((a, b) => endDate(b).localeCompare(endDate(a)))

  return (
    <>
      <Hero title="Histórico">
        <div className="mt-4 inline-flex rounded-xl bg-black/20 p-1 font-display text-sm font-bold uppercase tracking-wide">
          {[false, true].map((v) => (
            <button key={String(v)} onClick={() => setOnlyMine(v)}
              className={`rounded-lg px-4 py-1.5 transition ${onlyMine === v ? 'bg-volt text-ink' : 'text-white/75'}`}>
              {v ? 'Só as minhas' : 'Todas'}
            </button>
          ))}
        </div>
      </Hero>
      {done.length === 0 ? (
        <p className="py-16 text-center text-ink/50">Ainda não há apostas terminadas.</p>
      ) : (
        <div className="space-y-3">
          {done.map((b) => <BetCard key={b.id} bet={b} byId={byId} meId={me.id} />)}
        </div>
      )}
    </>
  )
}

const endDate = (b: { resolved_at: string | null; cancelled_at: string | null; closed_at: string | null; created_at: string }) =>
  b.resolved_at ?? b.cancelled_at ?? b.closed_at ?? b.created_at
