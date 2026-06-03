-- sql/fix_v0.3_profile_schema_drift.sql
-- Corrige la derive profil detectee en prod V0.3.
-- A executer dans Supabase SQL Editor si la migration n'a pas deja ete appliquee.
--
-- Symptome corrige :
--   POST botanica_player_data (upsert auth) -> 400 "avatar_url column ... not found"

BEGIN;

ALTER TABLE public.botanica_player_data
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

UPDATE public.botanica_player_data data
SET display_name = COALESCE(NULLIF(BTRIM(data.display_name), ''), profiles.username),
    avatar_url = COALESCE(data.avatar_url, profiles.avatar_url)
FROM public.profiles
WHERE profiles.id = data.user_id
  AND (
    data.display_name IS NULL
    OR BTRIM(data.display_name) = ''
    OR (data.avatar_url IS NULL AND profiles.avatar_url IS NOT NULL)
  );

CREATE OR REPLACE VIEW public.botanica_leaderboard AS
SELECT
  ROW_NUMBER() OVER (ORDER BY COALESCE(data.xp, 0) DESC) AS rank,
  data.display_name,
  data.avatar_url,
  COUNT(codex.species_id)::INT AS codex_count,
  data.level,
  data.xp
FROM public.botanica_player_data data
LEFT JOIN public.botanica_player_codex codex
  ON codex.user_id = data.user_id
WHERE data.display_name IS NOT NULL
GROUP BY data.user_id, data.display_name, data.avatar_url, data.level, data.xp;

COMMIT;

NOTIFY pgrst, 'reload schema';
