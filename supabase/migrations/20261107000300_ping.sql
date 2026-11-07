-- Função trivial usada pela GitHub Action "keep-alive" para o projeto do
-- plano gratuito não ser pausado por inatividade. Não expõe dados.
create or replace function public.ping()
returns text language sql stable
set search_path = ''
as $$ select 'ok'::text $$;

grant execute on function public.ping() to anon, authenticated;
