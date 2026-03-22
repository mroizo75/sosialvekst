alter table public.content_plans
  add column if not exists channels jsonb not null default '["facebook","instagram","linkedin"]'::jsonb;
