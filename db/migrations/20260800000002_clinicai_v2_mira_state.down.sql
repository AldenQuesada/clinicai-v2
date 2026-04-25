-- Rollback: 20260800000002_clinicai_v2_mira_state

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    BEGIN PERFORM cron.unschedule('mira_state_cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM cron.unschedule('mira_state_reminder_check'); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.mira_state_reminder_check();
DROP FUNCTION IF EXISTS public.mira_state_cleanup_expired();
DROP FUNCTION IF EXISTS public.mira_state_clear(text, text);
DROP FUNCTION IF EXISTS public.mira_state_get(text, text);
DROP FUNCTION IF EXISTS public.mira_state_set(text, text, jsonb, int);

DROP INDEX IF EXISTS public.idx_mira_state_expires;
DROP INDEX IF EXISTS public.idx_mira_state_phone_keypfx;

DROP TABLE IF EXISTS public.mira_conversation_state;

NOTIFY pgrst, 'reload schema';
