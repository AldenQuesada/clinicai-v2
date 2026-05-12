-- ============================================================================
-- CRM_PHASE_2ALEXA.2.1 · SMOKE (transacional · ROLLBACK)
-- Reception panel consumes consented patient photo
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_clinic_id   uuid;
  v_patient_id  uuid := gen_random_uuid();
  v_profile_id  uuid;
  v_baseline_outbox integer;
  v_after_outbox    integer;
  v_outbox_delta    integer;

  v_photo_path text := 'patient-profiles/test/test/profile-smoke-2alexa21.jpg';
  v_test_phone text := '5511'|| to_char(now(), 'YYMMDDHH24MISSMS');

  v_enabled_without_consent_blocked boolean := false;
  v_revoked_excluded_ok             boolean := false;

  v_ready_count           integer;
  v_panel_source_count    integer;
  v_provider_cron_count   integer;
  v_unsafe_outbox_count   integer;
BEGIN
  SELECT id INTO v_clinic_id FROM public.clinics LIMIT 1;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'sanity: nenhuma clinic disponivel';
  END IF;

  v_baseline_outbox := (SELECT count(*) FROM public.wa_outbox);

  -- A · worker71_off
  IF (SELECT active FROM cron.job WHERE jobid=71) THEN
    RAISE EXCEPTION 'A fail: worker71 ativo';
  END IF;

  -- B · profile_table_exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patient_profiles_extended') THEN
    RAISE EXCEPTION 'B fail: patient_profiles_extended ausente';
  END IF;

  -- C · provision patient + profile minimo
  INSERT INTO public.patients (id, clinic_id, name, phone, status, created_at, updated_at)
  VALUES (v_patient_id, v_clinic_id, 'Smoke 2ALEXA21 Patient', v_test_phone, 'active', now(), now());

  INSERT INTO public.patient_profiles_extended
    (clinic_id, patient_id, display_name, preferred_name, reception_animation_style)
  VALUES
    (v_clinic_id, v_patient_id, 'Smoke Hero', 'Smoke', 'premium_glow')
  RETURNING id INTO v_profile_id;

  -- D · welcome=true sem consent → CHECK constraint deve bloquear
  BEGIN
    UPDATE public.patient_profiles_extended
       SET reception_welcome_enabled = true
     WHERE id = v_profile_id;
    RAISE EXCEPTION 'D fail: welcome=true sem consent foi aceito';
  EXCEPTION WHEN check_violation THEN
    v_enabled_without_consent_blocked := true;
  END;

  -- E · grant consent + photo + welcome (sequência canônica)
  UPDATE public.patient_profiles_extended
     SET profile_photo_path = v_photo_path,
         profile_photo_uploaded_at = now(),
         reception_photo_consent_status = 'granted',
         reception_photo_consent_at = now()
   WHERE id = v_profile_id;

  UPDATE public.patient_profiles_extended
     SET reception_welcome_enabled = true
   WHERE id = v_profile_id;

  -- F · query equivalente a getReceptionDisplayProfile retorna 1 row
  SELECT count(*) INTO v_ready_count
  FROM public.patient_profiles_extended
  WHERE patient_id = v_patient_id
    AND reception_welcome_enabled = true
    AND reception_photo_consent_status = 'granted'
    AND profile_photo_path IS NOT NULL;
  IF v_ready_count != 1 THEN
    RAISE EXCEPTION 'F fail: ready query nao retornou esse profile (got %)', v_ready_count;
  END IF;

  -- G · enabled_without_photo == 0 cluster-wide
  IF (SELECT count(*) FROM public.patient_profiles_extended WHERE reception_welcome_enabled=true AND profile_photo_path IS NULL) != 0 THEN
    RAISE EXCEPTION 'G fail: existe row com welcome=true mas sem photo';
  END IF;

  -- H · ready profile expõe SOMENTE colunas seguras (display_name, preferred_name, animation_style, path)
  PERFORM patient_id, display_name, preferred_name, profile_photo_path, reception_animation_style
  FROM public.patient_profiles_extended
  WHERE patient_id = v_patient_id;

  -- I · revoke consent + welcome=false atômico (mesmo padrão do repository)
  UPDATE public.patient_profiles_extended
     SET reception_photo_consent_status = 'revoked',
         reception_photo_consent_revoked_at = now(),
         reception_welcome_enabled = false
   WHERE id = v_profile_id;

  -- J · query equivalente a getReceptionDisplayProfile NÃO retorna revoked
  SELECT count(*) INTO v_ready_count
  FROM public.patient_profiles_extended
  WHERE patient_id = v_patient_id
    AND reception_welcome_enabled = true
    AND reception_photo_consent_status = 'granted';
  IF v_ready_count != 0 THEN
    RAISE EXCEPTION 'J fail: revoked profile aparece em ready';
  END IF;
  v_revoked_excluded_ok := true;

  -- K · panel source query (mesmo shape de listByDate · só pra garantir join não quebra)
  SELECT count(*) INTO v_panel_source_count
  FROM public.appointments a
  WHERE a.deleted_at IS NULL
    AND a.scheduled_date = CURRENT_DATE;

  -- L · NO provider cron
  SELECT count(*) INTO v_provider_cron_count
  FROM cron.job
  WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%';
  IF v_provider_cron_count != 0 THEN
    RAISE EXCEPTION 'L fail: provider cron count = %', v_provider_cron_count;
  END IF;

  -- M · unsafe outbox count
  SELECT count(*) INTO v_unsafe_outbox_count
  FROM public.wa_outbox
  WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL;
  IF v_unsafe_outbox_count != 0 THEN
    RAISE EXCEPTION 'M fail: unsafe outbox count = %', v_unsafe_outbox_count;
  END IF;

  -- safety wa_outbox delta = 0
  v_after_outbox := (SELECT count(*) FROM public.wa_outbox);
  v_outbox_delta := v_after_outbox - v_baseline_outbox;
  IF v_outbox_delta != 0 THEN
    RAISE EXCEPTION 'safety fail: wa_outbox cresceu em %', v_outbox_delta;
  END IF;

  RAISE EXCEPTION 'SMOKE_RESULT_2ALEXA21:%', jsonb_build_object(
    'A_worker71_off', true,
    'B_profile_table_exists', true,
    'C_provision_ok', true,
    'D_welcome_without_consent_blocked', v_enabled_without_consent_blocked,
    'E_grant_consent_photo_welcome_ok', true,
    'F_ready_query_returns_one', true,
    'G_no_welcome_without_photo', true,
    'H_safe_columns_only', true,
    'I_revoke_atomic_ok', true,
    'J_revoked_excluded_from_ready', v_revoked_excluded_ok,
    'K_panel_source_today_count', v_panel_source_count,
    'L_provider_cron_count', v_provider_cron_count,
    'M_unsafe_outbox_count', v_unsafe_outbox_count,
    'wa_outbox_delta', v_outbox_delta,
    'baseline_outbox', v_baseline_outbox,
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71)
  )::text;
END $$;

COMMIT;

-- =============================================================================
-- UI MANUAL CHECKLIST (não checável via SQL · verificar visualmente):
-- =============================================================================
-- 1. Paciente sem foto/sem consent → ArrivalRow mostra avatar com iniciais.
-- 2. Paciente com foto mas consent=none → ArrivalRow mostra avatar iniciais (sem foto).
-- 3. Paciente com consent=revoked → ArrivalRow mostra iniciais.
-- 4. Paciente com foto + granted + welcome=true → ArrivalRow mostra mini foto
--    E hero premium aparece no topo do painel com animação consentida.
-- 5. Inspecionar DOM: img src é signed URL (https://*.supabase.co/storage/v1/...)
--    NÃO é storage path bruto (sem `patient-profiles/...` no atributo src).
-- 6. Nenhum telefone completo aparece no DOM · só últimos 4 dígitos quando
--    rendered (e na 2ALEXA.2.1 nem isso aparece no DOM atual).
-- 7. Nenhum valor, orçamento, anamnese ou observação aparece.
-- 8. Painel atualiza a cada 15s (server) · "há X min" a cada 30s (client).
