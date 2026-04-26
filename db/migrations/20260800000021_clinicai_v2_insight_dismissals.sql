-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-21 · clinicai-v2 · b2b_insight_dismissals                  ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: persistir dismissal de insights server-side com ║
-- ║ TTL 7 dias. Hoje (mig 800-19) o banner some via localStorage do device — ║
-- ║ dispensar no celular nao reflete no desktop, e some so 24h (dayKey).     ║
-- ║                                                                          ║
-- ║ Esta mig adiciona:                                                       ║
-- ║   1. Tabela b2b_insight_dismissals (clinic_id+kind+partnership_id PK)    ║
-- ║   2. RLS scoped clinic_id = app_clinic_id()                              ║
-- ║   3. RPC b2b_insight_dismiss(p_kind, p_partnership_id, p_ttl_days=7)     ║
-- ║   4. RPC b2b_insight_undo_dismiss(p_kind, p_partnership_id)              ║
-- ║   5. CREATE OR REPLACE b2b_insights_global() · filtra dismissals nao     ║
-- ║      expirados + retorna dismissed_count adicional. Shape preservado.    ║
-- ║                                                                          ║
-- ║ Audiencia: authenticated.                                                ║
-- ║ Replica 1:1 a logica de 800-19 · so adiciona NOT EXISTS por insight +    ║
-- ║ contador acumulado.                                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── Tabela: b2b_insight_dismissals ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_insight_dismissals (
  clinic_id       uuid        NOT NULL,
  kind            text        NOT NULL
                                CHECK (kind IN (
                                  'over_cap','health_red','health_worsening',
                                  'low_conversion','no_activity_60d',
                                  'nps_excellent','high_impact'
                                )),
  partnership_id  uuid        NOT NULL,
  dismissed_by    uuid        NULL,
  dismissed_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  PRIMARY KEY (clinic_id, kind, partnership_id)
);

COMMENT ON TABLE public.b2b_insight_dismissals IS
  'Dismissals server-side de insights cross-partnership · TTL 7d default (mig 800-21).';
COMMENT ON COLUMN public.b2b_insight_dismissals.expires_at IS
  'Apos esta data o insight reaparece no banner/lista. Default now()+7d, customizavel via RPC.';

-- ── Index pra filtros do RPC global ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_b2b_insight_dismissals_active
  ON public.b2b_insight_dismissals (clinic_id, expires_at);

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.b2b_insight_dismissals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_insight_dismissals_tenant" ON public.b2b_insight_dismissals;
CREATE POLICY "b2b_insight_dismissals_tenant" ON public.b2b_insight_dismissals
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_insight_dismissals TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════════════════════

