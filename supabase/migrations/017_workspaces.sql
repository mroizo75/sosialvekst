-- Workspaces: each user can own multiple businesses
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_workspaces_user on public.workspaces (user_id);

alter table public.workspaces enable row level security;

create policy "workspaces_owner"
on public.workspaces for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Add workspace_id to business-scoped tables
alter table public.brand_profiles
  drop constraint if exists brand_profiles_user_id_key,
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.social_accounts
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.content_plans
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.posts
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.media_assets
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.publish_jobs
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- Active workspace tracking on profiles
alter table public.profiles
  add column if not exists active_workspace_id uuid references public.workspaces(id) on delete set null;

-- Backfill: create a default workspace for every existing user
insert into public.workspaces (user_id, name, is_default)
select p.user_id, coalesce(nullif(p.company_name, ''), 'Min bedrift'), true
from public.profiles p
where not exists (
  select 1 from public.workspaces w where w.user_id = p.user_id
);

-- Backfill workspace_id on existing rows
update public.brand_profiles bp
set workspace_id = w.id
from public.workspaces w
where w.user_id = bp.user_id and w.is_default = true and bp.workspace_id is null;

update public.social_accounts sa
set workspace_id = w.id
from public.workspaces w
where w.user_id = sa.user_id and w.is_default = true and sa.workspace_id is null;

update public.content_plans cp
set workspace_id = w.id
from public.workspaces w
where w.user_id = cp.user_id and w.is_default = true and cp.workspace_id is null;

update public.posts po
set workspace_id = w.id
from public.workspaces w
where w.user_id = po.user_id and w.is_default = true and po.workspace_id is null;

update public.media_assets ma
set workspace_id = w.id
from public.workspaces w
where w.user_id = ma.user_id and w.is_default = true and ma.workspace_id is null;

update public.publish_jobs pj
set workspace_id = w.id
from public.workspaces w
where w.user_id = pj.user_id and w.is_default = true and pj.workspace_id is null;

-- Set active workspace for existing users
update public.profiles p
set active_workspace_id = w.id
from public.workspaces w
where w.user_id = p.user_id and w.is_default = true and p.active_workspace_id is null;

-- Indexes for workspace-scoped queries
create index if not exists idx_brand_profiles_workspace on public.brand_profiles (workspace_id);
create index if not exists idx_social_accounts_workspace on public.social_accounts (workspace_id);
create index if not exists idx_content_plans_workspace on public.content_plans (workspace_id);
create index if not exists idx_posts_workspace on public.posts (workspace_id);
create index if not exists idx_media_assets_workspace on public.media_assets (workspace_id);
create index if not exists idx_publish_jobs_workspace on public.publish_jobs (workspace_id);

-- Unique brand profile per workspace (replaces old user_id unique)
create unique index if not exists idx_brand_profiles_workspace_unique on public.brand_profiles (workspace_id) where workspace_id is not null;
