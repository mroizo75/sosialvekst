-- Add website scraping and enriched brand context fields to brand_profiles
alter table public.brand_profiles
  add column if not exists website_url text,
  add column if not exists website_content text,
  add column if not exists company_description text,
  add column if not exists products jsonb not null default '[]'::jsonb,
  add column if not exists unique_selling_points jsonb not null default '[]'::jsonb;
