import { useEffect, useMemo, useState } from 'react'
import { useBets, useMemberHiddenBets, useMembers, useSetMemberHiddenBets } from '../lib/api'
import { formatDate } from '../lib/dates'
import { MODE_LABEL } from '../lib/labels'
import type { Bet } from '../lib/types'
import { Button, ErrorBox, Spinner } from './ui'

const MODE_ICON: Record<Bet['mode'], string> = { one_v_one: '🥊', pool: '👥', odds: '📈', multi: '🔢' }

/**
 * Janela (por cima do ecrã de Membros) para escolher que apostas já feitas um
 * membro pode ver. Começam todas selecionadas; tocar numa aposta tira-a.
 */
export function VisibilitySheet({ email, isNew, onClose }: { email: string; isNew?: boolean; onClose: () => void }) {
  const bets = useBets()
  const members = useMembers()
  const hidden = useMemberHiddenBets(email)
  const save = useSetMemberHiddenBets()
  const [selected, setSelected] = useState<Set<string> | null>(null)

  const member = members.data?.find((m) => m.email === email)
  const name = member?.display_name ?? email
  const list = useMemo(() => (bets.data ?? []).filter((b) => !b.is_secret && b.status !== 'cancelled'), [bets.data])
  const participates = (b: Bet) => !!member?.user_id && b.bet_entries.some((e) => e.user_id === member.user_id)

  useEffect(() => {
    if (selected || !hidden.data || !bets.data) return
    setSelected(new Set(list.filter((b) => !hidden.data.has(b.id)).map((b) => b.id)))
  }, [hidden.data, bets.data, list, selected])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const toggle = (b: Bet) => {
    if (!selected || participates(b)) return
    const next = new Set(selected)
    if (next.has(b.id)) next.delete(b.id)
    else next.add(b.id)
    setSelected(next)
  }
  const count = selected?.size ?? 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-labelledby="vis-title">
      <button className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" aria-label="Fechar" onClick={onClose} />
      <div className="pb-safe relative mx-auto flex max-h-[85dvh] w-full max-w-xl flex-col rounded-t-3xl bg-paper shadow-2xl">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-ink/20" aria-hidden />
        <div className="border-b border-ink/10 px-5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {isNew && <div className="text-xs font-bold uppercase tracking-wide text-pitch-700">✓ Membro adicionado</div>}
              <h2 id="vis-title" className="text-xl font-bold leading-tight text-ink">Que apostas pode ver?</h2>
              <div className="mt-0.5 truncate text-sm font-semibold text-pitch-700">{name}</div>
              <p className="mt-1 text-sm text-ink/55">Toca numa aposta para a esconder. Toca outra vez para voltar a mostrar.</p>
            </div>
            <button onClick={onClose} className="-mr-1 text-2xl leading-none text-ink/40" aria-label="Fechar">×</button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="rounded-full bg-pitch-700 px-2.5 py-1 text-xs font-bold text-white">{count} de {list.length} visíveis</span>
            <span className="flex gap-1">
              <button className="rounded-lg px-2 py-1 text-xs font-bold text-pitch-700" onClick={() => setSelected(new Set(list.map((b) => b.id)))}>Todas</button>
              <button className="rounded-lg px-2 py-1 text-xs font-bold text-ink/55" onClick={() => setSelected(new Set(list.filter(participates).map((b) => b.id)))}>Nenhuma</button>
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
          {!selected ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : list.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink/55">Ainda não há apostas no grupo.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {list.map((b) => {
                const on = selected.has(b.id)
                const locked = participates(b)
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggle(b)}
                    aria-pressed={on}
                    className={`relative flex min-h-28 flex-col rounded-2xl p-3 text-left transition duration-200 ${
                      on
                        ? 'bg-white shadow-[0_2px_0_var(--color-pitch-600)] ring-2 ring-pitch-600'
                        : 'bg-white/50 opacity-45 ring-1 ring-ink/10 grayscale'
                    }`}
                  >
                    <span className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition ${
                      on ? 'bg-pitch-600 text-white' : 'bg-ink/10 text-transparent'
                    }`}>
                      {locked ? '🔒' : '✓'}
                    </span>
                    <span className="text-lg" aria-hidden>{MODE_ICON[b.mode]}</span>
                    <span className="mt-1 line-clamp-2 pr-4 text-sm font-bold leading-snug text-ink">{b.title}</span>
                    <span className="mt-auto pt-1.5 text-[11px] font-medium text-ink/50">
                      {MODE_LABEL[b.mode]} · {formatDate(b.created_at)}
                      {locked && ' · participa'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-ink/10 bg-white px-4 pb-3 pt-3">
          <ErrorBox error={save.error} />
          <Button className="w-full text-lg!" loading={save.isPending} disabled={!selected}
            onClick={() => selected && save.mutate(
              { email, betIds: list.filter((b) => !selected.has(b.id)).map((b) => b.id) },
              { onSuccess: onClose },
            )}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  )
}
