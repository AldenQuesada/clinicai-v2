-- ============================================================================
-- CRM_PHASE_2F · SMOKE TRANSACIONAL · APPOINTMENT CONFIRMATION TICKS
-- ============================================================================
-- Estratégia: DO block PL/pgSQL com BEGIN implícito + RAISE EXCEPTION final
-- para forçar ROLLBACK e retornar JSON com resultados no error.message.
--
-- Padrão idêntico aos smokes 2D.3D.1-R2/R3. Zero efeito persistente.
--
-- PRÉ-REQUISITO: mig 160 aplicada (tick fns presentes). Se não aplicada,
-- rodar este smoke retorna erro de função não encontrada.
--
-- Garantias:
-- 1. ROLLBACK obrigatório via RAISE EXCEPTION (código P0001)
-- 2. Fixture appointment criado SOMENTE dentro da transação
-- 3. Tick d_before e d_zero ambos executados
-- 4. Validação idempotência (segunda execução = zero duplicação)
-- 5. Validação contratos: content não vazio, phone não vazio, lead_id não nulo
-- 6. Cleanup automático pelo ROLLBACK
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id        uuid := public._default_clinic_id();
  v_lead_id          uuid;
  v_appt_d_before_id uuid;
  v_appt_d_zero_id   uuid;
  v_today_sp         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_tomorrow_sp      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1;
  v_fired_d_before_1 int;
  v_fired_d_before_2 int;
  v_fired_d_zero_1   int;
  v_fired_d_zero_2   int;
  v_baseline         jsonb;
  v_validation       jsonb;
  v_idempotency      jsonb;
  v_appts            jsonb;
