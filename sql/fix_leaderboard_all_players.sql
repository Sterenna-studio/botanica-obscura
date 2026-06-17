-- sql/fix_leaderboard_all_players.sql
-- Hall of Fame : inclure TOUS les joueurs, y compris ceux sans display_name.
--
-- Avant : la vue filtrait `WHERE data.display_name IS NOT NULL`, ce qui
-- excluait les joueurs dont le pseudo n'a jamais été renseigné. Le front gère
-- déjà le cas via le repli "Botaniste anonyme" (lib/leaderboard.js), donc on
-- retire le filtre et on expose tout le monde.
--
-- NB : on DROP puis recrée la vue (et non CREATE OR REPLACE) car l'ordre des
-- colonnes en prod a dérivé — CREATE OR REPLACE refuse de réordonner/renommer
-- des colonnes existantes. Le front sélectionne par nom, l'ordre n'importe pas.
--
-- À exécuter dans le SQL Editor Supabase. Idempotent.

BEGIN;

DROP VIEW IF EXISTS public.botanica_leaderboard;

CREATE VIEW public.botanica_leaderboard AS
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
GROUP BY data.user_id, data.display_name, data.avatar_url, data.level, data.xp;

-- Rétablit l'accès en lecture (perdu au DROP)
GRANT SELECT ON public.botanica_leaderboard TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
