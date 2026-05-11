-- ============================================================================
-- Migration 156 · clinicai-v2 · agenda alert automation hardening
-- ============================================================================
--
-- Propósito:
--   Corrigir 2 blockers em automações de alerta de agenda atualmente
--   DESLIGADAS (cron job 72 `agenda_alert_min_before_tick` · active=false).
--   Sem essa correção, religar o cron quebraria em produção.
--
-- Blockers identificados (def real capturada via pg_get_functiondef):
--
-- 1. public._agenda_alert_min_before_tick()
--    - WHERE l.appt_id = a.id
--    - agenda_alerts_log.appt_id é text · appointments.id é uuid
--    - Comparação implícita uuid→text inconsistente. Corrigir para
--      l.appt_id = a.id::text.
--
-- 2. public._enqueue_agenda_alert(uuid, record, text, record, text)
--    - INSERT INTO public.wa_outbox usa p_appt.patient_id como lead_id.
--    - wa_outbox.lead_id é uuid NOT NULL (mesmo problema da mig 155).
--    - Quando appt é lead-only (patient_id NULL), INSERT falha.
--    - Semanticamente errado: o campo é lead_id, não subject_id.
--    - Decisão técnica do Alden: usar APENAS p_appt.lead_id · se NULL,
--      sair sem inserir (return NULL) · zero throw.
--    - Idem em agenda_alerts_log.lead_id: usar p_appt.lead_id::text.
--
-- 3. Garantir UNIQUE (appt_id, alert_kind) em agenda_alerts_log para
--    suportar o ON CONFLICT já presente no _enqueue_agenda_alert.
--    Hoje há apenas PK em id + FK em clinic_id (sem unique nessa tupla).
--    Idempotente: cria só se não existir.
--
-- Defs capturadas via pg_get_functiondef em prod (Management API SELECT ·
-- token deletado pós-prep) e reproduzidas 1:1 EXCETO pelas correções acima.
--
-- Fora de escopo (não tocadas):
--   - wa_daily_summary, _render_appt_template, appt_upsert, appt_sync_batch,
--     _appt_upsert_one, appointment_attend, appointment_finalize,
--     appointment_change_status, lead_to_appointment, demais RPCs
--   - cron.job (jobs 12/71/72 inalterados · 72 continua DESLIGADO)
--   - schema da tabela wa_outbox (lead_id permanece NOT NULL)
--   - schema da tabela appointments
--   - wa_outbox_worker_tick / wa_agenda_automations data / WhatsApp /
--     Evolution / Secretaria
--   - TS Lara v2
--   - backfill / DML em qualquer tabela de negócio
--
-- Rollback: down NO-OP defensivo (não restaura bug text/uuid · não restaura
-- patient_id como lead_id).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. UNIQUE(appt_id, alert_kind) em agenda_alerts_log (idempotente)
--    Tabela está vazia (total_rows=0 · confirmado pelo Alden) · criação
--    segura sem risco de violação. Suporta ON CONFLICT no _enqueue_agenda_alert.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'agenda_alerts_log'
      AND c.contype = 'u'
      AND c.conkey @> (
        SELECT array_agg(attnum ORDER BY attnum)
        FROM pg_attribute
        WHERE attrelid = 'public.agenda_alerts_log'::regclass
          AND attname IN ('appt_id','alert_kind')
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'agenda_alerts_log'
      AND indexdef ILIKE '%UNIQUE%appt_id%alert_kind%'
  ) THEN
    EXECUTE 'ALTER TABLE public.agenda_alerts_log
             ADD CONSTRAINT agenda_alerts_log_appt_id_alert_kind_key
             UNIQUE (appt_id, alert_kind)';
    RAISE NOTICE 'mig 156 · agenda_alerts_log_appt_id_alert_kind_key criado';
  ELSE
    RAISE NOTICE 'mig 156 · unique (appt_id, alert_kind) ja existe · pulado';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. _agenda_alert_min_before_tick()
