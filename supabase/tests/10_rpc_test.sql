-- Testes das regras de segurança e das funções RPC.
-- Corre com: npm run test:db   (ver scripts/test-db.sh)
\set ON_ERROR_STOP on
\set QUIET on

-- ---------------------------------------------------------------------------
-- Utilitários (correm com as permissões de quem chama)
-- ---------------------------------------------------------------------------
create function public.t_expect_error(p_sql text, p_pattern text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm !~* p_pattern then
      raise exception 'Erro inesperado em [%]: "%" (esperado ~ "%")', p_sql, sqlerrm, p_pattern;
    end if;
    return;
  end;
  raise exception 'Esperava erro em [%] (~ "%"), mas não houve.', p_sql, p_pattern;
end $$;

create function public.t_assert(p_ok boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FALHOU: %', p_msg; end if;
end $$;

grant execute on function public.t_expect_error(text, text), public.t_assert(boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Dados: A (admin), B, C membros; D não membro.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@x.pt',  '{"full_name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@x.pt','{"name":"Bruno"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carla@x.pt','{}'),
  ('00000000-0000-0000-0000-00000000000d', 'intruso@x.pt','{}');
insert into public.allowed_emails (email, is_admin) values
  ('ana@x.pt', true), ('bruno@x.pt', false), ('carla@x.pt', false);

\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set C '00000000-0000-0000-0000-00000000000c'
\set D '00000000-0000-0000-0000-00000000000d'
\set asA 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-00000000000a","email":"ana@x.pt"}'', false);'
\set asB 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-00000000000b","email":"Bruno@X.pt"}'', false);'
\set asC 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-00000000000c","email":"carla@x.pt"}'', false);'
\set asD 'select set_config(''request.jwt.claims'', ''{"sub":"00000000-0000-0000-0000-00000000000d","email":"intruso@x.pt"}'', false);'

set role authenticated;
\o /dev/null

-- ---- Não membro -------------------------------------------------------------
:asD
select t_expect_error('select public.ensure_profile()', 'Sem acesso');
select t_expect_error($$select public.create_bet('x','',
  'one_v_one', now()+interval '1 day', now()+interval '2 days', array['a','b'], 0, 100)$$, 'Sem acesso');

-- ---- Perfis -----------------------------------------------------------------
:asA
select t_assert((select display_name from public.ensure_profile()) = 'Ana', 'nome Ana vindo do Google');
:asB
select t_assert((select display_name from public.ensure_profile()) = 'Bruno', 'email com maiúsculas é aceite');
:asC
select t_assert((select display_name from public.ensure_profile()) = 'carla', 'nome por omissão = parte do email');

-- ---- Escritas diretas bloqueadas -------------------------------------------
:asA
select t_expect_error($$insert into public.bets (creator_id,title,mode,closes_at,resolve_by)
  values (auth.uid(),'x','one_v_one',now()+interval '1 day',now()+interval '1 day')$$, 'permission denied');
select t_expect_error($$update public.bets set status='resolved'$$, 'permission denied');
select t_expect_error($$delete from public.bet_entries$$, 'permission denied');
select t_expect_error($$insert into public.payments (from_user,to_user,amount_cents,created_by)
  values (auth.uid(), auth.uid(), 1, auth.uid())$$, 'permission denied');
select t_expect_error($$select public._close_bet(gen_random_uuid())$$, 'permission denied');
select t_expect_error($$select public.require_member()$$, 'permission denied');

-- ---- Validações de criação --------------------------------------------------
select t_expect_error($$select public.create_bet('x','', 'one_v_one', now()-interval '1 hour', now()+interval '1 day', array['a','b'], 0, 100)$$, 'futuro');
select t_expect_error($$select public.create_bet('x','', 'one_v_one', now()+interval '2 day', now()+interval '1 day', array['a','b'], 0, 100)$$, 'resolução');
select t_expect_error($$select public.create_bet('x','', 'one_v_one', now()+interval '1 day', now()+interval '1 day', array['a','b'], 0, 0)$$, 'maior que zero');
select t_expect_error($$select public.create_bet('x','', 'one_v_one', now()+interval '1 day', now()+interval '1 day', array['a','b','c'], 0, 100)$$, '2 opções');
select t_expect_error($$select public.create_bet('x','', 'one_v_one', now()+interval '1 day', now()+interval '1 day', array['Sim','sim '], 0, 100)$$, 'diferentes');
select t_expect_error($$select public.create_bet('x','', 'one_v_one', now()+interval '1 day', now()+interval '1 day', array['a','b'], 2, 100)$$, 'tua opção');
select t_expect_error($$select public.create_bet('x','', 'odds', now()+interval '1 day', now()+interval '1 day', array['a','b'], 0, 100)$$, 'odds');

-- ---- 1 contra 1: fluxo completo --------------------------------------------
\o
select public.create_bet('Benfica ganha ao Porto', 'Jogo de domingo', 'one_v_one',
  now()+interval '1 day', now()+interval '3 days', array['Benfica ganha','Benfica não ganha'], 0, 500) as bet1 \gset
select id as b1_opt0 from public.bet_options where bet_id = :'bet1' and position = 0 \gset
select id as b1_opt1 from public.bet_options where bet_id = :'bet1' and position = 1 \gset
\o /dev/null

select t_expect_error(format('select public.join_bet(%L, %L)', :'bet1', :'b1_opt1'), 'Já entraste');
:asB
select t_expect_error(format('select public.join_bet(%L, %L)', :'bet1', :'b1_opt0'), 'lado contrário');
select public.join_bet(:'bet1', :'b1_opt1', 99999);
select t_assert((select amount_cents from public.bet_entries where bet_id = :'bet1' and user_id = auth.uid()) = 500,
                '1v1: quem aceita entra com o mesmo valor do criador');
:asC
select t_expect_error(format('select public.join_bet(%L, %L)', :'bet1', :'b1_opt1'), 'já aceitou');
select t_expect_error(format('select public.close_bet(%L)', :'bet1'), 'criador');
select t_expect_error(format('select public.resolve_bet(%L, %L)', :'bet1', :'b1_opt0'), 'criador');
select t_expect_error(format('select public.cancel_bet(%L)', :'bet1'), 'criador');

:asA
select t_assert(public.resolve_bet(:'bet1', :'b1_opt0') = 'resolved', 'resolver fecha e resolve');
select t_assert((select winning_option_id from public.bets where id = :'bet1') = :'b1_opt0'::uuid, 'opção vencedora gravada');
select t_expect_error(format('select public.resolve_bet(%L, %L)', :'bet1', :'b1_opt1'), 'não pode ser resolvida');

-- Desfazer resultado e marcar empate
:asB
select t_expect_error(format('select public.reopen_bet(%L)', :'bet1'), 'criador');
:asA
select public.reopen_bet(:'bet1');
select t_assert((select status from public.bets where id = :'bet1') = 'closed', 'reabrir volta a closed');
select t_assert(public.resolve_bet(:'bet1', null) = 'void', 'empate anula');
select t_assert((select void_reason from public.bets where id = :'bet1') = 'empate', 'motivo empate');
select public.reopen_bet(:'bet1');
select public.resolve_bet(:'bet1', :'b1_opt1');
-- O criador pode anular mesmo depois de resolvida
select public.cancel_bet(:'bet1');
select t_assert((select status from public.bets where id = :'bet1') = 'cancelled', 'cancelar depois de resolvida');
select t_expect_error(format('select public.cancel_bet(%L)', :'bet1'), 'já está cancelada');

-- ---- Fecho antecipado e admin ----------------------------------------------
:asB
\o
select public.create_bet('Chove amanhã', '', 'one_v_one',
  now()+interval '1 day', now()+interval '2 days', array['Sim','Não'], 1, 250) as bet2 \gset
\o /dev/null
select t_assert(public.close_bet(:'bet2') = 'void', 'fechar sem adversário anula');
select t_assert((select void_reason from public.bets where id = :'bet2') = 'sem_adversarios', 'motivo sem adversários');
:asA
select public.cancel_bet(:'bet2');  -- admin pode cancelar aposta de outro
select t_assert((select status from public.bets where id = :'bet2') = 'cancelled', 'admin cancela');

-- ---- Prazo expirado ---------------------------------------------------------
:asC
\o
select public.create_bet('Prazo', '', 'one_v_one',
  now()+interval '1 hour', now()+interval '2 hours', array['Sim','Não'], 0, 100) as bet3 \gset
select public.create_bet('Prazo 2', '', 'one_v_one',
  now()+interval '1 hour', now()+interval '2 hours', array['Sim','Não'], 0, 100) as bet4 \gset
select id as b4_opt1 from public.bet_options where bet_id = :'bet4' and position = 1 \gset
\o /dev/null
:asA
select public.join_bet(:'bet4', :'b4_opt1');
reset role;
update public.bets set closes_at = now() - interval '1 minute' where id in (:'bet3', :'bet4');
set role authenticated;
:asB
select t_expect_error(format('select public.join_bet(%L, %L)', :'bet4', :'b4_opt1'), 'já não aceita');
select t_assert(public.close_expired_bets() = 2, 'fecha 2 expiradas');
select t_assert((select status from public.bets where id = :'bet3') = 'void', 'expirada sem adversário → void');
select t_assert((select status from public.bets where id = :'bet4') = 'closed', 'expirada com adversário → closed');

-- ---- Aberta a vários --------------------------------------------------------
:asA
\o
select public.create_bet('Pool', '', 'pool',
  now()+interval '1 day', now()+interval '2 days', array['X','Y'], 0, 1000) as bet5 \gset
select id as b5_x from public.bet_options where bet_id = :'bet5' and position = 0 \gset
select id as b5_y from public.bet_options where bet_id = :'bet5' and position = 1 \gset
\o /dev/null
:asB
select t_expect_error(format('select public.join_bet(%L, %L)', :'bet5', :'b5_y'), 'maior que zero');
select public.join_bet(:'bet5', :'b5_y', 300);
:asC
select public.join_bet(:'bet5', :'b5_x', 200);   -- mesmo lado do criador é permitido
select t_assert((select sum(amount_cents) from public.bet_entries where bet_id = :'bet5') = 1500, 'pote do pool');
:asA
select t_assert(public.resolve_bet(:'bet5', :'b5_x') = 'resolved', 'pool resolvido');

-- ---- Escolha múltipla: ninguém acertou -------------------------------------
\o
select public.create_bet('Resultado', '', 'multi',
  now()+interval '1 day', now()+interval '2 days', array['1','X','2'], 0, 100) as bet6 \gset
select id as b6_x from public.bet_options where bet_id = :'bet6' and position = 1 \gset
select id as b6_2 from public.bet_options where bet_id = :'bet6' and position = 2 \gset
\o /dev/null
:asB
select public.join_bet(:'bet6', :'b6_x', 100);
:asA
select t_assert(public.resolve_bet(:'bet6', :'b6_2') = 'void', 'ninguém acertou → void');
select t_assert((select void_reason from public.bets where id = :'bet6') = 'ninguem_acertou', 'motivo ninguém acertou');

-- ---- Odds -------------------------------------------------------------------
\o
select public.create_bet('Odds', '', 'odds',
  now()+interval '1 day', now()+interval '2 days', array['Sim','Não'], 0, 1000, 2, 1) as bet7 \gset
select id as b7_no from public.bet_options where bet_id = :'bet7' and position = 1 \gset
select public.create_bet('Odds 3:1', '', 'odds',
  now()+interval '1 day', now()+interval '2 days', array['Sim','Não'], 0, 100, 3, 1) as bet8 \gset
select id as b8_no from public.bet_options where bet_id = :'bet8' and position = 1 \gset
\o /dev/null
select t_expect_error($$select public.create_bet('x','', 'odds', now()+interval '1 day', now()+interval '1 day', array['a','b'], 0, 1, 3, 1)$$, '0 €');
:asB
select public.join_bet(:'bet7', :'b7_no');
select public.join_bet(:'bet8', :'b8_no');
select t_assert((select amount_cents from public.bet_entries where bet_id = :'bet7' and user_id = auth.uid()) = 500, 'odds 2:1 → 5 €');
select t_assert((select amount_cents from public.bet_entries where bet_id = :'bet8' and user_id = auth.uid()) = 33, 'odds 3:1 de 1 € → 0,33 €');

-- Paridade com oddsTakerAmount() do cliente (src/lib/settlement.test.ts)
:asA
\o
select public.create_bet('Odds 1,5:1', '', 'odds', now()+interval '1 day', now()+interval '2 days', array['Sim','Não'], 0, 1000, 1.5, 1) as bet9 \gset
select id as b9_no from public.bet_options where bet_id = :'bet9' and position = 1 \gset
select public.create_bet('Odds meio cêntimo', '', 'odds', now()+interval '1 day', now()+interval '2 days', array['Sim','Não'], 0, 105, 2, 1) as bet10 \gset
select id as b10_no from public.bet_options where bet_id = :'bet10' and position = 1 \gset
select public.create_bet('Odds 1,1:1', '', 'odds', now()+interval '1 day', now()+interval '2 days', array['Sim','Não'], 0, 1000, 1.1, 1) as bet11 \gset
select id as b11_no from public.bet_options where bet_id = :'bet11' and position = 1 \gset
\o /dev/null
:asB
select public.join_bet(:'bet9', :'b9_no');
select public.join_bet(:'bet10', :'b10_no');
select public.join_bet(:'bet11', :'b11_no');
select t_assert((select amount_cents from public.bet_entries where bet_id = :'bet9' and user_id = auth.uid()) = 667, 'odds 1,5:1 de 10 € → 6,67 €');
select t_assert((select amount_cents from public.bet_entries where bet_id = :'bet10' and user_id = auth.uid()) = 53, 'odds 2:1 de 1,05 € → 0,53 €');
select t_assert((select amount_cents from public.bet_entries where bet_id = :'bet11' and user_id = auth.uid()) = 909, 'odds 1,1:1 de 10 € → 9,09 €');
:asC
select t_expect_error(format('select public.join_bet(%L, %L)', :'bet9', :'b9_no'), 'já aceitou');

-- Escolha múltipla com vários vencedores na mesma opção e 12 opções no máximo
:asA
select t_expect_error($$select public.create_bet('x','', 'multi', now()+interval '1 day', now()+interval '1 day',
  array['1','2','3','4','5','6','7','8','9','10','11','12','13'], 0, 100)$$, '2 a 12');
\o
select public.create_bet('Multi', '', 'multi', now()+interval '1 day', now()+interval '2 days', array['1','X','2'], 1, 300) as bet12 \gset
select id as b12_x from public.bet_options where bet_id = :'bet12' and position = 1 \gset
select id as b12_1 from public.bet_options where bet_id = :'bet12' and position = 0 \gset
\o /dev/null
:asB
select public.join_bet(:'bet12', :'b12_x', 100);
select t_expect_error(format('select public.join_bet(%L, %L, 50)', :'bet12', :'b12_x'), 'Já entraste');
:asC
select public.join_bet(:'bet12', :'b12_1', 1);  -- 1 cêntimo (sem mínimo)
:asA
select t_assert(public.resolve_bet(:'bet12', :'b12_x') = 'resolved', 'multi com 2 vencedores resolvida');

-- ---- Pagamentos -------------------------------------------------------------
:asC
select t_expect_error(format('select public.record_payment(%L, %L, 100)', :'A', :'B'), 'quem paga ou quem recebe');
:asB
\o
select public.record_payment(:'B', :'A', 150, 'MB WAY') as pay1 \gset
:asA
-- quem recebe também pode marcar
select public.record_payment(:'B', :'A', 50) as pay2 \gset
\o /dev/null
:asC
select t_expect_error(format('select public.delete_payment(%L)', :'pay1'), 'Não podes');
:asA
select public.delete_payment(:'pay1');
select t_assert((select count(*) from public.payments) = 1, 'pagamento apagado');

-- ---- Perfis: só o próprio nome ---------------------------------------------
:asB
update public.profiles set display_name = 'Bruninho' where id = auth.uid();
update public.profiles set display_name = 'Hack' where id = :'A';
select t_expect_error($$update public.profiles set email = 'x@y' where id = auth.uid()$$, 'permission denied');
reset role;
select t_assert((select display_name from public.profiles where id = :'B') = 'Bruninho', 'muda o próprio nome');
select t_assert((select display_name from public.profiles where id = :'A') = 'Ana', 'não muda o nome dos outros');
set role authenticated;

-- ---- Lista de autorizados ---------------------------------------------------
:asB
select t_expect_error($$insert into public.allowed_emails (email) values ('novo@x.pt')$$, 'row-level security');
select t_assert((select count(*) from public.allowed_emails) = 1, 'membro só vê o próprio email');
:asA
insert into public.allowed_emails (email) values ('novo@x.pt');
delete from public.allowed_emails where email = 'ana@x.pt';  -- não se pode remover a si próprio
select t_assert((select count(*) from public.allowed_emails) = 4, 'admin vê todos e não se removeu');
delete from public.allowed_emails where email = 'carla@x.pt';

-- Carla deixou de ser membro: perde acesso, mas o histórico mantém-se
:asC
select t_assert((select count(*) from public.bets) = 0, 'ex-membro não vê apostas');
:asA
select t_assert((select count(*) from public.bet_entries where user_id = :'C') > 0, 'histórico do ex-membro mantém-se');

-- ---- Não membro não lê nada; anónimo não executa nada ----------------------
:asD
select t_assert((select count(*) from public.bets) = 0, 'não membro não vê apostas');
select t_assert((select count(*) from public.profiles) = 0, 'não membro não vê perfis');
reset role;
set role anon;
select t_expect_error('select public.close_expired_bets()', 'permission denied');
select t_expect_error('select count(*) from public.bets', 'permission denied');
reset role;

\o
select 'OK: todos os testes da base de dados passaram' as resultado;
