-- =============================================================================
-- Fase 3 — Notificações push
--
-- Fluxo:
--   1. Triggers nas apostas/entradas colocam mensagens em notification_queue
--      (só para quem tem esse tipo de notificação ligado).
--   2. Cada inserção na fila chama (via pg_net) a Edge Function "send-push",
--      que envia Web Push para todos os dispositivos da pessoa.
--   3. O pg_cron corre push_tick() a cada 5 min: avisa "a fechar em breve" e
--      reenvia o que tenha ficado por enviar.
--
-- Configuração (uma vez, no SQL Editor — ver README):
--   insert into public.push_config (key, value) values
--     ('function_url', 'https://<ref>.supabase.co/functions/v1/send-push'),
--     ('webhook_secret', '<o mesmo segredo definido na Edge Function>');
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Preferências (por pessoa; valem para todos os dispositivos)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column notify_new_bet  boolean not null default true,
  add column notify_joined   boolean not null default true,
  add column notify_closing  boolean not null default true,
  add column notify_result   boolean not null default true,
  -- quando a pessoa respondeu ao aviso inicial ("Ativar" ou "Agora não")
  add column notifications_prompted_at timestamptz;

grant update (notify_new_bet, notify_joined, notify_closing, notify_result, notifications_prompted_at)
  on public.profiles to authenticated;

-- Aviso "a fechar em breve" já enviado para esta aposta?
alter table public.bets add column closing_notified_at timestamptz;

-- ---------------------------------------------------------------------------
-- Subscrições Web Push (uma por dispositivo/browser)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
-- Sem políticas: só as funções abaixo (e a Edge Function, com a service role) mexem aqui.
revoke all on public.push_subscriptions from anon, authenticated;

create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default ''
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member();
begin
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Subscrição inválida.';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, v_uid, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Configuração e fila
-- ---------------------------------------------------------------------------
create table public.push_config (
  key   text primary key check (key in ('function_url', 'webhook_secret')),
  value text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

create table public.notification_queue (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('new_bet', 'joined', 'closing', 'result')),
  title      text not null,
  body       text not null,
  url        text not null default '/',
  tag        text,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index notification_queue_pending_idx on public.notification_queue (id) where sent_at is null;
alter table public.notification_queue enable row level security;
revoke all on public.notification_queue from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auxiliares de texto
-- ---------------------------------------------------------------------------
create or replace function public._eur(p_cents bigint)
returns text language sql immutable
set search_path = ''
as $$ select replace(to_char(p_cents / 100.0, 'FM999999990.00'), '.', ',') || ' €' $$;

create or replace function public._lisbon(p_ts timestamptz)
returns text language sql stable
set search_path = ''
as $$ select to_char(p_ts at time zone 'Europe/Lisbon', 'DD/MM "às" HH24:MI') $$;

create or replace function public._name(p_uid uuid)
returns text language sql stable security definer
set search_path = ''
as $$ select coalesce((select display_name from public.profiles where id = p_uid), 'Alguém') $$;

-- Coloca uma mensagem na fila para cada destinatário que seja membro e tenha
-- esse tipo de notificação ligado.
create or replace function public._notify(
  p_users uuid[], p_kind text, p_title text, p_body text, p_url text, p_tag text default null
) returns void
language sql security definer
set search_path = ''
as $$
  insert into public.notification_queue (user_id, kind, title, body, url, tag)
  select p.id, p_kind, left(p_title, 120), left(p_body, 300), p_url, p_tag
    from public.profiles p
    join public.allowed_emails a on a.email = lower(p.email)
   where p.id = any (p_users)
     and case p_kind
           when 'new_bet' then p.notify_new_bet
           when 'joined'  then p.notify_joined
           when 'closing' then p.notify_closing
           else p.notify_result
         end;
$$;

-- ---------------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------------

-- Nova aposta → todos os membros exceto o criador.
create or replace function public._trg_bet_created()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  perform public._notify(
    array(select id from public.profiles where id <> new.creator_id),
    'new_bet',
    'Nova aposta de ' || public._name(new.creator_id),
    new.title || ' · entradas até ' || public._lisbon(new.closes_at),
    '/aposta/' || new.id,
    'bet-' || new.id
  );
  return new;
end;
$$;
create trigger bet_created_notify after insert on public.bets
  for each row execute function public._trg_bet_created();

-- Alguém entrou → criador.
create or replace function public._trg_entry_created()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_bet public.bets;
  v_label text;
begin
  select * into v_bet from public.bets where id = new.bet_id;
  if new.user_id = v_bet.creator_id then return new; end if;
  select label into v_label from public.bet_options where id = new.option_id;
  perform public._notify(
    array[v_bet.creator_id],
    'joined',
    public._name(new.user_id) || ' entrou na tua aposta',
    v_bet.title || ' · «' || v_label || '» com ' || public._eur(new.amount_cents),
    '/aposta/' || v_bet.id,
    'bet-' || v_bet.id
  );
  return new;
end;
$$;
create trigger entry_created_notify after insert on public.bet_entries
  for each row execute function public._trg_entry_created();

-- Resultado / anulação / cancelamento → participantes (exceto quem fez a ação).
create or replace function public._trg_bet_status()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_players uuid[];
  v_others uuid[];
  v_label text;
  v_actor uuid := auth.uid();
begin
  if new.status = old.status or new.status not in ('resolved', 'void', 'cancelled') then
    return new;
  end if;
  v_players := array(select user_id from public.bet_entries where bet_id = new.id);
  v_others := array(select u from unnest(v_players) u where u is distinct from v_actor);

  if new.status = 'resolved' then
    select label into v_label from public.bet_options where id = new.winning_option_id;
    perform public._notify(v_others, 'result', 'Resultado: ' || new.title,
      'Ganhou «' || v_label || '». Abre para ver quanto ganhaste ou perdeste.', '/aposta/' || new.id, 'bet-' || new.id);
  elsif new.status = 'void' and new.void_reason = 'sem_adversarios' then
    perform public._notify(array[new.creator_id], 'result', 'Aposta anulada: ' || new.title,
      'Fechou sem ninguém do outro lado, por isso ficou anulada.', '/aposta/' || new.id, 'bet-' || new.id);
  elsif new.status = 'void' then
    perform public._notify(v_others, 'result', 'Aposta anulada: ' || new.title,
      case new.void_reason when 'empate' then 'Empate' else 'Ninguém acertou' end
        || ' — ninguém ganha nem perde.', '/aposta/' || new.id, 'bet-' || new.id);
  else
    perform public._notify(v_others, 'result', 'Aposta cancelada: ' || new.title,
      public._name(coalesce(v_actor, new.creator_id)) || ' cancelou a aposta. Fica tudo anulado.',
      '/aposta/' || new.id, 'bet-' || new.id);
  end if;
  return new;
end;
$$;
create trigger bet_status_notify after update of status on public.bets
  for each row execute function public._trg_bet_status();

-- ---------------------------------------------------------------------------
-- Envio: chama a Edge Function (se pg_net e a configuração existirem)
-- ---------------------------------------------------------------------------
create or replace function public._dispatch_push()
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from public.push_config where key = 'function_url';
  select value into v_secret from public.push_config where key = 'webhook_secret';
  if v_url is null or v_secret is null
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return;
  end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2)'
    using v_url, jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret);
