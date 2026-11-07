import { useMemo, useState } from 'react'
import { useMe } from '../auth'
import { toSettleable, useBets, useDeletePayment, usePayments, useProfiles, useRecordPayment } from '../lib/api'
import { betProfits, computeBalances, simplifyDebts, type Transfer } from '../lib/settlement'
import { formatEuros, parseEuros } from '../lib/money'
import { formatDate } from '../lib/dates'
import { Avatar, Button, Card, ErrorBox, SubHeader, inputClass, Loading, Money, Section } from '../components/ui'

type ById = ReturnType<typeof useProfiles>['byId']

export function Balances() {
  const { me } = useMe()
  const bets = useBets()
  const payments = usePayments()
  const { byId, data: profiles } = useProfiles()
  const del = useDeletePayment()

  const data = useMemo(() => {
    if (!bets.data || !payments.data) return null
    const settleable = bets.data.map(toSettleable)
    const pays = payments.data.map((p) => ({ fromUser: p.from_user, toUser: p.to_user, amountCents: Number(p.amount_cents) }))
    const balances = computeBalances(settleable, pays)
    return { balances, profits: betProfits(settleable), transfers: simplifyDebts(balances) }
  }, [bets.data, payments.data])

  if (bets.isPending || payments.isPending) return <><SubHeader title="Saldos" /><Loading /></>
  if (bets.error || payments.error || !data) return <><SubHeader title="Saldos" /><ErrorBox error={bets.error ?? payments.error} /></>

  const name = (id: string) => byId.get(id)?.display_name ?? '—'
  const myBalance = data.balances.get(me.id) ?? 0
  const ranking = (profiles ?? [])
    .map((p) => ({ p, profit: data.profits.get(p.id) ?? 0 }))
    .sort((a, b) => b.profit - a.profit)

  return (
    <>
      <SubHeader title="Saldos" />
        <div className="pitch mb-6 rounded-xl px-4 py-5 text-center text-white shadow-[0_3px_0_var(--color-volt)]">
          <div className="font-display text-xs font-bold uppercase tracking-wider text-white/60">O teu saldo</div>
          <Money
            cents={myBalance}
            signed
            className={`mt-1 block font-display text-6xl font-extrabold italic leading-none ${myBalance > 0 ? 'text-volt!' : myBalance < 0 ? 'text-red-300!' : 'text-white!'}`}
          />
          <div className="mt-1.5 font-display text-sm font-bold uppercase tracking-wide text-white/75">
            {myBalance > 0 ? 'Tens a receber' : myBalance < 0 ? 'Tens a pagar' : 'Estás em dia ✓'}
          </div>
        </div>


      <Section title="Quem deve a quem" empty="Ninguém deve nada a ninguém. 🎉">
        {data.transfers.map((t) => (
          <TransferRow key={`${t.from}-${t.to}`} t={t} meId={me.id} name={name} byId={byId} />
        ))}
      </Section>

      <Section title="Classificação">
        <Card className="overflow-hidden p-0">
          <ol>
            {ranking.map(({ p, profit }, i) => (
              <li key={p.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${i % 2 ? 'bg-paper/60' : ''} ${p.id === me.id ? 'bg-pitch-50!' : ''}`}>
                <span className="flex min-w-0 items-center gap-3">
                  <Position n={i + 1} />
                  <Avatar profile={p} size={32} />
                  <span className={`truncate font-semibold ${p.id === me.id ? 'text-pitch-800' : ''}`}>{p.display_name}</span>
                </span>
                <Money cents={profit} signed className="shrink-0 font-display text-xl font-extrabold" />
              </li>
            ))}
          </ol>
        </Card>
        <p className="text-xs text-ink/45">Lucro acumulado em apostas resolvidas.</p>
      </Section>

      <ErrorBox error={del.error} />
      <Section title="Pagamentos registados" empty="Ainda não há pagamentos registados.">
        {payments.data.map((p) => (
          <Card key={p.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0 text-sm">
              <div className="truncate">
                <b>{name(p.from_user)}</b> <span className="text-ink/50">pagou a</span> <b>{name(p.to_user)}</b>
              </div>
              <div className="truncate text-xs text-ink/45">
                {formatDate(p.created_at)} · por {name(p.created_by)}{p.note && ` · ${p.note}`}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Money cents={Number(p.amount_cents)} className="font-display text-lg font-extrabold" />
              {(p.from_user === me.id || p.to_user === me.id) && (
                <button className="rounded-lg px-2 py-1 text-ink/40 hover:bg-ink/5" title="Desfazer" aria-label="Apagar pagamento"
                  onClick={() => { if (confirm('Apagar este pagamento?')) del.mutate(p.id) }}>
                  ✕
                </button>
              )}
            </div>
          </Card>
        ))}
      </Section>
    </>
  )
}

function Position({ n }: { n: number }) {
  const medal = ['bg-volt text-ink', 'bg-zinc-300 text-ink', 'bg-amber-600 text-white'][n - 1]
  return (
    <span className={`inline-flex h-7 w-7 shrink-0 -skew-x-6 items-center justify-center rounded-md font-display text-base font-extrabold italic ${medal ?? 'bg-ink/5 text-ink/50'}`}>
      {n}
    </span>
  )
}

function TransferRow({ t, meId, name, byId }: { t: Transfer; meId: string; name: (id: string) => string; byId: ById }) {
  const record = useRecordPayment()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(formatEuros(t.amountCents).replace(/[^\d,]/g, ''))
  const [note, setNote] = useState('')
  const involved = t.from === meId || t.to === meId
  const cents = parseEuros(amount)
  const iPay = t.from === meId

  return (
    <Card className={`border-l-[6px] ${involved ? (iPay ? 'border-red-500' : 'border-pitch-500') : 'border-ink/10'}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar profile={byId.get(t.from)} size={30} />
          <span className="font-display text-lg font-extrabold text-ink/30">→</span>
          <Avatar profile={byId.get(t.to)} size={30} />
          <span className="min-w-0 truncate text-sm">
            <b>{iPay ? 'Tu' : name(t.from)}</b> <span className="text-ink/50">paga a</span> <b>{t.to === meId ? 'ti' : name(t.to)}</b>
          </span>
        </div>
        <Money cents={t.amountCents} className="shrink-0 font-display text-2xl font-extrabold" />
      </div>
      {involved && !open && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setOpen(true)}>Marcar como pago</Button>
      )}
      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input className={`${inputClass} w-28 shrink-0`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Valor pago" />
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (ex.: MB WAY)" maxLength={200} />
          </div>
          <ErrorBox error={record.error} />
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="flex-1" disabled={!cents} loading={record.isPending}
              onClick={() => cents && record.mutate({ from: t.from, to: t.to, amountCents: cents, note }, { onSuccess: () => setOpen(false) })}>
              Confirmar
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
