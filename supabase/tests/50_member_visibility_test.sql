-- Saldos calculados no servidor + visibilidade das apostas antigas para membros novos.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

-- Utilizadores só deste teste (para isolar os saldos)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000501', 'p1@x.pt', '{"full_name":"P1"}'),
  ('00000000-0000-0000-0000-000000000502', 'p2@x.pt', '{"full_name":"P2"}'),
  ('00000000-0000-0000-0000-000000000503', 'p3@x.pt', '{"full_name":"P3"}'),
  ('00000000-0000-0000-0000-000000000504', 'p4@x.pt', '{"full_name":"P4"}'),
  ('00000000-0000-0000-0000-000000000505', 'novo1@x.pt', '{"full_name":"Novo"}');
insert into public.allowed_emails (email) values ('p1@x.pt'), ('p2@x.pt'), ('p3@x.pt'), ('p4@x.pt');

\set asA 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-00000000000a","email":"ana@x.pt"}'', false);'
\set asB 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-00000000000b","email":"bruno@x.pt"}'', false);'
\set as1 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-000000000501","email":"p1@x.pt"}'', false);'
\set as2 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-000000000502","email":"p2@x.pt"}'', false);'
\set as3 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-000000000503","email":"p3@x.pt"}'', false);'
\set as4 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-000000000504","email":"p4@x.pt"}'', false);'
\set asN 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-000000000505","email":"novo1@x.pt"}'', false);'

set role authenticated;
:as1
select public.ensure_profile();
:as2
select public.ensure_profile();
:as3
select public.ensure_profile();
:as4
select public.ensure_profile();

-- ---- Saldos no servidor = mesma regra do cliente ----------------------------
-- Pool: X = p1 10 €, p2 2 € ; Y = p3 3 €, p4 3 € ; ganha X → p1 +5, p2 +1, p3 −3, p4 −3
:as1
\o
select public.create_bet('SB pool', '', 'pool', now()+interval '1 day', now()+interval '2 days', array['X','Y'], 0, 1000) as v1 \gset
select id as v1_x from public.bet_options where bet_id = :'v1' and position = 0 \gset
select id as v1_y from public.bet_options where bet_id = :'v1' and position = 1 \gset
\o /dev/null
:as2
select public.join_bet(:'v1', :'v1_x', 200);
:as3
select public.join_bet(:'v1', :'v1_y', 300);
:as4
select public.join_bet(:'v1', :'v1_y', 300);
:as1
select public.resolve_bet(:'v1', :'v1_x');

-- Arredondamento: p1, p2, p3 com 1 € em X (por esta ordem), p4 1 € em Y → 1,34 / 1,33 / 1,33 (maior resto, ordem de entrada)
\o
select public.create_bet('SB round', '', 'pool', now()+interval '1 day', now()+interval '2 days', array['X','Y'], 0, 100) as v2 \gset
select id as v2_x from public.bet_options where bet_id = :'v2' and position = 0 \gset
select id as v2_y from public.bet_options where bet_id = :'v2' and position = 1 \gset
\o /dev/null
:as2
select public.join_bet(:'v2', :'v2_x', 100);
:as3
select public.join_bet(:'v2', :'v2_x', 100);
:as4
select public.join_bet(:'v2', :'v2_y', 100);
:as1
select public.resolve_bet(:'v2', :'v2_x');

-- Pagamento normal p3 → p1 2 €
:as3
select public.record_payment('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000501', 200);

select t_assert((select balance_cents from public.public_balances() where user_id = '00000000-0000-0000-0000-000000000501') = 500 + 34 - 200, 'p1');
select t_assert((select balance_cents from public.public_balances() where user_id = '00000000-0000-0000-0000-000000000502') = 100 + 33, 'p2');
select t_assert((select balance_cents from public.public_balances() where user_id = '00000000-0000-0000-0000-000000000503') = -300 + 33 + 200, 'p3');
select t_assert((select balance_cents from public.public_balances() where user_id = '00000000-0000-0000-0000-000000000504') = -300 - 100, 'p4');
select t_assert((select sum(balance_cents) from public.public_balances()) = 0, 'saldos somam zero');

