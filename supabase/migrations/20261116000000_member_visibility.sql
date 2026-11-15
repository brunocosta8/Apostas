-- =============================================================================
-- Visibilidade das apostas antigas para membros novos
--
--  * Quando o admin adiciona um membro, escolhe que apostas já existentes essa
--    pessoa pode ver (as escondidas vão para bet_excluded, como nas secretas).
--  * As apostas secretas ficam automaticamente escondidas de quem entra depois.
--  * Como cada pessoa pode ver apostas diferentes, o saldo "geral" de cada um
--    passa a ser calculado AQUI, com todas as apostas normais, e não no
--    telemóvel de cada pessoa. Assim o "quem deve a quem" é igual para todos.
--    (Mesma regra que src/lib/settlement.ts: pote dividido pelos vencedores na
--    proporção do que apostaram, cêntimos que sobram pelo maior resto.)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Saldos gerais (apostas normais resolvidas + pagamentos normais)
-- ---------------------------------------------------------------------------
create or replace function public.public_balances()
returns table (user_id uuid, balance_cents bigint)
language sql stable security definer
set search_path = ''
as $$
  with rb as (
    select b.id, b.winning_option_id from public.bets b
     where b.status = 'resolved' and not b.is_secret and b.winning_option_id is not null
  ), e as (
    select e.id, e.bet_id, e.user_id, e.created_at, e.amount_cents::numeric as amt,
           (e.option_id = rb.winning_option_id) as win
      from public.bet_entries e join rb on rb.id = e.bet_id
  ), tot as (
    select bet_id, sum(amt) as pot,
           coalesce(sum(amt) filter (where win), 0) as wtot,
           count(*) filter (where not win) as nlose
      from e group by bet_id
  ), w as (
    select e.*, t.pot, t.wtot,
           mod(t.pot * e.amt, t.wtot) as rem,
           (t.pot * e.amt - mod(t.pot * e.amt, t.wtot)) / t.wtot as base
      from e join tot t using (bet_id)
     where e.win and t.nlose > 0 and t.wtot > 0
  ), w2 as (
    select w.*,
           row_number() over (partition by w.bet_id order by w.rem desc, w.amt desc, w.created_at, w.id) as rn,
           w.pot - sum(w.base) over (partition by w.bet_id) as leftover
      from w
  ), nets as (
    select user_id, base + case when rn <= leftover then 1 else 0 end - amt as v from w2
    union all
    select e.user_id, -e.amt from e join tot t using (bet_id) where not e.win and t.wtot > 0
    union all
    select p.from_user, p.amount_cents from public.payments p where p.bet_id is null
    union all
    select p.to_user, -p.amount_cents from public.payments p where p.bet_id is null
  )
  select n.user_id, sum(n.v)::bigint
    from nets n
   where public.is_member()
   group by n.user_id
$$;

-- ---------------------------------------------------------------------------
-- Novos membros não veem apostas secretas já existentes
-- ---------------------------------------------------------------------------
create or replace function public._trg_member_added()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.bet_excluded (bet_id, email)
  select b.id, new.email from public.bets b
   where b.is_secret
     and not exists (select 1 from public.bet_entries x join public.profiles p on p.id = x.user_id
                      where x.bet_id = b.id and lower(p.email) = new.email)
  on conflict do nothing;
  return new;
end;
$$;
create trigger member_added_hide_secret after insert on public.allowed_emails
  for each row execute function public._trg_member_added();

-- ---------------------------------------------------------------------------
-- Admin: ver/escolher que apostas normais um membro não vê
-- ---------------------------------------------------------------------------
create or replace function public.member_hidden_bets(p_email text)
returns setof uuid
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Só um admin pode ver isto.' using errcode = '42501';
  end if;
  return query
    select x.bet_id from public.bet_excluded x join public.bets b on b.id = x.bet_id
     where x.email = lower(btrim(p_email)) and not b.is_secret;
end;
$$;

create or replace function public.set_member_hidden_bets(p_email text, p_bet_ids uuid[])
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if not public.is_admin() then
    raise exception 'Só um admin pode fazer isto.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.allowed_emails where email = v_email) then
    raise exception 'Esse email não é membro do grupo.';
  end if;
  if v_email = public.current_email() then
    raise exception 'Não podes esconder apostas de ti próprio.';
  end if;
  -- Não se pode esconder de alguém uma aposta em que participa (ou que criou).
  if exists (
    select 1 from unnest(coalesce(p_bet_ids, '{}')) as u(bet_id)
      join public.bet_entries x on x.bet_id = u.bet_id
      join public.profiles p on p.id = x.user_id
     where lower(p.email) = v_email
  ) then
    raise exception 'Não podes esconder de alguém uma aposta em que essa pessoa participa.';
  end if;

  -- Só mexe nas apostas normais que o admin consegue ver (as secretas são do criador).
  delete from public.bet_excluded x
   using public.bets b
   where x.bet_id = b.id and x.email = v_email and not b.is_secret and public.can_see_bet(b.id);

  insert into public.bet_excluded (bet_id, email)
  select b.id, v_email from public.bets b
   where b.id = any (coalesce(p_bet_ids, '{}')) and not b.is_secret and public.can_see_bet(b.id)
  on conflict do nothing;
end;
$$;

revoke execute on function
  public.public_balances(), public._trg_member_added(),
  public.member_hidden_bets(text), public.set_member_hidden_bets(text, uuid[])
from public, anon, authenticated;
grant execute on function
  public.public_balances(), public.member_hidden_bets(text), public.set_member_hidden_bets(text, uuid[])
to authenticated;
