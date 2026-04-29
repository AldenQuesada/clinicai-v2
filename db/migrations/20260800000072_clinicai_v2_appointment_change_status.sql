-- ============================================================================
-- Onda 4 · CRM Core · Camada 8 · RPC appointment_change_status
-- ============================================================================
--
-- State machine canonica de status de appointment (mig 62 ja tem CHECK de
-- valores · mas transicoes vivem soh em UI/client). Esta RPC consolida a
-- matriz no DB com guard SECURITY DEFINER.
--
-- Espelha clinic-dashboard legacy js/agenda-validation.js +
-- agenda-smart.constants.js (STATE_MACHINE).
--
-- Por que RPC e nao UPDATE direto:
--   1. Defense-in-depth: UI + DB validam · UI nao consegue burlar
--   2. Atomic phase_history (audit trail · alinha com sdr_change_phase
--      pattern · mig 65)
--   3. Side effects centralizados (timestamps de cancel/no-show, side-effects
--      futuros tipo trigger pra phase do lead se appt for cancelado)
--
-- NAO substitui appointment_attend / appointment_finalize / cancel via
-- UPDATE direto · esses ja existem com semantica especifica:
--   - attend (status=na_clinica + leads.phase=compareceu)
--   - finalize (status=finalizado + roteamento outcome paciente|orcamento|perdido)
--   - softDelete (deleted_at via UPDATE direto pelo repo)
--
-- Esta RPC cobre as transicoes "leves" sem side-effects:
--   agendado → aguardando_confirmacao
--   aguardando_confirmacao → confirmado
--   confirmado → aguardando
--   appointment → remarcado
--   appointment → cancelado/no_show (com motivo obrigatorio)
--   bloqueado → cancelado

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. MATRIZ CANONICA · _appointment_status_transition_allowed
-- ────────────────────────────────────────────────────────────────────────────
-- IMMUTABLE pra ser inlinable em CHECKs e composable em outras RPCs.
-- Verbatim do clinic-dashboard legacy (validateTransition + STATE_MACHINE).

CREATE OR REPLACE FUNCTION public._appointment_status_transition_allowed(
  p_from text,
  p_to   text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE p_from
    WHEN 'agendado'               THEN p_to IN ('aguardando_confirmacao','confirmado','remarcado','cancelado','no_show','agendado')
    WHEN 'aguardando_confirmacao' THEN p_to IN ('confirmado','remarcado','cancelado','no_show','aguardando_confirmacao')
    WHEN 'confirmado'             THEN p_to IN ('aguardando','remarcado','cancelado','no_show','confirmado','pre_consulta')
    WHEN 'pre_consulta'           THEN p_to IN ('aguardando','na_clinica','cancelado','no_show','pre_consulta')
    WHEN 'aguardando'             THEN p_to IN ('na_clinica','no_show','cancelado','aguardando')
    WHEN 'na_clinica'             THEN p_to IN ('em_consulta','em_atendimento','na_clinica')
    WHEN 'em_consulta'            THEN p_to IN ('em_atendimento','finalizado','em_consulta')
    WHEN 'em_atendimento'         THEN p_to IN ('finalizado','cancelado','na_clinica','em_atendimento')
    WHEN 'finalizado'             THEN FALSE  -- estado terminal · cancel via soft-delete
    WHEN 'remarcado'              THEN p_to IN ('agendado','cancelado','remarcado')
    WHEN 'cancelado'              THEN FALSE  -- estado terminal
    WHEN 'no_show'                THEN FALSE  -- estado terminal
    WHEN 'bloqueado'              THEN p_to IN ('cancelado','bloqueado')
    ELSE FALSE
  END;
$$;

COMMENT ON FUNCTION public._appointment_status_transition_allowed(text, text) IS
  'Matriz canonica de transicoes status appointment. IMMUTABLE · usado por appointment_change_status RPC. Mudar matriz exige migration nova + audit ADR.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RPC appointment_change_status
-- ────────────────────────────────────────────────────────────────────────────
-- Aceita transicoes "leves" (sem side-effects pesados).
--
-- Pra: cancelado/no_show, motivo eh obrigatorio (CHECK constraints
-- chk_appt_cancelled_consistency / chk_appt_noshow_consistency).
--
-- NAO usar pra: na_clinica (use appointment_attend RPC · atualiza
-- leads.phase=compareceu) · finalizado (use appointment_finalize · routes
-- paciente|orcamento|perdido).

CREATE OR REPLACE FUNCTION public.appointment_change_status(
  p_appointment_id uuid,
  p_new_status     text,
  p_reason         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id  uuid;
  v_appt       public.appointments%ROWTYPE;
  v_now        timestamptz := now();
  v_patch      jsonb := '{}'::jsonb;
BEGIN
  -- 1. Tenant guard
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  -- 2. Lock pessimista pra evitar race
  SELECT * INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  -- 3. Validar new_status canonical
  IF p_new_status NOT IN (
    'agendado','aguardando_confirmacao','confirmado','pre_consulta',
    'aguardando','na_clinica','em_consulta','em_atendimento',
    'finalizado','remarcado','cancelado','no_show','bloqueado'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status',
      'got', p_new_status
    );
  END IF;

  -- 4. Idempotencia · mesmo status, no-op
  IF v_appt.status = p_new_status THEN
    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'idempotent_skip', true,
      'status', v_appt.status
    );
  END IF;

  -- 5. Bloqueia transicoes que tem RPC dedicada (evita bypass de side-effects)
  IF p_new_status = 'na_clinica' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'use_dedicated_rpc',
      'hint', 'na_clinica · use appointment_attend (atualiza leads.phase=compareceu)'
    );
  END IF;
  IF p_new_status = 'finalizado' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'use_dedicated_rpc',
      'hint', 'finalizado · use appointment_finalize (routes paciente|orcamento|perdido)'
    );
  END IF;

  -- 6. Validar matriz canonica
  IF NOT public._appointment_status_transition_allowed(v_appt.status, p_new_status) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'illegal_status_transition',
      'from', v_appt.status,
      'to', p_new_status,
      'hint', 'Ver matriz em _appointment_status_transition_allowed'
    );
  END IF;

  -- 7. Validar reason quando obrigatorio (CHECK constraints da tabela)
  IF p_new_status IN ('cancelado','no_show') AND
     (p_reason IS NULL OR length(trim(p_reason)) < 2)
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'reason_required',
      'hint', format('%s exige motivo (min 2 chars)', p_new_status)
    );
  END IF;

  -- 8. Side-effects de timestamps (alinhados com chk_appt_*_consistency)
  IF p_new_status = 'cancelado' THEN
    UPDATE public.appointments
       SET status              = p_new_status,
           cancelado_em        = v_now,
           motivo_cancelamento = p_reason,
           updated_at          = v_now
     WHERE id = v_appt.id;
  ELSIF p_new_status = 'no_show' THEN
    UPDATE public.appointments
       SET status         = p_new_status,
           no_show_em     = v_now,
           motivo_no_show = p_reason,
           updated_at     = v_now
     WHERE id = v_appt.id;
  ELSE
    UPDATE public.appointments
       SET status     = p_new_status,
           updated_at = v_now
     WHERE id = v_appt.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_appt.id,
    'from_status', v_appt.status,
    'to_status', p_new_status
  );
