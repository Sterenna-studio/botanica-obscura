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

-- Ajouter champs progression/identite sur botanica_player_data si absents
ALTER TABLE botanica_player_data ADD COLUMN IF NOT EXISTS coins INT NOT NULL DEFAULT 0;
ALTER TABLE botanica_player_data ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE botanica_player_data ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Vue leaderboard (si pas encore creee)
CREATE OR REPLACE VIEW botanica_leaderboard AS
SELECT
  ROW_NUMBER() OVER (ORDER BY COALESCE(data.xp, 0) DESC) AS rank,
  data.display_name,
  data.avatar_url,
  COUNT(codex.species_id)::INT AS codex_count,
  data.level,
  data.xp
FROM botanica_player_data data
LEFT JOIN botanica_player_codex codex
  ON codex.user_id = data.user_id
WHERE data.display_name IS NOT NULL
GROUP BY data.user_id, data.display_name, data.avatar_url, data.level, data.xp;
