-- ============================================================================
-- Migration 166 · clinicai-v2 · ANAMNESIS + INFORMED CONSENT (intra-consulta)
-- ============================================================================
--
-- Propósito (CRM_PHASE_2I):
--   Camada clínica enterprise INTRA-consulta · ficha + consentimento que a
--   Dra/profissional preenche durante o atendimento. ZERO WhatsApp · zero
--   provider externo · zero envio real. Worker 71 OFF preservado.
--
-- Diferenciação dos sistemas pré-existentes:
--   - `anamnesis_*` (anamnesis_templates/responses/requests · 13 tabelas):
--     fluxo PRÉ-consulta · paciente preenche via link público. Mantido intacto.
--   - `legal_doc_requests/signatures/templates` (31 templates ativos):
--     fluxo de assinatura formal · paciente assina via link público.
--     Mantido intacto.
--   - `appointments.consentimento_img` (enum pendente/assinado/...):
--     flag legacy · mantido intacto.
--   - `appointment_anamneses` (esta mig):
--     ficha clínica preenchida pelo PROFISSIONAL durante consulta.
--   - `appointment_informed_consents` (esta mig):
--     registro de aceite intra-consulta (signer_name + term_version).
--
-- Arquitetura:
--   - 2 tabelas novas dedicadas ao appointment (não sobrescrevem nada).
--   - UNIQUE constraints para idempotência operacional.
--   - 4 RPCs SECURITY DEFINER:
--       appointment_anamnesis_upsert(p_id, p_payload jsonb) → jsonb
--       appointment_anamnesis_mark_complete(p_id) → jsonb
--       appointment_consent_accept(p_id, p_term_key, p_term_version, p_term_title, p_signer_name, p_payload) → jsonb
--       appointment_clinical_gate_status(p_id) → jsonb
--   - RLS multi-tenant ADR-028 (clinic_id via app_clinic_id() JWT)
--   - GRANT EXECUTE → authenticated + service_role
--
-- Fora de escopo (NÃO toca):
--   - anamnesis_* (pré-consulta) · zero touch
--   - legal_doc_* (assinatura legal) · zero touch
--   - appointments table · zero alteração (não mexe consentimento_img)
--   - appointment_finalize / attend / change_status · zero alteração
--   - wa_outbox · cron.job · WhatsApp pipeline · zero touch
--
-- Estado seguro pós-apply:
--   - Tabelas existem mas vazias
--   - Funções existem mas só são chamadas via UI nova (nenhum cron)
--   - Worker 71 segue OFF · ban gate 2L preservado · zero envio real
--
-- Rollback: down DROP ordenado (seguro · só remove objetos novos).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABELA appointment_anamneses
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_anamneses (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id              uuid        NOT NULL DEFAULT public._default_clinic_id(),
  appointment_id         uuid        NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  lead_id                uuid,
  patient_id             uuid,
  status                 text        NOT NULL DEFAULT 'draft',
  chief_complaint        text,
  medical_history        text,
  medications            text,
  allergies              text,
  previous_procedures    text,
  contraindications      text,
  pregnancy_lactation    text,
  autoimmune_disease     text,
  anticoagulants         text,
  expectations           text,
  professional_notes     text,
  payload                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by             uuid,
  updated_by             uuid,
  completed_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz,
  CONSTRAINT chk_appt_anamnesis_status CHECK (
    status IN ('draft','complete','archived')
  ),
  CONSTRAINT chk_appt_anamnesis_completed_at CHECK (
    (status = 'complete' AND completed_at IS NOT NULL)
    OR (status <> 'complete')
  )
);

-- 1 anamnese ATIVA (não-archived, não-deleted) por appointment
CREATE UNIQUE INDEX IF NOT EXISTS uq_appt_anamnesis_active
  ON public.appointment_anamneses (appointment_id)
  WHERE deleted_at IS NULL AND status <> 'archived';

