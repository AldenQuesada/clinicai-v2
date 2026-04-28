-- ============================================================================
-- Onda 4 · CRM Core · 8 RPCs canonicas + state machine endurecida
-- ============================================================================
--
-- Auditoria 2026-04-27 flagou:
--  - Legado tem ~30 RPCs SDR/CRM com naming inconsistente
--    (sdr_change_phase, lead_to_paciente, lead_to_orcamento,
--     lead_to_perdidos, leads_upsert, sdr_init_lead_pipelines, ...)
--  - State machine validada por _lead_phase_transition_allowed (mig 828
--    legado) · vamos preservar VERBATIM aqui (matriz e contrato).
--  - Helper _sdr_clinic_id duplicado · so app_clinic_id() agora.
--  - Trigger _auto_move_lead_to_target_table reescreve phase apos UPDATE
--    em loop · removido. Mig 60/61/62/63 NAO criam esse trigger. Em vez
--    disso, RPCs publicas sao a UNICA porta de entrada.
--
-- 8 RPCs canonicas (SECURITY DEFINER + search_path lockdown):
--
--   1. lead_create()          — entrada principal (B2B/VPI/webhook/manual)
--   2. lead_to_appointment()  — cria appt + phase=agendado
--   3. appointment_attend()   — paciente chegou (status=na_clinica + phase=compareceu)
--   4. appointment_finalize() — outcome decide proximo estado (paciente|orcamento|perdido)
--   5. lead_to_paciente()     — promove pra patients (exige phase=compareceu)
--   6. lead_to_orcamento()    — emite orcamento (exige phase=compareceu)
--   7. lead_lost()            — marca perdido (reason obrigatorio)
--   8. sdr_change_phase()     — wrapper generico (matriz canonica)
--
-- Plus utility:
--   _lead_phase_transition_allowed(from, to)  IMMUTABLE  (matriz canonica)
--
-- TODAS validam:
--   - clinic_id = app_clinic_id() (refusa cross-tenant · 403-equiv)
--   - lead/appt/orcamento existe e nao-deletado
--   - transicao valida (matriz)
--   - reason obrigatorio se perdido
--   - idempotencia onde aplicavel
--
-- Dependencias: leads (mig 60), patients (mig 61), appointments (mig 62),
--               orcamentos (mig 63), phase_history (mig 64).
--
-- ADR-029 RLS strategy + GOLD-STANDARD §SQL.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 0. MATRIZ CANONICA · _lead_phase_transition_allowed
-- ────────────────────────────────────────────────────────────────────────────
-- IMMUTABLE pra ser inlinable em CHECKs e composable em outras RPCs.
-- Verbatim do legado (mig 828 · src verificado em /tmp/audit-deep-results.json).

