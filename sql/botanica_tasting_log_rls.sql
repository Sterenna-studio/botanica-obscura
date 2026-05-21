-- sql/botanica_tasting_log_rls.sql
-- Autorise les joueurs authentifiés à écrire leur propre log de dégustation.

BEGIN;

ALTER TABLE public.botanica_tasting_log ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON TABLE public.botanica_tasting_log TO authenticated;

DO $$
DECLARE
  tasting_log_id_seq TEXT;
BEGIN
  SELECT pg_get_serial_sequence('public.botanica_tasting_log', 'id')
  INTO tasting_log_id_seq;

  IF tasting_log_id_seq IS NOT NULL THEN
    EXECUTE FORMAT('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', tasting_log_id_seq);
  END IF;
END $$;

DROP POLICY IF EXISTS "botanica_tasting_log_select_own" ON public.botanica_tasting_log;
CREATE POLICY "botanica_tasting_log_select_own"
ON public.botanica_tasting_log
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "botanica_tasting_log_insert_own" ON public.botanica_tasting_log;
CREATE POLICY "botanica_tasting_log_insert_own"
ON public.botanica_tasting_log
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id);

COMMIT;