CREATE INDEX IF NOT EXISTS idx_appt_anamnesis_clinic
  ON public.appointment_anamneses (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appt_anamnesis_appt
  ON public.appointment_anamneses (appointment_id);

COMMENT ON TABLE public.appointment_anamneses IS
  'Mig 166 (CRM_PHASE_2I) · ficha clínica INTRA-consulta preenchida pelo '
  'profissional durante o atendimento. Distinto de anamnesis_responses '
  '(pré-consulta · paciente preenche). 1 ativa por appointment.';

-- RLS
ALTER TABLE public.appointment_anamneses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appt_anamnesis_select_same_clinic ON public.appointment_anamneses;
CREATE POLICY appt_anamnesis_select_same_clinic
  ON public.appointment_anamneses
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS appt_anamnesis_update_same_clinic ON public.appointment_anamneses;
CREATE POLICY appt_anamnesis_update_same_clinic
  ON public.appointment_anamneses
  FOR UPDATE TO authenticated
  USING (clinic_id = public.app_clinic_id());

-- INSERT/DELETE somente via RPC SECURITY DEFINER
GRANT SELECT, UPDATE ON public.appointment_anamneses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_anamneses TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. TABELA appointment_informed_consents
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_informed_consents (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid        NOT NULL DEFAULT public._default_clinic_id(),
  appointment_id      uuid        NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  lead_id             uuid,
  patient_id          uuid,
  term_key            text        NOT NULL,
  term_version        text        NOT NULL,
  term_title          text        NOT NULL,
  signer_name         text,
  accepted            boolean     NOT NULL DEFAULT false,
  accepted_at         timestamptz,
  accepted_by         uuid,
  payload             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  revoked_at          timestamptz,
  revoke_reason       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT chk_appt_consent_accepted_at CHECK (
    (accepted = true AND accepted_at IS NOT NULL)
    OR (accepted = false)
  )
);

-- 1 consent ATIVO (não-deleted, não-revoked) por (appointment, term_key, term_version)
CREATE UNIQUE INDEX IF NOT EXISTS uq_appt_consent_active
  ON public.appointment_informed_consents (appointment_id, term_key, term_version)
  WHERE deleted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_appt_consent_clinic
  ON public.appointment_informed_consents (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appt_consent_appt
  ON public.appointment_informed_consents (appointment_id);

COMMENT ON TABLE public.appointment_informed_consents IS
  'Mig 166 (CRM_PHASE_2I) · registro de consentimento informado INTRA-consulta '
  '(profissional registra aceite com signer_name + term_version). Distinto de '
  'legal_doc_signatures (fluxo formal externo). 1 ativo por (appt, term_key, term_version).';

-- RLS
ALTER TABLE public.appointment_informed_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appt_consent_select_same_clinic ON public.appointment_informed_consents;
CREATE POLICY appt_consent_select_same_clinic
  ON public.appointment_informed_consents
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS appt_consent_update_same_clinic ON public.appointment_informed_consents;
CREATE POLICY appt_consent_update_same_clinic
  ON public.appointment_informed_consents
  FOR UPDATE TO authenticated
  USING (clinic_id = public.app_clinic_id());

GRANT SELECT, UPDATE ON public.appointment_informed_consents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_informed_consents TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RPC appointment_anamnesis_upsert
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.appointment_anamnesis_upsert(
  p_appointment_id uuid,
  p_payload        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_clinic_id   uuid;
  v_appt        record;
  v_anamnesis   record;
  v_now         timestamptz := now();
  v_actor       uuid;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  v_actor := auth.uid();

  SELECT id, clinic_id, lead_id, patient_id
    INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  -- Tenta UPDATE da row ativa
  UPDATE public.appointment_anamneses
     SET chief_complaint     = COALESCE(p_payload->>'chief_complaint', chief_complaint),
         medical_history     = COALESCE(p_payload->>'medical_history', medical_history),
         medications         = COALESCE(p_payload->>'medications', medications),
         allergies           = COALESCE(p_payload->>'allergies', allergies),
         previous_procedures = COALESCE(p_payload->>'previous_procedures', previous_procedures),
         contraindications   = COALESCE(p_payload->>'contraindications', contraindications),
         pregnancy_lactation = COALESCE(p_payload->>'pregnancy_lactation', pregnancy_lactation),
         autoimmune_disease  = COALESCE(p_payload->>'autoimmune_disease', autoimmune_disease),
         anticoagulants      = COALESCE(p_payload->>'anticoagulants', anticoagulants),
         expectations        = COALESCE(p_payload->>'expectations', expectations),
         professional_notes  = COALESCE(p_payload->>'professional_notes', professional_notes),
         payload             = COALESCE(p_payload->'payload', payload),
         updated_by          = v_actor,
         updated_at          = v_now
   WHERE appointment_id = p_appointment_id
     AND deleted_at IS NULL
     AND status <> 'archived'
  RETURNING id, status INTO v_anamnesis;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', p_appointment_id,
      'anamnesis_id', v_anamnesis.id,
      'status', v_anamnesis.status,
      'action', 'updated'
    );
  END IF;

  -- INSERT novo
  INSERT INTO public.appointment_anamneses (
    clinic_id, appointment_id, lead_id, patient_id,
    status,
    chief_complaint, medical_history, medications, allergies,
    previous_procedures, contraindications, pregnancy_lactation,
    autoimmune_disease, anticoagulants, expectations,
    professional_notes, payload,
    created_by, updated_by
  ) VALUES (
    v_clinic_id, p_appointment_id, v_appt.lead_id, v_appt.patient_id,
    'draft',
    p_payload->>'chief_complaint', p_payload->>'medical_history',
    p_payload->>'medications', p_payload->>'allergies',
    p_payload->>'previous_procedures', p_payload->>'contraindications',
    p_payload->>'pregnancy_lactation', p_payload->>'autoimmune_disease',
    p_payload->>'anticoagulants', p_payload->>'expectations',
    p_payload->>'professional_notes',
    COALESCE(p_payload->'payload', '{}'::jsonb),
    v_actor, v_actor
  ) RETURNING id, status INTO v_anamnesis;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', p_appointment_id,
    'anamnesis_id', v_anamnesis.id,
    'status', v_anamnesis.status,
    'action', 'created'
  );
END;
$function$;

COMMENT ON FUNCTION public.appointment_anamnesis_upsert(uuid, jsonb) IS
  'Mig 166 (CRM_PHASE_2I) · upsert da anamnese intra-consulta. Idempotente: '
  '1 ativa por appointment. Status inicial draft · marque complete via fn dedicada.';

GRANT EXECUTE ON FUNCTION public.appointment_anamnesis_upsert(uuid, jsonb)
  TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPC appointment_anamnesis_mark_complete
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.appointment_anamnesis_mark_complete(
  p_appointment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_clinic_id   uuid;
  v_anamnesis   record;
  v_now         timestamptz := now();
  v_actor       uuid;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  v_actor := auth.uid();

  UPDATE public.appointment_anamneses
     SET status       = 'complete',
         completed_at = v_now,
         updated_by   = v_actor,
         updated_at   = v_now
   WHERE appointment_id = p_appointment_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
     AND status = 'draft'
  RETURNING id, status, completed_at INTO v_anamnesis;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', p_appointment_id,
      'anamnesis_id', v_anamnesis.id,
      'status', v_anamnesis.status,
      'completed_at', v_anamnesis.completed_at,
      'idempotent_skip', false
    );
  END IF;

  -- Já está complete? Idempotent skip.
  SELECT id, status, completed_at INTO v_anamnesis
    FROM public.appointment_anamneses
   WHERE appointment_id = p_appointment_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
     AND status = 'complete';
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', p_appointment_id,
      'anamnesis_id', v_anamnesis.id,
      'status', 'complete',
      'completed_at', v_anamnesis.completed_at,
      'idempotent_skip', true
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', false,
    'error', 'no_active_anamnesis',
    'appointment_id', p_appointment_id
  );
