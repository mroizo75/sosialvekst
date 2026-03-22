create table if not exists public.post_media_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  file_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (post_id, sort_order)
);

alter table public.post_media_assets enable row level security;

drop policy if exists post_media_assets_owner on public.post_media_assets;
create policy "post_media_assets_owner"
on public.post_media_assets
for all
using (
  exists (
    select 1
    from public.posts p
    where p.id = post_media_assets.post_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.posts p
    where p.id = post_media_assets.post_id
      and p.user_id = auth.uid()
  )
);

create index if not exists post_media_assets_post_id_sort_order_idx
  on public.post_media_assets (post_id, sort_order);
