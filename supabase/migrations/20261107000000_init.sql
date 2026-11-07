-- =============================================================================
-- Apostas entre Amigos — esquema inicial
--
-- Princípios:
--   * Valores sempre em cêntimos (bigint).
--   * Só membros (email em allowed_emails) leem dados.
--   * Nenhuma escrita direta nas tabelas de apostas/pagamentos: tudo passa por
--     funções SECURITY DEFINER que validam autor, estado e prazos numa transação.
--   * Os saldos NÃO são guardados: o cliente calcula-os a partir das apostas
--     resolvidas + pagamentos (ver src/lib/settlement.ts, com testes).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.bet_mode as enum ('one_v_one', 'pool', 'odds', 'multi');

-- open      → aceita entradas
-- closed    → já não aceita entradas, à espera do resultado
-- resolved  → resultado marcado, há vencedores
-- void      → anulada automaticamente (sem adversários / empate / ninguém acertou)
-- cancelled → cancelada pelo criador (ou admin)
create type public.bet_status as enum ('open', 'closed', 'resolved', 'void', 'cancelled');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.allowed_emails (
  email      text primary key check (email = lower(btrim(email)) and email like '%@%'),
  is_admin   boolean not null default false,
  added_at   timestamptz not null default now()
);

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table public.bets (
  id                uuid primary key default gen_random_uuid(),
  creator_id        uuid not null references public.profiles (id),
  title             text not null check (char_length(btrim(title)) between 1 and 120),
  description       text not null default '' check (char_length(description) <= 2000),
  mode              public.bet_mode not null,
  status            public.bet_status not null default 'open',
  closes_at         timestamptz not null,
  resolve_by        timestamptz not null,
  -- Odds "X:Y" = o criador põe X por cada Y de quem aceita (só no modo odds).
  odds_creator      numeric(8, 2) check (odds_creator > 0),
  odds_taker        numeric(8, 2) check (odds_taker > 0),
  winning_option_id uuid,
  void_reason       text check (void_reason in ('sem_adversarios', 'empate', 'ninguem_acertou')),
  closed_at         timestamptz,
  resolved_at       timestamptz,
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  check (resolve_by >= closes_at),
  check ((mode = 'odds') = (odds_creator is not null and odds_taker is not null))
);

create table public.bet_options (
  id       uuid primary key default gen_random_uuid(),
  bet_id   uuid not null references public.bets (id) on delete cascade,
  label    text not null check (char_length(btrim(label)) between 1 and 80),
  position smallint not null,
  unique (bet_id, position),
  unique (id, bet_id)
);

alter table public.bets
  add constraint bets_winning_option_fk
  foreign key (winning_option_id, id) references public.bet_options (id, bet_id);

create table public.bet_entries (
  id           uuid primary key default gen_random_uuid(),
  bet_id       uuid not null references public.bets (id) on delete cascade,
  user_id      uuid not null references public.profiles (id),
  option_id    uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  created_at   timestamptz not null default now(),
  unique (bet_id, user_id),
  foreign key (option_id, bet_id) references public.bet_options (id, bet_id)
);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references public.profiles (id),
  to_user      uuid not null references public.profiles (id),
  amount_cents bigint not null check (amount_cents > 0),
  note         text not null default '' check (char_length(note) <= 200),
  created_by   uuid not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  check (from_user <> to_user)
);

create index bets_status_idx on public.bets (status, closes_at);
create index bet_entries_bet_idx on public.bet_entries (bet_id);
create index bet_entries_user_idx on public.bet_entries (user_id);
create index bet_options_bet_idx on public.bet_options (bet_id);

-- ---------------------------------------------------------------------------
-- Funções auxiliares de autorização
-- ---------------------------------------------------------------------------
create or replace function public.current_email()
returns text language sql stable
set search_path = ''
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_member()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.allowed_emails where email = public.current_email())
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.allowed_emails
                 where email = public.current_email() and is_admin)
$$;

