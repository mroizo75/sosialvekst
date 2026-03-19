alter table public.publish_jobs
  add column if not exists processing_started_at timestamptz,
  add column if not exists external_post_id text;

create index if not exists publish_jobs_status_run_at_idx
  on public.publish_jobs (status, run_at);

alter table public.publish_jobs
  drop constraint if exists publish_jobs_status_check;

alter table public.publish_jobs
  add constraint publish_jobs_status_check
  check (status in ('queued', 'retrying', 'processing', 'completed', 'failed'));