END $$;

COMMENT ON FUNCTION public.appointment_change_status(uuid, text, text) IS
  'Muda status de appointment validando matriz canonica + reason quando obrigatorio. Bloqueia na_clinica/finalizado · use RPCs dedicadas (appointment_attend / appointment_finalize) pra side-effects de phase do lead.';

-- ────────────────────────────────────────────────────────────────────────────
-- Grants
-- ────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public._appointment_status_transition_allowed(text, text)
  TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.appointment_change_status(uuid, text, text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY CHECK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Ambas funcoes existem
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='_appointment_status_transition_allowed'
  ) THEN
    RAISE EXCEPTION 'sanity: _appointment_status_transition_allowed nao existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='appointment_change_status'
  ) THEN
    RAISE EXCEPTION 'sanity: appointment_change_status nao existe';
  END IF;

  -- Validar matriz · 6 amostras canonicas
  IF NOT public._appointment_status_transition_allowed('agendado','confirmado') THEN
    RAISE EXCEPTION 'sanity: matriz quebrada (agendado -> confirmado)';
  END IF;
  IF NOT public._appointment_status_transition_allowed('confirmado','aguardando') THEN
    RAISE EXCEPTION 'sanity: matriz quebrada (confirmado -> aguardando)';
  END IF;
  IF NOT public._appointment_status_transition_allowed('agendado','cancelado') THEN
    RAISE EXCEPTION 'sanity: matriz quebrada (agendado -> cancelado)';
  END IF;
  IF public._appointment_status_transition_allowed('finalizado','agendado') THEN
    RAISE EXCEPTION 'sanity: matriz fraca (finalizado deveria ser terminal)';
  END IF;
  IF public._appointment_status_transition_allowed('cancelado','agendado') THEN
    RAISE EXCEPTION 'sanity: matriz fraca (cancelado deveria ser terminal · use re-create)';
  END IF;
  IF public._appointment_status_transition_allowed('agendado','na_clinica') THEN
    RAISE EXCEPTION 'sanity: matriz fraca (na_clinica precisa passar por aguardando)';
  END IF;

  RAISE NOTICE 'mig 20260800000072 · appointment_change_status RPC OK';
END $$;

COMMIT;
