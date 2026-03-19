alter table public.generation_log enable row level security;

drop policy if exists generation_log_owner on public.generation_log;
create policy "generation_log_owner"
on public.generation_log
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.subscriptions
  drop constraint if exists subscriptions_status_check;

alter table public.subscriptions
  add constraint subscriptions_status_check
  check (status in ('active', 'inactive', 'past_due', 'canceled', 'trialing'));

