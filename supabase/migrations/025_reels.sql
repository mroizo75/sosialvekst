-- Reels: the clean source photo and the state of the background video render

alter table public.posts
  add column if not exists reel_source_url text,
  add column if not exists video_status text
    check (video_status in ('pending', 'ready', 'failed'));
