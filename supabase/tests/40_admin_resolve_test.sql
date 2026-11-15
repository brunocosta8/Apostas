-- O admin pode fechar e resolver apostas de outros (mas não as secretas escondidas dele).
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

\set F '00000000-0000-0000-0000-0000000000f1'
\set asA 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-00000000000a","email":"ana@x.pt"}'', false);'
\set asB 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-00000000000b","email":"bruno@x.pt"}'', false);'
\set asF 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000f1","email":"filipe@x.pt"}'', false);'
\set asG 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000a1","email":"gil@x.pt"}'', false);'

reset role;
truncate public.notification_queue;
set role authenticated;

-- Filipe cria, Bruno aceita
:asF
\o
select public.create_bet('Admin resolve', '', 'one_v_one', now()+interval '1 day', now()+interval '2 days', array['Sim','Não'], 0, 100) as a1 \gset
select id as a1_sim from public.bet_options where bet_id = :'a1' and position = 0 \gset
select id as a1_nao from public.bet_options where bet_id = :'a1' and position = 1 \gset
select public.create_bet('Admin fecha', '', 'pool', now()+interval '1 day', now()+interval '2 days', array['A','B'], 0, 100) as a2 \gset
\o /dev/null
:asB
select public.join_bet(:'a1', :'a1_nao');

-- Um membro normal (nem criador, nem admin) continua sem poder
:asG
select t_expect_error(format('select public.resolve_bet(%L, %L)', :'a1', :'a1_sim'), 'criador');
select t_expect_error(format('select public.close_bet(%L)', :'a2'), 'criador');

-- O admin (Ana) pode fechar e resolver
:asA
select t_assert(public.close_bet(:'a2') = 'void', 'admin fecha (sem adversários → anulada)');
select t_assert(public.resolve_bet(:'a1', :'a1_sim') = 'resolved', 'admin marca o resultado');
reset role;
select t_assert(exists (select 1 from public.notification_queue where user_id = :'F' and kind = 'result' and body like 'Ganhou «Sim»%'),
                'criador é avisado do resultado marcado pelo admin');
set role authenticated;

-- Aposta secreta escondida do admin: não consegue
:asF
\o
select public.create_bet('Secreta sem admin', '', 'one_v_one', now()+interval '1 day', now()+interval '2 days', array['Sim','Não'], 0, 100,
  null, null, array['ana@x.pt']) as a3 \gset
select id as a3_sim from public.bet_options where bet_id = :'a3' and position = 0 \gset
\o /dev/null
:asA
select t_expect_error(format('select public.resolve_bet(%L, %L)', :'a3', :'a3_sim'), 'não encontrada');
select t_expect_error(format('select public.close_bet(%L)', :'a3'), 'não encontrada');

reset role;
\o
select 'OK: testes do admin passaram' as resultado;
