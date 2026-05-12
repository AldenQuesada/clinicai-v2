-- ============================================================================
-- CRM_PHASE_2I · SMOKE TRANSACIONAL · ANAMNESIS + CONSENT
-- ============================================================================
-- BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. Zero envio WhatsApp.
-- PRE-REQUISITO: Mig 166 aplicada (2 tabelas + 4 RPCs).
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id    uuid := public._default_clinic_id();
  v_lead_id      uuid;
  v_prof_id      uuid := '06757b9f-2a03-43ae-bd37-28021eb6afeb';
  v_actor_uid    uuid;
  v_today_sp     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_suffix       text;
  v_jwt          text;

  v_appt_id      uuid;
  v_baseline     jsonb;

  v_gate_initial   jsonb;
  v_upsert_1       jsonb;
  v_upsert_2       jsonb;
  v_gate_draft     jsonb;
  v_complete_1     jsonb;
  v_complete_2     jsonb;
  v_gate_complete_only jsonb;
  v_consent_1      jsonb;
  v_consent_2      jsonb;
  v_gate_final     jsonb;
  v_consent_no_name jsonb;
  v_consent_invalid_appt jsonb;
BEGIN
  -- App user real (FK)
  SELECT id INTO v_actor_uid FROM public.app_users
   WHERE clinic_id = v_clinic_id LIMIT 1;
  IF v_actor_uid IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PRE_FAIL_2I: sem app_user para fixture';
  END IF;

  v_jwt := jsonb_build_object(
    'clinic_id', v_clinic_id::text,
    'role', 'authenticated',
    'sub', v_actor_uid::text
  )::text;
  PERFORM set_config('request.jwt.claims', v_jwt, true);

  v_suffix := to_char(now(), 'YYMMDDHH24MISSMS');

  SELECT jsonb_build_object(
    'appointments_total', (SELECT count(*) FROM public.appointments),
    'anamneses_total', (SELECT count(*) FROM public.appointment_anamneses),
    'consents_total', (SELECT count(*) FROM public.appointment_informed_consents),
    'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox),
    'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'today_sp', v_today_sp
  ) INTO v_baseline;

  -- Fixture: lead + appointment em_atendimento
  SELECT id INTO v_lead_id FROM public.leads
   WHERE clinic_id = v_clinic_id AND lifecycle_status='ativo' AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PRE_FAIL_2I: sem lead ativo';
  END IF;

  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2I Clinical', '55449'||substring(v_suffix,1,9),
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '09:00'::time, '09:30'::time,
    'Smoke 2I Proc', 'em_atendimento', 500, 'pendente'
  ) RETURNING id INTO v_appt_id;

  -- ════════════════════════════════════════════════════════════════════
  -- A. Gate inicial · sem anamnese, sem consent → warning
  -- ════════════════════════════════════════════════════════════════════
  SELECT public.appointment_clinical_gate_status(v_appt_id) INTO v_gate_initial;

  -- ════════════════════════════════════════════════════════════════════
  -- B. Anamnese upsert 1 (cria draft)
  -- ════════════════════════════════════════════════════════════════════
  SELECT public.appointment_anamnesis_upsert(
    v_appt_id,
    jsonb_build_object(
      'chief_complaint', 'Linhas de expressão',
      'medical_history', 'Sem comorbidades',
      'medications', 'Nenhuma',
      'allergies', 'Lidocaína',
      'previous_procedures', 'Botox 2024',
      'expectations', 'Resultado natural',
      'professional_notes', 'Sem contraindicações'
    )
  ) INTO v_upsert_1;

  -- Idempotência: 2º upsert atualiza mesma row
  SELECT public.appointment_anamnesis_upsert(
    v_appt_id,
    jsonb_build_object('professional_notes', 'Atualizado · sem contraindicações')
  ) INTO v_upsert_2;

  SELECT public.appointment_clinical_gate_status(v_appt_id) INTO v_gate_draft;

  -- ════════════════════════════════════════════════════════════════════
  -- C. Mark complete
  -- ════════════════════════════════════════════════════════════════════
  SELECT public.appointment_anamnesis_mark_complete(v_appt_id) INTO v_complete_1;
  -- Idempotência
  SELECT public.appointment_anamnesis_mark_complete(v_appt_id) INTO v_complete_2;

  SELECT public.appointment_clinical_gate_status(v_appt_id) INTO v_gate_complete_only;

  -- ════════════════════════════════════════════════════════════════════
  -- D. Consent accept
  -- ════════════════════════════════════════════════════════════════════
  SELECT public.appointment_consent_accept(
    v_appt_id,
    'tcle_estetica',
    'v1.0',
    'TCLE - Procedimentos Estéticos',
    'Smoke Patient',
    '{"ip":"127.0.0.1","client":"smoke"}'::jsonb
  ) INTO v_consent_1;

  -- Idempotência: mesmo term_key + version → skip
  SELECT public.appointment_consent_accept(
    v_appt_id,
    'tcle_estetica',
    'v1.0',
    'TCLE - Procedimentos Estéticos',
    'Smoke Patient',
    '{}'::jsonb
  ) INTO v_consent_2;

  -- Gate final: anamnese complete + consent signed → OK
  SELECT public.appointment_clinical_gate_status(v_appt_id) INTO v_gate_final;

  -- ════════════════════════════════════════════════════════════════════
  -- E. Bloqueios
  -- ════════════════════════════════════════════════════════════════════
  -- E.1 · consent_accept sem signer_name
  SELECT public.appointment_consent_accept(
    v_appt_id, 'tcle_x', 'v1', 'X', NULL, '{}'::jsonb
  ) INTO v_consent_no_name;

  -- E.2 · consent_accept em appointment inexistente
  SELECT public.appointment_consent_accept(
    '00000000-0000-0000-0000-000000000000'::uuid,
    'tcle_x', 'v1', 'X', 'Foo', '{}'::jsonb
  ) INTO v_consent_invalid_appt;

  -- Force ROLLBACK
  RAISE EXCEPTION 'SMOKE_RESULT_2I:%', jsonb_build_object(
    'baseline', v_baseline,
    'fixture_appt_id', v_appt_id,
    'test_a_gate_initial', v_gate_initial,
    'test_b_anamnesis', jsonb_build_object(
      'upsert_1', v_upsert_1,
      'upsert_2_idempotent', v_upsert_2,
      'gate_draft', v_gate_draft
    ),
    'test_c_complete', jsonb_build_object(
      'complete_1', v_complete_1,
      'complete_2_idempotent', v_complete_2,
      'gate_complete_only', v_gate_complete_only
    ),
    'test_d_consent', jsonb_build_object(
      'consent_1', v_consent_1,
      'consent_2_idempotent', v_consent_2,
      'gate_final', v_gate_final
    ),
    'test_e_blocked', jsonb_build_object(
      'consent_no_name', v_consent_no_name,
      'consent_invalid_appt', v_consent_invalid_appt
    ),
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_delta', (SELECT count(*) FROM public.wa_outbox) - (v_baseline->>'wa_outbox_total')::int
  )::text;
END
$BLK$;
