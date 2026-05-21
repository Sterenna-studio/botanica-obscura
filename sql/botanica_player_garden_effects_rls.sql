-- sql/botanica_player_garden_effects_rls.sql
-- Table jardin Botanica avec effets stockés en JSONB.

BEGIN;

CREATE TABLE IF NOT EXISTS public.botanica_player_garden (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  effects    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.botanica_player_garden ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.botanica_player_garden TO authenticated;

DROP POLICY IF EXISTS "botanica_player_garden_select_own" ON public.botanica_player_garden;
CREATE POLICY "botanica_player_garden_select_own"
ON public.botanica_player_garden
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "botanica_player_garden_insert_own" ON public.botanica_player_garden;
CREATE POLICY "botanica_player_garden_insert_own"
ON public.botanica_player_garden
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "botanica_player_garden_update_own" ON public.botanica_player_garden;
CREATE POLICY "botanica_player_garden_update_own"
ON public.botanica_player_garden
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

COMMIT;
