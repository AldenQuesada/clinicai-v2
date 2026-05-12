-- ============================================================================
-- CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_BASE · SMOKE (transacional · ROLLBACK)
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_clinic_id   uuid;
  v_patient_id  uuid := gen_random_uuid();
  v_profile_id  uuid;
  v_baseline_outbox integer;
  v_after_outbox integer;
  v_outbox_delta integer;

  v_photo_path  text := 'patient-profiles/test/test/profile-test.jpg';
  v_test_phone  text := '5511'|| to_char(now(), 'YYMMDDHH24MISSMS');

  v_enabled_without_consent_blocked boolean := false;
  v_enabled_without_photo_blocked   boolean := false;
  v_revoke_disables_welcome_ok      boolean := false;

  v_reception_ready_count integer;
BEGIN
  SELECT id INTO v_clinic_id FROM public.clinics LIMIT 1;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'sanity: nenhuma clinic disponível';
  END IF;

  v_baseline_outbox := (SELECT count(*) FROM public.wa_outbox);

  -- Patient fixture
  INSERT INTO public.patients (id, clinic_id, name, phone, status, created_at, updated_at)
  VALUES (v_patient_id, v_clinic_id, 'Smoke 180 Patient', v_test_phone, 'active', now(), now());

  -- ── A · INSERT profile básico ─────────────────────────────────────────
  INSERT INTO public.patient_profiles_extended
    (clinic_id, patient_id, display_name, preferred_name, reception_animation_style)
  VALUES
    (v_clinic_id, v_patient_id, 'Smoke Display', 'Smoke', 'premium_soft')
  RETURNING id INTO v_profile_id;

  -- ── B · welcome=true sem consent → CHECK constraint deve bloquear ────
  BEGIN
    UPDATE public.patient_profiles_extended
       SET reception_welcome_enabled = true
     WHERE id = v_profile_id;
    -- Se chegou aqui, CHECK falhou em rejeitar
    RAISE EXCEPTION 'B fail: welcome=true sem consent foi aceito';
  EXCEPTION WHEN check_violation THEN
    v_enabled_without_consent_blocked := true;
  END;

  -- ── C · set photo path ───────────────────────────────────────────────
  UPDATE public.patient_profiles_extended
     SET profile_photo_path = v_photo_path,
         profile_photo_uploaded_at = now()
   WHERE id = v_profile_id;

  -- ── D · welcome=true com photo mas sem consent → ainda deve bloquear
  BEGIN
    UPDATE public.patient_profiles_extended
       SET reception_welcome_enabled = true
     WHERE id = v_profile_id;
    RAISE EXCEPTION 'D fail: welcome=true sem consent (com photo) foi aceito';
  EXCEPTION WHEN check_violation THEN
    v_enabled_without_photo_blocked := true;  -- "photo" check passed but consent enforced
  END;

  -- ── E · grant consent ───────────────────────────────────────────────
  UPDATE public.patient_profiles_extended
     SET reception_photo_consent_status = 'granted',
         reception_photo_consent_at = now()
   WHERE id = v_profile_id;

  -- ── F · agora welcome=true deve passar ──────────────────────────────
  UPDATE public.patient_profiles_extended
     SET reception_welcome_enabled = true
   WHERE id = v_profile_id;

  PERFORM 1 FROM public.patient_profiles_extended
   WHERE id = v_profile_id AND reception_welcome_enabled = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'F fail: welcome não persistiu após consent+photo';
  END IF;

  -- ── G · contagem de reception-ready ────────────────────────────────
  SELECT count(*) INTO v_reception_ready_count
  FROM public.patient_profiles_extended
  WHERE reception_welcome_enabled=true
    AND reception_photo_consent_status='granted'
    AND profile_photo_path IS NOT NULL;
  IF v_reception_ready_count < 1 THEN
    RAISE EXCEPTION 'G fail: reception-ready count deveria ser >= 1, got %', v_reception_ready_count;
  END IF;

  -- ── H · revoke consent → DB deve forçar welcome=false via constraint ──
  -- Estratégia: UPDATE atômico (revoked + welcome=false) é OK; tentar SÓ revoked
  -- com welcome=true deve falhar.
  BEGIN
    UPDATE public.patient_profiles_extended
       SET reception_photo_consent_status = 'revoked',
           reception_photo_consent_revoked_at = now()
     WHERE id = v_profile_id;
    RAISE EXCEPTION 'H fail: revoke sem welcome=false foi aceito (deveria CHECK)';
  EXCEPTION WHEN check_violation THEN
    v_revoke_disables_welcome_ok := true;
  END;

  -- ── I · revoke + welcome=false atômico (como o repository faz) ──────
  UPDATE public.patient_profiles_extended
     SET reception_photo_consent_status = 'revoked',
         reception_photo_consent_revoked_at = now(),
         reception_welcome_enabled = false
   WHERE id = v_profile_id;

  PERFORM 1 FROM public.patient_profiles_extended
   WHERE id = v_profile_id
     AND reception_photo_consent_status = 'revoked'
     AND reception_welcome_enabled = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'I fail: revoke+welcome=false não persistiu';
  END IF;

  -- ── J · getReceptionDisplayProfile equivalent · revoked não retorna
  SELECT count(*) INTO v_reception_ready_count
  FROM public.patient_profiles_extended
  WHERE id = v_profile_id
    AND reception_welcome_enabled=true
    AND reception_photo_consent_status='granted';
  IF v_reception_ready_count != 0 THEN
    RAISE EXCEPTION 'J fail: revoked profile aparece em reception-ready';
  END IF;

  -- ── safety wa_outbox delta = 0
  v_after_outbox := (SELECT count(*) FROM public.wa_outbox);
  v_outbox_delta := v_after_outbox - v_baseline_outbox;
  IF v_outbox_delta != 0 THEN
    RAISE EXCEPTION 'safety fail: wa_outbox cresceu em %', v_outbox_delta;
  END IF;

  RAISE EXCEPTION 'SMOKE_RESULT_PP_PROFILE:%', jsonb_build_object(
    'A_insert_ok', true,
    'B_welcome_without_consent_blocked', v_enabled_without_consent_blocked,
    'C_set_photo_ok', true,
    'D_welcome_without_consent_after_photo_blocked', v_enabled_without_photo_blocked,
    'E_grant_consent_ok', true,
    'F_welcome_enabled_after_grant', true,
    'G_reception_ready_count', v_reception_ready_count,
    'H_revoke_without_welcome_false_blocked', v_revoke_disables_welcome_ok,
    'I_revoke_atomic_ok', true,
    'J_revoked_not_in_ready', true,
    'wa_outbox_delta', v_outbox_delta,
    'baseline_outbox', v_baseline_outbox,
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71)
  )::text;
END $$;

COMMIT;
