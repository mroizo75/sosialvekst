alter table public.posts
  drop constraint if exists posts_status_check;

alter table public.posts
  add constraint posts_status_check
  check (status in ('generating', 'draft', 'approved', 'scheduled', 'published', 'failed', 'needs_review'));