CREATE OR REPLACE FUNCTION public._lead_phase_transition_allowed(
  p_from text,
  p_to   text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE p_from
    WHEN 'lead'       THEN p_to IN ('agendado', 'perdido')
    -- Agendado: pode virar reagendado (data mudou), compareceu (chegou),
    -- perdido (cancelou), agendado (no-op).
    WHEN 'agendado'   THEN p_to IN ('reagendado', 'compareceu', 'perdido', 'agendado')
    WHEN 'reagendado' THEN p_to IN ('agendado', 'compareceu', 'perdido', 'reagendado')
    -- Compareceu decide destino no modal de finalizacao.
    WHEN 'compareceu' THEN p_to IN ('paciente', 'orcamento', 'perdido', 'compareceu')
    -- Orcamento: aceitou (paciente), nova consulta (agendado), recusou (perdido).
    WHEN 'orcamento'  THEN p_to IN ('paciente', 'agendado', 'perdido', 'orcamento')
    -- Paciente: so vai a perdido em casos raros (faleceu / pediu opt-out).
    -- Nova consulta = novo appointment, lead.phase fica 'paciente'.
    WHEN 'paciente'   THEN p_to IN ('perdido', 'paciente')
    -- Perdido: recuperacao manual volta pra lead/agendado/reagendado.
    WHEN 'perdido'    THEN p_to IN ('lead', 'agendado', 'reagendado', 'perdido')
    ELSE FALSE
  END;
$$;

COMMENT ON FUNCTION public._lead_phase_transition_allowed(text, text) IS
  'Matriz canonica de transicoes phase. IMMUTABLE · usado por TODAS RPCs antes de UPDATE leads.phase. Mudar matriz exige migration nova + audit ADR.';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. lead_create() · entrada principal
-- ────────────────────────────────────────────────────────────────────────────
-- Chamada por:
--   - UI manual (Server Action /leads/new)
--   - Webhook Lara (apos primeira mensagem)
--   - B2B voucher emitido (vincula lead ao voucher_id em metadata)
--   - VPI referral (vincula lead ao partner_session_id em metadata)
--   - Quiz/Landing page submit
--
-- Idempotencia: dedup por (clinic_id, phone). Se lead ja existe e nao-deletado,
-- retorna o id existente (e atualiza source_meta se enriquece). Se existe
-- soft-deleted, "ressucita" (deleted_at=NULL, phase='lead').

CREATE OR REPLACE FUNCTION public.lead_create(
  p_phone        text,
  p_name         text         DEFAULT NULL,
  p_source       text         DEFAULT 'manual',
  p_source_type  text         DEFAULT 'manual',
  p_funnel       text         DEFAULT 'procedimentos',
  p_email        text         DEFAULT NULL,
  p_metadata     jsonb        DEFAULT '{}'::jsonb,
  p_assigned_to  uuid         DEFAULT NULL,
  p_temperature  text         DEFAULT 'warm'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid;
  v_lead_id   uuid;
  v_existing  public.leads%ROWTYPE;
  v_phone     text;
BEGIN
  -- 1.1 Tenant guard
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  -- 1.2 Validacao basica
  IF p_phone IS NULL OR length(trim(p_phone)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_required');
  END IF;
  v_phone := regexp_replace(trim(p_phone), '[^0-9+]', '', 'g');

  -- 1.3 Dedup por (clinic_id, phone)
  SELECT * INTO v_existing
    FROM public.leads
   WHERE clinic_id = v_clinic_id
     AND phone     = v_phone
   LIMIT 1;

  IF FOUND THEN
    -- 1.3.a Existe e ativo: enriquece metadata, retorna id
    IF v_existing.deleted_at IS NULL THEN
      UPDATE public.leads
         SET name        = COALESCE(NULLIF(p_name,''), name),
             email       = COALESCE(NULLIF(p_email,''), email),
             metadata    = metadata || COALESCE(p_metadata, '{}'::jsonb),
             updated_at  = now()
       WHERE id = v_existing.id;
      RETURN jsonb_build_object(
        'ok', true,
        'lead_id', v_existing.id,
        'existed', true,
        'phase', v_existing.phase
      );
    END IF;

    -- 1.3.b Existe mas soft-deleted (foi paciente/orcamento antes):
    -- NAO ressucitar automaticamente · isso quebra o modelo excludente.
    -- Caller deve usar lead_create_force_resurrect (futuro) ou criar
    -- um novo lead com phone normalizado de forma diferente.
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'lead_softdeleted_exists',
      'hint', 'Lead com este phone ja foi promovido a paciente/orcamento. Verificar patients/orcamentos pelo UUID.',
      'existing_id', v_existing.id,
      'existing_phase', v_existing.phase
    );
  END IF;

  -- 1.4 Insert novo
  INSERT INTO public.leads (
    clinic_id, name, phone, email,
    source, source_type, funnel, temperature,
    assigned_to, metadata, phase, phase_origin, phase_updated_at, phase_updated_by
  ) VALUES (
    v_clinic_id,
    COALESCE(NULLIF(p_name,''), ''),
    v_phone,
    NULLIF(p_email,''),
    p_source,
    p_source_type,
    p_funnel,
    p_temperature,
    p_assigned_to,
    COALESCE(p_metadata, '{}'::jsonb),
    'lead',
    'rpc',
    now(),
    auth.uid()
  )
  RETURNING id INTO v_lead_id;

  -- 1.5 Audit em phase_history (criacao = transicao NULL → lead)
  INSERT INTO public.phase_history (
    clinic_id, lead_id, from_phase, to_phase, origin, triggered_by, actor_id, reason
  ) VALUES (
    v_clinic_id, v_lead_id, NULL, 'lead', 'rpc',
    'rpc:lead_create',
    auth.uid(),
    p_source
  );

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', v_lead_id,
    'existed', false,
    'phase', 'lead'
  );
END $$;

COMMENT ON FUNCTION public.lead_create(text,text,text,text,text,text,jsonb,uuid,text) IS
  'Entrada principal de leads. Idempotente por (clinic_id, phone). Falha explicita se phone bate com lead soft-deleted (modelo excludente). Chamada por UI, B2B voucher, VPI referral, Lara webhook, quiz.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. lead_to_appointment() · cria appointment + phase=agendado
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lead_to_appointment(
  p_lead_id          uuid,
  p_scheduled_date   date,
  p_start_time       time,
  p_end_time         time,
  p_professional_id  uuid         DEFAULT NULL,
  p_professional_name text        DEFAULT '',
  p_procedure_name   text         DEFAULT '',
  p_consult_type     text         DEFAULT NULL,
  p_eval_type        text         DEFAULT NULL,
  p_value            numeric      DEFAULT 0,
  p_origem           text         DEFAULT 'manual',
  p_obs              text         DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id  uuid;
  v_lead       public.leads%ROWTYPE;
  v_appt_id    uuid;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  -- Lock pessimista pra evitar race com outro caller mudando phase
  SELECT * INTO v_lead
    FROM public.leads
   WHERE id = p_lead_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_not_found');
  END IF;

  -- Validar matriz: lead/reagendado/orcamento/perdido podem virar agendado
  IF NOT public._lead_phase_transition_allowed(v_lead.phase, 'agendado') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'illegal_phase_transition',
      'from', v_lead.phase,
      'to', 'agendado'
    );
  END IF;

  -- 2.1 Cria appointment (lead_id setado · patient_id NULL · CHECK XOR ok)
  INSERT INTO public.appointments (
    clinic_id, lead_id, patient_id,
    subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, consult_type, eval_type,
    value, payment_status, status, origem, obs
  ) VALUES (
    v_clinic_id,
    v_lead.id, NULL,
    COALESCE(v_lead.name, ''),
    v_lead.phone,
    p_professional_id,
    COALESCE(p_professional_name, ''),
    p_scheduled_date, p_start_time, p_end_time,
    COALESCE(p_procedure_name, ''),
    p_consult_type, p_eval_type,
    COALESCE(p_value, 0),
    'pendente', 'agendado',
    COALESCE(p_origem, 'manual'),
    p_obs
  )
  RETURNING id INTO v_appt_id;

  -- 2.2 Atualiza lead.phase=agendado (se ja nao estava)
  IF v_lead.phase <> 'agendado' THEN
    UPDATE public.leads
       SET phase            = 'agendado',
           phase_updated_at = now(),
           phase_updated_by = auth.uid(),
           phase_origin     = 'auto_transition',
           is_in_recovery   = CASE WHEN v_lead.phase = 'perdido' THEN true ELSE is_in_recovery END,
           updated_at       = now()
     WHERE id = v_lead.id;

    INSERT INTO public.phase_history (
      clinic_id, lead_id, from_phase, to_phase, origin, triggered_by, actor_id, reason
    ) VALUES (
      v_clinic_id, v_lead.id, v_lead.phase, 'agendado', 'auto_transition',
      'rpc:lead_to_appointment', auth.uid(),
      'appointment_id=' || v_appt_id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_appt_id,
    'lead_id', v_lead.id,
    'lead_phase_after', 'agendado'
  );
END $$;

COMMENT ON FUNCTION public.lead_to_appointment(uuid,date,time,time,uuid,text,text,text,text,numeric,text,text) IS
  'Cria appointment + atualiza leads.phase=agendado em transacao atomica. Valida matriz canonica. SELECT FOR UPDATE protege race condition.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. appointment_attend() · paciente chegou e foi atendido
-- ────────────────────────────────────────────────────────────────────────────
-- Marca status=na_clinica E atualiza leads.phase=compareceu.
-- Idempotente: chamar 2x nao duplica historico (so atualiza chegada_em
-- na primeira vez).

CREATE OR REPLACE FUNCTION public.appointment_attend(
  p_appointment_id uuid,
  p_chegada_em     timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id  uuid;
  v_appt       public.appointments%ROWTYPE;
  v_lead       public.leads%ROWTYPE;
  v_already    boolean := false;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  SELECT * INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  -- Idempotente: se ja esta na_clinica/em_consulta/em_atendimento/finalizado,
  -- nao reseta chegada_em.
  IF v_appt.status IN ('na_clinica','em_consulta','em_atendimento','finalizado') THEN
    v_already := true;
  END IF;

  -- Validar status atual permite attend (NAO permitido se cancelado/no_show/bloqueado)
  IF v_appt.status IN ('cancelado','no_show','bloqueado') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status_for_attend',
      'current_status', v_appt.status
    );
  END IF;

  -- 3.1 Atualiza appointment
  IF NOT v_already THEN
    UPDATE public.appointments
       SET status      = 'na_clinica',
           chegada_em  = COALESCE(p_chegada_em, now()),
           updated_at  = now()
     WHERE id = v_appt.id;
  END IF;

  -- 3.2 Atualiza lead.phase=compareceu (se appt tem lead vinculado)
  IF v_appt.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead
      FROM public.leads
     WHERE id = v_appt.lead_id AND clinic_id = v_clinic_id
     FOR UPDATE;

    IF FOUND AND v_lead.deleted_at IS NULL
       AND v_lead.phase <> 'compareceu'
       AND public._lead_phase_transition_allowed(v_lead.phase, 'compareceu')
    THEN
      UPDATE public.leads
         SET phase            = 'compareceu',
             phase_updated_at = now(),
             phase_updated_by = auth.uid(),
             phase_origin     = 'auto_transition',
             updated_at       = now()
       WHERE id = v_lead.id;

      INSERT INTO public.phase_history (
        clinic_id, lead_id, from_phase, to_phase, origin, triggered_by, actor_id, reason
      ) VALUES (
        v_clinic_id, v_lead.id, v_lead.phase, 'compareceu', 'auto_transition',
        'rpc:appointment_attend', auth.uid(),
        'appointment_id=' || v_appt.id::text
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_appt.id,
    'idempotent_skip', v_already,
    'status_after', CASE WHEN v_already THEN v_appt.status ELSE 'na_clinica' END
  );
END $$;

COMMENT ON FUNCTION public.appointment_attend(uuid,timestamptz) IS
  'Marca paciente chegou (status=na_clinica) + atualiza leads.phase=compareceu. Idempotente. Bloqueia se appt esta cancelado/no_show/bloqueado.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. appointment_finalize() · outcome roteia pra paciente|orcamento|perdido
-- ────────────────────────────────────────────────────────────────────────────
-- Modal de finalizacao da consulta. Decide proximo estado do lead.
--   outcome = 'paciente'  → chama lead_to_paciente() internamente
--   outcome = 'orcamento' → chama lead_to_orcamento() internamente
--   outcome = 'perdido'   → chama lead_lost() internamente (reason obrigatorio)
--   outcome = 'agendado'  → marca appt finalizado + cria proximo appt
--                            (cliente faz isso em 2 calls: finalize + lead_to_appointment)
--
-- Em todos: appointment.status='finalizado'.

CREATE OR REPLACE FUNCTION public.appointment_finalize(
  p_appointment_id uuid,
  p_outcome        text,
  p_value          numeric      DEFAULT NULL,
  p_payment_status text         DEFAULT NULL,
  p_notes          text         DEFAULT NULL,
  p_lost_reason    text         DEFAULT NULL,
  p_orcamento_items jsonb       DEFAULT NULL,
  p_orcamento_subtotal numeric  DEFAULT NULL,
  p_orcamento_discount numeric  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id   uuid;
  v_appt        public.appointments%ROWTYPE;
  v_lead_id     uuid;
  v_sub_call    jsonb;
  v_orc_total   numeric(12,2);
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  IF p_outcome IS NULL OR p_outcome NOT IN ('paciente','orcamento','perdido') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_outcome',
      'hint', 'outcome deve ser paciente|orcamento|perdido'
    );
  END IF;

  IF p_outcome = 'perdido' AND (p_lost_reason IS NULL OR length(trim(p_lost_reason)) = 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lost_reason_required');
  END IF;

  IF p_outcome = 'orcamento' AND (p_orcamento_subtotal IS NULL OR p_orcamento_items IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'orcamento_items_and_subtotal_required');
  END IF;

  SELECT * INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  IF v_appt.status NOT IN ('na_clinica','em_consulta','em_atendimento','finalizado') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status_for_finalize',
      'current_status', v_appt.status,
      'hint', 'Chame appointment_attend primeiro'
    );
  END IF;

  v_lead_id := v_appt.lead_id;
  IF v_lead_id IS NULL THEN
    -- Pode ser appt de paciente recorrente (patient_id setado, sem lead).
    -- Nesse caso so finaliza appt sem promover lead (paciente ja existe).
    UPDATE public.appointments
       SET status         = 'finalizado',
           value          = COALESCE(p_value, value),
           payment_status = COALESCE(p_payment_status, payment_status),
           obs            = COALESCE(p_notes, obs),
           updated_at     = now()
     WHERE id = v_appt.id;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'lead_id', NULL,
      'outcome', p_outcome,
      'note', 'patient_appointment_no_lead_promotion'
    );
  END IF;

  -- 4.1 Finaliza appointment
  UPDATE public.appointments
     SET status         = 'finalizado',
         value          = COALESCE(p_value, value),
         payment_status = COALESCE(p_payment_status, payment_status),
         obs            = COALESCE(p_notes, obs),
         updated_at     = now()
   WHERE id = v_appt.id;

  -- 4.2 Roteamento por outcome (cada sub-RPC valida matriz por sua conta)
  CASE p_outcome
    WHEN 'paciente' THEN
      v_sub_call := public.lead_to_paciente(
        p_lead_id      := v_lead_id,
        p_total_revenue := COALESCE(p_value, v_appt.value),
        p_first_at     := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
        p_last_at      := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
        p_notes        := p_notes
      );

    WHEN 'orcamento' THEN
      v_orc_total := GREATEST(0, p_orcamento_subtotal - COALESCE(p_orcamento_discount, 0));
      v_sub_call := public.lead_to_orcamento(
        p_lead_id   := v_lead_id,
        p_subtotal  := p_orcamento_subtotal,
        p_discount  := COALESCE(p_orcamento_discount, 0),
        p_items     := p_orcamento_items,
        p_notes     := p_notes
      );

    WHEN 'perdido' THEN
      v_sub_call := public.lead_lost(
        p_lead_id := v_lead_id,
        p_reason  := p_lost_reason
      );
  END CASE;

  IF v_sub_call IS NOT NULL AND (v_sub_call->>'ok')::boolean = false THEN
    -- Reverte appt? Nao · finalizado e estado terminal valido.
    -- Retorna erro pra UI tratar (orcamento/paciente/perdido nao executou).
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'sub_rpc_failed',
      'appointment_finalized', true,
      'sub_call', v_sub_call
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_appt.id,
    'lead_id', v_lead_id,
    'outcome', p_outcome,
    'sub_call', v_sub_call
  );
