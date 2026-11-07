// Edge Function "send-push": envia as notificações em fila (public.notification_queue)
// por Web Push para todos os dispositivos de cada destinatário.
//
// É chamada pela base de dados (pg_net) sempre que entra algo na fila, e pelo
// pg_cron como reserva. Protegida pelo cabeçalho x-push-secret.
//
// Secrets necessários (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:tu@gmail.com),
//   PUSH_WEBHOOK_SECRET (igual ao valor 'webhook_secret' em public.push_config).
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são fornecidos automaticamente.
//
// Desativar "Verify JWT" nesta função (a autenticação é feita pelo segredo).

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

interface Subscription { endpoint: string; p256dh: string; auth: string }
interface Item { id: number; user_id: string; title: string; body: string; url: string; tag: string | null; subscriptions: Subscription[] }

const env = (k: string) => {
  const v = Deno.env.get(k)
  if (!v) throw new Error(`Falta a variável ${k}`)
  return v
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (req.headers.get('x-push-secret') !== env('PUSH_WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }

  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))
  // Chave com acesso total (só existe no servidor). Projetos novos podem ter só a "secret key".
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? env('SUPABASE_SECRET_KEY')
  const db = createClient(env('SUPABASE_URL'), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let sent = 0
  let failed = 0
  const expired: string[] = []

  // Processa em lotes até a fila esvaziar (com limite de segurança).
  for (let round = 0; round < 10; round++) {
    const { data, error } = await db.rpc('claim_notifications', { p_limit: 100 })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    const items = (data ?? []) as Item[]
    if (items.length === 0) break

    await Promise.all(
      items.flatMap((item) =>
        item.subscriptions.map(async (s) => {
          const payload = JSON.stringify({ title: item.title, body: item.body, url: item.url, tag: item.tag ?? undefined })
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
              TTL: 60 * 60 * 24,
              urgency: 'normal',
            })
            sent++
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode
            // 404/410: o dispositivo cancelou a subscrição — apagar.
            if (status === 404 || status === 410) expired.push(s.endpoint)
            else {
              failed++
              console.error('Falha ao enviar push', status, (e as Error).message)
            }
          }
        }),
      ),
    )
  }

  if (expired.length) await db.from('push_subscriptions').delete().in('endpoint', expired)
  return Response.json({ sent, failed, expired: expired.length })
})
