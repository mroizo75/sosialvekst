-- Produktbilder: referansebilder knyttet til produktnavn.
-- Brukes av bilde-AI for å generere innhold med det faktiske produktet synlig.

CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  image_url text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_product_images_user_workspace
  ON product_images(user_id, workspace_id);

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_images_owner
  ON product_images FOR ALL
  USING (auth.uid() = user_id);