--    Fix: l.appt_id = a.id  →  l.appt_id = a.id::text
--    Resto 1:1 com def capturada em prod.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._agenda_alert_min_before_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  r_appt  record;
  v_rule  record;
  v_phone text;
  v_fired int := 0;
  v_mins  int;
BEGIN
  /*
    MIGRATION 010A — AGENDA MIN BEFORE CANONICAL STATUS

    Remove legado:
    - pre_consulta

    MIGRATION 156 (2026-05-11): cast l.appt_id = a.id::text porque
    agenda_alerts_log.appt_id é text e appointments.id é uuid.
  */

  FOR v_rule IN
    SELECT *, COALESCE((trigger_config->>'minutes')::int, 10) AS mins
    FROM public.wa_agenda_automations
    WHERE is_active = true
      AND trigger_type = 'min_before'
      AND recipient_type IN ('professional','admin')
      AND (channel ILIKE '%alert%' OR channel ILIKE '%whatsapp%')
  LOOP
    v_mins := v_rule.mins;

    FOR r_appt IN
      SELECT a.*
      FROM public.appointments a
      WHERE a.clinic_id = v_rule.clinic_id
        AND a.deleted_at IS NULL
        AND a.status IN (
          'agendado',
          'aguardando_confirmacao',
          'confirmado',
          'aguardando'
        )
        AND (
          (a.scheduled_date::text || ' ' || a.start_time::text)::timestamp
            AT TIME ZONE 'America/Sao_Paulo'
        ) BETWEEN now() + ((v_mins - 1) || ' minutes')::interval
              AND now() + ((v_mins + 1) || ' minutes')::interval
        AND NOT EXISTS (
          SELECT 1
          FROM public.agenda_alerts_log l
          WHERE l.appt_id = a.id::text          -- mig 156: cast uuid → text
            AND l.alert_kind = 'min' || v_mins::text
        )
    LOOP
      v_phone := public._appt_professional_phone(r_appt);

      IF v_phone IS NOT NULL THEN
        PERFORM public._enqueue_agenda_alert(
          r_appt.clinic_id,
          r_appt,
          'min' || v_mins::text,
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

COMMENT ON FUNCTION public._agenda_alert_min_before_tick() IS
  'Tick do cron job 72 (DESLIGADO). Dispara alertas min_before via _enqueue_agenda_alert. Mig 156 (2026-05-11): cast l.appt_id = a.id::text · agenda_alerts_log.appt_id é text e appointments.id é uuid. Resto idêntico à versão pré-156.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. _enqueue_agenda_alert(uuid, record, text, record, text)
--    Fixes:
--      a. Guard `IF p_appt.lead_id IS NULL THEN RETURN NULL; END IF;` antes do INSERT
--         (evita NOT NULL violation em wa_outbox.lead_id).
--      b. wa_outbox.lead_id: usar p_appt.lead_id (não p_appt.patient_id).
--      c. agenda_alerts_log.lead_id: usar p_appt.lead_id::text (não p_appt.patient_id::text).
--    Resto 1:1 com def capturada em prod (preserva content rendering,
--    regexp phone, RETURNING outbox_id, ON CONFLICT (appt_id, alert_kind)).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._enqueue_agenda_alert(p_clinic_id uuid, p_appt record, p_alert_kind text, p_rule record, p_phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_content text;
  v_phone text;
  v_outbox_id uuid;
BEGIN
  IF p_clinic_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RETURN NULL;
  END IF;

  -- mig 156: guard antes do INSERT · wa_outbox.lead_id é uuid NOT NULL.
  -- Se appointment é patient-only (lead_id NULL), sair silenciosamente.
  -- Não usar patient_id como lead_id (decisão Alden · viola semântica FK).
  IF p_appt.lead_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');

  IF v_phone = '' THEN
    RETURN NULL;
  END IF;

  v_content := coalesce(
    public._render_appt_template(p_rule.content_template, p_appt),
    public._render_appt_template(p_rule.alert_title, p_appt),
    '[Alerta] ' || p_alert_kind
  );

  WITH inserted_outbox AS (
    INSERT INTO public.wa_outbox (
      clinic_id,
      lead_id,
      phone,
      content,
      content_type,
      scheduled_at,
      business_hours,
      priority,
      max_attempts,
      status,
      appt_ref,
      rule_id
    ) VALUES (
      p_clinic_id,
      p_appt.lead_id,                            -- mig 156: lead_id real (não patient_id)
      v_phone,
      v_content,
      'text',
      now(),
      true,
      1,
      3,
      'queued',
      p_appt.id,
      p_rule.id
    )
    RETURNING id
  )
  SELECT inserted_outbox.id
  INTO v_outbox_id
  FROM inserted_outbox;

  INSERT INTO public.agenda_alerts_log (
    clinic_id,
    appt_id,
    lead_id,
    alert_kind,
    rule_id,
    recipient,
    outbox_id
  ) VALUES (
    p_clinic_id,
    p_appt.id,
    p_appt.lead_id::text,                        -- mig 156: lead_id real (não patient_id)
    p_alert_kind,
    p_rule.id,
    v_phone,
    v_outbox_id
  )
  ON CONFLICT (appt_id, alert_kind) DO NOTHING;

  RETURN v_outbox_id;
END;
$function$;

COMMENT ON FUNCTION public._enqueue_agenda_alert(uuid, record, text, record, text) IS
  'Enfileira alerta de agenda em wa_outbox + registra em agenda_alerts_log. Idempotente via ON CONFLICT (appt_id, alert_kind). Mig 156 (2026-05-11): guard para p_appt.lead_id IS NULL (return NULL · cenário patient-only) · wa_outbox.lead_id usa p_appt.lead_id (não patient_id · viola semântica FK + NOT NULL). Resto idêntico à versão pré-156.';

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY CHECK (dentro da transação · aborta apply se faltar)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def_tick text;
  v_def_enq  text;
BEGIN
  SELECT pg_get_functiondef('public._agenda_alert_min_before_tick()'::regprocedure) INTO v_def_tick;
  SELECT pg_get_functiondef('public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure) INTO v_def_enq;

  -- _agenda_alert_min_before_tick: cast presente
  IF position('a.id::text' IN v_def_tick) = 0 THEN
    RAISE EXCEPTION 'sanity: _agenda_alert_min_before_tick sem cast a.id::text';
  END IF;

  -- _enqueue_agenda_alert: não usa patient_id como lead_id em wa_outbox
  IF position('p_appt.patient_id' IN v_def_enq) > 0 THEN
    RAISE EXCEPTION 'sanity: _enqueue_agenda_alert ainda menciona p_appt.patient_id';
  END IF;
  -- _enqueue_agenda_alert: usa p_appt.lead_id
  IF position('p_appt.lead_id' IN v_def_enq) = 0 THEN
    RAISE EXCEPTION 'sanity: _enqueue_agenda_alert nao usa p_appt.lead_id';
  END IF;
  -- _enqueue_agenda_alert: tem guarda IS NULL
  IF position('p_appt.lead_id IS NULL' IN v_def_enq) = 0 THEN
    RAISE EXCEPTION 'sanity: _enqueue_agenda_alert sem guarda p_appt.lead_id IS NULL';
  END IF;
  -- _enqueue_agenda_alert: sem padrão COALESCE legado
  IF position('COALESCE(p_appt.lead_id, p_appt.patient_id)' IN v_def_enq) > 0 THEN
    RAISE EXCEPTION 'sanity: _enqueue_agenda_alert ainda usa COALESCE legado';
  END IF;

  -- unique constraint agenda_alerts_log(appt_id, alert_kind) existe
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'agenda_alerts_log'
      AND c.contype = 'u'
      AND c.conkey @> (
        SELECT array_agg(attnum ORDER BY attnum)
        FROM pg_attribute
        WHERE attrelid = 'public.agenda_alerts_log'::regclass
          AND attname IN ('appt_id','alert_kind')
      )
  ) THEN
    RAISE EXCEPTION 'sanity: agenda_alerts_log sem unique (appt_id, alert_kind)';
  END IF;

  RAISE NOTICE 'mig 156 · sanity OK · automações de alerta hardened';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
