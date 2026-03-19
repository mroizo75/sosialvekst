alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.social_accounts enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.media_assets enable row level security;
alter table public.content_plans enable row level security;
alter table public.posts enable row level security;
alter table public.post_revisions enable row level security;
alter table public.publish_jobs enable row level security;

create policy "profiles_owner"
on public.profiles
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "subscriptions_owner"
on public.subscriptions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "social_accounts_owner"
on public.social_accounts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "brand_profiles_owner"
on public.brand_profiles
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "media_assets_owner"
on public.media_assets
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "content_plans_owner"
on public.content_plans
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "posts_owner"
on public.posts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "post_revisions_owner"
on public.post_revisions
for all
using (
  exists (
    select 1
    from public.posts p
    where p.id = post_revisions.post_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.posts p
    where p.id = post_revisions.post_id
      and p.user_id = auth.uid()
  )
);

create policy "publish_jobs_owner"
on public.publish_jobs
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
