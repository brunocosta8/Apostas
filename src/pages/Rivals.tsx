import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMe } from '../auth'
import { useBets, usePayments, useProfiles } from '../lib/api'
import { headToHead, type H2HBetInput, type H2HOutcome, type H2HSummary } from '../lib/h2h'
import { formatDate } from '../lib/dates'
import { MODE_LABEL } from '../lib/labels'
import type { Bet, Profile } from '../lib/types'
import { Avatar, Card, ErrorBox, Loading, Money, Section, SubHeader } from '../components/ui'

const toInput = (b: Bet): H2HBetInput => ({
  id: b.id,
  status: b.status,
  winningOptionId: b.winning_option_id,
  date: b.resolved_at ?? b.cancelled_at ?? b.closed_at ?? b.created_at,
  entries: b.bet_entries.map((e) => ({ userId: e.user_id, optionId: e.option_id, amountCents: Number(e.amount_cents) })),
})

function useHeadToHeads() {
  const { me } = useMe()
  const bets = useBets()
  const profiles = useProfiles()
  const rows = useMemo(() => {
    if (!bets.data || !profiles.data) return null
    const inputs = bets.data.map(toInput)
    return profiles.data
      .filter((p) => p.id !== me.id)
      .map((p) => ({ profile: p, h2h: headToHead(inputs, me.id, p.id) }))
      .sort((a, b) => b.h2h.together - a.h2h.together || a.profile.display_name.localeCompare(b.profile.display_name, 'pt'))
  }, [bets.data, profiles.data, me.id])
  return { rows, bets, profiles }
}

const record = (s: H2HSummary) => `${s.wins}V · ${s.losses}D${s.draws ? ` · ${s.draws}E` : ''}`

/** Lista de confrontos com cada pessoa do grupo. */
export function Rivals() {
  const { rows, bets } = useHeadToHeads()
  if (bets.error) return <><SubHeader title="Confrontos" /><ErrorBox error={bets.error} /></>
  if (!rows) return <><SubHeader title="Confrontos" /><Loading /></>

  const withBets = rows.filter((r) => r.h2h.together > 0)
  const rival = withBets[0]
  const victim = [...withBets].sort((a, b) => b.h2h.net - a.h2h.net)[0]
  const nemesis = [...withBets].sort((a, b) => a.h2h.net - b.h2h.net)[0]

  return (
    <>
      <SubHeader title="Confrontos" />

      {withBets.length > 0 && (
        <div className="pitch mb-5 grid grid-cols-3 divide-x divide-white/15 rounded-xl py-3 text-center text-white shadow-[0_3px_0_var(--color-volt)]">
          <Highlight label="Maior rival" emoji="⚔️" p={rival.profile} sub={`${rival.h2h.together} apostas`} />
          <Highlight label="Freguês" emoji="💰" p={victim.h2h.net > 0 ? victim.profile : undefined} sub={victim.h2h.net > 0 ? <Money cents={victim.h2h.net} signed className="text-volt!" /> : null} />
          <Highlight label="Carrasco" emoji="😈" p={nemesis.h2h.net < 0 ? nemesis.profile : undefined} sub={nemesis.h2h.net < 0 ? <Money cents={nemesis.h2h.net} signed className="text-red-300!" /> : null} />
        </div>
      )}

      <div className="space-y-2">
        {rows.map(({ profile, h2h }) => (
          <Link key={profile.id} to={`/confrontos/${profile.id}`}
            className={`flex items-center gap-3 rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(13,27,18,0.06)] active:bg-white/70 ${h2h.together === 0 ? 'opacity-60' : ''}`}>
            <Avatar profile={profile} size={42} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold text-ink">{profile.display_name}</div>
              <div className="text-xs font-medium text-ink/55">
                {h2h.together === 0 ? 'Ainda sem confrontos' : `${h2h.together} ${h2h.together === 1 ? 'aposta' : 'apostas'} · ${record(h2h)}`}
              </div>
            </div>
            {h2h.together > 0 && <Money cents={h2h.net} signed className="shrink-0 font-display text-xl font-extrabold" />}
            <span className="text-xl text-ink/30" aria-hidden>›</span>
          </Link>
        ))}
        {rows.length === 0 && <p className="rounded-xl bg-white px-6 py-10 text-center text-sm text-ink/55">Ainda não há mais ninguém no grupo.</p>}
      </div>
    </>
  )
}

