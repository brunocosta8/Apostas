-- Atualizações em tempo real (a app atualiza sozinha quando alguém entra
-- numa aposta, resolve, regista um pagamento…). O Realtime respeita o RLS.
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bets, public.bet_entries, public.payments;
  else
    raise notice 'Publicação supabase_realtime não existe — tempo real ignorado.';
  end if;
end
$do$;
