-- Rollback 800-88 · restaura _b2b_invoke_edge sem guard de horario,
-- dropa fila + helpers. b2b_voucher_dispatch_queue (mig 800-06) NAO eh tocada.

BEGIN;

-- Restaura versao original do clinic-dashboard (sem guard de horario)
CREATE OR REPLACE FUNCTION public._b2b_invoke_edge(
  p_path text,
  p_body jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_url        text := 'https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/' || p_path;
  v_request_id bigint;
BEGIN
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := p_body,
    timeout_milliseconds := 30000
  ) INTO v_request_id;
  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id, 'url', v_url);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'edge invoke falhou (%): %', p_path, SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

GRANT EXECUTE ON FUNCTION public._b2b_invoke_edge(text, jsonb)
  TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.b2b_pending_dispatches_drain(int);
DROP TABLE  IF EXISTS public.b2b_pending_dispatches CASCADE;
DROP FUNCTION IF EXISTS public._b2b_pending_dispatches_set_updated_at();
DROP FUNCTION IF EXISTS public._b2b_next_window_start(uuid, timestamptz);
DROP FUNCTION IF EXISTS public._b2b_is_within_business_hours(uuid, timestamptz);

COMMIT;
NOTIFY pgrst, 'reload schema';
