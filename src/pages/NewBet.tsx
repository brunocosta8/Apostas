import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateBet } from '../lib/api'
import { formatEuros, parseEuros, parseOddsNumber } from '../lib/money'
import { toLocalInput } from '../lib/dates'
import { MODE_LABEL } from '../lib/labels'
import { oddsTakerAmount } from '../lib/settlement'
import type { BetMode } from '../lib/types'
import { Button, Card, ErrorBox, Field, SubHeader, formatCota, inputClass, Vs } from '../components/ui'

const MODES: { mode: BetMode; icon: string; desc: string }[] = [
  { mode: 'one_v_one', icon: '🥊', desc: 'Uma pessoa aceita o lado contrário, com o mesmo valor.' },
  { mode: 'pool', icon: '👥', desc: 'Vários em cada lado, cada um com o valor que quiser. Quem ganha divide o pote.' },
  { mode: 'odds', icon: '📈', desc: 'Defines as odds (ex.: 2:1). Uma pessoa aceita com o valor correspondente.' },
  { mode: 'multi', icon: '🔢', desc: 'Várias opções (ex.: 1-X-2). Quem acertar divide o pote.' },
]

const MAX_OPTIONS = 12

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
  const [options, setOptions] = useState<string[]>(['', ''])
  const [myOption, setMyOption] = useState(0)
  const [amount, setAmount] = useState('')
  const [oddsMine, setOddsMine] = useState('2')
  const [oddsTheirs, setOddsTheirs] = useState('1')
  const [closesAt, setClosesAt] = useState(toLocalInput(inHours(24)))
  const [resolveBy, setResolveBy] = useState(toLocalInput(inHours(48)))
  const [formError, setFormError] = useState<string | null>(null)

  const isMulti = mode === 'multi'
  const opts = isMulti ? options : options.slice(0, 2)
  // Em 1v1 e odds o criador fica sempre com o primeiro lado.
  const mine = mode === 'one_v_one' || mode === 'odds' ? 0 : Math.min(myOption, opts.length - 1)
  const amountCents = parseEuros(amount)
  const oc = parseOddsNumber(oddsMine)
  const ot = parseOddsNumber(oddsTheirs)
  const takerCents = mode === 'odds' && amountCents && oc && ot ? oddsTakerAmount(amountCents, oc, ot) : null

  function changeMode(m: BetMode) {
    setMode(m)
    if (m !== 'multi' && options.length < 2) setOptions([...options, ''].slice(0, 2))
  }
  const setOption = (i: number, v: string) => setOptions(options.map((o, j) => (j === i ? v : o)))
  const removeOption = (i: number) => {
    setOptions(options.filter((_, j) => j !== i))
    if (myOption >= i && myOption > 0) setMyOption(myOption - 1)
  }

  function submit(ev: FormEvent) {
    ev.preventDefault()
    setFormError(null)
    const closes = new Date(closesAt)
    const resolve = new Date(resolveBy)
    const clean = opts.map((o) => o.trim())
    if (!title.trim()) return setFormError('Dá um título à aposta.')
    if (clean.some((o) => !o)) return setFormError(isMulti ? 'Preenche todas as opções (ou remove as vazias).' : 'Preenche os dois lados da aposta.')
    if (new Set(clean.map((o) => o.toLowerCase())).size !== clean.length) return setFormError('As opções têm de ser diferentes entre si.')
    if (!amountCents || amountCents <= 0) return setFormError('Indica um valor válido (ex.: 5 ou 2,50).')
    if (mode === 'odds') {
      if (!oc || !ot) return setFormError('Odds inválidas: usa números positivos, ex.: 2 e 1, ou 1,5 e 1.')
      if (!takerCents || takerCents < 1) return setFormError('Com estas odds o valor de quem aceita seria 0 €.')
    }
    if (isNaN(closes.getTime()) || closes.getTime() <= Date.now()) return setFormError('A data limite para entrar tem de ser no futuro.')
    if (isNaN(resolve.getTime()) || resolve < closes) return setFormError('A data de resolução não pode ser antes da data limite.')

    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        mode,
        closesAt: closes,
        resolveBy: resolve,
        options: clean,
        creatorOption: mine,
        amountCents,
        ...(mode === 'odds' ? { oddsCreator: oc!, oddsTaker: ot! } : {}),
      },
      { onSuccess: (id) => navigate(`/aposta/${id as string}`, { replace: true }) },
    )
  }

  return (
    <>
      <SubHeader back="/" title="Nova aposta" />
      <form onSubmit={submit} className="space-y-5">
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink/70">Modo</span>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => (
              <button
                type="button"
                key={m.mode}
                onClick={() => changeMode(m.mode)}
                aria-pressed={mode === m.mode}
                className={`rounded-xl border-2 bg-white p-3 text-left transition ${
                  mode === m.mode ? 'border-pitch-600 shadow-[0_2px_0_var(--color-pitch-600)]' : 'border-transparent'
                }`}
              >
                <span className="text-xl">{m.icon}</span>
                <span className="mt-1 block text-base font-bold leading-tight text-ink">{MODE_LABEL[m.mode]}</span>
                <span className="mt-0.5 block text-xs leading-snug text-ink/55">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <Field label="Título">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
            placeholder={isMulti ? 'Ex.: Resultado do Benfica–Porto' : 'Ex.: Benfica–Porto de domingo'} />
        </Field>
        <Field label="Descrição (opcional)">
          <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
            maxLength={2000} placeholder="Regras, condições, como se decide…" />
        </Field>

        <Card className="space-y-3">
          {isMulti ? (
            <MultiOptions options={options} myOption={mine} setOption={setOption} setMyOption={setMyOption}
              add={() => setOptions([...options, ''])} remove={removeOption} />
          ) : mode === 'pool' ? (
            <PoolSides options={opts} myOption={mine} setOption={setOption} setMyOption={setMyOption} />
          ) : (
            <>
              <Field label="O teu lado">
                <input className={inputClass} value={opts[0]} onChange={(e) => setOption(0, e.target.value)} maxLength={80}
                  placeholder="Ex.: O Benfica ganha" />
              </Field>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-ink/10" /><Vs /><span className="h-px flex-1 bg-ink/10" />
              </div>
              <Field label="Lado contrário (de quem aceitar)">
                <input className={inputClass} value={opts[1]} onChange={(e) => setOption(1, e.target.value)} maxLength={80}
                  placeholder="Ex.: O Benfica não ganha" />
              </Field>
            </>
          )}

          {mode === 'odds' && (
            <Field label="Odds" hint="Tu pões X por cada Y de quem aceitar. Usa odds altas quando o teu lado é o mais provável.">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink/70">
                <span>Ponho</span>
                <input className={`${inputClass} w-20 text-center font-bold`} inputMode="decimal" value={oddsMine}
                  onChange={(e) => setOddsMine(e.target.value)} aria-label="Odds do criador" />
                <span>por cada</span>
                <input className={`${inputClass} w-20 text-center font-bold`} inputMode="decimal" value={oddsTheirs}
                  onChange={(e) => setOddsTheirs(e.target.value)} aria-label="Odds de quem aceita" />
              </div>
            </Field>
          )}

          <Field label={mode === 'pool' || isMulti ? 'O teu valor (€)' : 'Valor (€)'}>
            <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5,00" />
          </Field>

          <Summary>
            {!amountCents ? (
              'Indica o valor para veres o resumo.'
            ) : mode === 'one_v_one' ? (
              <>Quem aceitar entra com <b>{formatEuros(amountCents)}</b>. Quem ganhar leva o pote de <b>{formatEuros(amountCents * 2)}</b> (cota 2,00).</>
            ) : mode === 'odds' ? (
              takerCents ? (
                <>Tu arriscas <b>{formatEuros(amountCents)}</b>; quem aceitar entra com <b>{formatEuros(takerCents)}</b>.
                  Se ganhares, ganhas <b>{formatEuros(takerCents)}</b>. Se perderes, o outro ganha <b>{formatEuros(amountCents)}</b>
                  {' '}(cota dele: {formatCota((amountCents + takerCents) / takerCents)}).</>
              ) : 'Odds inválidas.'
            ) : (
              <>Entras com <b>{formatEuros(amountCents)}</b> em «{opts[mine]?.trim() || '…'}». Os outros escolhem {isMulti ? 'uma opção' : 'um lado'} e
                quanto apostam; quem acertar divide o pote na proporção do que apostou. Se ninguém acertar, fica anulada.</>
            )}
          </Summary>
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
        <Button type="submit" className="w-full text-lg!" loading={create.isPending}>Lançar aposta</Button>
      </form>
    </>
  )
}

