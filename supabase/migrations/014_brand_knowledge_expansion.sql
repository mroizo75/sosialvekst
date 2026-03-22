ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS founded_year text,
  ADD COLUMN IF NOT EXISTS team_description text,
  ADD COLUMN IF NOT EXISTS core_values text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS customer_pain_points text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS customer_success_stories text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS services text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS price_range text,
  ADD COLUMN IF NOT EXISTS brand_personality text,
  ADD COLUMN IF NOT EXISTS brand_dos_and_donts text,
  ADD COLUMN IF NOT EXISTS competitor_differentiators text,
  ADD COLUMN IF NOT EXISTS common_questions text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seasonal_focus text;