END;
$function$;

COMMENT ON FUNCTION public.appointment_anamnesis_mark_complete(uuid) IS
  'Mig 166 (CRM_PHASE_2I) · marca anamnese intra-consulta como complete. '
  'Idempotente: complete duplicado retorna idempotent_skip=true.';

GRANT EXECUTE ON FUNCTION public.appointment_anamnesis_mark_complete(uuid)
  TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RPC appointment_consent_accept
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.appointment_consent_accept(
  p_appointment_id uuid,
  p_term_key       text,
  p_term_version   text,
  p_term_title     text,
  p_signer_name    text,
  p_payload        jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_clinic_id   uuid;
  v_appt        record;
  v_consent     record;
  v_now         timestamptz := now();
  v_actor       uuid;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  IF p_term_key IS NULL OR length(trim(p_term_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'term_key_required');
  END IF;

  IF p_term_version IS NULL OR length(trim(p_term_version)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'term_version_required');
  END IF;

  IF p_signer_name IS NULL OR length(trim(p_signer_name)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'signer_name_required');
  END IF;

  v_actor := auth.uid();

  SELECT id, clinic_id, lead_id, patient_id
    INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  -- Idempotência: já aceito? Retorna skip.
  SELECT id, accepted, accepted_at, signer_name
    INTO v_consent
    FROM public.appointment_informed_consents
   WHERE appointment_id = p_appointment_id
     AND term_key = p_term_key
     AND term_version = p_term_version
     AND deleted_at IS NULL
     AND revoked_at IS NULL;

  IF FOUND AND v_consent.accepted = true THEN
    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', p_appointment_id,
      'consent_id', v_consent.id,
      'accepted', true,
      'accepted_at', v_consent.accepted_at,
      'signer_name', v_consent.signer_name,
      'idempotent_skip', true
    );
  END IF;

  IF FOUND AND v_consent.accepted = false THEN
    -- Existe row mas ainda não aceita · atualiza pra accepted
    UPDATE public.appointment_informed_consents
       SET accepted    = true,
           accepted_at = v_now,
           accepted_by = v_actor,
           signer_name = trim(p_signer_name),
           term_title  = p_term_title,
           payload     = COALESCE(p_payload, '{}'::jsonb),
           updated_at  = v_now
     WHERE id = v_consent.id
    RETURNING id, accepted_at INTO v_consent;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', p_appointment_id,
      'consent_id', v_consent.id,
      'accepted', true,
      'accepted_at', v_consent.accepted_at,
      'signer_name', p_signer_name,
      'idempotent_skip', false
    );
  END IF;

  -- Cria novo
  INSERT INTO public.appointment_informed_consents (
    clinic_id, appointment_id, lead_id, patient_id,
    term_key, term_version, term_title, signer_name,
    accepted, accepted_at, accepted_by, payload
  ) VALUES (
    v_clinic_id, p_appointment_id, v_appt.lead_id, v_appt.patient_id,
    p_term_key, p_term_version, p_term_title, trim(p_signer_name),
    true, v_now, v_actor, COALESCE(p_payload, '{}'::jsonb)
  ) RETURNING id, accepted_at INTO v_consent;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', p_appointment_id,
    'consent_id', v_consent.id,
    'accepted', true,
    'accepted_at', v_consent.accepted_at,
    'signer_name', p_signer_name,
    'idempotent_skip', false
  );
