-- ============================================================================
-- Migration 163 · clinicai-v2 · INTERNAL ALERTS COMPLETION
-- ============================================================================
--
-- Propósito (CRM_PHASE_2G.3):
--   Fecha 100% bloco alertas internos · 2 tick fns novas:
--     - _appointment_next_patient_internal_alert_tick()
--     - _appointment_attention_required_alert_tick()
--
-- Os enum values `next_patient` e `attention_required` já estão declarados
-- no CHECK constraint chk_app_alerts_kind (mig 161) · só falta tick fn.
--
-- Estado seguro pós-apply:
--   - Funções existem mas só rodam via cron quando este for criado
--     (cron 93 + 94 separadamente · não nesta migration)
--   - Worker 71 segue OFF
--   - Zero WhatsApp · zero envio · zero side-effect operacional
--
-- Fora de escopo (não toca):
--   - inbox_notifications · wa_outbox · agenda_alerts_log
--   - Ticks existentes (mig 156/160/161/162)
--   - Triggers · cron.job · TS/app code
--   - Schema appointment_internal_alerts (mig 161)
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. _appointment_next_patient_internal_alert_tick()
-- ────────────────────────────────────────────────────────────────────────────
--
-- Janela operacional:
--   Appointments cuja (scheduled_date + start_time) em SP esteja na janela
--   [now() + 25min, now() + 35min]. Cron sugerido: */5 * * * * (a cada 5
--   min · janela 10min cobre delays até 5min e garante hit em 2 ticks
--   consecutivos com UNIQUE protegendo duplicação).
--
-- Alvo:
--   - target_role='secretaria' (sempre)
--   - target_role='professional' com target_user_id=appointment.professional_id
--     se professional_id NOT NULL
--
-- Status elegíveis: agendado, aguardando_confirmacao, confirmado, aguardando.
-- Idempotência: UNIQUE(appointment_id, alert_kind, target_role) protege.
-- alert_kind: 'next_patient'.
-- Zero WhatsApp. Zero wa_outbox.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._appointment_next_patient_internal_alert_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  r_appt    record;
  v_fired   int := 0;
  v_inserted uuid;
BEGIN
  FOR r_appt IN
    SELECT a.id, a.clinic_id, a.scheduled_date, a.start_time, a.status,
           a.subject_name, a.subject_phone, a.lead_id, a.patient_id,
           a.professional_id, a.professional_name, a.procedure_name
    FROM public.appointments a
    WHERE a.deleted_at IS NULL
      AND a.status IN ('agendado','aguardando_confirmacao','confirmado','aguardando')
      AND (
        (a.scheduled_date::text || ' ' || a.start_time::text)::timestamp
          AT TIME ZONE 'America/Sao_Paulo'
      ) BETWEEN now() + interval '25 minutes'
            AND now() + interval '35 minutes'
  LOOP
    -- Secretaria sempre
    v_inserted := public.appointment_internal_alert_create(
      r_appt.id, 'next_patient', 'secretaria', NULL,
      jsonb_build_object(
        'appointment_id', r_appt.id,
        'subject_name',   r_appt.subject_name,
        'scheduled_date', r_appt.scheduled_date,
        'start_time',     r_appt.start_time,
        'professional_id', r_appt.professional_id,
        'professional_name', r_appt.professional_name,
        'procedure_name', r_appt.procedure_name,
        'status',         r_appt.status
      )
    );
    IF v_inserted IS NOT NULL THEN v_fired := v_fired + 1; END IF;

    -- Profissional (se houver)
    IF r_appt.professional_id IS NOT NULL THEN
      v_inserted := public.appointment_internal_alert_create(
        r_appt.id, 'next_patient', 'professional', r_appt.professional_id,
        jsonb_build_object(
          'appointment_id', r_appt.id,
          'subject_name',   r_appt.subject_name,
          'scheduled_date', r_appt.scheduled_date,
          'start_time',     r_appt.start_time,
          'professional_name', r_appt.professional_name,
          'procedure_name', r_appt.procedure_name
        )
      );
      IF v_inserted IS NOT NULL THEN v_fired := v_fired + 1; END IF;
    END IF;
  END LOOP;

  RETURN v_fired;
END;
$function$;

COMMENT ON FUNCTION public._appointment_next_patient_internal_alert_tick() IS
  'Mig 163 (CRM_PHASE_2G.3) · alerta interno "próximo paciente" · janela now+25..now+35min · target_role=secretaria + professional · ZERO WhatsApp.';

