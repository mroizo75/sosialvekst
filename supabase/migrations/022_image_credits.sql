alter table public.posts add column if not exists image_credit text;

alter table public.post_media_assets add column if not exists credit text;
