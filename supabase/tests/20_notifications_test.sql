-- Testes das notificações (fila, preferências, subscrições).
-- Corre depois de 10_rpc_test.sql (reutiliza t_assert / t_expect_error).
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'eva@x.pt', '{"full_name":"Eva"}'),
  ('00000000-0000-0000-0000-0000000000f1', 'filipe@x.pt', '{"full_name":"Filipe"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'gil@x.pt', '{"full_name":"Gil"}');
insert into public.allowed_emails (email) values ('eva@x.pt'), ('filipe@x.pt'), ('gil@x.pt');

\set E '00000000-0000-0000-0000-0000000000e1'
\set F '00000000-0000-0000-0000-0000000000f1'
\set G '00000000-0000-0000-0000-0000000000a1'
\set asE 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000e1","email":"eva@x.pt"}'', false);'
\set asF 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000f1","email":"filipe@x.pt"}'', false);'
\set asG 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-0000000000a1","email":"gil@x.pt"}'', false);'

set role authenticated;
:asE
select public.ensure_profile();
:asF
select public.ensure_profile();
:asG
select public.ensure_profile();
-- Gil não quer saber de apostas novas
update public.profiles set notify_new_bet = false, notifications_prompted_at = now() where id = auth.uid();
select t_assert((select not notify_new_bet and notifications_prompted_at is not null from public.profiles where id = auth.uid()), 'preferências guardadas');
-- Não pode mexer nas preferências dos outros nem noutras colunas
update public.profiles set notify_result = false where id = :'E';
select t_expect_error($$update public.profiles set email = 'x' where id = auth.uid()$$, 'permission denied');
-- A fila e a configuração são invisíveis para os utilizadores
select t_expect_error('select * from public.notification_queue', 'permission denied');
select t_expect_error('select * from public.push_config', 'permission denied');
select t_expect_error('select * from public.push_subscriptions', 'permission denied');
select t_expect_error('select * from public.claim_notifications(10)', 'permission denied');
select t_expect_error('select public.push_tick()', 'permission denied');
reset role;
select t_assert((select notify_result from public.profiles where id = :'E'), 'não alterou preferências da Eva');
truncate public.notification_queue;
set role authenticated;

-- ---- Nova aposta ------------------------------------------------------------
:asE
\o
select public.create_bet('Notif 1v1', '', 'one_v_one', now()+interval '1 day', now()+interval '2 days', array['Sim','Não'], 0, 250) as n1 \gset
select id as n1_no from public.bet_options where bet_id = :'n1' and position = 1 \gset
\o /dev/null
reset role;
select t_assert(exists (select 1 from public.notification_queue where user_id = :'F' and kind = 'new_bet' and url = '/aposta/' || :'n1' and title = 'Nova aposta de Eva'), 'Filipe avisado da nova aposta');
select t_assert(not exists (select 1 from public.notification_queue where user_id = :'G' and kind = 'new_bet'), 'Gil desligou novas apostas');
select t_assert(not exists (select 1 from public.notification_queue where user_id = :'E'), 'criador não é avisado da própria aposta');
select t_assert(not exists (select 1 from public.notification_queue q join public.profiles p on p.id = q.user_id where p.email = 'carla@x.pt'), 'ex-membro não recebe');

-- ---- Alguém entrou ----------------------------------------------------------
set role authenticated;
:asF
select public.join_bet(:'n1', :'n1_no');
reset role;
select t_assert((select body from public.notification_queue where user_id = :'E' and kind = 'joined') = 'Notif 1v1 · «Não» com 2,50 €', 'texto de "entrou"');
select t_assert((select title from public.notification_queue where user_id = :'E' and kind = 'joined') = 'Filipe entrou na tua aposta', 'título de "entrou"');

-- ---- Resultado --------------------------------------------------------------
set role authenticated;
:asE
select public.resolve_bet(:'n1', :'n1_no');
reset role;
select t_assert(exists (select 1 from public.notification_queue where user_id = :'F' and kind = 'result' and body like 'Ganhou «Não»%'), 'Filipe recebe o resultado');
select t_assert(not exists (select 1 from public.notification_queue where user_id = :'E' and kind = 'result'), 'quem resolve não é avisado');

-- Desligar resultados
set role authenticated;
:asF
update public.profiles set notify_result = false where id = auth.uid();
:asE
select public.reopen_bet(:'n1');
select public.resolve_bet(:'n1', null);
reset role;
select t_assert((select count(*) from public.notification_queue where user_id = :'F' and kind = 'result') = 1, 'sem novos avisos de resultado depois de desligar');
update public.profiles set notify_result = true where id = :'F';

-- ---- Sem adversários → criador ---------------------------------------------
set role authenticated;
:asE
\o
select public.create_bet('Ninguém pega', '', 'one_v_one', now()+interval '1 day', now()+interval '2 days', array['Sim','Não'], 0, 100) as n2 \gset
\o /dev/null
select public.close_bet(:'n2');
reset role;
select t_assert(exists (select 1 from public.notification_queue where user_id = :'E' and kind = 'result' and body like 'Fechou sem ninguém%'), 'criador avisado da anulação');

-- ---- Cancelamento → participantes exceto quem cancelou ---------------------
set role authenticated;
:asE
\o
select public.create_bet('Para cancelar', '', 'pool', now()+interval '1 day', now()+interval '2 days', array['A','B'], 0, 100) as n3 \gset
select id as n3_b from public.bet_options where bet_id = :'n3' and position = 1 \gset
\o /dev/null
:asF
select public.join_bet(:'n3', :'n3_b', 100);
:asE
select public.cancel_bet(:'n3');
reset role;
select t_assert(exists (select 1 from public.notification_queue where user_id = :'F' and kind = 'result' and body = 'Eva cancelou a aposta. Fica tudo anulado.'), 'Filipe avisado do cancelamento');

-- ---- A fechar em breve ------------------------------------------------------
set role authenticated;
:asE
\o
select public.create_bet('Fecha já', '', 'pool', now()+interval '90 minutes', now()+interval '1 day', array['A','B'], 0, 100) as n4 \gset
select public.create_bet('Fecha amanhã', '', 'pool', now()+interval '1 day', now()+interval '2 days', array['A','B'], 0, 100) as n5 \gset
\o /dev/null
reset role;
select public.push_tick();
select t_assert(exists (select 1 from public.notification_queue where user_id = :'F' and kind = 'closing' and url = '/aposta/' || :'n4'), 'aviso "a fechar" para quem não entrou');
select t_assert(not exists (select 1 from public.notification_queue where user_id = :'E' and kind = 'closing'), 'quem já entrou não recebe "a fechar"');
select t_assert(not exists (select 1 from public.notification_queue where kind = 'closing' and url = '/aposta/' || :'n5'), 'aposta que fecha amanhã ainda não avisa');
select public.push_tick();
select t_assert((select count(*) from public.notification_queue where user_id = :'F' and kind = 'closing') = 1, 'aviso "a fechar" só uma vez');

-- ---- Subscrições ------------------------------------------------------------
set role authenticated;
:asF
select t_expect_error($$select public.save_push_subscription('http://inseguro', 'k', 'a')$$, 'inválida');
select public.save_push_subscription('https://push.example/f1', 'chaveF', 'authF', 'Teste');
select public.save_push_subscription('https://push.example/f2', 'chaveF2', 'authF2');
:asG
select public.delete_push_subscription('https://push.example/f1');  -- não é dele: não faz nada
reset role;
select t_assert((select count(*) from public.push_subscriptions where user_id = :'F') = 2, 'Gil não apaga subscrições do Filipe');
set role authenticated;
:asF
select public.delete_push_subscription('https://push.example/f2');
reset role;
select t_assert((select count(*) from public.push_subscriptions where user_id = :'F') = 1, 'Filipe apaga a sua');

-- ---- Edge Function: claim ---------------------------------------------------
select t_assert((select count(*) from public.claim_notifications(1000) c
                  where c.user_id = :'F' and c.subscriptions @> '[{"endpoint":"https://push.example/f1","p256dh":"chaveF","auth":"authF"}]') >= 4,
                'claim devolve as mensagens do Filipe com a subscrição');
select t_assert(not exists (select 1 from public.notification_queue where sent_at is null), 'tudo marcado como enviado');
select t_assert((select count(*) from public.claim_notifications(1000)) = 0, 'claim não repete mensagens');

-- Sem pg_net/configuração, o envio é ignorado sem erro
insert into public.push_config values ('function_url', 'https://exemplo/functions/v1/send-push'), ('webhook_secret', 's');
select public._dispatch_push();

\o
select 'OK: testes de notificações passaram' as resultado;
