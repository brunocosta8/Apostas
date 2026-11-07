import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Bet } from '../lib/types'
import { toOddsContext, toSettleable, useJoinBet } from '../lib/api'
import { oddsTakerAmount, optionOdds, potentialPayout } from '../lib/settlement'
import { formatEuros, parseEuros } from '../lib/money'
import { Button, ErrorBox, formatCota, inputClass, Money } from './ui'

interface Selection { bet: Bet; optionId: string }
const Ctx = createContext<(s: Selection) => void>(() => {})

/** Abre o boletim para entrar numa aposta. */
export const useOpenSlip = () => useContext(Ctx)

export function BetSlipProvider({ children }: { children: ReactNode }) {
  const [sel, setSel] = useState<Selection | null>(null)
  return (
    <Ctx.Provider value={setSel}>
      {children}
      {sel && <BetSlipSheet sel={sel} onClose={() => setSel(null)} />}
    </Ctx.Provider>
  )
}

function BetSlipSheet({ sel, onClose }: { sel: Selection; onClose: () => void }) {
  const { bet, optionId } = sel
  const join = useJoinBet()
  const navigate = useNavigate()
  const option = bet.bet_options.find((o) => o.id === optionId)!
  const creatorEntry = bet.bet_entries.find((e) => e.user_id === bet.creator_id)
  const fixed = bet.mode === 'one_v_one' || bet.mode === 'odds'
  const fixedStake = !creatorEntry ? 0
    : bet.mode === 'one_v_one' ? Number(creatorEntry.amount_cents)
    : bet.mode === 'odds' ? oddsTakerAmount(Number(creatorEntry.amount_cents), Number(bet.odds_creator), Number(bet.odds_taker))
    : 0
  const [amount, setAmount] = useState('')
  const stake = fixed ? fixedStake : parseEuros(amount) ?? 0
  const payout = stake > 0 ? potentialPayout(toSettleable(bet).entries, optionId, stake) : 0
  const cota = stake > 0 ? payout / stake : optionOdds(toOddsContext(bet), optionId)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const add = (cents: number) => setAmount(formatEuros((parseEuros(amount) ?? 0) + cents).replace(/[^\d,]/g, ''))

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Boletim">
      <button className="absolute inset-0 bg-ink/50" aria-label="Fechar" onClick={onClose} />
      <div className="pb-safe relative mx-auto w-full max-w-xl rounded-t-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between rounded-t-2xl bg-pitch-700 px-4 py-3 text-white">
          <span className="flex items-center gap-2 font-bold">
            Boletim <span className="rounded-full bg-volt px-1.5 text-xs font-bold text-ink">1</span>
          </span>
          <button onClick={onClose} className="text-2xl leading-none text-white/80" aria-label="Fechar">×</button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded-xl border border-ink/10 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-ink/50">{bet.title}</div>
                <div className="font-bold text-ink">{option.label}</div>
              </div>
              {cota && <span className="shrink-0 rounded-lg bg-pitch-50 px-2.5 py-1 font-display text-lg font-extrabold text-pitch-700">{formatCota(cota)}</span>}
            </div>
          </div>

          {fixed ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink/60">Valor de entrada {bet.mode === 'odds' ? '(definido pelas odds)' : '(igual ao criador)'}</span>
              <Money cents={stake} className="font-bold" />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink/70" htmlFor="slip-amount">Valor a apostar</label>
              <div className="relative">
                <input id="slip-amount" autoFocus className={`${inputClass} pr-8 text-lg font-bold`} inputMode="decimal" placeholder="0,00"
                  value={amount} onChange={(e) => setAmount(e.target.value)} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-bold text-ink/40">€</span>
              </div>
              <div className="mt-2 flex gap-2">
                {[100, 500, 1000, 2000].map((c) => (
                  <button key={c} type="button" onClick={() => add(c)} className="flex-1 rounded-lg bg-paper py-1.5 text-sm font-bold text-ink/70 active:bg-ink/10">
                    +{c / 100} €
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-dashed border-ink/15 pt-3">
            <span className="text-sm font-semibold text-ink/60">Ganho potencial</span>
            <Money cents={payout} className="font-display text-2xl font-extrabold text-pitch-700" />
          </div>

          <ErrorBox error={join.error} />
          <Button
            className="w-full text-lg!"
            disabled={stake <= 0}
            loading={join.isPending}
            onClick={() =>
              join.mutate(
                { betId: bet.id, optionId, amountCents: fixed ? undefined : stake },
                { onSuccess: () => { onClose(); navigate(`/aposta/${bet.id}`) } },
              )
            }
          >
            Apostar {stake > 0 && formatEuros(stake)}
          </Button>
          <p className="text-center text-xs text-ink/45">A app só regista. Os pagamentos fazem-se fora (ex.: MB WAY).</p>
        </div>
      </div>
    </div>
  )
}