END $$;

COMMENT ON FUNCTION public.appointment_finalize(uuid,text,numeric,text,text,text,jsonb,numeric,numeric) IS
  'Finaliza appointment e roteia outcome (paciente|orcamento|perdido) chamando lead_to_paciente/lead_to_orcamento/lead_lost. Atomico no appt; sub-RPC pode falhar e UI deve tratar.';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. lead_to_paciente() · promove lead pra patients (ADR-001)
-- ────────────────────────────────────────────────────────────────────────────
-- Pre-condicao: lead.phase = 'compareceu' (ou paciente · idempotente).
-- Acao: INSERT patients (mesmo UUID) · UPDATE leads.deleted_at + phase
-- Side-effect: appointments com lead_id=p_lead_id sao remapeados pra
-- patient_id=p_lead_id (mesmo UUID).

CREATE OR REPLACE FUNCTION public.lead_to_paciente(
  p_lead_id        uuid,
  p_total_revenue  numeric      DEFAULT NULL,
  p_first_at       timestamptz  DEFAULT NULL,
  p_last_at        timestamptz  DEFAULT NULL,
  p_notes          text         DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id  uuid;
  v_lead       public.leads%ROWTYPE;
  v_already    boolean := false;
  v_appt_count int;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  SELECT * INTO v_lead
    FROM public.leads
   WHERE id = p_lead_id
     AND clinic_id = v_clinic_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_not_found');
  END IF;

  -- Idempotencia: se ja existe em patients (mesmo UUID), so atualiza agregados
  IF EXISTS (SELECT 1 FROM public.patients WHERE id = p_lead_id AND clinic_id = v_clinic_id) THEN
    v_already := true;
  END IF;

  IF NOT v_already THEN
    -- Pre-condicao: phase=compareceu (modelo excludente forte, ADR-001)
    IF v_lead.phase <> 'compareceu' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'illegal_transition',
        'from_phase', v_lead.phase,
        'hint', 'lead_to_paciente exige phase=compareceu (passe por appointment_attend antes)'
      );
    END IF;

    -- 5.1 Insert patient (mesmo UUID)
    INSERT INTO public.patients (
      id, clinic_id, name, phone, email,
      cpf, rg, birth_date,
      assigned_to, status, notes,
      total_procedures, total_revenue,
      first_procedure_at, last_procedure_at,
      source_lead_phase_at, source_lead_meta
    ) VALUES (
      v_lead.id, v_clinic_id,
      v_lead.name, v_lead.phone, v_lead.email,
      v_lead.cpf, v_lead.rg, v_lead.birth_date,
      v_lead.assigned_to, 'active', p_notes,
      0, COALESCE(p_total_revenue, 0),
      p_first_at, p_last_at,
      v_lead.phase_updated_at,
      jsonb_build_object(
        'source', v_lead.source,
        'source_type', v_lead.source_type,
        'funnel', v_lead.funnel,
        'temperature', v_lead.temperature,
        'metadata', v_lead.metadata
      )
    );
  ELSE
    -- 5.1.b idempotente: atualiza agregados se vieram
    UPDATE public.patients
       SET total_revenue      = COALESCE(p_total_revenue, total_revenue),
           first_procedure_at = COALESCE(first_procedure_at, p_first_at),
           last_procedure_at  = GREATEST(last_procedure_at, p_last_at),
           notes              = COALESCE(p_notes, notes),
           updated_at         = now()
     WHERE id = p_lead_id;
  END IF;

  -- 5.2 Re-mapear appointments deste lead pra patient (mesmo UUID)
  --     Mantem chk_appt_subject_xor (lead_id NULL, patient_id setado)
  UPDATE public.appointments
     SET lead_id    = NULL,
         patient_id = p_lead_id,
         updated_at = now()
   WHERE clinic_id = v_clinic_id
     AND lead_id   = p_lead_id;
  GET DIAGNOSTICS v_appt_count = ROW_COUNT;

  -- 5.3 Re-mapear orcamentos deste lead pra patient (mesmo padrao)
  UPDATE public.orcamentos
     SET lead_id    = NULL,
         patient_id = p_lead_id,
         updated_at = now()
   WHERE clinic_id = v_clinic_id
     AND lead_id   = p_lead_id;

  -- 5.4 Soft-delete em leads + phase=paciente
  UPDATE public.leads
     SET phase            = 'paciente',
         phase_updated_at = now(),
         phase_updated_by = auth.uid(),
         phase_origin     = 'rpc',
         deleted_at       = COALESCE(deleted_at, now()),
         updated_at       = now()
   WHERE id = p_lead_id;

  -- 5.5 Audit
  IF NOT v_already THEN
    INSERT INTO public.phase_history (
      clinic_id, lead_id, from_phase, to_phase, origin, triggered_by, actor_id, reason
    ) VALUES (
      v_clinic_id, p_lead_id, v_lead.phase, 'paciente', 'rpc',
      'rpc:lead_to_paciente', auth.uid(),
      'patients_id=' || p_lead_id::text || ' appointments_remapped=' || v_appt_count::text
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'patient_id', p_lead_id,
    'lead_id', p_lead_id,
    'idempotent_skip', v_already,
    'appointments_remapped', v_appt_count
  );
