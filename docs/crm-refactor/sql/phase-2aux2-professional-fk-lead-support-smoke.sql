-- ============================================================================
-- CRM_PHASE_2AUX.2 · PROFESSIONAL FK + LEAD SUPPORT SMOKE (transacional · ROLLBACK)
-- ============================================================================
-- 10 cenários cobertos. RAISE EXCEPTION P0001 força ROLLBACK.
-- ============================================================================

BEGIN;

-- JWT como owner com clinic_id resolvido após bootstrap
SELECT set_config('request.jwt.claims', '{"role":"authenticated","app_role":"owner"}', true);

DO $$
DECLARE
  v_clinic_id        uuid;
  v_prof_a_id        uuid;
  v_prof_b_id        uuid;
  v_patient_id       uuid := gen_random_uuid();
  v_lead_id          uuid := gen_random_uuid();
  v_phone_p          text := '5511'|| to_char(now(), 'YYMMDDHH24MISSMS');
  v_phone_l          text := '5511'|| to_char(now() + interval '1 second', 'YYMMDDHH24MISSMS');

  v_baseline_outbox  integer;
  v_after_outbox     integer;
  v_outbox_delta     integer;

  v_appt_a_id        uuid;
  v_appt_b_same_id   uuid;
  v_appt_a_overlap_id uuid;
  v_appt_lead_id     uuid;
  v_appt_invalid_status_attempt text;

  v_overlap_check_appt_a integer;
  v_overlap_check_prof_b integer;
  v_overlap_check_prof_a_overlap integer;
  v_xor_check        integer;
  v_zumbi_check      integer;
