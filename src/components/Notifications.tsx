import { useCallback, useEffect, useState } from 'react'
import { useMyPrefs, useUpdatePrefs } from '../lib/api'
import { disablePush, enablePush, getPushState, isIOS, type PushState } from '../lib/push'
import type { NotifyKey } from '../lib/types'
import { Button, Card, ErrorBox, Spinner, Toggle } from './ui'

export const NOTIFICATION_KINDS: { key: NotifyKey; icon: string; title: string; desc: string }[] = [
  { key: 'notify_new_bet', icon: '🆕', title: 'Novas apostas', desc: 'Quando alguém do grupo lança uma aposta.' },
  { key: 'notify_joined', icon: '🤝', title: 'Entraram na tua aposta', desc: 'Quando alguém aceita ou entra numa aposta tua.' },
  { key: 'notify_closing', icon: '⏰', title: 'A fechar em breve', desc: '2 horas antes de fecharem apostas onde ainda não entraste.' },
  { key: 'notify_result', icon: '🏁', title: 'Resultados', desc: 'Resultado marcado, aposta anulada ou cancelada.' },
]

const SESSION_DISMISS = 'apostas:notif-ios-later'

function usePushState() {
  const [state, setState] = useState<PushState | null>(null)
  const refresh = useCallback(() => {
    getPushState().then(setState).catch(() => setState('unsupported'))
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])
  return [state, refresh] as const
}

function InstallHint() {
  return (
    <p className="rounded-lg bg-volt/25 px-3 py-2.5 text-sm text-ink/80">
      {isIOS() ? (
        <>No iPhone, as notificações só funcionam na app instalada: no Safari toca em <b>Partilhar</b> → <b>Adicionar ao ecrã principal</b> e abre a app a partir do ícone.</>
      ) : (
        <>Este browser não suporta notificações. Experimenta o Chrome e instala a app (menu ⋮ → <b>Instalar app</b>).</>
      )}
    </p>
  )
}

function stateText(s: PushState): string {
  switch (s) {
    case 'on': return 'Ativas neste dispositivo.'
    case 'off': return 'Desligadas neste dispositivo.'
    case 'denied': return 'Bloqueadas nas definições do browser. Para as ativar, permite as notificações para este site e volta aqui.'
    case 'not-configured': return 'As notificações ainda não foram configuradas no servidor (ver README).'
    default: return ''
  }
}

/** Aviso mostrado uma vez, após o primeiro login. */
export function NotificationsWelcome({ userId }: { userId: string }) {
  const prefs = useMyPrefs(userId)
  const update = useUpdatePrefs(userId)
  const [state] = usePushState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(SESSION_DISMISS) === '1' } catch { return false }
  })

  if (hidden || !prefs.data || prefs.data.notifications_prompted_at || state === null) return null

  const answered = () => update.mutate({ notifications_prompted_at: new Date().toISOString() })
  const canEnable = state === 'off' || state === 'on'

  async function activate() {
    setBusy(true)
    setError(null)
    try {
      await enablePush()
      answered()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  function later() {
    if (state === 'ios-install') {
      // Voltamos a perguntar quando abrir a app instalada.
      try { sessionStorage.setItem(SESSION_DISMISS, '1') } catch { /* ignorar */ }
      setHidden(true)
    } else {
      answered()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="notif-title">
      <div className="absolute inset-0 bg-ink/50" />
      <div className="pb-safe relative mx-auto w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="pitch rounded-t-2xl px-5 pb-5 pt-6 text-white sm:rounded-t-2xl">
          <div className="text-4xl">🔔</div>
          <h2 id="notif-title" className="mt-2 font-display text-3xl font-extrabold uppercase italic leading-none">Queres ser avisado?</h2>
          <p className="mt-2 text-sm text-white/80">Podemos enviar-te notificações para não perderes nada no grupo.</p>
        </div>
        <div className="space-y-4 p-5">
          <ul className="space-y-2.5">
            {NOTIFICATION_KINDS.map((k) => (
              <li key={k.key} className="flex gap-3">
                <span className="text-xl" aria-hidden>{k.icon}</span>
                <span>
                  <span className="block text-sm font-bold text-ink">{k.title}</span>
                  <span className="block text-xs text-ink/55">{k.desc}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink/55">Podes ligar e desligar cada tipo, ou todas, a qualquer momento em <b>Perfil → Notificações</b>.</p>

          {(state === 'ios-install' || state === 'unsupported') && <InstallHint />}
          {(state === 'denied' || state === 'not-configured') && <p className="text-sm text-ink/70">{stateText(state)}</p>}
          <ErrorBox error={error} />

          <div className="flex flex-col gap-2">
            {canEnable && <Button className="w-full" loading={busy} onClick={() => void activate()}>Ativar notificações</Button>}
            <Button variant="ghost" className="w-full" disabled={busy} onClick={later}>
              {canEnable ? 'Agora não' : state === 'ios-install' ? 'Mais tarde' : 'OK'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Secção "Notificações" do Perfil. */
export function NotificationSettings({ userId }: { userId: string }) {
  const prefs = useMyPrefs(userId)
  const update = useUpdatePrefs(userId)
  const [state, refreshState] = usePushState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function toggleDevice(on: boolean) {
    setBusy(true)
    setError(null)
    try {
      if (on) await enablePush()
      else await disablePush()
      if (!prefs.data?.notifications_prompted_at) update.mutate({ notifications_prompted_at: new Date().toISOString() })
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
      refreshState()
    }
  }

  return (
    <Card className="mb-4">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink">🔔 Notificações</h2>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink">Neste dispositivo</div>
          {state && stateText(state) && <div className="text-xs text-ink/55">{stateText(state)}</div>}
        </div>
        {state === null || busy ? (
          <Spinner small />
        ) : (
          <Toggle label="Notificações neste dispositivo" checked={state === 'on'} disabled={state !== 'on' && state !== 'off'} onChange={(v) => void toggleDevice(v)} />
        )}
      </div>
      {(state === 'ios-install' || state === 'unsupported') && <div className="mt-2"><InstallHint /></div>}
      <div className="mt-2"><ErrorBox error={error ?? update.error} /></div>

      <h3 className="mb-1 mt-4 text-[13px] font-bold uppercase tracking-wide text-ink/50">O que queres receber</h3>
      {prefs.data ? (
        <ul className="divide-y divide-ink/5">
          {NOTIFICATION_KINDS.map((k) => (
            <li key={k.key} className="flex items-center justify-between gap-3 py-2.5">
              <span className="flex min-w-0 gap-2.5">
                <span aria-hidden>{k.icon}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{k.title}</span>
                  <span className="block text-xs text-ink/50">{k.desc}</span>
                </span>
              </span>
              <Toggle label={k.title} checked={prefs.data[k.key]} onChange={(v) => update.mutate({ [k.key]: v })} />
            </li>
          ))}
        </ul>
      ) : (
        <Spinner small />
      )}
      <p className="mt-2 text-xs text-ink/45">Estas escolhas valem para todos os teus dispositivos.</p>
    </Card>
  )
}