END $$;

COMMENT ON FUNCTION public.lead_to_paciente(uuid,numeric,timestamptz,timestamptz,text) IS
  'Promove lead pra patients · UUID compartilhado · soft-delete em leads · re-mapeia appointments/orcamentos. Idempotente. Exige phase=compareceu.';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. lead_to_orcamento() · emite orcamento e marca lead.phase=orcamento
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lead_to_orcamento(
  p_lead_id   uuid,
  p_subtotal  numeric,
  p_items     jsonb,
  p_discount  numeric  DEFAULT 0,
  p_notes     text     DEFAULT NULL,
  p_title     text     DEFAULT NULL,
  p_valid_until date   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id   uuid;
  v_lead        public.leads%ROWTYPE;
  v_orc_id      uuid;
  v_total       numeric(12,2);
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  IF p_subtotal IS NULL OR p_subtotal < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_subtotal');
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_items', 'hint', 'Esperado jsonb array');
  END IF;

  SELECT * INTO v_lead
    FROM public.leads
   WHERE id = p_lead_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_not_found_or_deleted');
  END IF;

  IF v_lead.phase <> 'compareceu' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'illegal_transition',
      'from_phase', v_lead.phase,
      'hint', 'lead_to_orcamento exige phase=compareceu'
    );
  END IF;

  v_total := GREATEST(0, p_subtotal - COALESCE(p_discount, 0));

  -- 6.1 Cria orcamento (lead_id setado · patient_id NULL · CHECK XOR ok)
  INSERT INTO public.orcamentos (
    clinic_id, lead_id, patient_id,
    title, notes, items, subtotal, discount, total,
    status, valid_until, created_by
  ) VALUES (
    v_clinic_id, v_lead.id, NULL,
    p_title, p_notes, p_items,
    p_subtotal, COALESCE(p_discount, 0), v_total,
    'draft', p_valid_until, auth.uid()
  )
  RETURNING id INTO v_orc_id;

  -- 6.2 Soft-delete em leads + phase=orcamento (modelo excludente)
  UPDATE public.leads
     SET phase            = 'orcamento',
         phase_updated_at = now(),
         phase_updated_by = auth.uid(),
         phase_origin     = 'rpc',
         deleted_at       = COALESCE(deleted_at, now()),
         updated_at       = now()
   WHERE id = v_lead.id;

  -- 6.3 Audit
  INSERT INTO public.phase_history (
    clinic_id, lead_id, from_phase, to_phase, origin, triggered_by, actor_id, reason
  ) VALUES (
    v_clinic_id, v_lead.id, v_lead.phase, 'orcamento', 'rpc',
    'rpc:lead_to_orcamento', auth.uid(),
    'orcamento_id=' || v_orc_id::text
  );

  RETURN jsonb_build_object(
    'ok', true,
    'orcamento_id', v_orc_id,
    'lead_id', v_lead.id,
    'total', v_total
  );