END;
$function$;

COMMENT ON FUNCTION public.appointment_consent_accept(uuid, text, text, text, text, jsonb) IS
  'Mig 166 (CRM_PHASE_2I) · registra aceite de consentimento informado '
  'intra-consulta. Idempotente: term_key + term_version já aceito retorna skip.';

GRANT EXECUTE ON FUNCTION public.appointment_consent_accept(uuid, text, text, text, text, jsonb)
  TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RPC appointment_clinical_gate_status
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.appointment_clinical_gate_status(
  p_appointment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_clinic_id          uuid;
  v_appt               record;
  v_anamnesis_status   text;
  v_anamnesis_id       uuid;
  v_anamnesis_complete_at timestamptz;
  v_consent_signed     boolean := false;
  v_consent_count      int := 0;
  v_gate_status        text;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  SELECT id, clinic_id, status AS appt_status, consentimento_img
    INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  -- Anamnesis status (intra-consulta · Mig 166)
  SELECT id, status, completed_at
    INTO v_anamnesis_id, v_anamnesis_status, v_anamnesis_complete_at
    FROM public.appointment_anamneses
   WHERE appointment_id = p_appointment_id
     AND deleted_at IS NULL
     AND status <> 'archived'
   LIMIT 1;
  IF NOT FOUND THEN
    v_anamnesis_status := 'none';
  END IF;

  -- Consent status (intra-consulta · Mig 166)
  SELECT count(*) > 0 INTO v_consent_signed
    FROM public.appointment_informed_consents
   WHERE appointment_id = p_appointment_id
     AND deleted_at IS NULL
     AND revoked_at IS NULL
     AND accepted = true;

  SELECT count(*) INTO v_consent_count
    FROM public.appointment_informed_consents
   WHERE appointment_id = p_appointment_id
     AND deleted_at IS NULL
     AND revoked_at IS NULL;

  -- Gate logic (warning · não bloqueia)
  v_gate_status := CASE
    WHEN v_anamnesis_status = 'complete' AND v_consent_signed THEN 'ok'
    WHEN v_anamnesis_status = 'none' AND NOT v_consent_signed THEN 'warning'
    WHEN v_anamnesis_status IN ('none','draft') OR NOT v_consent_signed THEN 'warning'
    ELSE 'ok'
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', p_appointment_id,
    'anamnesis', jsonb_build_object(
      'id', v_anamnesis_id,
      'status', v_anamnesis_status,
      'completed_at', v_anamnesis_complete_at
    ),
    'consent', jsonb_build_object(
      'signed', v_consent_signed,
      'rows', v_consent_count,
      'legacy_consentimento_img', v_appt.consentimento_img
    ),
    'gate_status', v_gate_status,
    'appointment_status', v_appt.appt_status
  );
