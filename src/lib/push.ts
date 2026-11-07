import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/**
 * Estado das notificações neste dispositivo:
 * - not-configured: falta a chave VAPID no deploy (ver README)
 * - ios-install:    iPhone/iPad fora da app instalada (a Apple só permite push na app do ecrã principal)
 * - unsupported:    browser sem Web Push
 * - denied:         a pessoa bloqueou as notificações nas definições do browser
 * - on / off
 */
export type PushState = 'not-configured' | 'ios-install' | 'unsupported' | 'denied' | 'on' | 'off'

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const existing = await navigator.serviceWorker.getRegistration()
  if (!existing) return null // sem service worker (ex.: modo de desenvolvimento)
  if (existing.active) return existing
  // Primeira visita: o service worker ainda está a instalar — esperar que fique ativo.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 10000)),
  ])
}

export async function getPushState(): Promise<PushState> {
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  if (isIOS() && !isStandalone()) return 'ios-install'
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Pede permissão e regista este dispositivo. Chamar diretamente a partir de um toque/clique. */
export async function enablePush(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) throw new Error('As notificações ainda não estão configuradas no servidor.')
  if (!supported()) throw new Error('Este browser não suporta notificações.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Bloqueaste as notificações. Para as ativar, muda a permissão deste site nas definições do browser.'
        : 'Não deste permissão para notificações.',
    )
  }
  const reg = await registration()
  if (!reg) throw new Error('Não foi possível ativar as notificações neste browser.')
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }))
  const json = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
}

/** Deixa de receber notificações neste dispositivo. */
export async function disablePush(): Promise<void> {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}
