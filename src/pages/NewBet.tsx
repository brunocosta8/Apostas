import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateBet } from '../lib/api'
import { parseEuros } from '../lib/money'
import { toLocalInput } from '../lib/dates'
import { MODE_LABEL } from '../lib/labels'
import type { BetMode } from '../lib/types'
import { Button, Card, ErrorBox, Field, inputClass, Money, PageTitle } from '../components/ui'

const MODES: { mode: BetMode; desc: string; available: boolean }[] = [
  { mode: 'one_v_one', desc: 'Uma pessoa aceita o lado contrário, com o mesmo valor.', available: true },
  { mode: 'pool', desc: 'Vários em cada lado; quem ganha divide o pote.', available: false },
  { mode: 'odds', desc: 'Defines odds (ex.: 2:1); quem aceita entra com o valor correspondente.', available: false },
  { mode: 'multi', desc: 'Várias opções; quem acertar divide o pote.', available: false },
]

const inHours = (h: number) => {
  const d = new Date(Date.now() + h * 3600_000)
  d.setMinutes(0, 0, 0)
  return d
}

export function NewBet() {
  const navigate = useNavigate()
  const create = useCreateBet()
  const [mode, setMode] = useState<BetMode>('one_v_one')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [mySide, setMySide] = useState('')
  const [otherSide, setOtherSide] = useState('')
  const [amount, setAmount] = useState('')
  const [closesAt, setClosesAt] = useState(toLocalInput(inHours(24)))
  const [resolveBy, setResolveBy] = useState(toLocalInput(inHours(48)))
  const [formError, setFormError] = useState<string | null>(null)

  const amountCents = parseEuros(amount)

  function submit(ev: FormEvent) {
    ev.preventDefault()
    setFormError(null)
    const closes = new Date(closesAt)
    const resolve = new Date(resolveBy)
    if (!title.trim()) return setFormError('Dá um título à aposta.')
    if (!mySide.trim() || !otherSide.trim()) return setFormError('Preenche os dois lados da aposta.')
    if (mySide.trim().toLowerCase() === otherSide.trim().toLowerCase()) return setFormError('Os dois lados têm de ser diferentes.')
    if (!amountCents || amountCents <= 0) return setFormError('Indica um valor válido (ex.: 5 ou 2,50).')
    if (isNaN(closes.getTime()) || closes.getTime() <= Date.now()) return setFormError('A data limite para entrar tem de ser no futuro.')
    if (isNaN(resolve.getTime()) || resolve < closes) return setFormError('A data de resolução não pode ser antes da data limite.')

    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        mode,
        closesAt: closes,
        resolveBy: resolve,
        options: [mySide.trim(), otherSide.trim()],
        creatorOption: 0,
        amountCents,
      },
      { onSuccess: (id) => navigate(`/aposta/${id as string}`, { replace: true }) },
    )
  }

  return (
    <>
      <PageTitle>Nova aposta</PageTitle>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <span className="mb-2 block text-sm font-medium text-slate-300">Modo</span>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                type="button"
                key={m.mode}
                disabled={!m.available}
                onClick={() => setMode(m.mode)}
                className={`rounded-xl border p-3 text-left transition disabled:opacity-40 ${
                  mode === m.mode ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-800/50'
                }`}
              >
                <span className="block text-sm font-semibold text-white">{MODE_LABEL[m.mode]}</span>
                <span className="mt-0.5 block text-xs leading-snug text-slate-400">{m.available ? m.desc : 'Em breve'}</span>
              </button>
            ))}
          </div>
        </div>

        <Field label="Título">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
            placeholder="Ex.: Benfica–Porto de domingo" />
        </Field>
        <Field label="Descrição (opcional)">
          <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
            maxLength={2000} placeholder="Regras, condições, como se decide…" />
        </Field>

        <Card className="space-y-3">
          <Field label="O teu lado">
            <input className={inputClass} value={mySide} onChange={(e) => setMySide(e.target.value)} maxLength={80}
              placeholder="Ex.: O Benfica ganha" />
          </Field>
          <Field label="Lado contrário (de quem aceitar)">
            <input className={inputClass} value={otherSide} onChange={(e) => setOtherSide(e.target.value)} maxLength={80}
              placeholder="Ex.: O Benfica não ganha" />
          </Field>
          <Field label="Valor (€)" hint={amountCents ? <>Quem aceitar entra com <Money cents={amountCents} />. O vencedor recebe <Money cents={amountCents} /> do outro.</> : 'Quem aceitar entra com o mesmo valor.'}>
            <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5,00" />
          </Field>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Data limite para entrar">
            <input type="datetime-local" className={inputClass} value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
          </Field>
          <Field label="Data prevista de resolução">
            <input type="datetime-local" className={inputClass} value={resolveBy} onChange={(e) => setResolveBy(e.target.value)} />
          </Field>
        </div>

        <ErrorBox error={formError ?? create.error} />
        <Button type="submit" className="w-full" loading={create.isPending}>Criar aposta</Button>
      </form>
    </>
  )
}
