create unique index if not exists subscriptions_user_id_unique
  on public.subscriptions (user_id);

create unique index if not exists publish_jobs_post_id_unique
  on public.publish_jobs (post_id);

alter table public.publish_jobs
  drop constraint if exists publish_jobs_status_check;

alter table public.publish_jobs
  add constraint publish_jobs_status_check
  check (status in ('queued', 'retrying', 'completed', 'failed'));

