-- Legg til media_mode i brand_profiles slik at valget faktisk persiteres.
ALTER TABLE brand_profiles
  ADD COLUMN IF NOT EXISTS media_mode text NOT NULL DEFAULT 'hybrid';
