-- The customer's goal for a plan decides the mix of reels (reach new people) and images (keep followers).
-- Existing plans keep today's behaviour, where every Facebook, Instagram and TikTok post is a reel.
alter table public.content_plans
  add column if not exists reach_goal text not null default 'growth';
alter table public.content_plans drop constraint if exists content_plans_reach_goal_check;
alter table public.content_plans
  add constraint content_plans_reach_goal_check
  check (reach_goal in ('growth', 'balanced', 'followers'));
