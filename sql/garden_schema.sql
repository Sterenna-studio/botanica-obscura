-- sql/garden_schema.sql
-- À exécuter dans Supabase SQL Editor

-- Table effets jardin par joueur
CREATE TABLE IF NOT EXISTS player_garden (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  waterBonus    SMALLINT NOT NULL DEFAULT 0,
  lightBonus    SMALLINT NOT NULL DEFAULT 0,
  thermoBonus   SMALLINT NOT NULL DEFAULT 0,
  fanBonus      SMALLINT NOT NULL DEFAULT 0,
  uvBonus       SMALLINT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE player_garden ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner" ON player_garden USING (auth.uid() = user_id);

-- Table log de ventes NPC
CREATE TABLE IF NOT EXISTS npc_sales_log (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  species_id      INT,
  quality_tier_id SMALLINT,
  price_sold      INT,
  sold_at         TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE npc_sales_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner" ON npc_sales_log USING (auth.uid() = user_id);

-- Ajouter quality_tier_id sur mutation_pots si absent
ALTER TABLE mutation_pots ADD COLUMN IF NOT EXISTS quality_tier_id SMALLINT DEFAULT NULL;

-- Ajouter coins sur botanica_player_data si absent
ALTER TABLE botanica_player_data ADD COLUMN IF NOT EXISTS coins INT NOT NULL DEFAULT 0;

-- Vue leaderboard (si pas encore créée)
CREATE OR REPLACE VIEW botanica_leaderboard AS
SELECT
  ROW_NUMBER() OVER (ORDER BY xp DESC) AS rank,
  display_name,
  avatar_url,
  codex_count,
  level,
  xp
FROM botanica_player_data
WHERE display_name IS NOT NULL;