-- Apostas secretas e canceladas não entram nos saldos gerais
:as1
\o
select public.create_bet('SB secreta', '', 'one_v_one', now()+interval '1 day', now()+interval '2 days', array['S','N'], 0, 5000,
  null, null, array['p4@x.pt']) as v3 \gset
select id as v3_n from public.bet_options where bet_id = :'v3' and position = 1 \gset
select id as v3_s from public.bet_options where bet_id = :'v3' and position = 0 \gset
\o /dev/null
:as2
select public.join_bet(:'v3', :'v3_n');
:as1
select public.resolve_bet(:'v3', :'v3_s');
select t_assert((select balance_cents from public.public_balances() where user_id = '00000000-0000-0000-0000-000000000501') = 334, 'secreta não conta nos saldos gerais');

-- Quem está escondido de uma aposta normal recebe os mesmos saldos gerais
reset role;
insert into public.bet_excluded values (:'v1', 'p4@x.pt');
set role authenticated;
:as4
select t_assert(not exists (select 1 from public.bets where id = :'v1'), 'p4 não vê a aposta escondida');
select t_assert((select balance_cents from public.public_balances() where user_id = '00000000-0000-0000-0000-000000000504') = -400, 'mas o saldo dele inclui-a (é igual para todos)');
reset role;
delete from public.bet_excluded where bet_id = :'v1' and email = 'p4@x.pt';
set role authenticated;

-- Não membro não recebe saldos
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000d","email":"intruso@x.pt"}', false);
select t_assert((select count(*) from public.public_balances()) = 0, 'não membro não vê saldos');

-- ---- Membro novo -----------------------------------------------------------
-- Admin (Ana) adiciona o "novo1": fica automaticamente escondido das secretas existentes
:asA
insert into public.allowed_emails (email) values ('novo1@x.pt');
reset role;
select t_assert(exists (select 1 from public.bet_excluded where bet_id = :'v3' and email = 'novo1@x.pt'), 'secreta escondida do novo membro');
select t_assert(not exists (select 1 from public.bet_excluded x join public.bets b on b.id = x.bet_id where x.email = 'novo1@x.pt' and not b.is_secret), 'apostas normais visíveis por omissão');
set role authenticated;

-- Só o admin escolhe
:asB
select t_expect_error(format('select public.set_member_hidden_bets(%L, array[%L]::uuid[])', 'novo1@x.pt', :'v1'), 'admin');
select t_expect_error(format('select * from public.member_hidden_bets(%L)', 'novo1@x.pt'), 'admin');
:asA
select t_expect_error(format('select public.set_member_hidden_bets(%L, array[%L]::uuid[])', 'naoexiste@x.pt', :'v1'), 'não é membro');
select t_expect_error(format('select public.set_member_hidden_bets(%L, array[%L]::uuid[])', 'p2@x.pt', :'v1'), 'participa');
select public.set_member_hidden_bets('novo1@x.pt', array[:'v1', :'v2']::uuid[]);
select t_assert((select count(*) from public.member_hidden_bets('novo1@x.pt')) = 2, 'admin vê as escondidas');

:asN
select public.ensure_profile();
select t_assert(not exists (select 1 from public.bets where id in (:'v1', :'v2', :'v3')), 'novo membro não vê as escondidas nem a secreta');

-- Voltar a mostrar uma
:asA
select public.set_member_hidden_bets('novo1@x.pt', array[:'v2']::uuid[]);
:asN
select t_assert(exists (select 1 from public.bets where id = :'v1'), 'aposta voltou a ficar visível');
select t_assert(not exists (select 1 from public.bets where id = :'v2'), 'a outra continua escondida');
reset role;
select t_assert(exists (select 1 from public.bet_excluded where bet_id = :'v3' and email = 'novo1@x.pt'), 'admin não mexeu na secreta');

\o
select 'OK: testes de visibilidade para membros novos passaram' as resultado;
