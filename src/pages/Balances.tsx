import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMe } from '../auth'
import { useBets, useDeletePayment, useLedger, usePayments, useProfiles, useRecordPayment } from '../lib/api'
import type { Transfer } from '../lib/settlement'
import { formatEuros, parseEuros } from '../lib/money'
import { formatDate } from '../lib/dates'
import { Avatar, Button, Card, ErrorBox, SubHeader, inputClass, Loading, Money, Section } from '../components/ui'

type ById = ReturnType<typeof useProfiles>['byId']

/** Uma dívida que me diz respeito (das contas normais ou de uma aposta secreta). */
interface MyDebt extends Transfer {
  betId?: string
}

export function Balances() {
  const { me } = useMe()
  const bets = useBets()
  const payments = usePayments()
  const { byId } = useProfiles()
  const ledger = useLedger()
  const del = useDeletePayment()

  if (bets.isPending || payments.isPending) return <><SubHeader back="/" title="Saldos" /><Loading /></>
  if (bets.error || payments.error || !ledger) return <><SubHeader back="/" title="Saldos" /><ErrorBox error={bets.error ?? payments.error} /></>

  const betById = new Map((bets.data ?? []).map((b) => [b.id, b]))
  const name = (id: string) => byId.get(id)?.display_name ?? '—'
  const myBalance = ledger.total.get(me.id) ?? 0

  const mine: MyDebt[] = [
    ...ledger.publicTransfers,
    ...ledger.secret.flatMap((s) => s.transfers.map((t) => ({ ...t, betId: s.betId }))),
  ].filter((t) => t.from === me.id || t.to === me.id)
  const toPay = mine.filter((t) => t.from === me.id).sort((a, b) => b.amountCents - a.amountCents)
  const toReceive = mine.filter((t) => t.to === me.id).sort((a, b) => b.amountCents - a.amountCents)
  const myPayments = payments.data.filter((p) => p.from_user === me.id || p.to_user === me.id)

  return (
    <>
      <SubHeader back="/" title="Saldos" />
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

      <Section title="Deves" empty="Não deves nada a ninguém. ✓">
        {toPay.map((t) => (
          <DebtRow key={`${t.betId ?? 'g'}-${t.to}`} t={t} meId={me.id} name={name} byId={byId} betTitle={t.betId && betById.get(t.betId)?.title} />
        ))}
      </Section>

      <Section title="Devem-te" empty="Ninguém te deve nada.">
        {toReceive.map((t) => (
          <DebtRow key={`${t.betId ?? 'g'}-${t.from}`} t={t} meId={me.id} name={name} byId={byId} betTitle={t.betId && betById.get(t.betId)?.title} />
        ))}
      </Section>

      <ErrorBox error={del.error} />
      <Section title="Histórico de pagamentos" empty="Ainda não pagaste nem recebeste nada.">
        {myPayments.map((p) => {
          const iPaid = p.from_user === me.id
          const other = iPaid ? p.to_user : p.from_user
          return (
            <Card key={p.id} className="flex items-center gap-3 py-3">
              <Avatar profile={byId.get(other)} size={34} />
              <div className="min-w-0 flex-1 text-sm">
                <div className="truncate font-semibold">
                  {p.bet_id && <span title="Aposta secreta">🔒 </span>}
                  {iPaid ? <>Pagaste a {name(other)}</> : <>{name(other)} pagou-te</>}
                </div>
                <div className="truncate text-xs text-ink/45">
                  {formatDate(p.created_at)}{p.bet_id && ` · ${betById.get(p.bet_id)?.title ?? 'aposta secreta'}`}{p.note && ` · ${p.note}`}
                </div>
              </div>
              <Money cents={iPaid ? -Number(p.amount_cents) : Number(p.amount_cents)} signed className="shrink-0 font-display text-lg font-extrabold" />
              <button className="rounded-lg px-1.5 py-1 text-ink/35 hover:bg-ink/5" title="Desfazer" aria-label="Apagar pagamento"
                onClick={() => { if (confirm('Apagar este pagamento?')) del.mutate(p.id) }}>
                ✕
              </button>
            </Card>
          )
        })}
      </Section>
    </>
  )
}

function DebtRow({ t, meId, name, byId, betTitle }: {
  t: MyDebt; meId: string; name: (id: string) => string; byId: ById; betTitle?: string | false
}) {
  const record = useRecordPayment()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(formatEuros(t.amountCents).replace(/[^\d,]/g, ''))
  const [note, setNote] = useState('')
  const cents = parseEuros(amount)
  const iPay = t.from === meId
  const other = iPay ? t.to : t.from

  return (
    <Card>
      <div className="flex items-center gap-3">
        <Link to={`/confrontos/${other}`} className="shrink-0"><Avatar profile={byId.get(other)} size={40} /></Link>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold text-ink">{iPay ? `Deves a ${name(other)}` : `${name(other)} deve-te`}</div>
          {t.betId && <div className="truncate text-xs text-ink/50">🔒 {betTitle || 'Aposta secreta'}</div>}
        </div>
        <Money cents={t.amountCents} className={`shrink-0 font-display text-2xl font-extrabold ${iPay ? 'text-red-600' : 'text-pitch-600'}`} />
      </div>
      {!open && (
        <Button variant={iPay ? 'secondary' : 'light'} className="mt-3 w-full" onClick={() => setOpen(true)}>
          {iPay ? 'Já paguei' : 'Já recebi'}
        </Button>
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
              onClick={() => cents && record.mutate({ from: t.from, to: t.to, amountCents: cents, note, betId: t.betId }, { onSuccess: () => setOpen(false) })}>
              Confirmar
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
