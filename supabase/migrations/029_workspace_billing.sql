-- Each business (workspace) has its own subscription and its own video credit balance.
-- Existing rows move to the user's default workspace.

alter table public.subscriptions
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.video_credits
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.video_credit_transactions
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

update public.subscriptions s
set workspace_id = w.id
from public.workspaces w
where w.user_id = s.user_id and w.is_default = true and s.workspace_id is null;

update public.video_credits vc
set workspace_id = w.id
from public.workspaces w
where w.user_id = vc.user_id and w.is_default = true and vc.workspace_id is null;

update public.video_credit_transactions vt
set workspace_id = w.id
from public.workspaces w
where w.user_id = vt.user_id and w.is_default = true and vt.workspace_id is null;

drop index if exists public.subscriptions_user_id_unique;
alter table public.video_credits drop constraint if exists video_credits_user_id_key;

create unique index if not exists subscriptions_workspace_unique
  on public.subscriptions (workspace_id) where workspace_id is not null;
create unique index if not exists video_credits_workspace_unique
  on public.video_credits (workspace_id) where workspace_id is not null;
create index if not exists idx_subscriptions_user on public.subscriptions (user_id);
create index if not exists idx_subscriptions_stripe_subscription on public.subscriptions (stripe_subscription_id);
create index if not exists idx_video_credit_transactions_workspace
  on public.video_credit_transactions (workspace_id, created_at desc);
