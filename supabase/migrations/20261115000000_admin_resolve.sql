-- O admin também pode fechar as entradas e marcar o resultado de qualquer aposta
-- (exceto apostas secretas escondidas dele, que nem sequer vê).
-- O criador é avisado pela notificação de resultado, porque quem age é o admin.

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
  if not found or not public.can_see_bet(p_bet_id) then raise exception 'Aposta não encontrada.'; end if;
  if v_bet.creator_id <> v_uid and not public.is_admin() then
    raise exception 'Só o criador (ou um admin) pode fechar a aposta.' using errcode = '42501';
  end if;
  if v_bet.status <> 'open' then
    raise exception 'A aposta já não está aberta.';
  end if;
  return public._close_bet(p_bet_id);
end;
$$;

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
  if not found or not public.can_see_bet(p_bet_id) then raise exception 'Aposta não encontrada.'; end if;
  if v_bet.creator_id <> v_uid and not public.is_admin() then
    raise exception 'Só o criador (ou um admin) pode marcar o resultado.' using errcode = '42501';
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