END;
$function$;

COMMENT ON FUNCTION public.appointment_clinical_gate_status(uuid) IS
  'Mig 166 (CRM_PHASE_2I) · consolida estado clínico (anamnese + consent) do '
  'appointment. Retorna gate_status ∈ {ok, warning} · não bloqueia ações '
  '(decisão 2I: warning-only · hard gate fica para 2I.1).';

GRANT EXECUTE ON FUNCTION public.appointment_clinical_gate_status(uuid)
  TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY DO BLOCK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ok_table_anamnesis boolean;
  v_ok_table_consent   boolean;
  v_ok_fn_upsert       boolean;
  v_ok_fn_complete     boolean;
  v_ok_fn_consent      boolean;
  v_ok_fn_gate         boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_anamneses') INTO v_ok_table_anamnesis;
  IF NOT v_ok_table_anamnesis THEN RAISE EXCEPTION 'sanity: appointment_anamneses não criada'; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_informed_consents') INTO v_ok_table_consent;
  IF NOT v_ok_table_consent THEN RAISE EXCEPTION 'sanity: appointment_informed_consents não criada'; END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert') INTO v_ok_fn_upsert;
  IF NOT v_ok_fn_upsert THEN RAISE EXCEPTION 'sanity: appointment_anamnesis_upsert não criada'; END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete') INTO v_ok_fn_complete;
  IF NOT v_ok_fn_complete THEN RAISE EXCEPTION 'sanity: appointment_anamnesis_mark_complete não criada'; END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_consent_accept') INTO v_ok_fn_consent;
  IF NOT v_ok_fn_consent THEN RAISE EXCEPTION 'sanity: appointment_consent_accept não criada'; END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status') INTO v_ok_fn_gate;
  IF NOT v_ok_fn_gate THEN RAISE EXCEPTION 'sanity: appointment_clinical_gate_status não criada'; END IF;

  RAISE NOTICE 'mig 166 · 2 tabelas + 4 RPCs criadas · zero impacto em sistemas existentes';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
