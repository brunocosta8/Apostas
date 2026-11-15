import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMe } from '../auth'
import { useBets, useMemberHiddenBets, useMembers, useSetMemberHiddenBets } from '../lib/api'
import { formatDate } from '../lib/dates'
import { MODE_LABEL, statusLabel } from '../lib/labels'
import { Button, Card, ErrorBox, Loading, SubHeader, Toggle } from '../components/ui'

/** Admin: escolher que apostas já existentes um membro pode ver. */
export function MemberVisibility() {
  const { isAdmin } = useMe()
  const { email: rawEmail } = useParams()
  const email = decodeURIComponent(rawEmail ?? '').toLowerCase()
  const [params] = useSearchParams()
  const isNew = params.get('novo') === '1'
  const navigate = useNavigate()
  const bets = useBets()
  const members = useMembers()
  const hidden = useMemberHiddenBets(email)
  const save = useSetMemberHiddenBets()
  const [visible, setVisible] = useState<Set<string> | null>(null)

  const member = members.data?.find((m) => m.email === email)
  const name = member?.display_name ?? email

  // Só apostas normais e não canceladas; as secretas ficam escondidas automaticamente.
  const list = useMemo(
    () => (bets.data ?? []).filter((b) => !b.is_secret && b.status !== 'cancelled'),
    [bets.data],
  )
  const participates = (betId: string) =>
    !!member?.user_id && !!list.find((b) => b.id === betId)?.bet_entries.some((e) => e.user_id === member.user_id)

  useEffect(() => {
    if (visible || !hidden.data || !bets.data) return
    setVisible(new Set(list.filter((b) => !hidden.data.has(b.id)).map((b) => b.id)))
  }, [hidden.data, bets.data, list, visible])

  if (!isAdmin) return <Navigate to="/" replace />
  const title = isNew ? 'Membro adicionado' : 'Apostas visíveis'
  if (bets.isPending || hidden.isPending || !visible) return <><SubHeader back="/admin" title={title} /><Loading /></>

  const setAll = (on: boolean) => setVisible(new Set(on ? list.map((b) => b.id) : list.filter((b) => participates(b.id)).map((b) => b.id)))
  const toggle = (id: string, on: boolean) => {
    const next = new Set(visible)
    if (on) next.add(id)
    else next.delete(id)
    setVisible(next)
  }
  const shown = list.filter((b) => visible.has(b.id)).length

  return (
    <>
      <SubHeader back="/admin" title={title} />
      <Card className="mb-4">
        <div className="text-sm text-ink/70">
          {isNew ? <>Adicionaste <b className="text-ink">{name}</b>. </> : null}
          Escolhe que apostas já feitas no grupo {isNew ? 'esta pessoa' : <b className="text-ink">{name}</b>} pode ver.
        </div>
        <p className="mt-2 text-xs text-ink/50">
          As apostas secretas ficam sempre escondidas de quem entra depois. As contas não mudam: os saldos são iguais para todos,
          mesmo para quem não vê algumas apostas.
        </p>
      </Card>

      {list.length === 0 ? (
        <p className="rounded-xl bg-white px-6 py-8 text-center text-sm text-ink/55">Ainda não há apostas no grupo.</p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink/60">{shown} de {list.length} visíveis</span>
            <span className="flex gap-1">
              <button className="rounded-lg px-2 py-1 text-xs font-bold text-pitch-700 hover:bg-pitch-50" onClick={() => setAll(true)}>Mostrar todas</button>
              <button className="rounded-lg px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50" onClick={() => setAll(false)}>Esconder todas</button>
            </span>
          </div>
          <Card className="mb-4 p-0">
            <ul className="divide-y divide-ink/5">
              {list.map((b) => {
                const locked = participates(b.id)
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className={`truncate text-sm font-semibold ${visible.has(b.id) ? 'text-ink' : 'text-ink/40 line-through'}`}>{b.title}</div>
                      <div className="truncate text-xs text-ink/45">
                        {MODE_LABEL[b.mode]} · {statusLabel(b)} · {formatDate(b.created_at)}
                        {locked && ' · participa'}
                      </div>
                    </div>
                    <Toggle label={`Mostrar «${b.title}»`} checked={visible.has(b.id)} disabled={locked} onChange={(v) => toggle(b.id, v)} />
                  </li>
                )
              })}
            </ul>
          </Card>
        </>
      )}

      <ErrorBox error={save.error} />
      <Button className="mt-2 w-full" loading={save.isPending}
        onClick={() => save.mutate(
          { email, betIds: list.filter((b) => !visible.has(b.id)).map((b) => b.id) },
          { onSuccess: () => navigate('/admin', { replace: true }) },
        )}>
        Guardar
      </Button>
    </>
  )
}
