-- ============================================================================
-- Migration 161 · clinicai-v2 · INTERNAL APPOINTMENT ALERTS (Secretaria/Mirian)
-- ============================================================================
--
-- Propósito (CRM_PHASE_2G):
--   Implementar alertas INTERNOS (dashboard/notification center · zero WhatsApp)
--   para Secretaria/Mirian/profissional cobrindo:
--     - 'not_confirmed_d_minus_1' · paciente não confirmou D-1
--     - 'not_confirmed_d_zero'    · paciente não confirmou no dia
--     - 'arrival'                 · paciente chegou na clínica
--
-- Arquitetura (Opção 3 da auditoria 2G):
--   - Tabela nova `appointment_internal_alerts` dedicada
--   - Não reusa `inbox_notifications` porque essa tabela exige `conversation_id NOT NULL`
--     e nem todo appointment tem wa_conversation associada
--   - Idempotência nativa: UNIQUE(appointment_id, alert_kind, target_role)
--   - Sem trigger automático em `appointments` (mais seguro)
--   - Tick fn para not_confirmed (chamável por cron ou ad-hoc)
--   - Helper fn para arrival (chamável por server action TS após attend)
--
-- Fora de escopo (NÃO toca):
--   - inbox_notifications (mig 847) · intacta
--   - wa_outbox · zero touch
--   - agenda_alerts_log · zero touch
--   - wa_agenda_automations · zero touch
--   - cron.job · zero alteração (NÃO cria cron novo nesta migration)
--   - appointment_finalize / appointment_attend / appointment_change_status RPCs
--   - TS/app code (patch TS separado · arquivo separado)
--   - triggers existentes
--
-- Estado seguro pós-apply:
--   - Tabela existe mas vazia
--   - Funções existem mas não são chamadas por nenhum cron ainda
--   - Apply não dispara envio nem alteração de dados existentes
--   - Worker 71 segue OFF · ban gate 2L preservado · zero envio real
--
-- Contratos garantidos:
--   - alert_kind ∈ {not_confirmed_d_minus_1, not_confirmed_d_zero, arrival,
--                    next_patient, attention_required}
--   - target_role ∈ {secretaria, professional, doctor, admin}
--   - UNIQUE constraint impede duplicidade automática
--   - RLS multi-tenant ADR-028 (clinic_id via app_clinic_id() JWT)
--   - GRANT SELECT/UPDATE → authenticated (mesma clinic via RLS)
--   - GRANT EXECUTE → service_role + authenticated (RPCs)
--
-- Rollback: down DROP ordenado (seguro · só remove objetos novos).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABELA appointment_internal_alerts
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_internal_alerts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL DEFAULT public._default_clinic_id(),
  appointment_id  uuid        NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  alert_kind      text        NOT NULL,
  target_role     text        NOT NULL,
  target_user_id  uuid,
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_read         boolean     NOT NULL DEFAULT false,
  read_by         uuid,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_app_alerts_kind CHECK (
    alert_kind IN ('not_confirmed_d_minus_1','not_confirmed_d_zero','arrival','next_patient','attention_required')
  ),
  CONSTRAINT chk_app_alerts_target_role CHECK (
    target_role IN ('secretaria','professional','doctor','admin')
  ),
  CONSTRAINT uq_app_alerts_dedup UNIQUE (appointment_id, alert_kind, target_role)
);

