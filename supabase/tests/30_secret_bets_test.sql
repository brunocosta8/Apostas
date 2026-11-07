-- Testes das apostas secretas. Corre depois de 10 e 20 (reutiliza utilizadores e helpers).
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

-- Hugo: membro que ainda não entrou na app (só está na lista)
insert into public.allowed_emails (email) values ('hugo@x.pt');

\set E '00000000-0000-0000-0000-0000000000e1'
\set F '00000000-0000-0000-0000-0000000000f1'
\set G '00000000-0000-0000-0000-0000000000a1'
\set asE 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000e1","email":"eva@x.pt"}'', false);'
\set asF 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000f1","email":"filipe@x.pt"}'', false);'
\set asG 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000a1","email":"gil@x.pt"}'', false);'
\set asA 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-00000000000a","email":"ana@x.pt"}'', false);'

reset role;
truncate public.notification_queue;
update public.profiles set notify_new_bet = true, notify_result = true;
set role authenticated;

-- ---- Validações -------------------------------------------------------------
:asE
select t_assert((select count(*) from public.list_members()) >= 5, 'membros listados (incluindo quem ainda não entrou)');
select t_assert(exists (select 1 from public.list_members() where email = 'hugo@x.pt' and user_id is null), 'Hugo aparece sem perfil');
select t_expect_error($$select public.create_bet('x','', 'one_v_one', now()+interval '1 day', now()+interval '2 days', array['a','b'], 0, 100, null, null, array['eva@x.pt'])$$, 'própria aposta');
select t_expect_error($$select public.create_bet('x','', 'one_v_one', now()+interval '1 day', now()+interval '2 days', array['a','b'], 0, 100, null, null, array['estranho@x.pt'])$$, 'membros do grupo');
select t_expect_error($$select public.create_bet('x','', 'one_v_one', now()+interval '1 day', now()+interval '2 days', array['a','b'], 0, 100, null, null,
  array(select email from public.list_members() where email <> 'eva@x.pt'))$$, 'pelo menos mais uma');

-- ---- Criar aposta secreta escondida do Gil, da Ana (admin) e do Hugo --------
\o
select public.create_bet('Surpresa para o Gil', 'segredo', 'pool', now()+interval '90 minutes', now()+interval '1 day',
  array['Sim','Não'], 0, 500, null, null, array[' Gil@X.pt ', 'ana@x.pt', 'hugo@x.pt']) as s1 \gset
select id as s1_no from public.bet_options where bet_id = :'s1' and position = 1 \gset
\o /dev/null
select t_assert((select is_secret from public.bets where id = :'s1'), 'marcada como secreta');
select t_assert((select count(*) from public.bet_excluded where bet_id = :'s1') = 3, 'criador vê a lista de escondidos');

-- ---- Quem está escondido não vê nada ----------------------------------------
:asG
select t_assert(not exists (select 1 from public.bets where id = :'s1'), 'Gil não vê a aposta');
select t_assert(not exists (select 1 from public.bet_options where bet_id = :'s1'), 'Gil não vê as opções');
select t_assert(not exists (select 1 from public.bet_entries where bet_id = :'s1'), 'Gil não vê as entradas');
select t_assert(not exists (select 1 from public.bet_excluded where bet_id = :'s1'), 'Gil não vê a lista de escondidos');
select t_expect_error(format('select public.join_bet(%L, %L, 100)', :'s1', :'s1_no'), 'não encontrada');
:asA
select t_assert(not exists (select 1 from public.bets where id = :'s1'), 'admin escondido também não vê');
select t_expect_error(format('select public.cancel_bet(%L)', :'s1'), 'não encontrada');
select t_expect_error(format('select public.reopen_bet(%L)', :'s1'), 'não encontrada');

-- Quem não está escondido vê e entra, mas não sabe de quem está escondida
:asF
select t_assert(exists (select 1 from public.bets where id = :'s1' and is_secret), 'Filipe vê a aposta secreta');
select t_assert(not exists (select 1 from public.bet_excluded where bet_id = :'s1'), 'Filipe não vê de quem está escondida');
select public.join_bet(:'s1', :'s1_no', 300);

-- ---- Notificações ----------------------------------------------------------
reset role;
select t_assert(exists (select 1 from public.notification_queue where user_id = :'F' and kind = 'new_bet' and title like '🔒 Aposta secreta de Eva'), 'Filipe avisado (secreta)');
select t_assert(not exists (select 1 from public.notification_queue where user_id = :'G'), 'Gil não recebe nada da aposta secreta');
select t_assert(not exists (select 1 from public.notification_queue q join public.profiles p on p.id = q.user_id where p.email = 'ana@x.pt' and q.url = '/aposta/' || :'s1'), 'Ana não recebe nada da aposta secreta');
select public.push_tick();
select t_assert(not exists (select 1 from public.notification_queue where user_id = :'G' and kind = 'closing'), 'Gil não recebe "a fechar"');

-- ---- Resolver e acertar à parte --------------------------------------------
set role authenticated;
:asE
select public.resolve_bet(:'s1', :'s1_no');
:asG
select t_expect_error(format('select public.record_payment(%L, %L, 100, %L, %L)', :'G', :'F', '', :'s1'), 'inválida');
:asF
\o
select public.record_payment(:'E', :'F', 300, 'MB WAY', :'s1') as sp1 \gset
\o /dev/null
select t_expect_error(format('select public.record_payment(%L, %L, 100, %L, %L)', :'F', :'G', '', :'s1'), 'participado');
select t_assert(exists (select 1 from public.payments where id = :'sp1' and bet_id = :'s1'), 'Filipe vê o pagamento secreto');
:asG
select t_assert(not exists (select 1 from public.payments where id = :'sp1'), 'Gil não vê o pagamento secreto');
select t_assert(exists (select 1 from public.payments where bet_id is null), 'Gil continua a ver pagamentos normais');
-- pagamento ligado a aposta pública é recusado
:asE
\o
select public.create_bet('Pública', '', 'one_v_one', now()+interval '1 day', now()+interval '2 days', array['a','b'], 0, 100) as p1 \gset
\o /dev/null
select t_expect_error(format('select public.record_payment(%L, %L, 100, %L, %L)', :'E', :'F', '', :'p1'), 'inválida');
:asG
select t_assert(exists (select 1 from public.bets where id = :'p1' and not is_secret), 'Gil vê apostas públicas');

reset role;
\o
select 'OK: testes de apostas secretas passaram' as resultado;