-- ── b2b_insight_dismiss(kind, partnership_id, ttl_days) ─────────────────
CREATE OR REPLACE FUNCTION public.b2b_insight_dismiss(
  p_kind            text,
  p_partnership_id  uuid,
  p_ttl_days        int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid  uuid := public.app_clinic_id();
  v_uid  uuid := auth.uid();
  v_ttl  int  := GREATEST(COALESCE(p_ttl_days, 7), 1);
  v_exp  timestamptz := now() + make_interval(days => v_ttl);
BEGIN
  IF v_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;
  IF p_kind IS NULL OR p_partnership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_args');
  END IF;

  INSERT INTO public.b2b_insight_dismissals (
    clinic_id, kind, partnership_id, dismissed_by, dismissed_at, expires_at
  ) VALUES (
    v_cid, p_kind, p_partnership_id, v_uid, now(), v_exp
  )
  ON CONFLICT (clinic_id, kind, partnership_id)
  DO UPDATE SET
    dismissed_by = EXCLUDED.dismissed_by,
    dismissed_at = EXCLUDED.dismissed_at,
    expires_at   = EXCLUDED.expires_at;

  RETURN jsonb_build_object(
    'ok',          true,
    'kind',        p_kind,
    'partnership_id', p_partnership_id,
    'expires_at',  v_exp,
    'ttl_days',    v_ttl
  );
END $$;

COMMENT ON FUNCTION public.b2b_insight_dismiss(text, uuid, int) IS
  'Silencia 1 insight (kind, partnership_id) por N dias (default 7). Upsert · refresh TTL se ja existir.';

GRANT EXECUTE ON FUNCTION public.b2b_insight_dismiss(text, uuid, int) TO authenticated;

-- ── b2b_insight_undo_dismiss(kind, partnership_id) ──────────────────────
CREATE OR REPLACE FUNCTION public.b2b_insight_undo_dismiss(
  p_kind            text,
  p_partnership_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid     uuid := public.app_clinic_id();
  v_deleted int;
BEGIN
  IF v_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;
  IF p_kind IS NULL OR p_partnership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_args');
  END IF;

  DELETE FROM public.b2b_insight_dismissals
   WHERE clinic_id      = v_cid
     AND kind           = p_kind
     AND partnership_id = p_partnership_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',      true,
    'deleted', v_deleted
  );
END $$;

COMMENT ON FUNCTION public.b2b_insight_undo_dismiss(text, uuid) IS
  'Remove dismissal de 1 insight · faz reaparecer no proximo fetch.';

GRANT EXECUTE ON FUNCTION public.b2b_insight_undo_dismiss(text, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- CREATE OR REPLACE b2b_insights_global · filtra dismissals + dismissed_count
-- Replica 1:1 da mig 800-19 · so adiciona:
--   - NOT EXISTS check por insight emitido
--   - contador v_dismissed_count
--   - campo dismissed_count no return
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.b2b_insights_global()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid       uuid := public.app_clinic_id();
  v_unit_cost numeric := 0;
  v_defaults  jsonb;
  v_insights  jsonb := '[]'::jsonb;
  v_p         record;
  v_v_total   int;
  v_v_purchased int;
  v_v_redeemed int;
  v_conv_pct  numeric;
  v_cost_brl  numeric;
  v_nps_score numeric;
  v_last_voucher timestamptz;
  v_health_first text;
  v_health_curr  text;
  v_health_dir   text;
  v_count_partnerships int := 0;
  v_dismissed_count    int := 0;
BEGIN
  -- ── Defaults da clinica (custo unit) ───────────────────────────────
  SELECT settings -> 'b2b_defaults' INTO v_defaults
    FROM public.clinics WHERE id = v_cid;
  v_unit_cost := COALESCE((v_defaults ->> 'voucher_unit_cost_brl')::numeric, 0);

  -- ── Loop por parcerias active+review+contract ──────────────────────
  FOR v_p IN
    SELECT id, name, pillar, status, health_color, monthly_value_cap_brl, created_at
      FROM public.b2b_partnerships
     WHERE clinic_id = v_cid
       AND status IN ('active', 'review', 'contract')
  LOOP
    v_count_partnerships := v_count_partnerships + 1;

    -- Vouchers stats
    SELECT
      count(*)::int,
      count(*) FILTER (WHERE status = 'purchased')::int,
      count(*) FILTER (WHERE status IN ('redeemed','purchased'))::int,
      max(created_at)
    INTO v_v_total, v_v_purchased, v_v_redeemed, v_last_voucher
      FROM public.b2b_vouchers
     WHERE clinic_id = v_cid
       AND partnership_id = v_p.id
       AND COALESCE(is_demo, false) = false;

    v_cost_brl := v_v_redeemed::numeric * v_unit_cost;
    v_conv_pct := CASE WHEN v_v_total > 0
                       THEN ROUND((v_v_purchased::numeric / v_v_total) * 100, 1)
                       ELSE 0 END;

    -- ── over_cap (CRITICAL · score 95) ────────────────────────────
    IF v_p.monthly_value_cap_brl IS NOT NULL
       AND v_p.monthly_value_cap_brl > 0
       AND v_cost_brl > v_p.monthly_value_cap_brl THEN
      IF EXISTS (
        SELECT 1 FROM public.b2b_insight_dismissals d
         WHERE d.clinic_id = v_cid
           AND d.kind = 'over_cap'
           AND d.partnership_id = v_p.id
           AND d.expires_at > now()
      ) THEN
        v_dismissed_count := v_dismissed_count + 1;
      ELSE
        v_insights := v_insights || jsonb_build_object(
          'kind',             'over_cap',
          'severity',         'critical',
          'title',            'Custo acima do teto',
          'message',          format('%s passou de R$ %s do teto (R$ %s acumulado).',
                                     v_p.name,
                                     to_char(v_p.monthly_value_cap_brl, 'FM999G990D00'),
                                     to_char(v_cost_brl, 'FM999G990D00')),
          'partnership_id',   v_p.id,
          'partnership_name', v_p.name,
          'action_url',       '/partnerships/' || v_p.id,
          'score',            95
        );
      END IF;
    END IF;

    -- ── health_red (CRITICAL · score 90) ──────────────────────────
    IF v_p.health_color = 'red' THEN
      IF EXISTS (
        SELECT 1 FROM public.b2b_insight_dismissals d
         WHERE d.clinic_id = v_cid
           AND d.kind = 'health_red'
           AND d.partnership_id = v_p.id
           AND d.expires_at > now()
      ) THEN
        v_dismissed_count := v_dismissed_count + 1;
      ELSE
        v_insights := v_insights || jsonb_build_object(
          'kind',             'health_red',
          'severity',         'critical',
          'title',            'Saúde vermelha',
          'message',          format('Parceria %s está em saúde crítica. Considere ligar ou aplicar playbook de retenção.',
                                     v_p.name),
          'partnership_id',   v_p.id,
          'partnership_name', v_p.name,
          'action_url',       '/partnerships/' || v_p.id || '?tab=crescer',
          'score',            90
        );
      END IF;
    END IF;

    -- ── health_worsening (WARNING · score 75) ────────────────────
    BEGIN
      SELECT new_color, old_color INTO v_health_curr, v_health_first
        FROM public.b2b_health_log
       WHERE clinic_id = v_cid
         AND partnership_id = v_p.id
         AND changed_at >= now() - interval '90 days'
       ORDER BY changed_at DESC
       LIMIT 1;
      IF v_health_curr IS NOT NULL THEN
        v_health_dir := CASE
          WHEN v_health_first = 'green' AND v_health_curr IN ('yellow','red') THEN 'worsening'
          WHEN v_health_first = 'yellow' AND v_health_curr = 'red' THEN 'worsening'
          ELSE 'stable'
        END;
        IF v_health_dir = 'worsening' AND v_p.health_color <> 'red' THEN
          IF EXISTS (
            SELECT 1 FROM public.b2b_insight_dismissals d
             WHERE d.clinic_id = v_cid
               AND d.kind = 'health_worsening'
               AND d.partnership_id = v_p.id
               AND d.expires_at > now()
          ) THEN
            v_dismissed_count := v_dismissed_count + 1;
          ELSE
            v_insights := v_insights || jsonb_build_object(
              'kind',             'health_worsening',
              'severity',         'warning',
              'title',            'Saúde piorando (90d)',
              'message',          format('%s caiu de %s para %s nos últimos 90 dias.',
                                         v_p.name, v_health_first, v_health_curr),
              'partnership_id',   v_p.id,
              'partnership_name', v_p.name,
              'action_url',       '/partnerships/' || v_p.id || '?tab=crescer',
              'score',            75
            );
          END IF;
        END IF;
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      NULL;
    END;

    -- ── low_conversion (WARNING · score 70) ──────────────────────
    IF v_v_total >= 5 AND v_conv_pct < 15 THEN
      IF EXISTS (
        SELECT 1 FROM public.b2b_insight_dismissals d
         WHERE d.clinic_id = v_cid
           AND d.kind = 'low_conversion'
           AND d.partnership_id = v_p.id
           AND d.expires_at > now()
      ) THEN
        v_dismissed_count := v_dismissed_count + 1;
      ELSE
        v_insights := v_insights || jsonb_build_object(
          'kind',             'low_conversion',
          'severity',         'warning',
          'title',            'Conversão baixa',
          'message',          format('%s · conv %s%% em %s vouchers. Reveja combo configurado.',
                                     v_p.name, v_conv_pct, v_v_total),
          'partnership_id',   v_p.id,
          'partnership_name', v_p.name,
          'action_url',       '/partnerships/' || v_p.id || '?tab=crescer',
          'score',            70
        );
      END IF;
    END IF;

    -- ── no_activity_60d (INFO · score 50) ────────────────────────
    IF v_p.status = 'active'
       AND (v_last_voucher IS NULL OR v_last_voucher < now() - interval '60 days') THEN
      IF EXISTS (
        SELECT 1 FROM public.b2b_insight_dismissals d
         WHERE d.clinic_id = v_cid
           AND d.kind = 'no_activity_60d'
           AND d.partnership_id = v_p.id
           AND d.expires_at > now()
      ) THEN
        v_dismissed_count := v_dismissed_count + 1;
      ELSE
        v_insights := v_insights || jsonb_build_object(
          'kind',             'no_activity_60d',
          'severity',         'info',
          'title',            'Sem atividade (60d)',
          'message',          format('%s não emitiu vouchers nos últimos 60 dias. Risco de esfriamento.',
                                     v_p.name),
          'partnership_id',   v_p.id,
          'partnership_name', v_p.name,
          'action_url',       '/partnerships/' || v_p.id || '?tab=vouchers',
          'score',            50
        );
      END IF;
    END IF;

    -- ── nps_excellent (SUCCESS · score 60) ───────────────────────
    BEGIN
      SELECT CASE WHEN count(*) > 0
        THEN ROUND(AVG(score)::numeric, 1)
        ELSE NULL END
      INTO v_nps_score
        FROM public.b2b_nps_responses
       WHERE clinic_id = v_cid
         AND partnership_id = v_p.id
         AND score IS NOT NULL;
      IF v_nps_score IS NOT NULL AND v_nps_score >= 8 THEN
        IF EXISTS (
          SELECT 1 FROM public.b2b_insight_dismissals d
           WHERE d.clinic_id = v_cid
             AND d.kind = 'nps_excellent'
             AND d.partnership_id = v_p.id
             AND d.expires_at > now()
        ) THEN
          v_dismissed_count := v_dismissed_count + 1;
        ELSE
          v_insights := v_insights || jsonb_build_object(
            'kind',             'nps_excellent',
            'severity',         'success',
            'title',            'NPS excelente',
            'message',          format('%s · NPS %s. Use Pitch Mode pra reforçar parceria + propor upgrade.',
                                       v_p.name, v_nps_score),
            'partnership_id',   v_p.id,
            'partnership_name', v_p.name,
            'action_url',       '/partnerships/' || v_p.id || '?tab=crescer',
            'score',            60
          );
        END IF;
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      NULL;
    END;

    -- ── high_impact (SUCCESS · score 55) ─────────────────────────
    IF v_v_purchased >= 10 THEN
      IF EXISTS (
        SELECT 1 FROM public.b2b_insight_dismissals d
         WHERE d.clinic_id = v_cid
           AND d.kind = 'high_impact'
           AND d.partnership_id = v_p.id
           AND d.expires_at > now()
      ) THEN
        v_dismissed_count := v_dismissed_count + 1;
      ELSE
        v_insights := v_insights || jsonb_build_object(
          'kind',             'high_impact',
          'severity',         'success',
          'title',            'Alto impacto',
          'message',          format('%s já converteu %s vouchers em pagantes. Considere parceria de imagem.',
                                     v_p.name, v_v_purchased),
          'partnership_id',   v_p.id,
          'partnership_name', v_p.name,
          'action_url',       '/partnerships/' || v_p.id || '?tab=crescer',
          'score',            55
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',                   true,
    'generated_at',         now(),
    'partnerships_scanned', v_count_partnerships,
    'count',                jsonb_array_length(v_insights),
    'dismissed_count',      v_dismissed_count,
    'insights',             v_insights
  );
END $$;

COMMENT ON FUNCTION public.b2b_insights_global() IS
  'Insights cross-partnership · alertas (over_cap, health_red, low_conversion, no_activity) + oportunidades (nps_excellent, high_impact). Score 0-100 pra ordenacao. Filtra dismissals nao expirados (mig 800-21).';

GRANT EXECUTE ON FUNCTION public.b2b_insights_global() TO authenticated;

-- ─── ASSERTS ──────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='b2b_insight_dismissals' AND relkind='r') THEN
    RAISE EXCEPTION 'ASSERT FAIL: tabela b2b_insight_dismissals nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_insight_dismiss') THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_insight_dismiss nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_insight_undo_dismiss') THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_insight_undo_dismiss nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_insights_global') THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_insights_global nao existe';
  END IF;
  RAISE NOTICE '✅ Mig 800-21 OK — b2b_insight_dismissals + RPCs prontos';
END $$;

COMMIT;
