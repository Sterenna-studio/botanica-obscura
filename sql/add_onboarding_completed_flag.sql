-- sql/add_onboarding_completed_flag.sql
-- Ajoute un flag persistant pour empêcher de redonner les graines de départ
-- si le joueur vide son inventaire après l'onboarding.
-- À exécuter dans Supabase SQL Editor.

BEGIN;

ALTER TABLE public.botanica_player_data
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill compat V0.2 : tout joueur qui possède ou a possédé des graines
-- est considéré comme déjà onboardé si une ligne player_data existe.
UPDATE public.botanica_player_data data
SET onboarding_completed = TRUE,
    last_active = COALESCE(data.last_active, NOW())
WHERE onboarding_completed = FALSE
  AND EXISTS (
    SELECT 1
    FROM public.botanica_player_seeds seeds
    WHERE seeds.user_id = data.user_id
  );

COMMIT;
