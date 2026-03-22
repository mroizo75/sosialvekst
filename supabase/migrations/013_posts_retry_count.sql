ALTER TABLE posts ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_posts_status_stuck
  ON posts (user_id, status)
  WHERE status IN ('generating', 'failed');
