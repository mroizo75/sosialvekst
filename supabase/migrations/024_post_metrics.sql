-- Statistikk fra publiserte poster og metadata som lar systemet lære hva som virker

alter table public.posts
  add column if not exists generation_meta jsonb;

alter table public.social_accounts
  add column if not exists metrics_status text not null default 'ok'
    check (metrics_status in ('ok', 'missing_permission', 'error'));

create table if not exists public.post_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null,
  workspace_id uuid not null,
  channel text not null check (channel in ('facebook', 'instagram', 'linkedin', 'tiktok')),
  checkpoint text not null check (checkpoint in ('24h', '72h', '7d')),
  published_at timestamptz not null,
  views int not null default 0,
  reach int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  shares int not null default 0,
  saves int not null default 0,
  clicks int not null default 0,
  raw jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  unique (post_id, checkpoint)
);

alter table public.post_metrics enable row level security;

drop policy if exists post_metrics_owner_read on public.post_metrics;
create policy "post_metrics_owner_read"
on public.post_metrics
for select
using (user_id = auth.uid());

create index if not exists post_metrics_workspace_channel_idx
  on public.post_metrics (user_id, workspace_id, channel, published_at desc);

-- Kaller /api/metrics/run hver time. Bruker samme app_config som publiseringen.
create or replace function public.trigger_metrics_run()
returns void
language plpgsql
security definer
as $$
declare
  _app_url text;
  _cron_secret text;
begin
  select value into _app_url from public.app_config where key = 'publish_url';
  select value into _cron_secret from public.app_config where key = 'cron_secret';

  if _app_url is null or _cron_secret is null then
    raise warning '[metrics_cron] publish_url or cron_secret not configured in app_config';
    return;
  end if;

  perform net.http_post(
    url := _app_url || '/api/metrics/run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', _cron_secret
    ),
    body := '{}'::jsonb
  );
end;
$$;

select cron.schedule(
  'collect-post-metrics',
  '0 * * * *',
  $$select public.trigger_metrics_run()$$
);
