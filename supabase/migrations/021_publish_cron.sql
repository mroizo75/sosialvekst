-- Aktiver pg_cron og pg_net for automatisk publisering
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Config-tabell for app-innstillinger (erstatter current_setting som krever superuser)
create table if not exists public.app_config (
  key text primary key,
  value text not null
);

alter table public.app_config enable row level security;

create policy "app_config_service_only"
on public.app_config for select
using (auth.role() = 'service_role');

-- Funksjon som sjekker forfalne jobber og trigger publisering
create or replace function public.trigger_publish_run()
returns void
language plpgsql
security definer
as $$
declare
  _app_url text;
  _cron_secret text;
  _due_count int;
begin
  select count(*) into _due_count
  from public.publish_jobs
  where status in ('queued', 'retrying')
    and run_at <= now();

  if _due_count = 0 then
    return;
  end if;

  select value into _app_url
  from public.app_config
  where key = 'publish_url';

  select value into _cron_secret
  from public.app_config
  where key = 'cron_secret';

  if _app_url is null or _cron_secret is null then
    raise warning '[publish_cron] publish_url or cron_secret not configured in app_config';
    return;
  end if;

  perform net.http_post(
    url := _app_url || '/api/publish/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _cron_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;

-- Kjør hvert minutt — funksjonen avbryter tidlig hvis ingen jobber er forfalt
select cron.schedule(
  'publish-due-posts',
  '* * * * *',
  $$select public.trigger_publish_run()$$
);
