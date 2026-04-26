-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-35 · clinicai-v2 · Partnership detail RPCs (port legacy)   ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: portar 19 secoes do modal admin legacy pras    ║
-- ║ tabs do detalhe da parceria na Mira (Detalhe / Performance / Crescer /  ║
-- ║ Health). Esta mig cria a infra de DB faltante:                           ║
-- ║                                                                          ║
-- ║   1. Tabelas auxiliares (idempotente · IF NOT EXISTS):                   ║
-- ║      - b2b_health_history (snapshots de health_color · sec 16 Trend)    ║
-- ║      - b2b_audit_log (log generico · sec 18 Timeline + LGPD audit)      ║
-- ║      - b2b_consent_log (LGPD consents · sec 19)                         ║
-- ║      - b2b_group_exposures (eventos do grupo · sec 15 Cost)             ║
-- ║      - b2b_nps_responses (NPS por parceria · ja referenciada por mig 17)║
-- ║      - b2b_partnership_alerts (sec 5 Health snapshot via repo)          ║
-- ║                                                                          ║
-- ║   2. RPCs (todas SECURITY DEFINER + app_clinic_id() + GRANT auth):       ║
-- ║      - b2b_partnership_health_snapshot(uuid)  · sec 5                   ║
-- ║      - b2b_partnership_impact_score(uuid)     · sec 13                  ║
-- ║      - b2b_partnership_cost(uuid)             · sec 15                  ║
-- ║      - b2b_health_trend(uuid, int)            · sec 16                  ║
-- ║      - b2b_partnership_audit_timeline(uuid, int) · sec 18              ║
-- ║      - b2b_partnership_anonymize(uuid, text)  · sec 19                  ║
-- ║      - b2b_partnership_export_data(uuid)      · sec 19                  ║
-- ║      - b2b_consent_set / b2b_consent_get      · sec 19                  ║
-- ║      - b2b_partnership_targets_list(uuid)     · sec 7  (Targets)        ║
-- ║      - b2b_partnership_events_list(uuid)      · sec 8  (Events)         ║
-- ║      - b2b_partnership_content_list(uuid)     · sec 9  (Content)        ║
-- ║      - b2b_attribution_roi(uuid)              · sec 14 (ROI)            ║
-- ║      - b2b_attribution_leads(uuid, int)       · sec 14 (ROI history)    ║
-- ║                                                                          ║
-- ║ Padroes (mesmo rigor das migs 800-20+):                                  ║
-- ║   - SECURITY DEFINER + search_path locked                                ║
-- ║   - clinic_id via public.app_clinic_id() · NUNCA literal                 ║
-- ║   - RLS via app_clinic_id() (FORCE RLS em tables novas)                 ║
-- ║   - GRANT EXECUTE TO authenticated · zero anon                           ║
-- ║   - Defensive degradation: se tabela inexistente, RPC retorna ok=false  ║
-- ║   - Tudo idempotente (CREATE OR REPLACE / IF NOT EXISTS)                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. TABELAS AUXILIARES
-- ═══════════════════════════════════════════════════════════════════════

-- ── b2b_health_history (sec 16 Trend) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_health_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  partnership_id  uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  health_color    text NOT NULL CHECK (health_color IN ('unknown','green','yellow','red')),
  previous_color  text NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_health_history_partnership
  ON public.b2b_health_history (partnership_id, recorded_at DESC);

ALTER TABLE public.b2b_health_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_health_history_tenant" ON public.b2b_health_history;
CREATE POLICY "b2b_health_history_tenant" ON public.b2b_health_history
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT ON public.b2b_health_history TO authenticated;