function Highlight({ label, emoji, p, sub }: { label: string; emoji: string; p?: Profile; sub: React.ReactNode }) {
  return (
    <div className="min-w-0 px-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/60">{emoji} {label}</div>
      {p ? (
        <>
          <div className="mt-1 flex justify-center"><Avatar profile={p} size={30} ring /></div>
          <div className="mt-1 truncate text-sm font-bold">{p.display_name.split(' ')[0]}</div>
        </>
      ) : (
        <div className="mt-2 text-sm text-white/50">—</div>
      )}
      <div className="font-display text-sm font-bold text-white/80">{sub}</div>
    </div>
  )
}

const OUTCOME: Record<H2HOutcome, { label: string; cls: string }> = {
  win: { label: 'Vitória', cls: 'bg-pitch-600 text-white' },
  loss: { label: 'Derrota', cls: 'bg-red-600 text-white' },
  draw: { label: 'Empate', cls: 'bg-ink/10 text-ink/70' },
  same: { label: 'Mesmo lado', cls: 'bg-volt text-ink' },
  pending: { label: 'Em curso', cls: 'bg-pitch-50 text-pitch-800 ring-1 ring-pitch-200' },
  void: { label: 'Anulada', cls: 'bg-ink/5 text-ink/45' },
}

/** Confronto "Tu VS pessoa". */
export function Rival() {
  const { id } = useParams()
  const { me } = useMe()
  const { rows, bets, profiles } = useHeadToHeads()
  const payments = usePayments()

  if (bets.error) return <><SubHeader back="/confrontos" title="Confronto" /><ErrorBox error={bets.error} /></>
  if (!rows || !bets.data) return <><SubHeader back="/confrontos" title="Confronto" /><Loading /></>
  const row = rows.find((r) => r.profile.id === id)
  if (!row) return <><SubHeader back="/confrontos" title="Confronto" /><p className="text-center text-ink/60">Pessoa não encontrada.</p></>

  const { profile: other, h2h } = row
  const first = other.display_name.split(' ')[0]
  const meProfile = profiles.byId.get(me.id) ?? me
  const betById = new Map(bets.data.map((b) => [b.id, b]))
  const paid = (payments.data ?? []).filter((p) => p.from_user === me.id && p.to_user === other.id).reduce((a, p) => a + Number(p.amount_cents), 0)
  const received = (payments.data ?? []).filter((p) => p.from_user === other.id && p.to_user === me.id).reduce((a, p) => a + Number(p.amount_cents), 0)

  return (
    <>
      <SubHeader back="/confrontos" title={`Tu vs ${first}`} />

      <div className="pitch mb-4 rounded-xl px-4 pb-5 pt-4 text-white shadow-[0_3px_0_var(--color-volt)]">
        <div className="flex items-center justify-between">
          <Side p={meProfile} name="Tu" />
          <div className="text-center">
            <div className="font-display text-5xl font-extrabold italic leading-none tabular-nums">
              {h2h.wins}<span className="mx-1.5 text-white/40">–</span>{h2h.losses}
            </div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-white/60">
              {h2h.draws > 0 ? `${h2h.draws} ${h2h.draws === 1 ? 'empate' : 'empates'}` : 'vitórias – derrotas'}
            </div>
          </div>
          <Side p={other} name={first} />
        </div>
        <div className="mt-4 rounded-lg bg-black/20 px-3 py-2 text-center text-sm">
          {h2h.together === 0 ? (
            <>Ainda não apostaram um contra o outro.</>
          ) : h2h.net > 0 ? (
            <>Já ganhaste <Money cents={h2h.net} className="font-display text-lg font-extrabold text-volt" /> ao {first}</>
          ) : h2h.net < 0 ? (
            <>Já perdeste <Money cents={-h2h.net} className="font-display text-lg font-extrabold text-red-300" /> para o {first}</>
          ) : (
            <>Estão empatados em dinheiro</>
          )}
        </div>
      </div>

      {h2h.together > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-2">
          <Stat label="Apostas juntos" value={h2h.together} />
          <Stat label="% de vitórias" value={h2h.winRate === null ? '—' : `${h2h.winRate}%`} />
          <Stat label="Sequência" value={h2h.streak ? `${h2h.streak.type === 'win' ? '🔥' : '🥶'} ${h2h.streak.count} ${h2h.streak.type === 'win' ? (h2h.streak.count === 1 ? 'vitória' : 'vitórias') : (h2h.streak.count === 1 ? 'derrota' : 'derrotas')}` : '—'} />
          <Stat label="Total que apostaste" value={<Money cents={h2h.myStakeTotal} />} />
          <Stat label="Maior vitória" value={h2h.biggestWin ? <Money cents={h2h.biggestWin.pairNet} signed /> : '—'}
            sub={h2h.biggestWin && betById.get(h2h.biggestWin.id)?.title} to={h2h.biggestWin && `/aposta/${h2h.biggestWin.id}`} />
          <Stat label="Maior derrota" value={h2h.biggestLoss ? <Money cents={h2h.biggestLoss.pairNet} signed /> : '—'}
            sub={h2h.biggestLoss && betById.get(h2h.biggestLoss.id)?.title} to={h2h.biggestLoss && `/aposta/${h2h.biggestLoss.id}`} />
          <Stat label="Do mesmo lado" value={`${h2h.sameSide}×`} />
          <Stat label="Em curso" value={h2h.pending} />
        </div>
      )}

      {(paid > 0 || received > 0) && (
        <Section title="Pagamentos entre vocês">
          <Card className="grid grid-cols-2 divide-x divide-ink/10 py-3 text-center">
            <div><div className="text-[11px] font-bold uppercase text-ink/50">Pagaste</div><Money cents={paid} className="font-display text-xl font-extrabold" /></div>
            <div><div className="text-[11px] font-bold uppercase text-ink/50">Recebeste</div><Money cents={received} className="font-display text-xl font-extrabold" /></div>
          </Card>
        </Section>
      )}

      <Section title="Apostas em comum" empty={`Ainda não há apostas com o ${first}.`}>
        {h2h.bets.map((r) => {
          const b = betById.get(r.id)!
          return (
            <Link key={r.id} to={`/aposta/${r.id}`} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(13,27,18,0.06)] active:bg-white/70">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink">{b.is_secret && '🔒 '}{b.title}</div>
                <div className="truncate text-xs text-ink/50">
                  {MODE_LABEL[b.mode]} · {formatDate(b.resolved_at ?? b.cancelled_at ?? b.closed_at ?? b.created_at)}
                  {' · '}tu <Money cents={r.myStake} /> vs <Money cents={r.theirStake} />
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${OUTCOME[r.outcome].cls}`}>{OUTCOME[r.outcome].label}</span>
                {(r.outcome === 'win' || r.outcome === 'loss') && <Money cents={r.pairNet} signed className="text-sm font-bold" />}
              </div>
            </Link>
          )
        })}
      </Section>
    </>
  )
}

function Side({ p, name }: { p: Profile; name: string }) {
  return (
    <div className="flex w-20 flex-col items-center gap-1.5">
      <Avatar profile={p} size={56} ring />
      <span className="max-w-full truncate text-sm font-bold">{name}</span>
    </div>
  )
}

function Stat({ label, value, sub, to }: { label: string; value: React.ReactNode; sub?: string | null; to?: string | null }) {
  const body = (
    <>
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink/45">{label}</div>
      <div className="mt-0.5 font-display text-2xl font-extrabold leading-tight text-ink">{value}</div>
      {sub && <div className="truncate text-xs text-ink/50">{sub}</div>}
    </>
  )
  const cls = 'block rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(13,27,18,0.06)]'
  return to ? <Link to={to} className={`${cls} active:bg-white/70`}>{body}</Link> : <div className={cls}>{body}</div>
}

