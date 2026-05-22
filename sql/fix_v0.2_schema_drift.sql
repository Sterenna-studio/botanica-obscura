-- sql/fix_v0.2_schema_drift.sql
-- Corrige les divergences de schéma découvertes en prod V0.2.
-- À exécuter dans Supabase SQL Editor.
--
-- Symptômes corrigés :
--   1. GET botanica_player_garden?select=effects → 400 "column effects does not exist"
--   2. POST botanica_player_seeds (upsert with onConflict) → 400 missing unique constraint

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. botanica_player_garden : passer aux effets JSONB
-- ─────────────────────────────────────────────────────────────

-- Ajoute la colonne JSONB si elle manque
ALTER TABLE public.botanica_player_garden
  ADD COLUMN IF NOT EXISTS effects JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Si les anciennes colonnes individuelles existent, on migre leur valeur vers
-- la colonne effects avant de les supprimer.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'botanica_player_garden'
      AND column_name IN ('waterbonus','lightbonus','thermobonus','fanbonus','uvbonus')
  ) THEN
    UPDATE public.botanica_player_garden
    SET effects = jsonb_build_object(
      'waterBonus',  COALESCE(waterBonus,  0),
      'lightBonus',  COALESCE(lightBonus,  0),
      'thermoBonus', COALESCE(thermoBonus, 0),
      'fanBonus',    COALESCE(fanBonus,    0),
      'uvBonus',     COALESCE(uvBonus,     0)
    )
    WHERE effects = '{}'::jsonb;

    ALTER TABLE public.botanica_player_garden
      DROP COLUMN IF EXISTS waterBonus,
      DROP COLUMN IF EXISTS lightBonus,
      DROP COLUMN IF EXISTS thermoBonus,
      DROP COLUMN IF EXISTS fanBonus,
      DROP COLUMN IF EXISTS uvBonus;
  END IF;
END $$;

-- S'assure que updated_at existe
ALTER TABLE public.botanica_player_garden
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- RLS : owner-only (idempotent)
ALTER TABLE public.botanica_player_garden ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "botanica_player_garden_select_own" ON public.botanica_player_garden;
CREATE POLICY "botanica_player_garden_select_own"
  ON public.botanica_player_garden FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "botanica_player_garden_insert_own" ON public.botanica_player_garden;
CREATE POLICY "botanica_player_garden_insert_own"
  ON public.botanica_player_garden FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "botanica_player_garden_update_own" ON public.botanica_player_garden;
CREATE POLICY "botanica_player_garden_update_own"
  ON public.botanica_player_garden FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ─────────────────────────────────────────────────────────────
-- 2. botanica_player_seeds : contrainte unique (user_id, species_id)
-- ─────────────────────────────────────────────────────────────

-- Supprime les doublons éventuels avant la contrainte (garde la plus récente)
DELETE FROM public.botanica_player_seeds a
USING public.botanica_player_seeds b
WHERE a.id < b.id
  AND a.user_id = b.user_id
  AND a.species_id = b.species_id;

-- Ajoute la contrainte si absente (requise pour ON CONFLICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'botanica_player_seeds_user_species_unique'
  ) THEN
    ALTER TABLE public.botanica_player_seeds
      ADD CONSTRAINT botanica_player_seeds_user_species_unique
      UNIQUE (user_id, species_id);
  END IF;
END $$;

-- RLS : owner-only (idempotent — au cas où jamais activée)
ALTER TABLE public.botanica_player_seeds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "botanica_player_seeds_select_own" ON public.botanica_player_seeds;
CREATE POLICY "botanica_player_seeds_select_own"
  ON public.botanica_player_seeds FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "botanica_player_seeds_insert_own" ON public.botanica_player_seeds;
CREATE POLICY "botanica_player_seeds_insert_own"
  ON public.botanica_player_seeds FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "botanica_player_seeds_update_own" ON public.botanica_player_seeds;
CREATE POLICY "botanica_player_seeds_update_own"
  ON public.botanica_player_seeds FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "botanica_player_seeds_delete_own" ON public.botanica_player_seeds;
CREATE POLICY "botanica_player_seeds_delete_own"
  ON public.botanica_player_seeds FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

COMMIT;
