-- Aktiver pg_cron og pg_net for automatisk publisering
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

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

  _app_url := current_setting('app.publish_url', true);
  _cron_secret := current_setting('app.cron_secret', true);

  if _app_url is null or _cron_secret is null then
    raise warning '[publish_cron] app.publish_url or app.cron_secret not configured';
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
