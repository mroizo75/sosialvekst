-- Allow 'tiktok' as a channel value in social_accounts and posts.
-- The original schema uses a text column (not an enum), so no ALTER TYPE is needed.
-- We only add a CHECK constraint if one doesn't already exist, otherwise we replace it.

-- Ensure social_accounts.channel accepts 'tiktok'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'social_accounts_channel_check'
  ) THEN
    ALTER TABLE social_accounts DROP CONSTRAINT social_accounts_channel_check;
  END IF;
END $$;

ALTER TABLE social_accounts
  ADD CONSTRAINT social_accounts_channel_check
  CHECK (channel IN ('facebook', 'instagram', 'linkedin', 'tiktok'));

-- Ensure posts.channel accepts 'tiktok'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'posts_channel_check'
  ) THEN
    ALTER TABLE posts DROP CONSTRAINT posts_channel_check;
  END IF;
END $$;

ALTER TABLE posts
  ADD CONSTRAINT posts_channel_check
  CHECK (channel IN ('facebook', 'instagram', 'linkedin', 'tiktok'));

-- Ensure publish_jobs.channel accepts 'tiktok'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'publish_jobs_channel_check'
  ) THEN
    ALTER TABLE publish_jobs DROP CONSTRAINT publish_jobs_channel_check;
  END IF;
END $$;

ALTER TABLE publish_jobs
  ADD CONSTRAINT publish_jobs_channel_check
  CHECK (channel IN ('facebook', 'instagram', 'linkedin', 'tiktok'));
