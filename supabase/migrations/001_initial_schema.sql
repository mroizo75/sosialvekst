create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  full_name text not null,
  company_name text not null,
  country_code text not null default 'NO',
  preferred_language text not null default 'nb-NO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan_code text not null default 'base_3x4',
  extra_posts_per_week int not null default 0,
  status text not null default 'inactive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  channel text not null check (channel in ('facebook', 'instagram', 'linkedin')),
  account_id text not null,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, channel, account_id)
);

create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  target_audience text not null,
  brand_voice text not null,
  key_messages jsonb not null default '[]'::jsonb,
  prohibited_terms jsonb not null default '[]'::jsonb,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asset_type text not null check (asset_type in ('image', 'video', 'logo')),
  source_type text not null check (source_type in ('owned', 'ai')),
  file_url text not null,
  alt_text text,
  created_at timestamptz not null default now()
);

create table if not exists public.content_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  posts_per_week int not null default 3,
  total_weeks int not null default 4,
  country_code text not null default 'NO',
  topic_windows jsonb not null default '[]'::jsonb,
  media_mode text not null check (media_mode in ('ai_only', 'hybrid', 'owned_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid not null references public.content_plans(id) on delete cascade,
  channel text not null check (channel in ('facebook', 'instagram', 'linkedin')),
  status text not null check (status in ('draft', 'scheduled', 'published', 'failed', 'needs_review')),
  scheduled_at timestamptz not null,
  text_content text not null,
  image_url text,
  video_url text,
  quality_score jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  revision_no int not null,
  text_content text not null,
  image_url text,
  video_url text,
  created_at timestamptz not null default now(),
  unique (post_id, revision_no)
);

create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null,
  channel text not null check (channel in ('facebook', 'instagram', 'linkedin')),
  run_at timestamptz not null,
  attempts int not null default 0,
  status text not null default 'queued',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
