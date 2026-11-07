-- Fecho automático das apostas na data limite (a cada 5 minutos).
-- O pg_cron está disponível no plano gratuito do Supabase.
-- (Em Postgres sem pg_cron — ex.: testes locais — esta migração não faz nada.)
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.unschedule(jobid) from cron.job where jobname = 'fechar-apostas-expiradas';
    perform cron.schedule('fechar-apostas-expiradas', '*/5 * * * *',
                          'select public.close_expired_bets()');
  else
    raise notice 'pg_cron não disponível — fecho automático não agendado.';
  end if;
end
$do$;