END $$;

COMMENT ON FUNCTION public.lead_to_orcamento(uuid,numeric,jsonb,numeric,text,text,date) IS
  'Cria orcamento + soft-delete em leads + phase=orcamento. Exige phase=compareceu. Modelo excludente (orcamento.lead_id aponta pra lead soft-deleted).';

-- ────────────────────────────────────────────────────────────────────────────
-- 7. lead_lost() · marca lead perdido (reason obrigatorio)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lead_lost(
  p_lead_id uuid,
  p_reason  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid;
  v_lead      public.leads%ROWTYPE;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT * INTO v_lead
    FROM public.leads
   WHERE id = p_lead_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_not_found');
  END IF;

  IF NOT public._lead_phase_transition_allowed(v_lead.phase, 'perdido') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'illegal_phase_transition',
      'from', v_lead.phase, 'to', 'perdido'
    );
  END IF;

  -- Idempotencia: se ja perdido com mesmo motivo, nao-op (so atualiza ts)
  IF v_lead.phase = 'perdido' AND v_lead.lost_reason = p_reason THEN
    RETURN jsonb_build_object(
      'ok', true,
      'lead_id', v_lead.id,
      'idempotent_skip', true
    );
  END IF;

  UPDATE public.leads
     SET phase            = 'perdido',
         phase_updated_at = now(),
         phase_updated_by = auth.uid(),
         phase_origin     = 'rpc',
         lost_reason      = p_reason,
         lost_at          = now(),
         lost_by          = auth.uid(),
         updated_at       = now()
   WHERE id = v_lead.id;

  INSERT INTO public.phase_history (
    clinic_id, lead_id, from_phase, to_phase, origin, triggered_by, actor_id, reason
  ) VALUES (
    v_clinic_id, v_lead.id, v_lead.phase, 'perdido', 'rpc',
    'rpc:lead_lost', auth.uid(), p_reason
  );

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', v_lead.id,
    'phase_after', 'perdido'
  );