BEGIN
  -- Bootstrap: pega clínica + 2 profissionais com agenda_enabled
  SELECT id INTO v_clinic_id FROM public.clinics LIMIT 1;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'sanity: nenhuma clinic disponível pra smoke';
  END IF;

  -- Pega 2 profissionais ATIVOS da clínica
  SELECT id INTO v_prof_a_id
    FROM public.professional_profiles
   WHERE clinic_id = v_clinic_id AND is_active = true AND agenda_enabled = true
   ORDER BY display_name LIMIT 1;

  SELECT id INTO v_prof_b_id
    FROM public.professional_profiles
   WHERE clinic_id = v_clinic_id AND is_active = true AND agenda_enabled = true
     AND id != COALESCE(v_prof_a_id, gen_random_uuid())
   ORDER BY display_name LIMIT 1;

  IF v_prof_a_id IS NULL OR v_prof_b_id IS NULL THEN
    -- Cria fixture se não houver 2 profissionais (smoke é transacional · ROLLBACK)
    IF v_prof_a_id IS NULL THEN
      v_prof_a_id := gen_random_uuid();
      INSERT INTO public.professional_profiles (
        id, clinic_id, display_name, specialty, is_active, agenda_enabled, color, created_at, updated_at
      ) VALUES (v_prof_a_id, v_clinic_id, 'Smoke Prof A', 'Generic', true, true, '#aaaaaa', now(), now());
    END IF;
    IF v_prof_b_id IS NULL THEN
      v_prof_b_id := gen_random_uuid();
      INSERT INTO public.professional_profiles (
        id, clinic_id, display_name, specialty, is_active, agenda_enabled, color, created_at, updated_at
      ) VALUES (v_prof_b_id, v_clinic_id, 'Smoke Prof B', 'Generic', true, true, '#bbbbbb', now(), now());
    END IF;
  END IF;

  -- Adiciona clinic_id ao JWT
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object(
      'role','authenticated','app_role','owner',
      'sub','00000000-0000-0000-0000-000000000001',
      'clinic_id', v_clinic_id::text
    )::text, true);

  v_baseline_outbox := (SELECT count(*) FROM public.wa_outbox);

  -- Cria patient fixture
  INSERT INTO public.patients (id, clinic_id, name, phone, status, created_at, updated_at)
  VALUES (v_patient_id, v_clinic_id, 'Smoke 2AUX2 Patient', v_phone_p, 'active', now(), now());

  -- Cria lead fixture
  INSERT INTO public.leads (id, clinic_id, name, phone, phase, lifecycle_status, created_at, updated_at)
  VALUES (v_lead_id, v_clinic_id, 'Smoke 2AUX2 Lead', v_phone_l, 'lead', 'ativo', now(), now());

  -- ── TEST A · Criar appointment com patient + professional A ──────────────
  v_appt_a_id := gen_random_uuid();
  INSERT INTO public.appointments (
    id, clinic_id, patient_id, professional_id, professional_name,
    subject_name, subject_phone, scheduled_date, start_time, end_time,
    status, value, origem, created_at, updated_at
  ) VALUES (
    v_appt_a_id, v_clinic_id, v_patient_id, v_prof_a_id, 'Smoke Prof A',
    'Smoke 2AUX2 Patient', v_phone_p,
    current_date + interval '7 days', '09:00', '10:00',
    'agendado', 0, 'manual', now(), now()
  );

  -- ── TEST B · Mesmo horário + professional B (deve ser permitido) ─────────
  v_appt_b_same_id := gen_random_uuid();
  INSERT INTO public.appointments (
    id, clinic_id, patient_id, professional_id, professional_name,
    subject_name, subject_phone, scheduled_date, start_time, end_time,
    status, value, origem, created_at, updated_at
  ) VALUES (
    v_appt_b_same_id, v_clinic_id,
    NULL,  -- block-time pra evitar conflict por patient
    v_prof_b_id, 'Smoke Prof B',
    'Smoke 2AUX2 Other', '5511999999999',
    current_date + interval '7 days', '09:00', '10:00',
    'bloqueado', 0, 'manual', now(), now()
  );

  -- ── TEST C · Overlap com professional A (deve detectar conflict) ─────────
  -- Não inserimos · usamos a função do app layer (checkConflicts) simulando
  -- via query manual. O ContratoOverlap: appts ativos do mesmo prof+date+overlap horário.
  SELECT count(*) INTO v_overlap_check_appt_a
  FROM public.appointments
  WHERE deleted_at IS NULL
    AND clinic_id = v_clinic_id
    AND professional_id = v_prof_a_id
    AND scheduled_date = current_date + interval '7 days'
    AND status IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','remarcado','bloqueado')
    AND start_time < '10:30'::time
    AND end_time   > '09:30'::time;
  -- Esperado: 1 (o appointment A existe e overlap com 09:30-10:30)
  IF v_overlap_check_appt_a != 1 THEN
    RAISE EXCEPTION 'C fail: overlap check professional A retornou % (esperado 1)', v_overlap_check_appt_a;
  END IF;

  -- Mesmo horário 09:30-10:30 com Prof B agora (sem overlap com A pq prof diferente)
  SELECT count(*) INTO v_overlap_check_prof_b
  FROM public.appointments
  WHERE deleted_at IS NULL
    AND clinic_id = v_clinic_id
    AND professional_id = v_prof_b_id
    AND scheduled_date = current_date + interval '7 days'
    AND status IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','remarcado','bloqueado')
    AND start_time < '10:30'::time
    AND end_time   > '09:30'::time;
  -- Prof B tem appointment 09:00-10:00 que SIM overlap com 09:30-10:30
  IF v_overlap_check_prof_b != 1 THEN
    RAISE EXCEPTION 'B-aux fail: prof B count inesperado: %', v_overlap_check_prof_b;
  END IF;

  -- Diferente prof + diferente horário · zero conflict
  SELECT count(*) INTO v_overlap_check_prof_a_overlap
  FROM public.appointments
  WHERE deleted_at IS NULL
    AND clinic_id = v_clinic_id
    AND professional_id = v_prof_a_id
    AND scheduled_date = current_date + interval '7 days'
    AND status IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','remarcado','bloqueado')
    AND start_time < '15:00'::time
    AND end_time   > '14:00'::time;
  IF v_overlap_check_prof_a_overlap != 0 THEN
    RAISE EXCEPTION 'C-aux fail: deveria ser 0 conflicts mas é %', v_overlap_check_prof_a_overlap;
  END IF;

  -- ── TEST D · Criar appointment com lead + professional A ─────────────────
  v_appt_lead_id := gen_random_uuid();
  INSERT INTO public.appointments (
    id, clinic_id, lead_id, professional_id, professional_name,
    subject_name, subject_phone, scheduled_date, start_time, end_time,
    status, value, origem, created_at, updated_at
  ) VALUES (
    v_appt_lead_id, v_clinic_id, v_lead_id, v_prof_a_id, 'Smoke Prof A',
    'Smoke 2AUX2 Lead', v_phone_l,
    current_date + interval '7 days', '14:00', '15:00',
    'agendado', 0, 'manual', now(), now()
  );

  -- ── TEST E · Validar XOR (chk_appt_subject_xor) ─────────────────────────
  -- Tenta inserir appointment com lead_id AND patient_id (deve falhar via CHECK)
  BEGIN
    INSERT INTO public.appointments (
      id, clinic_id, lead_id, patient_id, professional_id,
      subject_name, scheduled_date, start_time, end_time,
      status, value, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_clinic_id, v_lead_id, v_patient_id, v_prof_a_id,
      'Both', current_date + interval '7 days', '16:00', '17:00',
      'agendado', 0, now(), now()
    );
    -- Não deveria chegar aqui
    RAISE EXCEPTION 'E fail: XOR check não bloqueou lead+patient simultâneos';
  EXCEPTION WHEN check_violation OR raise_exception THEN
    -- Aceita ambos · check_violation (CHECK constraint) ou raise_exception (trigger)
    IF SQLERRM LIKE '%E fail%' THEN
      RAISE;
    END IF;
    v_xor_check := 1;
  END;

  -- ── TEST F · Status zumbi rejeitado (CHECK constraint) ──────────────────
  BEGIN
    INSERT INTO public.appointments (
      id, clinic_id, patient_id, professional_id,
      subject_name, scheduled_date, start_time, end_time,
      status, value, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_clinic_id, v_patient_id, v_prof_a_id,
      'Zombie', current_date + interval '7 days', '18:00', '19:00',
      'em_consulta', 0, now(), now()
    );
    RAISE EXCEPTION 'F fail: status zumbi em_consulta foi aceito';
  EXCEPTION WHEN check_violation THEN
    v_zumbi_check := 1;
  END;

  -- ── TEST G · Editar appointment preservando subject + trocando horário ──
  UPDATE public.appointments
     SET start_time = '11:00', end_time = '12:00', updated_at = now()
   WHERE id = v_appt_a_id;

  -- Verifica que subject (patient_id) foi preservado
  PERFORM 1 FROM public.appointments
   WHERE id = v_appt_a_id AND patient_id = v_patient_id AND lead_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'G fail: subject não foi preservado em edição';
  END IF;

  -- ── TEST H · FK professional_id válido pra professional_profiles ────────
  -- Tenta inserir appointment com professional_id que não existe (deve falhar FK)
  BEGIN
    INSERT INTO public.appointments (
      id, clinic_id, patient_id, professional_id,
      subject_name, scheduled_date, start_time, end_time,
      status, value, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_clinic_id, v_patient_id, gen_random_uuid(),
      'BadProf', current_date + interval '7 days', '20:00', '21:00',
      'agendado', 0, now(), now()
    );
    RAISE EXCEPTION 'H fail: FK professional_id inválido foi aceito';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL; -- esperado
  END;

  -- ── WA_OUTBOX delta deve ser ZERO ────────────────────────────────────────
  v_after_outbox := (SELECT count(*) FROM public.wa_outbox);
  v_outbox_delta := v_after_outbox - v_baseline_outbox;
  IF v_outbox_delta != 0 THEN
    RAISE EXCEPTION 'safety fail: wa_outbox cresceu em %', v_outbox_delta;
  END IF;

  -- ── RAISE com JSON resultado ─────────────────────────────────────────────
  RAISE EXCEPTION 'SMOKE_RESULT_2AUX2:%', jsonb_build_object(
    'A_create_patient_prof_a',     'ok',
    'B_create_prof_b_same_time',   'ok',
    'C_overlap_prof_a_detected',   v_overlap_check_appt_a,
    'C_prof_b_count',              v_overlap_check_prof_b,
    'C_prof_a_no_overlap',         v_overlap_check_prof_a_overlap,
    'D_create_lead_prof_a',        'ok',
    'E_xor_blocked',               v_xor_check,
    'F_zumbi_blocked',             v_zumbi_check,
    'G_subject_preserved',         'ok',
    'H_invalid_fk_blocked',        'ok',
    'wa_outbox_delta',             v_outbox_delta,
    'baseline_outbox',             v_baseline_outbox,
    'worker71_off_still',          (SELECT NOT active FROM cron.job WHERE jobid=71)
  )::text;
END $$;

COMMIT;
