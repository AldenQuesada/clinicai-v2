-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ DOWN · Migration 800-10 · restaura cleanup sem buffer + get sem grace    ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Reverte para o comportamento da mig 800-02:                              ║
-- ║   · cleanup_expired delete WHERE expires_at < now() (sem buffer)         ║
-- ║   · mira_state_get sem grace window                                      ║
-- ║   · DROP mira_state_get_with_metadata                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP FUNCTION IF EXISTS public.mira_state_get_with_metadata(text, text);

CREATE OR REPLACE FUNCTION public.mira_state_cleanup_expired()
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM public.mira_conversation_state WHERE expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

CREATE OR REPLACE FUNCTION public.mira_state_get(
  p_phone text,
  p_key   text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_row record;
BEGIN
  DELETE FROM public.mira_conversation_state
   WHERE phone = p_phone AND state_key = p_key AND expires_at < now();

  SELECT state_value, expires_at INTO v_row
    FROM public.mira_conversation_state
   WHERE phone = p_phone AND state_key = p_key
   LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'value',      v_row.state_value,
    'expires_at', v_row.expires_at
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.mira_state_cleanup_expired()  TO service_role;
GRANT EXECUTE ON FUNCTION public.mira_state_get(text, text)    TO service_role;

NOTIFY pgrst, 'reload schema';
