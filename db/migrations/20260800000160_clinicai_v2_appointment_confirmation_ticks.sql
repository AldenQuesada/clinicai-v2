-- ============================================================================
-- Migration 160 · clinicai-v2 · APPOINTMENT CONFIRMATION TICKS (d_before + d_zero)
-- ============================================================================
--
-- Propósito:
--   Implementar as tick functions que processam regras `wa_agenda_automations`
--   com `trigger_type IN ('d_before', 'd_zero')`. Estas regras existem ativas
--   no banco há tempos (Confirmacao D-1, Chegou o Dia) mas SEM tick fn ·
--   gap P0 identificado na fase 2E.
--
-- Escopo:
--   - 2 funções novas (forward · CREATE OR REPLACE):
--     1. _agenda_alert_d_before_tick() RETURNS integer
--     2. _agenda_alert_d_zero_tick()   RETURNS integer
--   - Sanity DO block valida ambas presentes + signature do _enqueue_agenda_alert
--   - NOTIFY pgrst reload
--
-- Fora de escopo (NÃO toca):
--   - _enqueue_agenda_alert (reusa as-is · mig 156+158)
--   - _render_appt_template (reusa as-is · mig 154)
--   - _appt_professional_phone (reusa as-is)
--   - _agenda_alert_min_before_tick (mig 156 · job 72 · intocada)
--   - wa_daily_summary (mig 155 · job 12 · intocada)
--   - tabelas: appointments, leads, wa_outbox, wa_agenda_automations, agenda_alerts_log (zero DML)
--   - triggers existentes
--   - cron.job (zero alteração · jobs 12/71/72 inalterados · NÃO cria cron novo)
--   - TS / app code
--
-- Estado seguro pós-apply:
--   - Funções existem mas NÃO são chamadas por nenhum cron ainda
--   - Apply não dispara envio automático
--   - Ativação requer fase futura com autorização explícita (criar cron 73/74)
--
-- Contratos garantidos:
--   - Status elegíveis: agendado, aguardando_confirmacao, confirmado
--   - Recipient: patient (subject_phone) ou professional (_appt_professional_phone)
--   - Channel: whatsapp OR alert (task fora do escopo)
--   - lead_id NOT NULL obrigatório (herdado de _enqueue_agenda_alert)
--   - Phone resolvível obrigatório
--   - Content nunca vazio (NULLIF fallback de mig 158)
--   - Idempotência via agenda_alerts_log UNIQUE(appt_id, alert_kind)
--   - alert_kind: 'day_minus_N' para d_before · 'day_zero' para d_zero
--   - Não colide com 'min10', 'min15', etc do min_before tick
--
-- Rollback: down DROP ordenado (seguro · só remove funções novas).
-- Apply controlado: PREP nesta fase · apply fica para 2F.2.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. _agenda_alert_d_before_tick()
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._agenda_alert_d_before_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  r_appt          record;
  v_rule          record;
  v_phone         text;
  v_alert_kind    text;
  v_days_before   int;
  v_min_lead_days int;
  v_target_date   date;
  v_today_sp      date;
  v_fired         int := 0;
BEGIN
  /*
    Processa regras wa_agenda_automations com trigger_type='d_before'.
    Para cada rule ativa, busca appointments cuja scheduled_date = today_SP + N days,
    onde N = trigger_config->>'days' (default 1).

    Idempotência: agenda_alerts_log UNIQUE(appt_id, alert_kind).
    alert_kind = 'day_minus_' || N (não colide com min_before).

    Channel processado: whatsapp OR alert. Channel='task' fora do escopo.
    Recipient processado: patient (subject_phone) OR professional (_appt_professional_phone).
    Status elegíveis: agendado, aguardando_confirmacao, confirmado.

    min_lead_days: se rule.trigger_config->>'min_lead_days' > 0, exige que
    appointment.created_at <= now() - interval 'N days'. Evita confirmar appt
    criado on-the-fly (paciente sabe que tem · não precisa lembrar).

    Não envia mensagem · só enfileira em wa_outbox via _enqueue_agenda_alert.
    Worker 71 desligado mantém estado dry · zero envio real.
  */

  v_today_sp := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  FOR v_rule IN
    SELECT *,
           COALESCE((trigger_config->>'days')::int, 1)             AS days,
           COALESCE((trigger_config->>'min_lead_days')::int, 0)    AS min_lead_days_v
    FROM public.wa_agenda_automations
    WHERE is_active = true
      AND trigger_type = 'd_before'
      AND recipient_type IN ('patient', 'professional')
      AND (channel ILIKE '%alert%' OR channel ILIKE '%whatsapp%')
  LOOP
    v_days_before   := v_rule.days;
    v_min_lead_days := v_rule.min_lead_days_v;
    v_alert_kind    := 'day_minus_' || v_days_before::text;
    v_target_date   := v_today_sp + v_days_before;

    FOR r_appt IN
      SELECT a.*
      FROM public.appointments a
      WHERE a.clinic_id = v_rule.clinic_id
        AND a.deleted_at IS NULL
        AND a.scheduled_date = v_target_date
        AND a.status IN ('agendado','aguardando_confirmacao','confirmado')
        AND a.lead_id IS NOT NULL
        AND (
          v_min_lead_days <= 0
          OR a.created_at <= now() - (v_min_lead_days || ' days')::interval
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.agenda_alerts_log l
          WHERE l.appt_id    = a.id::text
            AND l.alert_kind = v_alert_kind
        )
    LOOP
      -- Resolve phone por recipient_type da regra
      IF v_rule.recipient_type = 'patient' THEN
        v_phone := r_appt.subject_phone;
      ELSE
        v_phone := public._appt_professional_phone(r_appt);
      END IF;

      IF v_phone IS NOT NULL AND length(trim(v_phone)) > 0 THEN
        PERFORM public._enqueue_agenda_alert(
          r_appt.clinic_id,
          r_appt,
          v_alert_kind,
          v_rule,
          v_phone
        );
        v_fired := v_fired + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_fired;
