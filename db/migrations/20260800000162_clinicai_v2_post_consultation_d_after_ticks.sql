-- ============================================================================
-- Migration 162 · clinicai-v2 · POST-CONSULTATION D_AFTER TICK
-- ============================================================================
--
-- Propósito (CRM_PHASE_2K):
--   Tick function para wa_agenda_automations.trigger_type='d_after'.
--   Resolve gap P0 da auditoria 2E: 5 regras ativas (Apos Consulta D+1,
--   Pos-procedimento D+2/D+3, Pedir Avaliacao, NPS D+7) configuradas no banco
--   mas SEM ticker que as processe.
--
-- Estratégia (mesmo padrão de mig 160 d_before/d_zero):
--   - Função pública SQL · SECURITY DEFINER · service_role only
--   - Janela: target_date = today_SP - trigger_config.days
--   - Status elegível: 'finalizado' (consulta acabou)
--   - Channel filter: whatsapp OR alert (skip 'task' · sem fila de tasks ainda)
--   - Recipient: patient (subject_phone) ou professional (_appt_professional_phone)
--   - lead_id NOT NULL obrigatório (guard _enqueue_agenda_alert)
--   - Idempotência: agenda_alerts_log UNIQUE(appt_id, alert_kind)
--   - alert_kind: 'day_plus_N' (não colide com day_minus_N, day_zero, min10)
--   - Content nunca vazio (NULLIF fallback mig 158)
--
-- Worker 71 segue OFF · gera fila wa_outbox queued · zero envio real.
-- Ban gate 2L preservado · zero call Meta/Evolution.
--
-- Fora de escopo (não toca):
--   - _enqueue_agenda_alert (mig 156+158 · reuso)
--   - _render_appt_template (mig 154 · reuso)
--   - _appt_professional_phone (reuso)
--   - tick fns d_before/d_zero/min_before (intactas)
--   - cron.job (NÃO cria cron nesta migration · ativação separada)
--   - TS/app code
--   - wa_agenda_automations regras (dados não alterados)
--
-- Rollback: down DROP simples.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- _agenda_alert_d_after_tick()
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._agenda_alert_d_after_tick()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  r_appt        record;
  v_rule        record;
  v_phone       text;
  v_alert_kind  text;
  v_days_after  int;
  v_target_date date;
  v_today_sp    date;
  v_fired       int := 0;
BEGIN
  /*
    Processa regras wa_agenda_automations com trigger_type='d_after'.
    Para cada rule ativa whatsapp/alert, busca appointments finalizados cuja
    scheduled_date = today_SP - N days (N do trigger_config.days).

    alert_kind = 'day_plus_' || N · não colide com day_minus_N / day_zero / min10.

    Channel: somente whatsapp OR alert. Channel 'task' fica fora do escopo
    desta fase (sem fila de tasks ainda).

    Recipient: patient (subject_phone) OR professional (_appt_professional_phone).

    Status elegível: 'finalizado' somente. NÃO disparar para cancelado/no_show/
    remarcado/bloqueado/agendado/etc (consulta precisa ter acontecido).

    Idempotência via agenda_alerts_log UNIQUE(appt_id, alert_kind).
    Não envia mensagem · só enfileira em wa_outbox via _enqueue_agenda_alert.
    Worker 71 desligado mantém estado dry · zero envio real.
  */

  v_today_sp := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  FOR v_rule IN
    SELECT *,
           COALESCE((trigger_config->>'days')::int, 1) AS days
    FROM public.wa_agenda_automations
    WHERE is_active = true
      AND trigger_type = 'd_after'
      AND recipient_type IN ('patient', 'professional')
      AND (channel ILIKE '%alert%' OR channel ILIKE '%whatsapp%')
  LOOP
    v_days_after  := v_rule.days;
    v_alert_kind  := 'day_plus_' || v_days_after::text;
    v_target_date := v_today_sp - v_days_after;

    FOR r_appt IN
      SELECT a.*
      FROM public.appointments a
      WHERE a.clinic_id = v_rule.clinic_id
        AND a.deleted_at IS NULL
        AND a.scheduled_date = v_target_date
        AND a.status = 'finalizado'
        AND a.lead_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.agenda_alerts_log l
          WHERE l.appt_id    = a.id::text
            AND l.alert_kind = v_alert_kind
        )
    LOOP
      -- Resolve phone por recipient_type
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

COMMENT ON FUNCTION public._agenda_alert_d_after_tick() IS
  'Mig 162 (CRM_PHASE_2K) · processa wa_agenda_automations trigger_type=d_after · enfileira wa_outbox idempotente via _enqueue_agenda_alert. alert_kind=day_plus_N. Status elegível: finalizado. Channel: whatsapp/alert (skip task). Worker 71 OFF · zero envio real.';

GRANT EXECUTE ON FUNCTION public._agenda_alert_d_after_tick() TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY DO block
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_exists       boolean;
  v_enqueue_exists  boolean;
  v_render_exists   boolean;
  v_d_before_ok     boolean;
  v_d_zero_ok       boolean;
BEGIN
  -- Função nova existe
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_agenda_alert_d_after_tick') INTO v_fn_exists;
  IF NOT v_fn_exists THEN
    RAISE EXCEPTION 'sanity: _agenda_alert_d_after_tick nao foi criada';
  END IF;

  -- Helpers presentes
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_enqueue_agenda_alert') INTO v_enqueue_exists;
  IF NOT v_enqueue_exists THEN
    RAISE EXCEPTION 'sanity: helper _enqueue_agenda_alert ausente · mig 156/158 nao aplicada?';
  END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_render_appt_template') INTO v_render_exists;
  IF NOT v_render_exists THEN
    RAISE EXCEPTION 'sanity: helper _render_appt_template ausente · mig 154 nao aplicada?';
  END IF;

  -- Ticks irmãs (mig 160) intactas · sanity defensiva
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_agenda_alert_d_before_tick') INTO v_d_before_ok;
  IF NOT v_d_before_ok THEN
    RAISE EXCEPTION 'sanity: _agenda_alert_d_before_tick (mig 160) ausente · regressão?';
  END IF;
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_agenda_alert_d_zero_tick') INTO v_d_zero_ok;
  IF NOT v_d_zero_ok THEN
    RAISE EXCEPTION 'sanity: _agenda_alert_d_zero_tick (mig 160) ausente · regressão?';
  END IF;

  RAISE NOTICE 'mig 162 · _agenda_alert_d_after_tick criada · helpers OK · ticks irmãs intactas';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
