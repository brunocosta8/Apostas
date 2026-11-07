import { useMemo, useState } from 'react'
import { useMe } from '../auth'
import { toSettleable, useBets, useDeletePayment, usePayments, useProfiles, useRecordPayment } from '../lib/api'
import { betProfits, computeBalances, simplifyDebts, type Transfer } from '../lib/settlement'
import { formatEuros, parseEuros } from '../lib/money'
import { formatDate } from '../lib/dates'
import { Avatar, Button, Card, ErrorBox, inputClass, Loading, Money, PageTitle, Section } from '../components/ui'

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

  if (bets.isPending || payments.isPending) return <Loading />
  if (bets.error || payments.error) return <ErrorBox error={bets.error ?? payments.error} />
  if (!data) return null

  const name = (id: string) => byId.get(id)?.display_name ?? '—'
  const myBalance = data.balances.get(me.id) ?? 0
  const ranking = (profiles ?? [])
    .map((p) => ({ p, profit: data.profits.get(p.id) ?? 0 }))
    .sort((a, b) => b.profit - a.profit)

  return (
    <>
      <PageTitle>Saldos</PageTitle>

      <Card className="mb-6 text-center">
        <div className="text-sm text-slate-400">O teu saldo</div>
        <Money cents={myBalance} signed className="mt-1 block text-4xl font-bold" />
        <div className="mt-1 text-sm text-slate-400">
          {myBalance > 0 ? 'tens a receber' : myBalance < 0 ? 'tens a pagar' : 'estás em dia'}
        </div>
      </Card>

      <Section title="Quem deve a quem" empty="Ninguém deve nada a ninguém. 🎉">
        {data.transfers.map((t) => (
          <TransferRow key={`${t.from}-${t.to}`} t={t} meId={me.id} name={name} byId={byId} />
        ))}
      </Section>

      <Section title="Ranking (lucro em apostas)">
        <Card className="p-0">
          <ol className="divide-y divide-slate-800">
            {ranking.map(({ p, profit }, i) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <span className="flex items-center gap-3">
                  <span className="w-5 text-right text-sm text-slate-500">{i + 1}</span>
                  <Avatar profile={p} size={28} />
                  <span className={p.id === me.id ? 'font-semibold text-emerald-300' : 'text-slate-200'}>{p.display_name}</span>
                </span>
                <Money cents={profit} signed className="font-semibold" />
              </li>
            ))}
          </ol>
        </Card>
      </Section>

      <ErrorBox error={del.error} />
      <Section title="Pagamentos registados" empty="Ainda não há pagamentos registados.">
        {payments.data.map((p) => (
          <Card key={p.id} className="flex items-center justify-between gap-3 py-3">
            <div className="text-sm">
              <div className="text-slate-200">
                <span className="font-medium">{name(p.from_user)}</span> pagou a <span className="font-medium">{name(p.to_user)}</span>
              </div>
              <div className="text-xs text-slate-500">
                {formatDate(p.created_at)} · registado por {name(p.created_by)}{p.note && ` · ${p.note}`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Money cents={Number(p.amount_cents)} className="font-semibold text-slate-100" />
              {(p.from_user === me.id || p.to_user === me.id) && (
                <button className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-800" title="Desfazer"
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

function TransferRow({ t, meId, name, byId }: {
  t: Transfer; meId: string; name: (id: string) => string; byId: ReturnType<typeof useProfiles>['byId']
}) {
  const record = useRecordPayment()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(formatEuros(t.amountCents).replace(/[^\d,]/g, ''))
  const [note, setNote] = useState('')
  const involved = t.from === meId || t.to === meId
  const cents = parseEuros(amount)

  return (
    <Card className={involved ? 'border-emerald-500/30' : ''}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Avatar profile={byId.get(t.from)} size={26} />
          <span className="truncate"><b>{t.from === meId ? 'Tu' : name(t.from)}</b> → <b>{t.to === meId ? 'ti' : name(t.to)}</b></span>
          <Avatar profile={byId.get(t.to)} size={26} />
        </div>
        <Money cents={t.amountCents} className="shrink-0 font-semibold text-white" />
      </div>
      {involved && !open && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setOpen(true)}>Marcar como pago</Button>
      )}
      {open && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Valor pago" />
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
