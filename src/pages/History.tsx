import { useState } from 'react'
import { useMe } from '../auth'
import { useBets, useProfiles } from '../lib/api'
import { BetCard } from '../components/BetCard'
import { ErrorBox, Loading, PageTitle } from '../components/ui'

export function History() {
  const { me } = useMe()
  const bets = useBets()
  const { byId } = useProfiles()
  const [onlyMine, setOnlyMine] = useState(false)

  if (bets.isPending) return <Loading />
  if (bets.error) return <ErrorBox error={bets.error} />

  const done = bets.data
    .filter((b) => ['resolved', 'void', 'cancelled'].includes(b.status))
    .filter((b) => !onlyMine || b.bet_entries.some((e) => e.user_id === me.id))
    .sort((a, b) => endDate(b).localeCompare(endDate(a)))

  return (
    <>
      <PageTitle
        action={
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" className="h-4 w-4 accent-emerald-500" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
            Só as minhas
          </label>
        }
      >
        Histórico
      </PageTitle>
      {done.length === 0 ? (
        <p className="py-16 text-center text-slate-400">Ainda não há apostas terminadas.</p>
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