END;
$function$;

COMMENT ON FUNCTION public._agenda_alert_d_before_tick() IS
  'Mig 160 · processa wa_agenda_automations trigger_type=d_before · enfileira '
  'wa_outbox idempotente via _enqueue_agenda_alert. alert_kind=day_minus_N. '
  'Status elegíveis: agendado/aguardando_confirmacao/confirmado. min_lead_days '
  'respeitado quando trigger_config define. Não chamada por cron até autorização.';

GRANT EXECUTE ON FUNCTION public._agenda_alert_d_before_tick() TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. _agenda_alert_d_zero_tick()
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._agenda_alert_d_zero_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  r_appt       record;
  v_rule       record;
  v_phone      text;
  v_alert_kind text := 'day_zero';
  v_today_sp   date;
  v_fired      int := 0;
BEGIN
  /*
    Processa regras wa_agenda_automations com trigger_type='d_zero'.
    Para cada rule ativa, busca appointments cuja scheduled_date = today_SP.

    alert_kind = 'day_zero' (não colide com 'day_minus_N' nem 'min10').

    Mesmas regras de status, channel, recipient e idempotência do d_before tick.
    Sem min_lead_days (lembrete do dia · sem restrição de quanto antes foi criado).
  */

  v_today_sp := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  FOR v_rule IN
    SELECT *
    FROM public.wa_agenda_automations
    WHERE is_active = true
      AND trigger_type = 'd_zero'
      AND recipient_type IN ('patient', 'professional')
      AND (channel ILIKE '%alert%' OR channel ILIKE '%whatsapp%')
  LOOP
    FOR r_appt IN
      SELECT a.*
      FROM public.appointments a
      WHERE a.clinic_id = v_rule.clinic_id
        AND a.deleted_at IS NULL
        AND a.scheduled_date = v_today_sp
        AND a.status IN ('agendado','aguardando_confirmacao','confirmado')
        AND a.lead_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.agenda_alerts_log l
          WHERE l.appt_id    = a.id::text
            AND l.alert_kind = v_alert_kind
        )
    LOOP
      IF v_rule.recipient_type = 'patient' THEN
        v_phone := r_appt.subject_phone;
      ELSE
        v_phone := public._appt_professional_phone(r_appt);
      END IF;

      IF v_phone IS NOT NULL AND length(trim(v_phone)) > 0 THEN
        PERFORM public._enqueue_agenda_alert(
          r_appt.clinic_id,
          r_appt,
          v_alert_kind,
          v_rule,
          v_phone
        );
        v_fired := v_fired + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_fired;
END;
$function$;

COMMENT ON FUNCTION public._agenda_alert_d_zero_tick() IS
  'Mig 160 · processa wa_agenda_automations trigger_type=d_zero · enfileira '
  'wa_outbox idempotente via _enqueue_agenda_alert. alert_kind=day_zero. '
  'Status elegíveis: agendado/aguardando_confirmacao/confirmado. Não chamada '
  'por cron até autorização.';

GRANT EXECUTE ON FUNCTION public._agenda_alert_d_zero_tick() TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY DO block · aborta apply em violação
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_d_before_exists  boolean;
  v_d_zero_exists    boolean;
  v_enqueue_exists   boolean;
  v_render_exists    boolean;
  v_min_before_def_ok boolean;
BEGIN
  -- Tick fns novas presentes
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='_agenda_alert_d_before_tick'
  ) INTO v_d_before_exists;
  IF NOT v_d_before_exists THEN
    RAISE EXCEPTION 'sanity: _agenda_alert_d_before_tick nao foi criada';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='_agenda_alert_d_zero_tick'
  ) INTO v_d_zero_exists;
  IF NOT v_d_zero_exists THEN
    RAISE EXCEPTION 'sanity: _agenda_alert_d_zero_tick nao foi criada';
  END IF;

  -- Helpers requeridos presentes (sanity defensiva)
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='_enqueue_agenda_alert'
  ) INTO v_enqueue_exists;
  IF NOT v_enqueue_exists THEN
    RAISE EXCEPTION 'sanity: _enqueue_agenda_alert helper ausente · mig 156/158 nao aplicada?';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='_render_appt_template'
  ) INTO v_render_exists;
  IF NOT v_render_exists THEN
    RAISE EXCEPTION 'sanity: _render_appt_template helper ausente · mig 154 nao aplicada?';
  END IF;

  -- Min_before tick não regrediu (mig 156 preservada)
  SELECT (position('l.appt_id = a.id::text' IN pg_get_functiondef('public._agenda_alert_min_before_tick()'::regprocedure)) > 0)
    INTO v_min_before_def_ok;
  IF NOT v_min_before_def_ok THEN
    RAISE EXCEPTION 'sanity: _agenda_alert_min_before_tick mig 156 cast (a.id::text) nao detectado · regressao?';
  END IF;

  RAISE NOTICE 'mig 160 · 2 tick fns criadas · helpers OK · min_before intacto';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