END $$;

COMMENT ON FUNCTION public.lead_lost(uuid, text) IS
  'Marca lead perdido. Reason obrigatorio (CHECK constraint chk_leads_lost_consistency tambem garante). Idempotente.';

-- ────────────────────────────────────────────────────────────────────────────
-- 8. sdr_change_phase() · wrapper generico (matriz canonica)
-- ────────────────────────────────────────────────────────────────────────────
-- Quando UI quer mudar phase manualmente (Kanban drag-drop, override admin).
-- Roteia pra RPC especializada quando aplicavel.

CREATE OR REPLACE FUNCTION public.sdr_change_phase(
  p_lead_id  uuid,
  p_to_phase text,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid;
  v_lead      public.leads%ROWTYPE;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  IF p_to_phase NOT IN ('lead','agendado','reagendado','compareceu','paciente','orcamento','perdido') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phase', 'to', p_to_phase);
  END IF;

  -- Roteamento: se vai pra paciente/orcamento/perdido, delega pra RPC especifica
  -- (que valida pre-condicoes e cria registros downstream).
  IF p_to_phase = 'perdido' THEN
    RETURN public.lead_lost(p_lead_id, COALESCE(p_reason, ''));
  END IF;

  IF p_to_phase = 'paciente' THEN
    -- Sem appointment_finalize · UI deve preencher dados via lead_to_paciente direto
    RETURN public.lead_to_paciente(p_lead_id, NULL, NULL, NULL, p_reason);
  END IF;

  IF p_to_phase = 'orcamento' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'use_lead_to_orcamento_directly',
      'hint', 'orcamento exige items+subtotal · use lead_to_orcamento(p_lead_id, p_subtotal, p_items, ...)'
    );
  END IF;

  -- Fases simples (lead/agendado/reagendado/compareceu): UPDATE direto
  SELECT * INTO v_lead
    FROM public.leads
   WHERE id = p_lead_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_not_found');
  END IF;

  IF NOT public._lead_phase_transition_allowed(v_lead.phase, p_to_phase) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'illegal_phase_transition',
      'from', v_lead.phase, 'to', p_to_phase,
      'hint', 'Ver matriz em _lead_phase_transition_allowed'
    );
  END IF;

  IF v_lead.phase = p_to_phase THEN
    RETURN jsonb_build_object('ok', true, 'lead_id', p_lead_id, 'idempotent_skip', true);
  END IF;

  UPDATE public.leads
     SET phase            = p_to_phase,
         phase_updated_at = now(),
         phase_updated_by = auth.uid(),
         phase_origin     = 'manual_override',
         is_in_recovery   = CASE WHEN v_lead.phase='perdido' AND p_to_phase<>'perdido' THEN true ELSE is_in_recovery END,
         updated_at       = now()
   WHERE id = p_lead_id;

  INSERT INTO public.phase_history (
    clinic_id, lead_id, from_phase, to_phase, origin, triggered_by, actor_id, reason
  ) VALUES (
    v_clinic_id, p_lead_id, v_lead.phase, p_to_phase, 'manual_override',
    'rpc:sdr_change_phase', auth.uid(), p_reason
  );

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', p_lead_id,
    'from_phase', v_lead.phase,
    'to_phase', p_to_phase
  );
