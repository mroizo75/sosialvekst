-- Voice used for the spoken voiceover on reels.
alter table public.brand_profiles
  add column if not exists reel_voice text not null default 'female';
alter table public.brand_profiles drop constraint if exists brand_profiles_reel_voice_check;
alter table public.brand_profiles
  add constraint brand_profiles_reel_voice_check
  check (reel_voice in ('female', 'male'));
