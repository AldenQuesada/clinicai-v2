-- ============================================================================
-- VPI ind_stage triggers · fix v_lead_id text → uuid (3 funcs)
-- ============================================================================
--
-- Bug class: 3 trigger functions declaravam v_lead_id como TEXT mas chamavam
-- _vpi_update_funnel_stage(p_lead_id uuid, ...) · PG não consegue inferir
-- cast text→uuid em PERFORM · falha com 42883 "function does not exist".
--
-- Sintoma observado: _trigger_error_log enche de "function public._vpi_update_funnel_stage(text, unknown, unknown) does not exist"
-- pra TODA inbound em wa_messages.
--
-- Impacto: cosmético até agora (exception capturada · INSERT passa) · MAS
-- mascara erros reais em outros triggers (ruído alto · diff dos 3 funcs
-- corrige > 90% dos rows do _trigger_error_log).
--
-- Audit Passo 7 + sweep classe-wide hoje (2026-05-04):
--   _vpi_ind_stage_on_inbound       (trigger AFTER INSERT em wa_messages)
--   _vpi_ind_stage_on_appointment   (trigger AFTER INSERT em appointments)
--   _vpi_ind_stage_on_arrival       (trigger AFTER UPDATE em appointments)
--
-- Mantém SECURITY DEFINER + search_path · só muda DECLARE v_lead_id uuid.

BEGIN;

-- ── 1. _vpi_ind_stage_on_inbound ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._vpi_ind_stage_on_inbound()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_phone      text;
  v_phone_last8 text;
  v_lead_id    uuid;
BEGIN
  IF NEW.direction IS NULL OR NEW.direction != 'inbound' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT phone INTO v_phone
      FROM public.wa_conversations
     WHERE id = NEW.conversation_id;

    IF v_phone IS NULL OR length(trim(v_phone)) = 0 THEN
      RETURN NEW;
    END IF;

    v_phone_last8 := right(regexp_replace(v_phone, '\D', '', 'g'), 8);
    IF length(v_phone_last8) < 8 THEN RETURN NEW; END IF;

    SELECT id INTO v_lead_id
      FROM public.leads
     WHERE right(regexp_replace(COALESCE(phone,''), '\D', '', 'g'), 8) = v_phone_last8
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_lead_id IS NULL THEN RETURN NEW; END IF;

    PERFORM public._vpi_update_funnel_stage(v_lead_id, 'responded', 'responded_at');
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._trigger_log(
      '_vpi_ind_stage_on_inbound', 'wa_messages',
      SQLERRM, SQLSTATE,
      jsonb_build_object('msg_id', NEW.id, 'conversation_id', NEW.conversation_id)
    );
  END;

  RETURN NEW;
END $function$;

-- ── 2. _vpi_ind_stage_on_appointment ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public._vpi_ind_stage_on_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_phone_last8 text;
  v_lead_id uuid;
BEGIN
  IF NEW.patient_phone IS NULL OR length(trim(NEW.patient_phone)) = 0 THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_phone_last8 := right(regexp_replace(NEW.patient_phone, '\D', '', 'g'), 8);
    IF length(v_phone_last8) < 8 THEN RETURN NEW; END IF;

    SELECT id INTO v_lead_id
      FROM public.leads
     WHERE right(regexp_replace(COALESCE(phone,''), '\D', '', 'g'), 8) = v_phone_last8
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_lead_id IS NULL THEN RETURN NEW; END IF;

    PERFORM public._vpi_update_funnel_stage(v_lead_id, 'scheduled', 'scheduled_at');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[vpi_ind_stage_on_appointment] appt=% err=%', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END $function$;

-- ── 3. _vpi_ind_stage_on_arrival ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._vpi_ind_stage_on_arrival()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_phone_last8 text;
  v_lead_id uuid;
BEGIN
  -- Só disparar quando chegada_em mudou de null → valor
  IF NEW.chegada_em IS NULL THEN RETURN NEW; END IF;
  IF OLD.chegada_em IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.patient_phone IS NULL OR length(trim(NEW.patient_phone)) = 0 THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_phone_last8 := right(regexp_replace(NEW.patient_phone, '\D', '', 'g'), 8);
    IF length(v_phone_last8) < 8 THEN RETURN NEW; END IF;

    SELECT id INTO v_lead_id
      FROM public.leads
     WHERE right(regexp_replace(COALESCE(phone,''), '\D', '', 'g'), 8) = v_phone_last8
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_lead_id IS NULL THEN RETURN NEW; END IF;

    PERFORM public._vpi_update_funnel_stage(v_lead_id, 'showed', 'showed_at');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[vpi_ind_stage_on_arrival] appt=% err=%', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END $function$;

-- ── 4. Sanity check ───────────────────────────────────────────────────────
DO $$
DECLARE
  v_remaining INT;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM pg_proc
  WHERE pronamespace='public'::regnamespace
    AND prosrc ILIKE '%v_lead_id text%'
    AND prosrc ILIKE '%_vpi_update_funnel_stage%';
  IF v_remaining > 0 THEN
    RAISE WARNING 'mig 115 · % funcs ainda com v_lead_id text · investigar', v_remaining;
  ELSE
    RAISE NOTICE 'mig 115 · 3 triggers VPI corrigidos · v_lead_id agora uuid';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