END $$;

COMMENT ON FUNCTION public.sdr_change_phase(uuid, text, text) IS
  'Wrapper generico de mudanca de phase. Roteia pra lead_lost/lead_to_paciente quando aplicavel. Para fases simples (lead/agendado/reagendado/compareceu) faz UPDATE direto. orcamento exige RPC especifica (items+subtotal).';

-- ────────────────────────────────────────────────────────────────────────────
-- Grants das RPCs
-- ────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public._lead_phase_transition_allowed(text, text) TO authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION public.lead_create(text, text, text, text, text, text, jsonb, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lead_to_appointment(uuid, date, time, time, uuid, text, text, text, text, numeric, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.appointment_attend(uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.appointment_finalize(uuid, text, numeric, text, text, text, jsonb, numeric, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lead_to_paciente(uuid, numeric, timestamptz, timestamptz, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lead_to_orcamento(uuid, numeric, jsonb, numeric, text, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lead_lost(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sdr_change_phase(uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY CHECK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text;
BEGIN
  -- 8 RPCs canonicas + matriz devem existir
  FOR v_missing IN
    SELECT name FROM (VALUES
      ('_lead_phase_transition_allowed'),
      ('lead_create'),
      ('lead_to_appointment'),
      ('appointment_attend'),
      ('appointment_finalize'),
      ('lead_to_paciente'),
      ('lead_to_orcamento'),
      ('lead_lost'),
      ('sdr_change_phase')
    ) AS t(name)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname = t.name
    )
  LOOP
    RAISE EXCEPTION 'sanity: RPC % nao existe', v_missing;
  END LOOP;

  -- Validar matriz: as 7 fases canonicas
  IF NOT public._lead_phase_transition_allowed('lead', 'agendado') THEN
    RAISE EXCEPTION 'sanity: matriz quebrada (lead -> agendado)';
  END IF;
  IF NOT public._lead_phase_transition_allowed('compareceu', 'paciente') THEN
    RAISE EXCEPTION 'sanity: matriz quebrada (compareceu -> paciente)';
  END IF;
  IF NOT public._lead_phase_transition_allowed('perdido', 'lead') THEN
    RAISE EXCEPTION 'sanity: matriz quebrada (perdido -> lead recovery)';
  END IF;
  IF public._lead_phase_transition_allowed('lead', 'compareceu') THEN
    RAISE EXCEPTION 'sanity: matriz fraca (lead -> compareceu deveria ser FALSE)';
  END IF;
  IF public._lead_phase_transition_allowed('paciente', 'orcamento') THEN
    RAISE EXCEPTION 'sanity: matriz fraca (paciente -> orcamento deveria ser FALSE)';
  END IF;

  RAISE NOTICE 'mig 20260800000065 · 8 RPCs CRM core OK';
END $$;

COMMIT;