GRANT EXECUTE ON FUNCTION public._appointment_next_patient_internal_alert_tick()
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. _appointment_attention_required_alert_tick()
-- ────────────────────────────────────────────────────────────────────────────
--
-- Scan diário (cron sugerido `0 10 * * *` UTC = 07:00 BRT) de appointments
-- futuros (próximos 7 dias) com dados críticos faltando.
--
-- Casos detectados (codificados em payload.reasons[] como array):
--   - 'no_phone'         · subject_phone vazio ou null
--   - 'no_subject_link'  · lead_id NULL AND patient_id NULL
--   - 'no_professional'  · professional_id NULL ou professional_name vazio
--
-- Status elegíveis: agendado, aguardando_confirmacao, confirmado.
-- Target: secretaria (visibilidade operacional).
-- alert_kind: 'attention_required' canônico · 1 alerta por appt mesmo com
-- múltiplas reasons (UNIQUE constraint preserva idempotência).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._appointment_attention_required_alert_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  r_appt       record;
  v_reasons    text[];
  v_today_sp   date;
  v_fired      int := 0;
  v_inserted   uuid;
BEGIN
  v_today_sp := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  FOR r_appt IN
    SELECT a.id, a.clinic_id, a.scheduled_date, a.start_time, a.status,
           a.subject_name, a.subject_phone, a.lead_id, a.patient_id,
           a.professional_id, a.professional_name, a.procedure_name
    FROM public.appointments a
    WHERE a.deleted_at IS NULL
      AND a.scheduled_date BETWEEN v_today_sp AND v_today_sp + 7
      AND a.status IN ('agendado','aguardando_confirmacao','confirmado')
  LOOP
    v_reasons := ARRAY[]::text[];

    IF r_appt.subject_phone IS NULL OR length(trim(r_appt.subject_phone)) = 0 THEN
      v_reasons := array_append(v_reasons, 'no_phone');
    END IF;

    IF r_appt.lead_id IS NULL AND r_appt.patient_id IS NULL THEN
      v_reasons := array_append(v_reasons, 'no_subject_link');
    END IF;

    IF r_appt.professional_id IS NULL
       OR r_appt.professional_name IS NULL
       OR length(trim(r_appt.professional_name)) = 0 THEN
      v_reasons := array_append(v_reasons, 'no_professional');
    END IF;

    IF array_length(v_reasons, 1) IS NULL THEN
      CONTINUE;
    END IF;

    v_inserted := public.appointment_internal_alert_create(
      r_appt.id, 'attention_required', 'secretaria', NULL,
      jsonb_build_object(
        'appointment_id', r_appt.id,
        'subject_name',   r_appt.subject_name,
        'scheduled_date', r_appt.scheduled_date,
        'start_time',     r_appt.start_time,
        'status',         r_appt.status,
        'professional_id', r_appt.professional_id,
        'professional_name', r_appt.professional_name,
        'procedure_name', r_appt.procedure_name,
        'reasons',        to_jsonb(v_reasons)
      )
    );

    IF v_inserted IS NOT NULL THEN
      v_fired := v_fired + 1;
    END IF;
  END LOOP;

  RETURN v_fired;
END;
$function$;

COMMENT ON FUNCTION public._appointment_attention_required_alert_tick() IS
  'Mig 163 (CRM_PHASE_2G.3) · scan diário de appointments futuros (7 dias) com dados críticos faltantes (no_phone, no_subject_link, no_professional). Target secretaria · 1 alerta por appt · idempotente · ZERO WhatsApp.';

GRANT EXECUTE ON FUNCTION public._appointment_attention_required_alert_tick()
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY DO BLOCK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_next_patient_ok   boolean;
  v_attention_ok      boolean;
  v_create_fn_ok      boolean;
  v_mig_161_table_ok  boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_appointment_next_patient_internal_alert_tick') INTO v_next_patient_ok;
  IF NOT v_next_patient_ok THEN
    RAISE EXCEPTION 'sanity: _appointment_next_patient_internal_alert_tick nao criada';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_appointment_attention_required_alert_tick') INTO v_attention_ok;
  IF NOT v_attention_ok THEN
    RAISE EXCEPTION 'sanity: _appointment_attention_required_alert_tick nao criada';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_internal_alert_create') INTO v_create_fn_ok;
  IF NOT v_create_fn_ok THEN
    RAISE EXCEPTION 'sanity: helper appointment_internal_alert_create ausente · mig 161 nao aplicada?';
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts') INTO v_mig_161_table_ok;
  IF NOT v_mig_161_table_ok THEN
    RAISE EXCEPTION 'sanity: tabela appointment_internal_alerts (mig 161) ausente';
  END IF;

  RAISE NOTICE 'mig 163 · 2 tick fns criadas · helpers OK · tabela mig 161 intacta';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