CREATE INDEX IF NOT EXISTS idx_app_alerts_clinic_unread
  ON public.appointment_internal_alerts (clinic_id, is_read, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_app_alerts_appt
  ON public.appointment_internal_alerts (appointment_id);

CREATE INDEX IF NOT EXISTS idx_app_alerts_target_user
  ON public.appointment_internal_alerts (target_user_id)
  WHERE target_user_id IS NOT NULL;

COMMENT ON TABLE public.appointment_internal_alerts IS
  'Mig 161 (CRM_PHASE_2G) · alertas internos da operação (Secretaria/Mirian/prof) '
  'relacionados a appointments. ZERO acoplamento com WhatsApp · dashboard apenas. '
  'Idempotência via UNIQUE(appointment_id, alert_kind, target_role).';

-- RLS
ALTER TABLE public.appointment_internal_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_alerts_select_same_clinic ON public.appointment_internal_alerts;
CREATE POLICY app_alerts_select_same_clinic
  ON public.appointment_internal_alerts
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS app_alerts_update_same_clinic ON public.appointment_internal_alerts;
CREATE POLICY app_alerts_update_same_clinic
  ON public.appointment_internal_alerts
  FOR UPDATE TO authenticated
  USING (clinic_id = public.app_clinic_id());

-- INSERT/DELETE somente via RPC SECURITY DEFINER (service_role)
-- Sem policy INSERT/DELETE para authenticated.

GRANT SELECT, UPDATE ON public.appointment_internal_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_internal_alerts TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RPC appointment_internal_alert_create
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.appointment_internal_alert_create(
  p_appointment_id uuid,
  p_alert_kind     text,
  p_target_role    text,
  p_target_user_id uuid    DEFAULT NULL,
  p_payload        jsonb   DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_clinic_id uuid;
  v_id        uuid;
BEGIN
  -- Tenant: deriva do appointment · não confia em parâmetro
  SELECT clinic_id INTO v_clinic_id
  FROM public.appointments
  WHERE id = p_appointment_id AND deleted_at IS NULL;

  IF v_clinic_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.appointment_internal_alerts (
    clinic_id, appointment_id, alert_kind, target_role, target_user_id, payload
  ) VALUES (
    v_clinic_id, p_appointment_id, p_alert_kind, p_target_role, p_target_user_id, COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (appointment_id, alert_kind, target_role) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;  -- NULL se ON CONFLICT skip
END;
$function$;

COMMENT ON FUNCTION public.appointment_internal_alert_create(uuid, text, text, uuid, jsonb) IS
  'Mig 161 · cria alerta interno idempotente · ON CONFLICT DO NOTHING via UNIQUE(appointment_id, alert_kind, target_role).';

GRANT EXECUTE ON FUNCTION public.appointment_internal_alert_create(uuid, text, text, uuid, jsonb)
  TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RPC appointment_internal_alert_mark_read
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.appointment_internal_alert_mark_read(
  p_alert_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_clinic_id uuid;
  v_user_id   uuid;
  v_updated   int;
BEGIN
  v_clinic_id := public.app_clinic_id();
  v_user_id   := auth.uid();

  UPDATE public.appointment_internal_alerts
     SET is_read = true,
         read_by = v_user_id,
         read_at = now()
   WHERE id = p_alert_id
     AND clinic_id = v_clinic_id
     AND is_read = false;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', v_updated > 0, 'updated', v_updated);
END;
$function$;

COMMENT ON FUNCTION public.appointment_internal_alert_mark_read(uuid) IS
  'Mig 161 · marca alerta como lido · scope automático clinic_id + auth.uid().';

GRANT EXECUTE ON FUNCTION public.appointment_internal_alert_mark_read(uuid)
  TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. TICK FN · not_confirmed (D-1 + D-zero)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._appointment_not_confirmed_alert_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  r_appt     record;
  v_today_sp date;
  v_kind     text;
  v_fired    int := 0;
  v_inserted uuid;
BEGIN
  /*
    Escaneia appointments com status 'aguardando_confirmacao' OR 'agendado'
    cuja data é hoje ou amanhã em SP (D-1 e D-zero).
    Para cada, cria alerta interno target_role='secretaria' se ainda não existe.
    Idempotência via UNIQUE(appointment_id, alert_kind, target_role).
    ZERO WhatsApp · zero outbox.
  */
  v_today_sp := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  FOR r_appt IN
    SELECT a.id, a.clinic_id, a.scheduled_date, a.start_time, a.status,
           a.subject_name, a.subject_phone, a.lead_id, a.patient_id,
           a.professional_id, a.professional_name, a.procedure_name
    FROM public.appointments a
    WHERE a.deleted_at IS NULL
      AND a.status IN ('agendado','aguardando_confirmacao')
      AND a.scheduled_date IN (v_today_sp, v_today_sp + 1)
  LOOP
    v_kind := CASE
      WHEN r_appt.scheduled_date = v_today_sp THEN 'not_confirmed_d_zero'
      ELSE 'not_confirmed_d_minus_1'
    END;

    v_inserted := public.appointment_internal_alert_create(
      r_appt.id,
      v_kind,
      'secretaria',
      NULL,
      jsonb_build_object(
        'appointment_id',     r_appt.id,
        'subject_name',       r_appt.subject_name,
        'subject_phone',      r_appt.subject_phone,
        'scheduled_date',     r_appt.scheduled_date,
        'start_time',         r_appt.start_time,
        'status',             r_appt.status,
        'professional_id',    r_appt.professional_id,
        'professional_name',  r_appt.professional_name,
        'procedure_name',     r_appt.procedure_name,
        'lead_id',            r_appt.lead_id,
        'patient_id',         r_appt.patient_id
      )
    );

    IF v_inserted IS NOT NULL THEN
      v_fired := v_fired + 1;
    END IF;
  END LOOP;

  RETURN v_fired;
END;
$function$;

COMMENT ON FUNCTION public._appointment_not_confirmed_alert_tick() IS
  'Mig 161 · gera alerta interno secretaria para appointments aguardando_confirmacao/agendado em D-1 ou D-zero. Idempotente · ZERO WhatsApp · sem cron nesta migration.';

GRANT EXECUTE ON FUNCTION public._appointment_not_confirmed_alert_tick()
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. HELPER FN · arrival (paciente chegou · chamável por TS após attend)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.appointment_arrival_internal_alert(
  p_appointment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_appt          record;
  v_alert_pro_id  uuid;
  v_alert_sec_id  uuid;
  v_count         int := 0;
BEGIN
  SELECT a.id, a.clinic_id, a.status, a.scheduled_date, a.start_time, a.chegada_em,
         a.subject_name, a.subject_phone, a.lead_id, a.patient_id,
         a.professional_id, a.professional_name, a.procedure_name
    INTO v_appt
    FROM public.appointments a
   WHERE a.id = p_appointment_id AND a.deleted_at IS NULL;

  IF v_appt.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'appointment_not_found');
  END IF;

  -- Só faz sentido se status indica que paciente chegou.
  IF v_appt.status NOT IN ('na_clinica','aguardando','em_atendimento','em_consulta') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'status_not_arrival_like', 'status', v_appt.status);
  END IF;

  -- Alerta para profissional dono do appointment
  v_alert_pro_id := public.appointment_internal_alert_create(
    p_appointment_id, 'arrival', 'professional', v_appt.professional_id,
    jsonb_build_object(
      'appointment_id', v_appt.id,
      'subject_name',   v_appt.subject_name,
      'scheduled_date', v_appt.scheduled_date,
      'start_time',     v_appt.start_time,
      'chegada_em',     v_appt.chegada_em,
      'professional_id', v_appt.professional_id,
      'professional_name', v_appt.professional_name,
      'procedure_name', v_appt.procedure_name
    )
  );
  IF v_alert_pro_id IS NOT NULL THEN v_count := v_count + 1; END IF;

  -- Alerta para Secretaria (visibilidade operacional)
  v_alert_sec_id := public.appointment_internal_alert_create(
    p_appointment_id, 'arrival', 'secretaria', NULL,
    jsonb_build_object(
      'appointment_id', v_appt.id,
      'subject_name',   v_appt.subject_name,
      'scheduled_date', v_appt.scheduled_date,
      'start_time',     v_appt.start_time,
      'chegada_em',     v_appt.chegada_em,
      'professional_name', v_appt.professional_name,
      'procedure_name', v_appt.procedure_name
    )
  );
  IF v_alert_sec_id IS NOT NULL THEN v_count := v_count + 1; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'created_count', v_count,
    'pro_alert_id', v_alert_pro_id,
    'sec_alert_id', v_alert_sec_id
  );
END;
$function$;

COMMENT ON FUNCTION public.appointment_arrival_internal_alert(uuid) IS
  'Mig 161 · cria 2 alertas internos (professional + secretaria) quando paciente chega. Idempotente. Status check defensivo. Chamável por TS server action.';

GRANT EXECUTE ON FUNCTION public.appointment_arrival_internal_alert(uuid)
  TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY DO BLOCK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_table_exists boolean;
  v_create_fn    boolean;
  v_mark_read_fn boolean;
  v_tick_fn      boolean;
  v_arrival_fn   boolean;
  v_unique_ok    boolean;
  v_rls_enabled  boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_internal_alerts') INTO v_table_exists;
  IF NOT v_table_exists THEN RAISE EXCEPTION 'sanity: tabela appointment_internal_alerts nao criada'; END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_internal_alert_create') INTO v_create_fn;
  IF NOT v_create_fn THEN RAISE EXCEPTION 'sanity: RPC appointment_internal_alert_create ausente'; END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_internal_alert_mark_read') INTO v_mark_read_fn;
  IF NOT v_mark_read_fn THEN RAISE EXCEPTION 'sanity: RPC appointment_internal_alert_mark_read ausente'; END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_appointment_not_confirmed_alert_tick') INTO v_tick_fn;
  IF NOT v_tick_fn THEN RAISE EXCEPTION 'sanity: tick fn _appointment_not_confirmed_alert_tick ausente'; END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_arrival_internal_alert') INTO v_arrival_fn;
  IF NOT v_arrival_fn THEN RAISE EXCEPTION 'sanity: helper fn appointment_arrival_internal_alert ausente'; END IF;

  SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_app_alerts_dedup') INTO v_unique_ok;
  IF NOT v_unique_ok THEN RAISE EXCEPTION 'sanity: UNIQUE constraint uq_app_alerts_dedup ausente'; END IF;

  SELECT relrowsecurity FROM pg_class WHERE oid='public.appointment_internal_alerts'::regclass INTO v_rls_enabled;
  IF NOT v_rls_enabled THEN RAISE EXCEPTION 'sanity: RLS nao habilitado em appointment_internal_alerts'; END IF;

  RAISE NOTICE 'mig 161 · tabela + 4 fns + UNIQUE + RLS OK';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