function Summary({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-pitch-50 px-3 py-2.5 text-sm leading-relaxed text-ink/75">{children}</p>
}

function PoolSides({ options, myOption, setOption, setMyOption }: {
  options: string[]; myOption: number; setOption: (i: number, v: string) => void; setMyOption: (i: number) => void
}) {
  return (
    <>
      {[0, 1].map((i) => (
        <div key={i}>
          {i === 1 && (
            <div className="mb-3 flex items-center gap-3">
              <span className="h-px flex-1 bg-ink/10" /><Vs /><span className="h-px flex-1 bg-ink/10" />
            </div>
          )}
          <Field label={i === 0 ? 'Lado A' : 'Lado B'}>
            <input className={inputClass} value={options[i]} onChange={(e) => setOption(i, e.target.value)} maxLength={80}
              placeholder={i === 0 ? 'Ex.: Chove' : 'Ex.: Não chove'} />
          </Field>
        </div>
      ))}
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-ink/70">Em que lado ficas?</span>
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((i) => (
            <button key={i} type="button" onClick={() => setMyOption(i)} aria-pressed={myOption === i}
              className={`truncate rounded-lg px-3 py-2.5 text-sm font-bold ${myOption === i ? 'bg-pitch-700 text-white' : 'bg-paper text-ink/60'}`}>
              {options[i]?.trim() || (i === 0 ? 'Lado A' : 'Lado B')}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function MultiOptions({ options, myOption, setOption, setMyOption, add, remove }: {
  options: string[]; myOption: number; setOption: (i: number, v: string) => void; setMyOption: (i: number) => void
  add: () => void; remove: (i: number) => void
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-ink/70">Opções <span className="font-normal text-ink/45">— toca no círculo para escolher a tua</span></span>
      <ul className="space-y-2">
        {options.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            <button type="button" onClick={() => setMyOption(i)} aria-label={`Escolher opção ${i + 1}`} aria-pressed={myOption === i}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${myOption === i ? 'border-pitch-600 bg-pitch-600 text-white' : 'border-ink/20'}`}>
              {myOption === i && <span className="text-xs font-bold">✓</span>}
            </button>
            <input className={inputClass} value={o} onChange={(e) => setOption(i, e.target.value)} maxLength={80}
              placeholder={['Ex.: Vitória do Benfica', 'Ex.: Empate', 'Ex.: Vitória do Porto'][i] ?? `Opção ${i + 1}`} />
            {options.length > 2 && (
              <button type="button" onClick={() => remove(i)} aria-label={`Remover opção ${i + 1}`}
                className="h-9 w-9 shrink-0 rounded-lg text-lg text-ink/40 hover:bg-ink/5">×</button>
            )}
          </li>
        ))}
      </ul>
      {options.length < MAX_OPTIONS && (
        <button type="button" onClick={add} className="mt-2 rounded-lg px-2 py-1.5 text-sm font-bold text-pitch-700 hover:bg-pitch-50">
          + Adicionar opção
        </button>
      )}
    </div>
  )
}
