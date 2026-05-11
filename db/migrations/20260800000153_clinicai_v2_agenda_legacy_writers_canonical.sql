-- ============================================================================
-- Migration 153 · clinicai-v2 · agenda legacy writers · canonical schema
-- ============================================================================
--
-- Propósito P0:
--   Recriar public.appt_upsert(jsonb) e public.appt_sync_batch(jsonb) para
--   aceitar o payload camelCase pt-br do legacy (apps/lara/public/legacy/js)
--   mas gravar usando o contrato canônico do schema atual de
--   public.appointments (mig 062 + 151 + 152):
--     subject_name, subject_phone, professional_id, professional_name,
--     scheduled_date, start_time, end_time, procedure_name, consult_type,
--     eval_type, value, payment_method, payment_status, status, origem,
--     obs, consentimento_img, recurrence_*.
--
-- Por que esta mig existe:
--   Auditoria 2026-05-11 confirmou que as versões atuais de appt_upsert
--   e appt_sync_batch no banco ainda tentam gravar colunas legadas
--   (patient_name, patient_phone, professional_idx, room_idx) que não
--   existem mais. Resultado: schedule-modal.js do legacy salva em
--   localStorage mas SALVA EM ERRO silencioso no banco · operadora acha
--   que agendou mas appt nunca chega ao Supabase.
--
-- Escopo:
--   - CREATE OR REPLACE FUNCTION public.appt_upsert(jsonb)
--   - CREATE OR REPLACE FUNCTION public.appt_sync_batch(jsonb)
--   - GRANT/REVOKE preservados (CREATE OR REPLACE mantém grants existentes)
--   - NOTIFY pgrst, 'reload schema'
--
-- Fora de escopo:
--   - Schema da tabela appointments (não alterar nesta fase)
--   - Outras RPCs (appointment_attend, appointment_finalize, appointment_change_status,
--     lead_to_appointment, appt_set_canonical, appt_set_cortesia, appt_delete*,
--     appt_create_series, appt_list · todas inalteradas)
--   - WhatsApp / cron / wa_outbox / wa_agenda_automations
--   - Schema de procedimentos[]/pagamentos[] (não existem como colunas na
--     tabela canon · legacy chama appt_set_canonical separado depois do
--     appt_upsert · esta mig NÃO os trata)
--   - Schema TS novo (Lara v2) · não usa estas RPCs
--   - Backfill
--
-- Compatibilidade preservada:
--   - Payload camelCase legacy: pacienteNome, pacienteId, pacientePhone,
--     pacienteTelefone (fallback), profissionalNome, _professionalId,
--     data, horaInicio, horaFim, procedimento, status, obs, origem,
--     consentimentoImagem, valor, formaPagamento, statusPagamento,
--     tipoConsulta, tipoAvaliacao, recurrence_*/recurrenceCamelCase.
--   - Retorno de id_remapped: se id legacy (não-UUID), gera UUID novo;
--     se UUID, mantém.
--
-- Rollback:
--   - Down: NO-OP defensivo (não restaura versões antigas quebradas)
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Helper interno · normaliza payload jsonb legacy para colunas canon
--    (não é PUBLIC API · não exposto a grants externos)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._appt_upsert_one(
  p_data       jsonb,
  p_clinic_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_role               text;
  v_id_input           text;
  v_id_final           uuid;
  v_id_remapped        boolean := false;
  v_id_legacy_input    text   := NULL;

  v_subject_id         uuid;
  v_lead_id            uuid;
  v_patient_id         uuid;

  v_subject_name       text;
  v_subject_phone      text;
  v_professional_id    uuid;
  v_professional_name  text;
  v_scheduled_date     date;
  v_start_time         time;
  v_end_time           time;
  v_procedure_name     text;
  v_consult_type       text;
  v_eval_type          text;
  v_value              numeric(10,2);
  v_payment_method     text;
  v_payment_status     text;
  v_status             text;
  v_origem             text;
  v_obs                text;
  v_consentimento_img  text;
  v_recurrence_group_id      uuid;
  v_recurrence_index         integer;
  v_recurrence_total         integer;
  v_recurrence_procedure     text;
  v_recurrence_interval_days integer;

  v_existing_id        uuid;
  v_now                timestamptz := now();
BEGIN
  -- 1. Permissão de role (espelho da RLS da tabela)
  v_role := public.app_role();
  IF v_role IS NULL OR v_role NOT IN ('owner','admin','receptionist','therapist') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role', 'got', COALESCE(v_role,'<null>'));
  END IF;

  -- 2. id obrigatório (legacy gera client-side com crypto.randomUUID OU appt_*)
  v_id_input := NULLIF(trim(COALESCE(p_data->>'id','')), '');
  IF v_id_input IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'id_required');
  END IF;

  -- 3. Detectar UUID válido vs id legacy (appt_<ts>_<rand>)
  BEGIN
    v_id_final := v_id_input::uuid;
    v_id_remapped := false;
  EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
    v_id_legacy_input := v_id_input;
    v_id_final := gen_random_uuid();
    v_id_remapped := true;
  END;

  -- 4. Campos obrigatórios mínimos
  v_subject_name := NULLIF(trim(COALESCE(p_data->>'pacienteNome','')), '');
  IF v_subject_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subject_name_required');
  END IF;

  -- data + horaInicio + horaFim
  IF (p_data->>'data') IS NULL OR length(trim(p_data->>'data')) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'scheduled_date_required');
  END IF;
  IF (p_data->>'horaInicio') IS NULL OR length(trim(p_data->>'horaInicio')) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'start_time_required');
  END IF;
  IF (p_data->>'horaFim') IS NULL OR length(trim(p_data->>'horaFim')) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'end_time_required');
  END IF;

  BEGIN
    v_scheduled_date := (p_data->>'data')::date;
    v_start_time     := (p_data->>'horaInicio')::time;
    v_end_time       := (p_data->>'horaFim')::time;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_date_or_time');
  END;

  IF v_end_time <= v_start_time THEN
    RETURN jsonb_build_object('ok', false, 'error', 'end_time_must_be_after_start_time');
  END IF;

  -- 5. Resolver subject_id (lead OU patient · modelo excludente)
  v_subject_id := NULLIF(trim(COALESCE(p_data->>'pacienteId','')), '')::uuid;
  IF v_subject_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.leads
       WHERE id = v_subject_id AND clinic_id = p_clinic_id AND deleted_at IS NULL
    ) THEN
      v_lead_id := v_subject_id;
    ELSIF EXISTS (
      SELECT 1 FROM public.patients
       WHERE id = v_subject_id AND clinic_id = p_clinic_id AND deleted_at IS NULL
    ) THEN
      v_patient_id := v_subject_id;
    ELSE
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'invalid_lead_or_patient_id',
        'got', v_subject_id::text
      );
    END IF;
  END IF;

  -- 6. Subject XOR enforced pelo CHECK · status='bloqueado' permite NULL
  v_status := NULLIF(trim(COALESCE(p_data->>'status','')), '');
  IF v_status IS NULL THEN v_status := 'agendado'; END IF;

  IF v_lead_id IS NULL AND v_patient_id IS NULL AND v_status <> 'bloqueado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subject_required');
  END IF;

  -- 7. Validar status (contrato canon)
  IF v_status NOT IN (
    'agendado','aguardando_confirmacao','confirmado','pre_consulta',
    'aguardando','na_clinica','em_consulta','em_atendimento',
    'finalizado','remarcado','cancelado','no_show','bloqueado'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status', 'got', v_status);
  END IF;

  -- 8. Subject snapshot + professional
  v_subject_phone := COALESCE(
    NULLIF(trim(COALESCE(p_data->>'pacientePhone','')), ''),
    NULLIF(trim(COALESCE(p_data->>'pacienteTelefone','')), '')
  );

  v_professional_id   := NULLIF(trim(COALESCE(p_data->>'_professionalId','')), '')::uuid;
  v_professional_name := COALESCE(NULLIF(trim(COALESCE(p_data->>'profissionalNome','')), ''), '');

  v_procedure_name := COALESCE(NULLIF(trim(COALESCE(p_data->>'procedimento','')), ''), '');
  v_consult_type   := NULLIF(trim(COALESCE(p_data->>'tipoConsulta','')), '');
  v_eval_type      := NULLIF(trim(COALESCE(p_data->>'tipoAvaliacao','')), '');

  -- 9. Financeiro
  v_value := COALESCE(NULLIF(p_data->>'valor','')::numeric, 0);
  IF v_value < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_value_negative');
  END IF;
  v_payment_method := NULLIF(trim(COALESCE(p_data->>'formaPagamento','')), '');
  v_payment_status := NULLIF(trim(COALESCE(p_data->>'statusPagamento','')), '');
  IF v_payment_status IS NULL THEN v_payment_status := 'pendente'; END IF;
  IF v_payment_status NOT IN ('pendente','parcial','pago','cortesia','isento') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payment_status', 'got', v_payment_status);
  END IF;

  -- 10. Consentimento (normaliza chave camelCase legacy)
  v_consentimento_img := NULLIF(trim(COALESCE(
    p_data->>'consentimentoImagem',
    p_data->>'consentimento_img'
  )), '');
  IF v_consentimento_img IS NULL THEN v_consentimento_img := 'pendente'; END IF;
  IF v_consentimento_img NOT IN ('pendente','assinado','recusado','nao_aplica') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_consentimento_img', 'got', v_consentimento_img);
  END IF;

  -- 11. Origem + obs
  v_origem := NULLIF(trim(COALESCE(p_data->>'origem','')), '');
  v_obs    := NULLIF(p_data->>'obs', '');

  -- 12. Recurrence (aceita snake_case e camelCase)
  v_recurrence_group_id := NULLIF(trim(COALESCE(
    p_data->>'recurrence_group_id',
    p_data->>'recurrenceGroupId'
  )), '')::uuid;
  v_recurrence_index := NULLIF(COALESCE(
    p_data->>'recurrence_index',
    p_data->>'recurrenceIndex'
  ), '')::integer;
  v_recurrence_total := NULLIF(COALESCE(
    p_data->>'recurrence_total',
    p_data->>'recurrenceTotal'
  ), '')::integer;
  v_recurrence_procedure := NULLIF(trim(COALESCE(
    p_data->>'recurrence_procedure',
    p_data->>'recurrenceProcedure',
    ''
  )), '');
  v_recurrence_interval_days := NULLIF(COALESCE(
    p_data->>'recurrence_interval_days',
    p_data->>'recurrenceIntervalDays'
  ), '')::integer;

  -- 13. Lock + check se id existe (UPDATE path)
  SELECT id INTO v_existing_id
    FROM public.appointments
   WHERE id = v_id_final
     AND clinic_id = p_clinic_id
   FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    -- UPDATE path
    UPDATE public.appointments
       SET subject_name         = v_subject_name,
           subject_phone        = v_subject_phone,
           lead_id              = v_lead_id,
           patient_id           = v_patient_id,
           professional_id      = v_professional_id,
           professional_name    = v_professional_name,
           scheduled_date       = v_scheduled_date,
           start_time           = v_start_time,
           end_time             = v_end_time,
           procedure_name       = v_procedure_name,
           consult_type         = v_consult_type,
           eval_type            = v_eval_type,
           value                = v_value,
           payment_method       = v_payment_method,
           payment_status       = v_payment_status,
           status               = v_status,
           origem               = COALESCE(v_origem, origem),
           obs                  = v_obs,
           consentimento_img    = v_consentimento_img,
           recurrence_group_id      = v_recurrence_group_id,
           recurrence_index         = v_recurrence_index,
           recurrence_total         = v_recurrence_total,
           recurrence_procedure     = v_recurrence_procedure,
           recurrence_interval_days = v_recurrence_interval_days,
           updated_at           = v_now
     WHERE id = v_id_final;
  ELSE
    -- INSERT path (mesmo se v_id_remapped=true · id já é UUID)
    INSERT INTO public.appointments (
      id, clinic_id, lead_id, patient_id,
      subject_name, subject_phone,
      professional_id, professional_name,
      scheduled_date, start_time, end_time,
      procedure_name, consult_type, eval_type,
      value, payment_method, payment_status,
      status, origem, obs, consentimento_img,
      recurrence_group_id, recurrence_index, recurrence_total,
      recurrence_procedure, recurrence_interval_days
    ) VALUES (
      v_id_final, p_clinic_id, v_lead_id, v_patient_id,
      v_subject_name, v_subject_phone,
      v_professional_id, v_professional_name,
      v_scheduled_date, v_start_time, v_end_time,
      v_procedure_name, v_consult_type, v_eval_type,
      v_value, v_payment_method, v_payment_status,
      v_status, v_origem, v_obs, v_consentimento_img,
      v_recurrence_group_id, v_recurrence_index, v_recurrence_total,
      v_recurrence_procedure, v_recurrence_interval_days
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id_final,
    'id_remapped', v_id_remapped,
    'id_legacy_input', v_id_legacy_input,
    'action', CASE WHEN v_existing_id IS NOT NULL THEN 'updated' ELSE 'inserted' END
  );
END $$;

COMMENT ON FUNCTION public._appt_upsert_one(jsonb, uuid) IS
  'Helper interno · normaliza payload legacy camelCase pt-br para schema canon de appointments. Não exposto via grants externos (apenas chamado por appt_upsert e appt_sync_batch).';

-- Helper interno · revogar EXECUTE de todos os roles externos.
-- Como public._appt_upsert_one é SECURITY DEFINER e roda o mesmo código que
-- appt_upsert, deixar PUBLIC/anon/authenticated com EXECUTE não adiciona
-- nenhum vetor (a função externa já é callable), mas a higiene exige que
-- helper interno permaneça invisível a clientes diretos.
REVOKE EXECUTE ON FUNCTION public._appt_upsert_one(jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._appt_upsert_one(jsonb, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public._appt_upsert_one(jsonb, uuid) FROM authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. public.appt_upsert(jsonb) · entrypoint cliente legacy
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.appt_upsert(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  RETURN public._appt_upsert_one(p_data, v_clinic_id);
END $$;

COMMENT ON FUNCTION public.appt_upsert(jsonb) IS
  'Legacy writer canônico · aceita payload camelCase pt-br do legacy JS e grava no schema canon (subject_name/subject_phone/professional_id). Retorna { ok, id, id_remapped, id_legacy_input, action } ou { ok:false, error:''...'' }. Lara v2 TS usa lead_to_appointment, NÃO esta função.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. public.appt_sync_batch(p_appointments jsonb) · batch drain legacy
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.appt_sync_batch(p_appointments jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id     uuid;
  v_item          jsonb;
  v_result        jsonb;
  v_idx           integer := 0;
  v_processed     integer := 0;
  v_success       integer := 0;
  v_errors        integer := 0;
  v_remapped      integer := 0;
  v_errors_arr    jsonb   := '[]'::jsonb;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;
  IF p_appointments IS NULL OR jsonb_typeof(p_appointments) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload_expected_array');
  END IF;

  FOR v_item IN SELECT jsonb_array_elements(p_appointments)
  LOOP
    v_processed := v_processed + 1;
    BEGIN
      v_result := public._appt_upsert_one(v_item, v_clinic_id);
    EXCEPTION WHEN OTHERS THEN
      v_result := jsonb_build_object('ok', false, 'error', 'exception', 'detail', SQLERRM);
    END;

    IF (v_result->>'ok')::boolean IS TRUE THEN
      v_success := v_success + 1;
      IF COALESCE((v_result->>'id_remapped')::boolean, false) THEN
        v_remapped := v_remapped + 1;
      END IF;
    ELSE
      v_errors := v_errors + 1;
      IF jsonb_array_length(v_errors_arr) < 20 THEN
        v_errors_arr := v_errors_arr || jsonb_build_array(
          jsonb_build_object(
            'index', v_idx,
            'legacy_id', v_item->>'id',
            'error', v_result->>'error',
            'result', v_result
          )
        );
      END IF;
    END IF;

    v_idx := v_idx + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'processed_count', v_processed,
    'success_count', v_success,
    'error_count', v_errors,
    'remapped_count', v_remapped,
    'errors', v_errors_arr
  );
END $$;

COMMENT ON FUNCTION public.appt_sync_batch(jsonb) IS
  'Legacy batch drainer · itera array e chama _appt_upsert_one por item. Continua em erro individual · retorna agregados + até 20 erros detalhados. Usado pelo auto-sync one-shot do legacy (agenda-smart.js).';

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY CHECK (DO block · dentro da transação · aborta apply se faltar)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='appt_upsert'
  ) THEN
    RAISE EXCEPTION 'sanity: appt_upsert nao existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='appt_sync_batch'
  ) THEN
    RAISE EXCEPTION 'sanity: appt_sync_batch nao existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='_appt_upsert_one'
  ) THEN
    RAISE EXCEPTION 'sanity: _appt_upsert_one nao existe';
  END IF;
  RAISE NOTICE 'mig 153 · appt_upsert + appt_sync_batch recriados canon';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