-- Cria/atualiza o perfil do utilizador autenticado. Falha se não for membro.
-- O cliente chama isto logo após o login.
create or replace function public.ensure_profile()
returns public.profiles
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_meta jsonb;
  v_name text;
  v_avatar text;
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'Sessão inválida.';
  end if;
  if not public.is_member() then
    raise exception 'Sem acesso: o teu email não está na lista de membros.' using errcode = '42501';
  end if;

  select coalesce(raw_user_meta_data, '{}'::jsonb) into v_meta from auth.users where id = v_uid;
  v_name := left(btrim(coalesce(v_meta ->> 'full_name', v_meta ->> 'name',
                                split_part(public.current_email(), '@', 1))), 40);
  if v_name = '' then v_name := 'Membro'; end if;
  v_avatar := coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture');

  insert into public.profiles (id, email, display_name, avatar_url)
  values (v_uid, public.current_email(), v_name, v_avatar)
  on conflict (id) do update
    set email = excluded.email,
        avatar_url = excluded.avatar_url
  returning * into v_profile;

  return v_profile;
end;
$$;

-- Garante que quem chama é membro com perfil; devolve o id.
create or replace function public.require_member()
returns uuid language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_member() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    perform public.ensure_profile();
  end if;
  return auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Ciclo de vida das apostas
-- ---------------------------------------------------------------------------

-- Fecha uma aposta (interno). Se não houver pelo menos duas opções com
-- apostadores, fica anulada ("sem adversários").
create or replace function public._close_bet(p_bet_id uuid)
returns public.bet_status
language plpgsql security definer
set search_path = ''
as $$
declare
  v_sides int;
  v_status public.bet_status;
begin
  select count(distinct option_id) into v_sides
  from public.bet_entries where bet_id = p_bet_id;

  if v_sides < 2 then
    update public.bets
       set status = 'void', void_reason = 'sem_adversarios', closed_at = now()
     where id = p_bet_id and status = 'open'
    returning status into v_status;
  else
    update public.bets
       set status = 'closed', closed_at = now()
     where id = p_bet_id and status = 'open'
    returning status into v_status;
  end if;
  return v_status;
end;
$$;