end;
$$;

create or replace function public._trg_queue_dispatch()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  perform public._dispatch_push();
  return null;
end;
$$;
create trigger notification_queue_dispatch after insert on public.notification_queue
  for each statement execute function public._trg_queue_dispatch();

-- Usado pela Edge Function: marca até p_limit mensagens como enviadas e
-- devolve-as com as subscrições do destinatário.
create or replace function public.claim_notifications(p_limit int default 100)
returns table (id bigint, user_id uuid, title text, body text, url text, tag text, subscriptions jsonb)
language sql security definer
set search_path = ''
as $$
  with picked as (
    select q.id from public.notification_queue q
     where q.sent_at is null
     order by q.id
     limit p_limit
     for update skip locked
  ), done as (
    update public.notification_queue q set sent_at = now()
      from picked where q.id = picked.id
    returning q.*
  )
  select d.id, d.user_id, d.title, d.body, d.url, d.tag,
         coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                     from public.push_subscriptions s where s.user_id = d.user_id), '[]'::jsonb)
    from done d
   order by d.id;
$$;

-- A cada 5 min: avisos "a fechar em breve" (2 h antes) e reenvio do que ficou na fila.
create or replace function public.push_tick()
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select b.* from public.bets b
     where b.status = 'open'
       and b.closing_notified_at is null
       and b.closes_at > now()
       and b.closes_at <= now() + interval '2 hours'
     for update skip locked
  loop
    update public.bets set closing_notified_at = now() where id = r.id;
    -- Só faz sentido avisar se ainda há lugar: em 1v1/odds só enquanto ninguém aceitou.
    if r.mode in ('one_v_one', 'odds')
       and (select count(*) from public.bet_entries where bet_id = r.id) >= 2 then
      continue;
    end if;
    perform public._notify(
      array(select p.id from public.profiles p
             where not exists (select 1 from public.bet_entries e where e.bet_id = r.id and e.user_id = p.id)),
      'closing',
      'Fecha em breve ⏰',
      r.title || ' · entradas até ' || public._lisbon(r.closes_at),
      '/aposta/' || r.id,
      'bet-' || r.id
    );
  end loop;

  delete from public.notification_queue where sent_at < now() - interval '30 days';

  if exists (select 1 from public.notification_queue where sent_at is null and created_at < now() - interval '1 minute') then
    perform public._dispatch_push();
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------------
revoke execute on function
  public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text),
  public._eur(bigint), public._lisbon(timestamptz), public._name(uuid),
  public._notify(uuid[], text, text, text, text, text), public._dispatch_push(),
  public.claim_notifications(int), public.push_tick(),
  public._trg_bet_created(), public._trg_entry_created(), public._trg_bet_status(), public._trg_queue_dispatch()
from public, anon, authenticated;

grant execute on function public.save_push_subscription(text, text, text, text), public.delete_push_subscription(text)
  to authenticated;

do $do$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_notifications(int) to service_role;
    grant select, delete on public.push_subscriptions to service_role;
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- Extensões e agendamento (no Supabase; ignorado em Postgres sem elas)
-- ---------------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'notificacoes-push';
    perform cron.schedule('notificacoes-push', '*/5 * * * *', 'select public.push_tick()');
  end if;
end
$do$;
