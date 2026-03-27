-- Videokreditter for AI Video Studio
create table if not exists public.video_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  balance integer not null default 0,
  total_purchased integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.video_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  amount integer not null,
  type text not null check (type in ('purchase', 'usage', 'refund')),
  description text,
  stripe_session_id text,
  created_at timestamptz not null default now()
);

alter table public.video_credits enable row level security;
alter table public.video_credit_transactions enable row level security;

create policy "Brukere kan lese egne kreditter"
  on public.video_credits for select
  using (auth.uid() = user_id);

create policy "Brukere kan lese egne transaksjoner"
  on public.video_credit_transactions for select
  using (auth.uid() = user_id);