-- Fecha todas as apostas cujo prazo de entrada já passou. Chamado pelo
-- pg_cron (ver migração seguinte) e também pelo cliente ao abrir a app.
create or replace function public.close_expired_bets()
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from public.bets
     where status = 'open' and closes_at <= now()
     for update skip locked
  loop
    perform public._close_bet(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.create_bet(
  p_title           text,
  p_description     text,
  p_mode            public.bet_mode,
  p_closes_at       timestamptz,
  p_resolve_by      timestamptz,
  p_options         text[],
  p_creator_option  int,          -- índice (0-based) da opção do criador
  p_amount_cents    bigint,       -- valor do criador
  p_odds_creator    numeric default null,
  p_odds_taker      numeric default null
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

  insert into public.bets (creator_id, title, description, mode, closes_at, resolve_by,
                           odds_creator, odds_taker)
  values (v_uid, btrim(p_title), coalesce(btrim(p_description), ''), p_mode,
          p_closes_at, p_resolve_by, p_odds_creator, p_odds_taker)
  returning id into v_bet_id;

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
  if not found then
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

-- O criador fecha a aposta antes do prazo.
create or replace function public.close_bet(p_bet_id uuid)
returns public.bet_status
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member();
  v_bet public.bets;
begin
  select * into v_bet from public.bets where id = p_bet_id for update;
  if not found then raise exception 'Aposta não encontrada.'; end if;
  if v_bet.creator_id <> v_uid then
    raise exception 'Só o criador pode fechar a aposta.' using errcode = '42501';
  end if;
  if v_bet.status <> 'open' then
    raise exception 'A aposta já não está aberta.';
  end if;
  return public._close_bet(p_bet_id);
end;
$$;

-- O criador marca o resultado. p_winning_option_id = null → empate (anulada).
-- Se a aposta ainda estiver aberta, é fechada primeiro.
create or replace function public.resolve_bet(p_bet_id uuid, p_winning_option_id uuid)
returns public.bet_status
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member();
  v_bet public.bets;
  v_status public.bet_status;
begin
  select * into v_bet from public.bets where id = p_bet_id for update;
  if not found then raise exception 'Aposta não encontrada.'; end if;
  if v_bet.creator_id <> v_uid then
    raise exception 'Só o criador pode marcar o resultado.' using errcode = '42501';
  end if;

  v_status := v_bet.status;
  if v_status = 'open' then
    v_status := public._close_bet(p_bet_id);
  end if;
  if v_status <> 'closed' then
    raise exception 'Esta aposta não pode ser resolvida (estado: %).', v_status;
  end if;

  if p_winning_option_id is null then
    update public.bets
       set status = 'void', void_reason = 'empate', winning_option_id = null, resolved_at = now()
     where id = p_bet_id
    returning status into v_status;
    return v_status;
  end if;

  if not exists (select 1 from public.bet_options where id = p_winning_option_id and bet_id = p_bet_id) then
    raise exception 'Opção inválida.';
  end if;

  if not exists (select 1 from public.bet_entries where bet_id = p_bet_id and option_id = p_winning_option_id) then
    update public.bets
       set status = 'void', void_reason = 'ninguem_acertou',
           winning_option_id = p_winning_option_id, resolved_at = now()
     where id = p_bet_id
    returning status into v_status;
  else
    update public.bets
       set status = 'resolved', void_reason = null,
           winning_option_id = p_winning_option_id, resolved_at = now()
     where id = p_bet_id
    returning status into v_status;
  end if;
  return v_status;
end;
$$;

-- Desfazer o resultado (criador ou admin): volta a "fechada, à espera de resultado".
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
  if not found then raise exception 'Aposta não encontrada.'; end if;
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

-- Cancelar (criador ou admin), em qualquer estado: tudo anulado.
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
  if not found then raise exception 'Aposta não encontrada.'; end if;
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
-- Pagamentos ("marcar como pago") — qualquer uma das duas partes regista.
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_from uuid, p_to uuid, p_amount_cents bigint, p_note text default ''
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
  insert into public.payments (from_user, to_user, amount_cents, note, created_by)
  values (p_from, p_to, p_amount_cents, coalesce(btrim(p_note), ''), v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.delete_payment(p_payment_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_member();
begin
  delete from public.payments
   where id = p_payment_id and (v_uid in (from_user, to_user) or public.is_admin());
  if not found then
    raise exception 'Não podes apagar este pagamento.' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.allowed_emails enable row level security;
alter table public.profiles       enable row level security;
alter table public.bets           enable row level security;
alter table public.bet_options    enable row level security;
alter table public.bet_entries    enable row level security;
alter table public.payments       enable row level security;

-- Leitura: só membros.
create policy "membros leem perfis"     on public.profiles    for select to authenticated using (public.is_member());
create policy "membros leem apostas"    on public.bets        for select to authenticated using (public.is_member());
create policy "membros leem opções"     on public.bet_options for select to authenticated using (public.is_member());
create policy "membros leem entradas"   on public.bet_entries for select to authenticated using (public.is_member());
create policy "membros leem pagamentos" on public.payments    for select to authenticated using (public.is_member());

-- Perfil: cada um muda apenas o seu nome a mostrar.
create policy "editar o próprio perfil" on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_member())
  with check (id = auth.uid());

-- Lista de autorizados: só admins (e um admin não se pode remover nem despromover).
create policy "admins leem autorizados" on public.allowed_emails for select to authenticated
  using (public.is_admin() or email = public.current_email());
create policy "admins adicionam" on public.allowed_emails for insert to authenticated
  with check (public.is_admin());
create policy "admins alteram" on public.allowed_emails for update to authenticated
  using (public.is_admin() and email <> public.current_email())
  with check (public.is_admin());
create policy "admins removem" on public.allowed_emails for delete to authenticated
  using (public.is_admin() and email <> public.current_email());

-- Privilégios: o Supabase concede tudo a anon/authenticated por omissão;
-- restringimos explicitamente (defesa em profundidade, além do RLS).
revoke all on public.allowed_emails, public.profiles, public.bets, public.bet_options,
              public.bet_entries, public.payments from anon, authenticated;
grant select on public.profiles, public.bets, public.bet_options, public.bet_entries,
                public.payments to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.allowed_emails to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public._close_bet(uuid) from authenticated;
grant execute on function
  public.current_email(), public.is_member(), public.is_admin(), public.ensure_profile(),
  public.close_expired_bets(),
  public.create_bet(text, text, public.bet_mode, timestamptz, timestamptz, text[], int, bigint, numeric, numeric),
  public.join_bet(uuid, uuid, bigint), public.close_bet(uuid), public.resolve_bet(uuid, uuid),
  public.reopen_bet(uuid), public.cancel_bet(uuid),
  public.record_payment(uuid, uuid, bigint, text), public.delete_payment(uuid)
to authenticated;
-- require_member é chamado por funções SECURITY DEFINER (corre como o dono),
-- por isso não precisa de ser exposto.
revoke execute on function public.require_member() from authenticated;