BEGIN
  -- ── Baseline pré-fixture ─────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'wa_outbox_total',          (SELECT count(*) FROM public.wa_outbox),
    'agenda_alerts_log_total',  (SELECT count(*) FROM public.agenda_alerts_log),
    'appointments_total',       (SELECT count(*) FROM public.appointments),
    'today_sp',                 v_today_sp,
    'tomorrow_sp',              v_tomorrow_sp
  ) INTO v_baseline;

  -- ── Lead existente reutilizado (sem criar lead novo) ─────────────────────
  -- Pega o primeiro lead 'lead' phase ativo da clinic default · só pra
  -- satisfazer FK e guards. ROLLBACK reverte qualquer side-effect.
  SELECT id INTO v_lead_id
  FROM public.leads
  WHERE clinic_id = v_clinic_id
    AND lifecycle_status = 'ativo'
    AND deleted_at IS NULL
    AND phone IS NOT NULL AND length(trim(phone)) > 0
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PRE_FAIL: nenhum lead ativo com phone para fixture';
  END IF;

  -- ── Fixture 1: appointment amanhã (d_before days=1) ──────────────────────
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status, consentimento_img,
    created_at
  ) VALUES (
    v_clinic_id,
    v_lead_id,
    'Smoke 2F D-1',
    '5544999422944',
    '06757b9f-2a03-43ae-bd37-28021eb6afeb',
    'ALDEN JULIO QUESADA SIFONTES',
    v_tomorrow_sp,
    '10:00'::time,
    '10:30'::time,
    'Smoke 2F D-1',
    'agendado',
    0,
    'pendente',
    'pendente',
    -- created_at no passado para satisfazer min_lead_days=2 da rule "Confirmacao D-1"
    now() - interval '3 days'
  ) RETURNING id INTO v_appt_d_before_id;

  -- ── Fixture 2: appointment hoje (d_zero) ─────────────────────────────────
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status, consentimento_img,
    created_at
  ) VALUES (
    v_clinic_id,
    v_lead_id,
    'Smoke 2F D0',
    '5544999422944',
    '06757b9f-2a03-43ae-bd37-28021eb6afeb',
    'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp,
    '15:00'::time,
    '15:30'::time,
    'Smoke 2F D0',
    'confirmado',
    0,
    'pendente',
    'pendente',
    now() - interval '1 hour'
  ) RETURNING id INTO v_appt_d_zero_id;

  -- ── Tick 1 ───────────────────────────────────────────────────────────────
  SELECT public._agenda_alert_d_before_tick() INTO v_fired_d_before_1;
  SELECT public._agenda_alert_d_zero_tick()   INTO v_fired_d_zero_1;

  -- ── Validação ────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'fired_d_before_1', v_fired_d_before_1,
    'fired_d_zero_1',   v_fired_d_zero_1,
    'log_d_before', (
      SELECT to_jsonb(l) FROM public.agenda_alerts_log l
      WHERE l.appt_id = v_appt_d_before_id::text
        AND l.alert_kind = 'day_minus_1'
    ),
    'log_d_zero', (
      SELECT to_jsonb(l) FROM public.agenda_alerts_log l
      WHERE l.appt_id = v_appt_d_zero_id::text
        AND l.alert_kind = 'day_zero'
    ),
    'outbox_d_before', (
      SELECT jsonb_build_object(
        'id', o.id, 'phone', o.phone,
        'content_len', length(o.content),
        'content_not_empty', (o.content IS NOT NULL AND length(o.content) > 0),
        'content_preview', substring(o.content from 1 for 80),
        'lead_id', o.lead_id, 'status', o.status, 'rule_id', o.rule_id,
        'appt_ref', o.appt_ref
      ) FROM public.wa_outbox o WHERE o.appt_ref = v_appt_d_before_id::text
    ),
    'outbox_d_zero', (
      SELECT jsonb_build_object(
        'id', o.id, 'phone', o.phone,
        'content_len', length(o.content),
        'content_not_empty', (o.content IS NOT NULL AND length(o.content) > 0),
        'content_preview', substring(o.content from 1 for 80),
        'lead_id', o.lead_id, 'status', o.status, 'rule_id', o.rule_id,
        'appt_ref', o.appt_ref
      ) FROM public.wa_outbox o WHERE o.appt_ref = v_appt_d_zero_id::text
    )
  ) INTO v_validation;

  -- ── Tick 2 (idempotência) ────────────────────────────────────────────────
  SELECT public._agenda_alert_d_before_tick() INTO v_fired_d_before_2;
  SELECT public._agenda_alert_d_zero_tick()   INTO v_fired_d_zero_2;

  SELECT jsonb_build_object(
    'fired_d_before_2', v_fired_d_before_2,
    'fired_d_zero_2',   v_fired_d_zero_2,
    'log_d_before_count', (
      SELECT count(*) FROM public.agenda_alerts_log
      WHERE appt_id = v_appt_d_before_id::text AND alert_kind = 'day_minus_1'),
    'log_d_zero_count', (
      SELECT count(*) FROM public.agenda_alerts_log
      WHERE appt_id = v_appt_d_zero_id::text AND alert_kind = 'day_zero'),
    'outbox_d_before_count', (
      SELECT count(*) FROM public.wa_outbox WHERE appt_ref = v_appt_d_before_id::text),
    'outbox_d_zero_count', (
      SELECT count(*) FROM public.wa_outbox WHERE appt_ref = v_appt_d_zero_id::text)
  ) INTO v_idempotency;

  SELECT jsonb_build_object(
    'd_before_id', v_appt_d_before_id,
    'd_zero_id',   v_appt_d_zero_id,
    'lead_id',     v_lead_id
  ) INTO v_appts;

  -- ── Forçar ROLLBACK ──────────────────────────────────────────────────────
  RAISE EXCEPTION 'SMOKE_RESULT_2F:%', jsonb_build_object(
    'baseline',     v_baseline,
    'fixture_ids',  v_appts,
    'validation',   v_validation,
    'idempotency',  v_idempotency
  )::text;
END
$BLK$;

-- ROLLBACK implícito pelo RAISE EXCEPTION acima.
-- Counters de produção retornam ao baseline. Nenhum dado persiste.
