-- Product catalog per business. A post or a content plan can feature one product,
-- and the AI shows it in the setting where it is actually used.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text,
  usage_settings text,
  target_audience text,
  benefits text[] not null default '{}',
  product_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists products_workspace_name_unique
  on public.products (workspace_id, lower(name));
create index if not exists idx_products_user_workspace
  on public.products (user_id, workspace_id);

alter table public.products enable row level security;

drop policy if exists products_owner on public.products;
create policy products_owner
  on public.products for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.product_images
  add column if not exists product_id uuid references public.products(id) on delete cascade;

insert into public.products (user_id, workspace_id, name)
select distinct on (pi.workspace_id, lower(pi.product_name))
  pi.user_id, pi.workspace_id, pi.product_name
from public.product_images pi
where pi.workspace_id is not null
order by pi.workspace_id, lower(pi.product_name), pi.created_at
on conflict (workspace_id, lower(name)) do nothing;

update public.product_images pi
set product_id = p.id
from public.products p
where pi.product_id is null
  and p.workspace_id = pi.workspace_id
  and lower(p.name) = lower(pi.product_name);

create index if not exists idx_product_images_product
  on public.product_images (product_id, sort_order);

alter table public.posts
  add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.content_plans
  add column if not exists product_id uuid references public.products(id) on delete set null;
