-- ============================================================================
-- Migration 158 · clinicai-v2 · agenda alert content fallback hardening
-- ============================================================================
--
-- Propósito:
--   Corrigir o fallback de conteúdo em `_enqueue_agenda_alert` que permitia
--   `wa_outbox.content = ''` quando `wa_agenda_automations.content_template`
--   é string vazia.
--
-- Bug observado em smoke 2D.3D.1-R2 (achado adjacente · não bloqueia FK):
--   - rule "Alerta 10 Min" tem `content_template = ''` e `alert_title` válido
--   - `_render_appt_template('')` retorna `''` (não NULL)
--   - `COALESCE('', rendered_alert_title, fallback)` escolhe `''`
--   - wa_outbox.content fica vazio · bloqueia ativação do job 72
--
-- Correção cirúrgica:
--   `COALESCE(NULLIF(render(content_template), ''), NULLIF(render(alert_title), ''), '[Alerta] '||kind)`
--   `NULLIF(x, '')` retorna NULL se x = ''; COALESCE pula NULL e cai no próximo.
--
-- Escopo mínimo:
--   - Recria APENAS `public._enqueue_agenda_alert(uuid, record, text, record, text)`
--   - Preserva: assinatura, retorno, SECURITY DEFINER, search_path, guards,
--     normalização telefone, INSERT wa_outbox, lead_id real, agenda_alerts_log,
--     ON CONFLICT (appt_id, alert_kind), grants (CREATE OR REPLACE preserva)
--   - Mantém comentários originais sobre mig 156 (lead_id real, não patient_id)
--
-- Fora de escopo (não tocadas):
--   - _render_appt_template (mig 154)
--   - _agenda_alert_min_before_tick (mig 156)
--   - _appt_professional_phone
--   - wa_daily_summary (mig 155)
--   - appt_* (mig 153)
--   - cron.job (12/71/72 inalterados · 71/72 continuam desligados)
--   - schema de wa_outbox/agenda_alerts_log/wa_agenda_automations/appointments
--   - regras wa_agenda_automations (templates não modificados)
--   - TS Lara v2 (apps/lara/src/)
--   - WhatsApp / Evolution / Secretaria
--
-- Rollback: down NO-OP defensivo (rollback exige forward migration nova).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Recria _enqueue_agenda_alert com NULLIF nos renders (correção mínima)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._enqueue_agenda_alert(
  p_clinic_id  uuid,
  p_appt       record,
  p_alert_kind text,
  p_rule       record,
  p_phone      text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_content   text;
  v_phone     text;
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

  -- mig 158: NULLIF(..., '') trata string vazia como NULL para o COALESCE
  -- pular para o próximo candidato. Sem isso, content_template='' ganhava
  -- e wa_outbox.content ficava vazio.
  v_content := COALESCE(
    NULLIF(public._render_appt_template(p_rule.content_template, p_appt), ''),
    NULLIF(public._render_appt_template(p_rule.alert_title, p_appt), ''),
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

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY CHECK (dentro da transação · aborta apply em violação)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
  v_has_nullif_content   boolean;
  v_has_nullif_title     boolean;
  v_has_insert_outbox    boolean;
  v_has_lead_id_guard    boolean;
  v_has_patient_id_refs  boolean;
  v_has_on_conflict      boolean;
  v_has_old_bug_pattern  boolean;
BEGIN
  v_def := pg_get_functiondef(
    'public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure
  );

  v_has_nullif_content := position(
    'NULLIF(public._render_appt_template(p_rule.content_template, p_appt), '''')' IN v_def
  ) > 0;

  v_has_nullif_title := position(
    'NULLIF(public._render_appt_template(p_rule.alert_title, p_appt), '''')' IN v_def
  ) > 0;

  v_has_insert_outbox := position('INSERT INTO public.wa_outbox' IN v_def) > 0;
  v_has_lead_id_guard := position('p_appt.lead_id IS NULL' IN v_def) > 0;
  v_has_patient_id_refs := position('p_appt.patient_id' IN v_def) > 0;
  v_has_on_conflict := position('ON CONFLICT (appt_id, alert_kind)' IN v_def) > 0;

  -- bug pré-mig158: COALESCE direto sem NULLIF nos renders
  v_has_old_bug_pattern := position(
    'COALESCE(' || E'\n' ||
    '    public._render_appt_template(p_rule.content_template, p_appt),' || E'\n' ||
    '    public._render_appt_template(p_rule.alert_title, p_appt),'
    IN v_def
  ) > 0;

  IF NOT v_has_nullif_content THEN
    RAISE EXCEPTION 'sanity: _enqueue_agenda_alert nao tem NULLIF no render de content_template';
  END IF;
  IF NOT v_has_nullif_title THEN
    RAISE EXCEPTION 'sanity: _enqueue_agenda_alert nao tem NULLIF no render de alert_title';
  END IF;
  IF NOT v_has_insert_outbox THEN
    RAISE EXCEPTION 'sanity: _enqueue_agenda_alert nao tem INSERT INTO public.wa_outbox';
  END IF;
  IF NOT v_has_lead_id_guard THEN
    RAISE EXCEPTION 'sanity: _enqueue_agenda_alert nao tem guard p_appt.lead_id IS NULL';
  END IF;
  IF v_has_patient_id_refs THEN
    RAISE EXCEPTION 'sanity: _enqueue_agenda_alert reintroduziu p_appt.patient_id';
  END IF;
  IF NOT v_has_on_conflict THEN
    RAISE EXCEPTION 'sanity: _enqueue_agenda_alert nao tem ON CONFLICT (appt_id, alert_kind)';
  END IF;
  IF v_has_old_bug_pattern THEN
    RAISE EXCEPTION 'sanity: _enqueue_agenda_alert ainda contem padrao bugado sem NULLIF';
  END IF;

  RAISE NOTICE 'mig 158 · _enqueue_agenda_alert com NULLIF aplicado · 0 regressoes';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
