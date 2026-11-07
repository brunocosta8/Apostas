-- =============================================================================
-- Apostas secretas: o criador escolhe membros que NÃO veem a aposta.
--
--   * bet_excluded guarda os emails escondidos (por email, para incluir membros
--     que ainda não entraram na app).
--   * As regras de leitura (RLS) passam a usar can_see_bet(): quem está
--     escondido não vê a aposta, as opções, as entradas, nem os pagamentos dela.
--   * As notificações dessa aposta não são enviadas a quem está escondido.
--   * Os pagamentos de apostas secretas têm bet_id: são acertados à parte,
--     só entre quem participou (ver src/lib/settlement.ts → computeLedger).
-- =============================================================================

alter table public.bets add column is_secret boolean not null default false;

create table public.bet_excluded (
  bet_id uuid not null references public.bets (id) on delete cascade,
  email  text not null check (email = lower(btrim(email))),
  primary key (bet_id, email)
);
alter table public.bet_excluded enable row level security;

alter table public.payments add column bet_id uuid references public.bets (id);
create index payments_bet_idx on public.payments (bet_id) where bet_id is not null;

-- ---------------------------------------------------------------------------
-- Visibilidade
-- ---------------------------------------------------------------------------
create or replace function public.can_see_bet(p_bet_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select public.is_member()
     and not exists (select 1 from public.bet_excluded
                      where bet_id = p_bet_id and email = public.current_email())
$$;

drop policy "membros leem apostas"    on public.bets;
drop policy "membros leem opções"     on public.bet_options;
drop policy "membros leem entradas"   on public.bet_entries;
drop policy "membros leem pagamentos" on public.payments;

create policy "membros leem apostas visíveis"  on public.bets        for select to authenticated using (public.can_see_bet(id));
create policy "membros leem opções visíveis"   on public.bet_options for select to authenticated using (public.can_see_bet(bet_id));
create policy "membros leem entradas visíveis" on public.bet_entries for select to authenticated using (public.can_see_bet(bet_id));
create policy "membros leem pagamentos visíveis" on public.payments for select to authenticated
  using (public.is_member() and (bet_id is null or public.can_see_bet(bet_id)));
-- Só o criador sabe de quem a aposta está escondida.
create policy "criador vê quem está escondido" on public.bet_excluded for select to authenticated
  using (exists (select 1 from public.bets b where b.id = bet_id and b.creator_id = auth.uid()));

revoke all on public.bet_excluded from anon, authenticated;
grant select on public.bet_excluded to authenticated;

-- Lista de membros (para escolher de quem esconder). Inclui quem ainda não entrou.
create or replace function public.list_members()
returns table (email text, display_name text, user_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select a.email, p.display_name, p.id
    from public.allowed_emails a
    left join public.profiles p on lower(p.email) = a.email
   where public.is_member()
   order by coalesce(p.display_name, a.email)
$$;

-- ---------------------------------------------------------------------------
-- create_bet: novo parâmetro p_hidden_emails
-- ---------------------------------------------------------------------------
drop function public.create_bet(text, text, public.bet_mode, timestamptz, timestamptz, text[], int, bigint, numeric, numeric);

create function public.create_bet(
  p_title           text,
  p_description     text,
  p_mode            public.bet_mode,
  p_closes_at       timestamptz,
  p_resolve_by      timestamptz,
  p_options         text[],
  p_creator_option  int,
  p_amount_cents    bigint,
  p_odds_creator    numeric default null,
  p_odds_taker      numeric default null,
  p_hidden_emails   text[] default '{}'
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member();
  v_bet_id uuid;
  v_n int := coalesce(array_length(p_options, 1), 0);
  v_option_ids uuid[] := '{}';
  v_id uuid;
  v_hidden text[];
  i int;
begin
  if p_closes_at is null or p_closes_at <= now() then
    raise exception 'A data limite para entrar tem de ser no futuro.';
  end if;
  if p_resolve_by is null or p_resolve_by < p_closes_at then
    raise exception 'A data de resolução não pode ser antes da data limite para entrar.';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'O valor tem de ser maior que zero.';
  end if;

  if p_mode in ('one_v_one', 'pool', 'odds') and v_n <> 2 then
    raise exception 'Este modo precisa de exatamente 2 opções.';
  end if;
  if p_mode = 'multi' and (v_n < 2 or v_n > 12) then
    raise exception 'A escolha múltipla precisa de 2 a 12 opções.';
  end if;
  if exists (select 1 from unnest(p_options) o where o is null or btrim(o) = '') then
    raise exception 'As opções não podem estar vazias.';
  end if;
  if (select count(distinct lower(btrim(o))) from unnest(p_options) o) <> v_n then
    raise exception 'As opções têm de ser diferentes entre si.';
  end if;
  if p_creator_option is null or p_creator_option < 0 or p_creator_option >= v_n then
    raise exception 'Escolhe a tua opção.';
  end if;

  if p_mode = 'odds' then
    if p_odds_creator is null or p_odds_taker is null or p_odds_creator <= 0 or p_odds_taker <= 0 then
      raise exception 'Define as odds (ex.: 2:1).';
    end if;
    if round(p_amount_cents * p_odds_taker / p_odds_creator) < 1 then
      raise exception 'Com estas odds o valor de quem aceita seria 0 €.';
    end if;
  else
    p_odds_creator := null;
    p_odds_taker := null;
  end if;

  -- Quem fica sem ver a aposta
  v_hidden := array(select distinct lower(btrim(e)) from unnest(coalesce(p_hidden_emails, '{}')) e
                     where e is not null and btrim(e) <> '');
  if public.current_email() = any (v_hidden) then
    raise exception 'Não te podes esconder da tua própria aposta.';
  end if;
  if exists (select 1 from unnest(v_hidden) e
              where not exists (select 1 from public.allowed_emails a where a.email = e)) then
    raise exception 'Só podes esconder a aposta de membros do grupo.';
  end if;
  if (select count(*) from public.allowed_emails) - coalesce(array_length(v_hidden, 1), 0) < 2 then
    raise exception 'Tem de ficar pelo menos mais uma pessoa a ver a aposta.';
  end if;

  insert into public.bets (creator_id, title, description, mode, closes_at, resolve_by,
                           odds_creator, odds_taker, is_secret)
  values (v_uid, btrim(p_title), coalesce(btrim(p_description), ''), p_mode,
          p_closes_at, p_resolve_by, p_odds_creator, p_odds_taker,
          coalesce(array_length(v_hidden, 1), 0) > 0)
  returning id into v_bet_id;

  insert into public.bet_excluded (bet_id, email) select v_bet_id, e from unnest(v_hidden) e;

  for i in 1 .. v_n loop
    insert into public.bet_options (bet_id, label, position)
    values (v_bet_id, btrim(p_options[i]), i - 1)
    returning id into v_id;
    v_option_ids := v_option_ids || v_id;
  end loop;

  insert into public.bet_entries (bet_id, user_id, option_id, amount_cents)
  values (v_bet_id, v_uid, v_option_ids[p_creator_option + 1], p_amount_cents);

  return v_bet_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- join_bet / cancel_bet / reopen_bet: quem está escondido não pode agir
-- ---------------------------------------------------------------------------
create or replace function public.join_bet(
  p_bet_id       uuid,
  p_option_id    uuid,
  p_amount_cents bigint default null
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member();
  v_bet public.bets;
  v_creator_entry public.bet_entries;
  v_amount bigint;
begin
  select * into v_bet from public.bets where id = p_bet_id for update;
  if not found or not public.can_see_bet(p_bet_id) then
    raise exception 'Aposta não encontrada.';
  end if;
  if v_bet.status <> 'open' or v_bet.closes_at <= now() then
    raise exception 'Esta aposta já não aceita entradas.';
  end if;
  if exists (select 1 from public.bet_entries where bet_id = p_bet_id and user_id = v_uid) then
    raise exception 'Já entraste nesta aposta.';
  end if;
  if not exists (select 1 from public.bet_options where id = p_option_id and bet_id = p_bet_id) then
    raise exception 'Opção inválida.';
  end if;

  select * into v_creator_entry from public.bet_entries
   where bet_id = p_bet_id and user_id = v_bet.creator_id;

  if v_bet.mode in ('one_v_one', 'odds') then
    if (select count(*) from public.bet_entries where bet_id = p_bet_id) >= 2 then
      raise exception 'Alguém já aceitou esta aposta.';
    end if;
    if p_option_id = v_creator_entry.option_id then
      raise exception 'Tens de ficar com o lado contrário ao do criador.';
    end if;
    if v_bet.mode = 'one_v_one' then
      v_amount := v_creator_entry.amount_cents;
    else
      v_amount := round(v_creator_entry.amount_cents * v_bet.odds_taker / v_bet.odds_creator);
    end if;
  else
    if p_amount_cents is null or p_amount_cents <= 0 then
      raise exception 'O valor tem de ser maior que zero.';
    end if;
    v_amount := p_amount_cents;
  end if;

  insert into public.bet_entries (bet_id, user_id, option_id, amount_cents)
  values (p_bet_id, v_uid, p_option_id, v_amount);
end;
$$;

create or replace function public.reopen_bet(p_bet_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member();
  v_bet public.bets;
begin
  select * into v_bet from public.bets where id = p_bet_id for update;
  if not found or not public.can_see_bet(p_bet_id) then raise exception 'Aposta não encontrada.'; end if;
  if v_bet.creator_id <> v_uid and not public.is_admin() then
    raise exception 'Só o criador (ou um admin) pode desfazer o resultado.' using errcode = '42501';
  end if;
  if not (v_bet.status = 'resolved'
          or (v_bet.status = 'void' and v_bet.void_reason in ('empate', 'ninguem_acertou'))) then
    raise exception 'Esta aposta não tem resultado para desfazer.';
  end if;
  update public.bets
     set status = 'closed', winning_option_id = null, void_reason = null, resolved_at = null
   where id = p_bet_id;
end;
$$;

create or replace function public.cancel_bet(p_bet_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member();
  v_bet public.bets;
begin
  select * into v_bet from public.bets where id = p_bet_id for update;
  if not found or not public.can_see_bet(p_bet_id) then raise exception 'Aposta não encontrada.'; end if;
  if v_bet.creator_id <> v_uid and not public.is_admin() then
    raise exception 'Só o criador (ou um admin) pode cancelar a aposta.' using errcode = '42501';
  end if;
  if v_bet.status = 'cancelled' then
    raise exception 'A aposta já está cancelada.';
  end if;
  update public.bets
     set status = 'cancelled', cancelled_at = now(),
         closed_at = coalesce(closed_at, now())
   where id = p_bet_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pagamentos: p_bet_id para acertar dívidas de uma aposta secreta
-- ---------------------------------------------------------------------------
drop function public.record_payment(uuid, uuid, bigint, text);

create function public.record_payment(
  p_from uuid, p_to uuid, p_amount_cents bigint, p_note text default '', p_bet_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member();
  v_id uuid;
begin
  if v_uid not in (p_from, p_to) then
    raise exception 'Só quem paga ou quem recebe pode registar este pagamento.' using errcode = '42501';
  end if;
  if p_from = p_to then raise exception 'Pagamento inválido.'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'O valor tem de ser maior que zero.';
  end if;
  if (select count(*) from public.profiles where id in (p_from, p_to)) <> 2 then
    raise exception 'Membro desconhecido.';
  end if;
  if p_bet_id is not null then
    if not exists (select 1 from public.bets where id = p_bet_id and is_secret) or not public.can_see_bet(p_bet_id) then
      raise exception 'Aposta inválida para este pagamento.';
    end if;
    if (select count(distinct user_id) from public.bet_entries
         where bet_id = p_bet_id and user_id in (p_from, p_to)) <> 2 then
      raise exception 'Os dois têm de ter participado nesta aposta.';
    end if;
  end if;
  insert into public.payments (from_user, to_user, amount_cents, note, created_by, bet_id)
  values (p_from, p_to, p_amount_cents, coalesce(btrim(p_note), ''), v_uid, p_bet_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notificações: nunca enviar a quem está escondido
-- ---------------------------------------------------------------------------
drop function public._notify(uuid[], text, text, text, text, text);

create function public._notify(
  p_bet_id uuid, p_users uuid[], p_kind text, p_title text, p_body text, p_url text, p_tag text default null
) returns void
language sql security definer
set search_path = ''
as $$
  insert into public.notification_queue (user_id, kind, title, body, url, tag)
  select p.id, p_kind, left(p_title, 120), left(p_body, 300), p_url, p_tag
    from public.profiles p
    join public.allowed_emails a on a.email = lower(p.email)
   where p.id = any (p_users)
     and not exists (select 1 from public.bet_excluded x where x.bet_id = p_bet_id and x.email = a.email)
     and case p_kind
           when 'new_bet' then p.notify_new_bet
           when 'joined'  then p.notify_joined
           when 'closing' then p.notify_closing
           else p.notify_result
         end;
$$;

create or replace function public._trg_bet_created()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  perform public._notify(
    new.id,
    array(select id from public.profiles where id <> new.creator_id),
    'new_bet',
    case when new.is_secret then '🔒 Aposta secreta de ' else 'Nova aposta de ' end || public._name(new.creator_id),
    new.title || ' · entradas até ' || public._lisbon(new.closes_at),
    '/aposta/' || new.id,
    'bet-' || new.id
  );
  return new;
end;
$$;
-- Adiado para o fim da transação: assim a lista de escondidos já existe.
drop trigger bet_created_notify on public.bets;
create constraint trigger bet_created_notify after insert on public.bets
  deferrable initially deferred
  for each row execute function public._trg_bet_created();

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
    v_bet.id,
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
    perform public._notify(new.id, v_others, 'result', 'Resultado: ' || new.title,
      'Ganhou «' || v_label || '». Abre para ver quanto ganhaste ou perdeste.', '/aposta/' || new.id, 'bet-' || new.id);
  elsif new.status = 'void' and new.void_reason = 'sem_adversarios' then
    perform public._notify(new.id, array[new.creator_id], 'result', 'Aposta anulada: ' || new.title,
      'Fechou sem ninguém do outro lado, por isso ficou anulada.', '/aposta/' || new.id, 'bet-' || new.id);
  elsif new.status = 'void' then
    perform public._notify(new.id, v_others, 'result', 'Aposta anulada: ' || new.title,
      case new.void_reason when 'empate' then 'Empate' else 'Ninguém acertou' end
        || ' — ninguém ganha nem perde.', '/aposta/' || new.id, 'bet-' || new.id);
  else
    perform public._notify(new.id, v_others, 'result', 'Aposta cancelada: ' || new.title,
      public._name(coalesce(v_actor, new.creator_id)) || ' cancelou a aposta. Fica tudo anulado.',
      '/aposta/' || new.id, 'bet-' || new.id);
  end if;
  return new;
end;
$$;

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
    if r.mode in ('one_v_one', 'odds')
       and (select count(*) from public.bet_entries where bet_id = r.id) >= 2 then
      continue;
    end if;
    perform public._notify(
      r.id,
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
  public.can_see_bet(uuid), public.list_members(),
  public.create_bet(text, text, public.bet_mode, timestamptz, timestamptz, text[], int, bigint, numeric, numeric, text[]),
  public.record_payment(uuid, uuid, bigint, text, uuid),
  public._notify(uuid, uuid[], text, text, text, text, text)
from public, anon;
revoke execute on function public._notify(uuid, uuid[], text, text, text, text, text) from authenticated;
grant execute on function
  public.can_see_bet(uuid), public.list_members(),
  public.create_bet(text, text, public.bet_mode, timestamptz, timestamptz, text[], int, bigint, numeric, numeric, text[]),
  public.record_payment(uuid, uuid, bigint, text, uuid)
to authenticated;
