create table if not exists public.generation_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null check (action in ('regenerate_all', 'regenerate_single', 'generate_plan')),
  post_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_generation_log_user_date
  on public.generation_log (user_id, created_at);