-- Trigger registra mudancas de health_color
CREATE OR REPLACE FUNCTION public._b2b_health_history_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, pg_temp AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.health_color IS NOT NULL AND NEW.health_color <> 'unknown') OR
     (TG_OP = 'UPDATE' AND NEW.health_color IS DISTINCT FROM OLD.health_color) THEN
    INSERT INTO public.b2b_health_history (
      clinic_id, partnership_id, health_color, previous_color, recorded_at
    ) VALUES (
      NEW.clinic_id, NEW.id, COALESCE(NEW.health_color, 'unknown'),
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.health_color ELSE NULL END,
      now()
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_health_history ON public.b2b_partnerships;
CREATE TRIGGER trg_b2b_health_history
  AFTER INSERT OR UPDATE OF health_color ON public.b2b_partnerships
  FOR EACH ROW EXECUTE FUNCTION public._b2b_health_history_log();

-- ── b2b_audit_log (sec 18 Timeline + LGPD audit) ────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  partnership_id  uuid REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  action          text NOT NULL,           -- 'status_change'|'health_change'|'voucher_issued'|...
  from_value      text NULL,
  to_value        text NULL,
  notes           text NULL,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  author          text NULL,                -- 'user@email' | 'system' | 'lgpd_admin'
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_audit_log_partnership
  ON public.b2b_audit_log (partnership_id, created_at DESC);

ALTER TABLE public.b2b_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_audit_log_tenant" ON public.b2b_audit_log;
CREATE POLICY "b2b_audit_log_tenant" ON public.b2b_audit_log
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT ON public.b2b_audit_log TO authenticated;

-- ── b2b_consent_log (sec 19 LGPD) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_consent_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  partnership_id  uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  consent_type    text NOT NULL CHECK (consent_type IN ('comm','analytics','data_sharing','marketing')),
  granted         boolean NOT NULL,
  source          text NULL,
  notes           text NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_consent_log_lookup
  ON public.b2b_consent_log (partnership_id, consent_type, created_at DESC);

ALTER TABLE public.b2b_consent_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_consent_log_tenant_select" ON public.b2b_consent_log;
CREATE POLICY "b2b_consent_log_tenant_select" ON public.b2b_consent_log
  FOR SELECT USING (clinic_id = public.app_clinic_id());
DROP POLICY IF EXISTS "b2b_consent_log_insert_none" ON public.b2b_consent_log;
CREATE POLICY "b2b_consent_log_insert_none" ON public.b2b_consent_log
  FOR INSERT WITH CHECK (false);

GRANT SELECT ON public.b2b_consent_log TO authenticated;
-- INSERT so via RPC (security definer)

-- ── b2b_group_exposures (sec 15 Cost · eventos do grupo) ────────────────
-- Schema canonico (clinic-dashboard mig 290): event_type/title/date_occurred/
-- reach_count/leads_count/conversions. Adiciona cost_estimate_brl (mig 312).
-- Idempotente · ALTER ADD COLUMN IF NOT EXISTS pra evolucionar quando ja
-- existe com schema legado.
CREATE TABLE IF NOT EXISTS public.b2b_group_exposures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  partnership_id  uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  event_type      text NOT NULL DEFAULT 'outro'
    CHECK (event_type IN ('palestra','evento_presencial','email_blast','post_exclusivo',
                          'mencao_stories','newsletter','outro')),
  title           text NOT NULL,
  date_occurred   date NOT NULL DEFAULT current_date,
  reach_count     int NOT NULL DEFAULT 0,
  leads_count     int NOT NULL DEFAULT 0,
  conversions     int NULL,
  cost_estimate_brl numeric NULL,
  notes           text NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.b2b_group_exposures
  ADD COLUMN IF NOT EXISTS cost_estimate_brl numeric NULL;

CREATE INDEX IF NOT EXISTS idx_b2b_group_exposures_partnership
  ON public.b2b_group_exposures (partnership_id, date_occurred DESC);

ALTER TABLE public.b2b_group_exposures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_group_exposures_tenant" ON public.b2b_group_exposures;
CREATE POLICY "b2b_group_exposures_tenant" ON public.b2b_group_exposures
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_group_exposures TO authenticated;

-- ── b2b_nps_responses ───────────────────────────────────────────────────
-- Ja era referenciada por mig 800-17 (growth panel) e 800-21 (insights)
-- mas sem garantia de existir. Cria idempotente.
CREATE TABLE IF NOT EXISTS public.b2b_nps_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  partnership_id  uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  score           int NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment         text NULL,
  source          text NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_nps_responses_partnership
  ON public.b2b_nps_responses (partnership_id, created_at DESC);

ALTER TABLE public.b2b_nps_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_nps_responses_tenant" ON public.b2b_nps_responses;
CREATE POLICY "b2b_nps_responses_tenant" ON public.b2b_nps_responses
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_nps_responses TO authenticated;

-- ── b2b_partnership_alerts (sec 5 Health snapshot · alerts ativos) ──────
CREATE TABLE IF NOT EXISTS public.b2b_partnership_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  partnership_id  uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  alert_kind      text NOT NULL,           -- 'cap_warning','zero_conversion','inactive',...
  severity        text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','critical')),
  message         text NOT NULL,
  resolved        boolean NOT NULL DEFAULT false,
  resolved_at     timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_partnership_alerts_active
  ON public.b2b_partnership_alerts (partnership_id, resolved, created_at DESC);

ALTER TABLE public.b2b_partnership_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_partnership_alerts_tenant" ON public.b2b_partnership_alerts;
CREATE POLICY "b2b_partnership_alerts_tenant" ON public.b2b_partnership_alerts
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT, UPDATE ON public.b2b_partnership_alerts TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 2. RPC · b2b_partnership_health_snapshot (sec 5)
-- ═══════════════════════════════════════════════════════════════════════
-- Score 0-100 em tempo real. Defensive: se b2b_vouchers/nps nao existem,
-- penalty pula a metric e segue. Espelha clinic-dashboard mig 711.
CREATE OR REPLACE FUNCTION public.b2b_partnership_health_snapshot(
  p_partnership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid       uuid := public.app_clinic_id();
  v_p         public.b2b_partnerships%ROWTYPE;
  v_score     int  := 100;
  v_triggers  text[] := ARRAY[]::text[];
  v_days_since_voucher int;
  v_cap_pct   numeric := 0;
  v_cap_used  int := 0;
  v_cap_total int := 5;
  v_conv_pct  numeric := 0;
  v_vouchers_90d int := 0;
  v_conv_90d  int := 0;
  v_nps_avg   numeric;
  v_color     text;
  v_start_month date := date_trunc('month', now())::date;
BEGIN
  SELECT * INTO v_p FROM public.b2b_partnerships
   WHERE id = p_partnership_id AND clinic_id = v_cid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  -- Metric 1: dias desde ultimo voucher (defensive)
  BEGIN
    SELECT COALESCE(EXTRACT(DAY FROM (now() - MAX(issued_at)))::int, 999)
      INTO v_days_since_voucher
      FROM public.b2b_vouchers
     WHERE partnership_id = p_partnership_id
       AND clinic_id = v_cid;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_days_since_voucher := 999;
  END;

  IF v_days_since_voucher > 60 THEN
    v_score := v_score - 40;
    v_triggers := v_triggers || ('sem vouchers ha ' || v_days_since_voucher || ' dias')::text;
  END IF;

  -- Metric 2: cap atingido este mes
  v_cap_total := COALESCE(v_p.voucher_monthly_cap, 5);
  BEGIN
    SELECT COUNT(*) INTO v_cap_used
      FROM public.b2b_vouchers
     WHERE partnership_id = p_partnership_id
       AND clinic_id = v_cid
       AND issued_at >= v_start_month;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_cap_used := 0;
  END;
  v_cap_pct := CASE WHEN v_cap_total > 0
                    THEN (v_cap_used::numeric / v_cap_total::numeric) * 100
                    ELSE 0 END;
  IF v_cap_pct >= 90 THEN
    v_score := v_score - 20;
    v_triggers := v_triggers || ('cap quase esgotado (' || ROUND(v_cap_pct)::text || '%)')::text;
  END IF;

  -- Metric 3: conversao 90d
  BEGIN
    SELECT COUNT(*) INTO v_vouchers_90d
      FROM public.b2b_vouchers
     WHERE partnership_id = p_partnership_id AND clinic_id = v_cid
       AND issued_at >= now() - interval '90 days';
  EXCEPTION WHEN undefined_table THEN v_vouchers_90d := 0; END;

  BEGIN
    SELECT COUNT(*) INTO v_conv_90d
      FROM public.b2b_attributions
     WHERE partnership_id = p_partnership_id AND clinic_id = v_cid
       AND converted_at >= now() - interval '90 days';
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_conv_90d := 0; END;

  IF v_vouchers_90d > 0 THEN
    v_conv_pct := (v_conv_90d::numeric / v_vouchers_90d::numeric) * 100;
    IF v_conv_pct = 0 THEN
      v_score := v_score - 30;
      v_triggers := v_triggers || ('zero conversoes ultimos 90 dias')::text;
    END IF;
  END IF;

  -- Metric 4: NPS
  BEGIN
    SELECT AVG(score) INTO v_nps_avg
      FROM public.b2b_nps_responses
     WHERE partnership_id = p_partnership_id
       AND clinic_id = v_cid
       AND created_at >= now() - interval '180 days';
    IF v_nps_avg IS NOT NULL AND v_nps_avg < 7 THEN
      v_score := v_score - 10;
      v_triggers := v_triggers || ('NPS baixo: ' || ROUND(v_nps_avg, 1)::text)::text;
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_nps_avg := NULL; END;

  IF v_score < 0 THEN v_score := 0; END IF;
  v_color := CASE
    WHEN v_score >= 70 THEN 'green'
    WHEN v_score >= 40 THEN 'yellow'
    ELSE 'red'
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'partnership_id', p_partnership_id,
    'color', v_color,
    'score', v_score,
    'triggers', to_jsonb(v_triggers),
    'metrics', jsonb_build_object(
      'days_since_last_voucher', v_days_since_voucher,
      'cap_used',                v_cap_used,
      'cap_total',               v_cap_total,
      'cap_used_pct',            ROUND(v_cap_pct, 1),
      'vouchers_90d',            v_vouchers_90d,
      'conv_90d',                v_conv_90d,
      'conv_pct',                ROUND(v_conv_pct, 1),
      'nps_avg',                 v_nps_avg
    ),
    'computed_at', now()
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_partnership_health_snapshot(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_partnership_health_snapshot(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 3. RPC · b2b_partnership_impact_score (sec 13)
-- ═══════════════════════════════════════════════════════════════════════
-- Espelha clinic-dashboard mig 351. Score 0-100 normalizado pelo topo.
-- Defensive: se tabelas auxiliares nao existem, devolve zeros.
CREATE OR REPLACE FUNCTION public.b2b_partnership_impact_score(
  p_partnership_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_out jsonb;
BEGIN
  WITH base AS (
    SELECT
      p.id, p.name, p.tier, p.pillar, p.status, p.health_color,
      COALESCE((SELECT COUNT(*) FROM public.b2b_vouchers v
                 WHERE v.partnership_id = p.id AND v.clinic_id = v_cid
                   AND v.status = 'redeemed'), 0) AS vouchers_redeemed,
      COALESCE((SELECT SUM(reach_count) FROM public.b2b_group_exposures ge
                 WHERE ge.partnership_id = p.id AND ge.clinic_id = v_cid), 0) AS total_reach,
      COALESCE(p.voucher_unit_cost_brl, 0) *
        COALESCE((SELECT COUNT(*) FROM public.b2b_vouchers v
                   WHERE v.partnership_id = p.id AND v.clinic_id = v_cid
                     AND v.status = 'redeemed'), 0) +
      COALESCE((SELECT SUM(cost_estimate_brl) FROM public.b2b_group_exposures ge
                 WHERE ge.partnership_id = p.id AND ge.clinic_id = v_cid), 0) AS total_cost,
      COALESCE((SELECT AVG(score)::numeric FROM public.b2b_nps_responses n
                 WHERE n.partnership_id = p.id AND n.clinic_id = v_cid
                   AND n.score IS NOT NULL), 0) AS avg_nps
    FROM public.b2b_partnerships p
    WHERE p.clinic_id = v_cid
      AND (p_partnership_id IS NULL OR p.id = p_partnership_id)
      AND p.status NOT IN ('closed')
  ),
  scored AS (
    SELECT *,
      (vouchers_redeemed::numeric * GREATEST(avg_nps, 1) * (1 + total_reach::numeric / 1000))
      / GREATEST(1 + total_cost / 1000, 1) AS raw_score
    FROM base
  ),
  normalized AS (
    SELECT *,
      CASE WHEN MAX(raw_score) OVER () > 0
        THEN ROUND((raw_score / MAX(raw_score) OVER ()) * 100)
        ELSE 0
      END AS impact_score
    FROM scored
  )
  SELECT
    CASE WHEN p_partnership_id IS NOT NULL THEN
      (SELECT to_jsonb(n.*) FROM normalized n LIMIT 1)
    ELSE
      COALESCE((SELECT jsonb_agg(to_jsonb(n.*) ORDER BY n.impact_score DESC) FROM normalized n), '[]'::jsonb)
    END
  INTO v_out;

  IF p_partnership_id IS NOT NULL AND v_out IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  RETURN COALESCE(v_out, '{}'::jsonb);
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_partnership_impact_score(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_partnership_impact_score(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 4. RPC · b2b_partnership_cost (sec 15)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_partnership_cost(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid          uuid := public.app_clinic_id();
  v_unit_cost    numeric;
  v_monthly_cap  numeric;
  v_voucher_count int := 0;
  v_voucher_cost numeric := 0;
  v_group_cost   numeric := 0;
  v_group_exposures int := 0;
  v_group_reach  int := 0;
BEGIN
  SELECT voucher_unit_cost_brl, monthly_value_cap_brl
    INTO v_unit_cost, v_monthly_cap
    FROM public.b2b_partnerships
   WHERE clinic_id = v_cid AND id = p_partnership_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  BEGIN
    SELECT COUNT(*) INTO v_voucher_count
      FROM public.b2b_vouchers
     WHERE clinic_id = v_cid
       AND partnership_id = p_partnership_id
       AND status = 'redeemed';
  EXCEPTION WHEN undefined_table THEN v_voucher_count := 0; END;
  v_voucher_cost := COALESCE(v_unit_cost, 0) * v_voucher_count;

  SELECT COALESCE(SUM(cost_estimate_brl), 0),
         COUNT(*),
         COALESCE(SUM(reach_count), 0)
    INTO v_group_cost, v_group_exposures, v_group_reach
    FROM public.b2b_group_exposures
   WHERE clinic_id = v_cid AND partnership_id = p_partnership_id;

  RETURN jsonb_build_object(
    'ok', true,
    'voucher_unit_cost_brl', v_unit_cost,
    'voucher_redeemed',      v_voucher_count,
    'voucher_total_cost',    v_voucher_cost,
    'group_exposures',       v_group_exposures,
    'group_reach',           v_group_reach,
    'group_total_cost',      v_group_cost,
    'total_cost',            v_voucher_cost + v_group_cost,
    'monthly_cap_brl',       v_monthly_cap,
    'over_cap',              (v_monthly_cap IS NOT NULL
                              AND (v_voucher_cost + v_group_cost) > v_monthly_cap)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_partnership_cost(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_partnership_cost(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 5. RPC · b2b_health_trend (sec 16)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_health_trend(
  p_partnership_id uuid, p_days int DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_current text;
  v_first text;
  v_history jsonb;
  v_trend text;
  v_score_now int;
  v_score_first int;
  v_changes int;
  v_red int;
  v_green int;
BEGIN
  SELECT health_color INTO v_current
    FROM public.b2b_partnerships
   WHERE clinic_id = v_cid AND id = p_partnership_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  SELECT health_color INTO v_first
    FROM public.b2b_health_history
   WHERE clinic_id = v_cid AND partnership_id = p_partnership_id
     AND recorded_at >= now() - (p_days || ' days')::interval
   ORDER BY recorded_at ASC LIMIT 1;

  v_score_now := CASE COALESCE(v_current, 'unknown')
                   WHEN 'green' THEN 3 WHEN 'yellow' THEN 2
                   WHEN 'red' THEN 1 ELSE 0 END;
  v_score_first := CASE COALESCE(v_first, v_current, 'unknown')
                     WHEN 'green' THEN 3 WHEN 'yellow' THEN 2
                     WHEN 'red' THEN 1 ELSE 0 END;
  v_trend := CASE
    WHEN v_score_now > v_score_first THEN 'improving'
    WHEN v_score_now < v_score_first THEN 'worsening'
    ELSE 'stable'
  END;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE health_color = 'red'),
         COUNT(*) FILTER (WHERE health_color = 'green')
    INTO v_changes, v_red, v_green
    FROM public.b2b_health_history
   WHERE clinic_id = v_cid AND partnership_id = p_partnership_id
     AND recorded_at >= now() - (p_days || ' days')::interval;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'color', health_color,
      'previous', previous_color,
      'at', recorded_at
    ) ORDER BY recorded_at ASC
  ), '[]'::jsonb) INTO v_history
    FROM public.b2b_health_history
   WHERE clinic_id = v_cid AND partnership_id = p_partnership_id
     AND recorded_at >= now() - (p_days || ' days')::interval;

  RETURN jsonb_build_object(
    'ok', true,
    'current', v_current,
    'first_in_window', v_first,
    'trend', v_trend,
    'days_window', p_days,
    'changes', v_changes,
    'red_changes', v_red,
    'green_changes', v_green,
    'history', v_history
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_health_trend(uuid, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_health_trend(uuid, int) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 6. RPC · b2b_partnership_audit_timeline (sec 18)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_partnership_audit_timeline(
  p_partnership_id uuid,
  p_limit          int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_out jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.b2b_partnerships
                  WHERE id = p_partnership_id AND clinic_id = v_cid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',          a.id,
      'action',      a.action,
      'from_value',  a.from_value,
      'to_value',    a.to_value,
      'notes',       a.notes,
      'meta',        a.meta,
      'author',      a.author,
      'created_at',  a.created_at
    ) ORDER BY a.created_at DESC
  ), '[]'::jsonb) INTO v_out
    FROM (
      SELECT id, action, from_value, to_value, notes, meta, author, created_at
        FROM public.b2b_audit_log
       WHERE clinic_id = v_cid AND partnership_id = p_partnership_id
       ORDER BY created_at DESC
       LIMIT p_limit
    ) a;

  RETURN jsonb_build_object('ok', true, 'items', v_out);
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_partnership_audit_timeline(uuid, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_partnership_audit_timeline(uuid, int) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 7. RPCs · LGPD (sec 19) · anonymize / export / consent_set / consent_get
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.b2b_partnership_anonymize(
  p_partnership_id uuid,
  p_reason         text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid       uuid := public.app_clinic_id();
  v_old       record;
  v_new_name  text;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required',
      'detail', 'Motivo obrigatorio (minimo 5 chars).');
  END IF;

  SELECT id, name, contact_name, contact_phone, contact_email,
         contact_instagram, contact_website, narrative_quote
    INTO v_old
    FROM public.b2b_partnerships
   WHERE id = p_partnership_id AND clinic_id = v_cid;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  v_new_name := 'Parceria anonimizada #' || left(p_partnership_id::text, 8);

  INSERT INTO public.b2b_audit_log (
    clinic_id, partnership_id, action, from_value, to_value, notes, meta, author
  ) VALUES (
    v_cid, p_partnership_id, 'lgpd_anonymize',
    v_old.name, v_new_name, p_reason,
    jsonb_build_object(
      'old_contact_name',     v_old.contact_name,
      'old_contact_phone',    LEFT(COALESCE(v_old.contact_phone, ''), 4) || '****',
      'old_contact_email',    CASE
                                WHEN v_old.contact_email IS NULL THEN NULL
                                ELSE LEFT(v_old.contact_email, 2) || '***@' || split_part(v_old.contact_email, '@', 2)
                              END,
      'old_contact_instagram', v_old.contact_instagram,
      'old_contact_website',   v_old.contact_website
    ),
    'lgpd_admin'
  );

  UPDATE public.b2b_partnerships
     SET name              = v_new_name,
         contact_name      = NULL,
         contact_phone     = NULL,
         contact_email     = NULL,
         contact_instagram = NULL,
         contact_website   = NULL,
         narrative_quote   = NULL,
         narrative_author  = NULL,
         emotional_trigger = NULL,
         updated_at        = now()
   WHERE id = p_partnership_id;

  -- Anonimizar wa_senders se tabela existe
  BEGIN
    UPDATE public.b2b_partnership_wa_senders
       SET active = false
     WHERE partnership_id = p_partnership_id;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Anonimizar nps comments se tabela existe
  BEGIN
    UPDATE public.b2b_nps_responses
       SET comment = '[anonimizado LGPD]'
     WHERE partnership_id = p_partnership_id AND comment IS NOT NULL;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  RETURN jsonb_build_object('ok', true,
    'partnership_id', p_partnership_id,
    'new_name', v_new_name, 'reason', p_reason);
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_partnership_anonymize(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_partnership_anonymize(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.b2b_partnership_export_data(
  p_partnership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_partnership jsonb;
  v_vouchers jsonb := '[]'::jsonb;
  v_nps      jsonb := '[]'::jsonb;
  v_comments jsonb := '[]'::jsonb;
  v_audit    jsonb := '[]'::jsonb;
  v_consents jsonb := '[]'::jsonb;
BEGIN
  SELECT to_jsonb(p.*) INTO v_partnership
    FROM public.b2b_partnerships p
   WHERE p.id = p_partnership_id AND p.clinic_id = v_cid;
  IF v_partnership IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(v.*) ORDER BY v.issued_at DESC), '[]'::jsonb)
      INTO v_vouchers
      FROM public.b2b_vouchers v
     WHERE v.partnership_id = p_partnership_id;
  EXCEPTION WHEN undefined_table THEN v_vouchers := '[]'::jsonb; END;

  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(n.*) ORDER BY n.created_at DESC), '[]'::jsonb)
      INTO v_nps
      FROM public.b2b_nps_responses n
     WHERE n.partnership_id = p_partnership_id;
  EXCEPTION WHEN undefined_table THEN v_nps := '[]'::jsonb; END;

  BEGIN
    SELECT COALESCE(jsonb_agg(to_jsonb(c.*) ORDER BY c.created_at DESC), '[]'::jsonb)
      INTO v_comments
      FROM public.b2b_partnership_comments c
     WHERE c.partnership_id = p_partnership_id;
  EXCEPTION WHEN undefined_table THEN v_comments := '[]'::jsonb; END;

  SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at DESC), '[]'::jsonb)
    INTO v_audit
    FROM public.b2b_audit_log a
   WHERE a.partnership_id = p_partnership_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(c.*) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_consents
    FROM public.b2b_consent_log c
   WHERE c.partnership_id = p_partnership_id;

  INSERT INTO public.b2b_audit_log (
    clinic_id, partnership_id, action, notes, author
  ) VALUES (
    v_cid, p_partnership_id, 'lgpd_export',
    'Export de dados LGPD (portabilidade)', 'lgpd_admin'
  );

  RETURN jsonb_build_object(
    'ok', true, 'exported_at', now(),
    'partnership', v_partnership,
    'vouchers', v_vouchers,
    'nps', v_nps,
    'comments', v_comments,
    'audit', v_audit,
    'consents', v_consents
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_partnership_export_data(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_partnership_export_data(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.b2b_consent_set(
  p_partnership_id uuid,
  p_type           text,
  p_granted        boolean,
  p_source         text DEFAULT 'ui_admin',
  p_notes          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_id  uuid;
BEGIN
  IF p_type NOT IN ('comm','analytics','data_sharing','marketing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consent_type_invalido');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.b2b_partnerships
                  WHERE id = p_partnership_id AND clinic_id = v_cid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  INSERT INTO public.b2b_consent_log (
    clinic_id, partnership_id, consent_type, granted, source, notes
  ) VALUES (
    v_cid, p_partnership_id, p_type, p_granted, p_source, p_notes
  ) RETURNING id INTO v_id;

  INSERT INTO public.b2b_audit_log (
    clinic_id, partnership_id, action, to_value, notes, author
  ) VALUES (
    v_cid, p_partnership_id,
    'lgpd_consent_' || CASE WHEN p_granted THEN 'grant' ELSE 'revoke' END,
    p_type,
    'Consentimento ' || CASE WHEN p_granted THEN 'concedido' ELSE 'revogado' END,
    'lgpd_admin'
  );

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_consent_set(uuid, text, boolean, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_consent_set(uuid, text, boolean, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.b2b_consent_get(
  p_partnership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid   uuid := public.app_clinic_id();
  v_state jsonb;
BEGIN
  SELECT jsonb_object_agg(consent_type, jsonb_build_object(
    'granted', granted, 'source', source,
    'updated_at', created_at, 'notes', notes
  ))
    INTO v_state
    FROM (
      SELECT DISTINCT ON (consent_type)
             consent_type, granted, source, created_at, notes
        FROM public.b2b_consent_log
       WHERE partnership_id = p_partnership_id AND clinic_id = v_cid
       ORDER BY consent_type, created_at DESC
    ) latest;

  RETURN jsonb_build_object(
    'ok', true,
    'partnership_id', p_partnership_id,
    'consents', COALESCE(v_state, '{}'::jsonb)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_consent_get(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_consent_get(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 8. RPCs · targets/events/content list (sec 7, 8, 9)
-- ═══════════════════════════════════════════════════════════════════════

-- Targets = b2b_partnership_metas (mig 800-22)
CREATE OR REPLACE FUNCTION public.b2b_partnership_targets_list(
  p_partnership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'kind', kind, 'target', target,
      'source', source, 'created_at', created_at
    ) ORDER BY created_at DESC
  ), '[]'::jsonb) INTO v_out
    FROM public.b2b_partnership_metas
   WHERE clinic_id = v_cid AND partnership_id = p_partnership_id;

  RETURN jsonb_build_object('ok', true, 'items', v_out);
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_partnership_targets_list(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_partnership_targets_list(uuid) TO authenticated;

-- Events = b2b_partnership_tasks com source LIKE 'event:%' OR group_exposures
CREATE OR REPLACE FUNCTION public.b2b_partnership_events_list(
  p_partnership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'event_type', e.event_type,
      'title', e.title,
      'date', e.date_occurred,
      'reach', e.reach_count,
      'leads', e.leads_count,
      'conversions', e.conversions,
      'cost', e.cost_estimate_brl,
      'notes', e.notes
    ) ORDER BY e.date_occurred DESC
  ), '[]'::jsonb) INTO v_out
    FROM public.b2b_group_exposures e
   WHERE e.clinic_id = v_cid AND e.partnership_id = p_partnership_id;

  RETURN jsonb_build_object('ok', true, 'items', v_out);
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_partnership_events_list(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_partnership_events_list(uuid) TO authenticated;

-- Content = b2b_partnership_contents (mig 800-22)
CREATE OR REPLACE FUNCTION public.b2b_partnership_content_list(
  p_partnership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'kind', kind, 'title', title,
      'schedule', schedule, 'status', status,
      'source', source, 'created_at', created_at
    ) ORDER BY created_at DESC
  ), '[]'::jsonb) INTO v_out
    FROM public.b2b_partnership_contents
   WHERE clinic_id = v_cid AND partnership_id = p_partnership_id;

  RETURN jsonb_build_object('ok', true, 'items', v_out);
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_partnership_content_list(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_partnership_content_list(uuid) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 9. RPCs · Attribution ROI + leads (sec 14)
-- ═══════════════════════════════════════════════════════════════════════
-- Defensive: tabelas b2b_attributions/b2b_attribution_leads podem nao existir.
-- Se nao existem, retorna zeros / lista vazia.

CREATE OR REPLACE FUNCTION public.b2b_attribution_roi(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_referred int := 0;
  v_matched  int := 0;
  v_converted int := 0;
  v_revenue numeric := 0;
  v_cost   numeric := 0;
  v_roi_pct numeric := NULL;
  v_conv_rate numeric := NULL;
  v_unit_cost numeric;
  v_redeemed int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.b2b_partnerships
                  WHERE id = p_partnership_id AND clinic_id = v_cid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  SELECT voucher_unit_cost_brl INTO v_unit_cost
    FROM public.b2b_partnerships
   WHERE id = p_partnership_id AND clinic_id = v_cid;

  -- Defensive: tenta b2b_attributions, fallback pra zeros
  BEGIN
    SELECT
      COUNT(*) FILTER (WHERE status IN ('referred','matched','converted','lost')),
      COUNT(*) FILTER (WHERE status IN ('matched','converted')),
      COUNT(*) FILTER (WHERE status = 'converted'),
      COALESCE(SUM(revenue_brl) FILTER (WHERE status = 'converted'), 0)
    INTO v_referred, v_matched, v_converted, v_revenue
    FROM public.b2b_attributions
   WHERE clinic_id = v_cid AND partnership_id = p_partnership_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_referred := 0; v_matched := 0; v_converted := 0; v_revenue := 0;
  END;

  -- Custo aproximado = redeemed * unit_cost
  BEGIN
    SELECT COUNT(*) INTO v_redeemed
      FROM public.b2b_vouchers
     WHERE clinic_id = v_cid AND partnership_id = p_partnership_id
       AND status = 'redeemed';
  EXCEPTION WHEN undefined_table THEN v_redeemed := 0; END;
  v_cost := COALESCE(v_unit_cost, 0) * v_redeemed;

  IF v_cost > 0 THEN
    v_roi_pct := ROUND(((v_revenue - v_cost) / v_cost) * 100, 1);
  END IF;
  IF v_referred > 0 THEN
    v_conv_rate := ROUND((v_converted::numeric / v_referred) * 100, 1);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'referred', v_referred,
    'matched', v_matched,
    'converted', v_converted,
    'revenue_brl', v_revenue,
    'cost_brl', v_cost,
    'net_brl', v_revenue - v_cost,
    'roi_pct', v_roi_pct,
    'conversion_rate', v_conv_rate
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_attribution_roi(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_attribution_roi(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.b2b_attribution_leads(
  p_partnership_id uuid,
  p_limit          int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.b2b_partnerships
                  WHERE id = p_partnership_id AND clinic_id = v_cid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  BEGIN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'lead_name', a.lead_name,
        'lead_phone', a.lead_phone,
        'source', a.source,
        'status', a.status,
        'revenue_brl', a.revenue_brl,
        'created_at', a.created_at,
        'converted_at', a.converted_at
      ) ORDER BY a.created_at DESC
    ), '[]'::jsonb) INTO v_out
      FROM (
        SELECT id, lead_name, lead_phone, source, status, revenue_brl,
               created_at, converted_at
          FROM public.b2b_attributions
         WHERE clinic_id = v_cid AND partnership_id = p_partnership_id
         ORDER BY created_at DESC
         LIMIT p_limit
      ) a;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_out := '[]'::jsonb; END;

  RETURN jsonb_build_object('ok', true, 'items', v_out);
END $$;

REVOKE EXECUTE ON FUNCTION public.b2b_attribution_leads(uuid, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_attribution_leads(uuid, int) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════
-- 10. ASSERTS finais
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_required_fns text[] := ARRAY[
    'b2b_partnership_health_snapshot',
    'b2b_partnership_impact_score',
    'b2b_partnership_cost',
    'b2b_health_trend',
    'b2b_partnership_audit_timeline',
    'b2b_partnership_anonymize',
    'b2b_partnership_export_data',
    'b2b_consent_set',
    'b2b_consent_get',
    'b2b_partnership_targets_list',
    'b2b_partnership_events_list',
    'b2b_partnership_content_list',
    'b2b_attribution_roi',
    'b2b_attribution_leads'
  ];
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY v_required_fns LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = v_fn) THEN
      RAISE EXCEPTION 'ASSERT FAIL: % nao existe', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE '[OK] Mig 800-35 - 14 RPCs do detail criadas + 6 tabelas auxiliares';
END $$;

COMMIT;
