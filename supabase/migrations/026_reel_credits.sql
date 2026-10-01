-- Reels are paid with video credits; 'no_credits' marks a reel that was skipped for lack of credits.
alter table public.posts drop constraint if exists posts_video_status_check;
alter table public.posts
  add constraint posts_video_status_check
  check (video_status in ('pending', 'ready', 'failed', 'no_credits'));
