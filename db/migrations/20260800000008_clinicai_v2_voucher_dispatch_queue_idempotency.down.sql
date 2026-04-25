-- Rollback: 20260800000008_clinicai_v2_voucher_dispatch_queue_idempotency
--
-- Restaura RPCs pre-fix (sem idempotency guard) e remove processing_started_at.
-- Caller deve reaplicar mig 800-06 se quiser voltar 100% pro estado anterior;
-- aqui nao redefinimos pick/complete/fail pro corpo da 800-06 porque o
-- DROP+migrate do 800-06.up.sql refaz isso. Down so tira o guard novo.

DROP FUNCTION IF EXISTS public.b2b_dispatch_queue_reset_stuck(int);

-- pick: volta versao sem processing_started_at SET (800-06)
CREATE OR REPLACE FUNCTION public.b2b_dispatch_queue_pick(p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_results jsonb := '[]'::jsonb;
  v_row     record;
  v_limit   int;
BEGIN
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 10), 100));

  FOR v_row IN
    UPDATE public.b2b_voucher_dispatch_queue
       SET status          = 'processing',
           attempts        = attempts + 1,
           last_attempt_at = now()
     WHERE id IN (
       SELECT id FROM public.b2b_voucher_dispatch_queue
        WHERE status = 'pending'
          AND scheduled_at <= now()
        ORDER BY scheduled_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT v_limit
     )
    RETURNING id, clinic_id, partnership_id, recipient_name, recipient_phone,
              recipient_cpf, combo, notes, batch_id, attempts, submitted_by
  LOOP
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'queue_id',         v_row.id,
      'clinic_id',        v_row.clinic_id,
      'partnership_id',   v_row.partnership_id,
      'recipient_name',   v_row.recipient_name,
      'recipient_phone',  v_row.recipient_phone,
      'recipient_cpf',    v_row.recipient_cpf,
      'combo',            v_row.combo,
      'notes',            v_row.notes,
      'batch_id',         v_row.batch_id,
      'attempts',         v_row.attempts,
      'submitted_by',     v_row.submitted_by
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'items', v_results);
END
$$;

-- complete: volta versao sem guard (800-06)
CREATE OR REPLACE FUNCTION public.b2b_dispatch_queue_complete(
  p_queue_id   uuid,
  p_voucher_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.b2b_voucher_dispatch_queue
     SET status          = 'done',
         voucher_id      = p_voucher_id,
         error_message   = NULL,
         last_attempt_at = now()
   WHERE id = p_queue_id
     AND status = 'processing';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_count > 0, 'updated', v_count);
END
$$;

-- fail: volta versao 800-06 (sem leitura de status_atual e sem guard FOR UPDATE)
CREATE OR REPLACE FUNCTION public.b2b_dispatch_queue_fail(
  p_queue_id uuid,
  p_error    text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_attempts int;
  v_new_status text;
  v_count int;
BEGIN
  SELECT attempts INTO v_attempts
    FROM public.b2b_voucher_dispatch_queue
   WHERE id = p_queue_id
   LIMIT 1;
  IF v_attempts IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'queue_id_not_found');
  END IF;

  IF v_attempts >= 3 THEN
    v_new_status := 'failed';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE public.b2b_voucher_dispatch_queue
     SET status          = v_new_status,
         error_message   = LEFT(COALESCE(p_error, 'unknown_error'), 1000),
         last_attempt_at = now()
   WHERE id = p_queue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',          v_count > 0,
    'new_status',  v_new_status,
    'attempts',    v_attempts
  );
END
$$;

DROP INDEX IF EXISTS public.idx_b2b_dispatch_queue_processing_started;

ALTER TABLE public.b2b_voucher_dispatch_queue
  DROP COLUMN IF EXISTS processing_started_at;

NOTIFY pgrst, 'reload schema';
