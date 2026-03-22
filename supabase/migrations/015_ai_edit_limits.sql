ALTER TABLE content_plans
  ADD COLUMN IF NOT EXISTS ai_edits_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_edits_limit integer NOT NULL DEFAULT 5;
