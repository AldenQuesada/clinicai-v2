-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-17 · clinicai-v2 · partner_growth_panel                    ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: A2 painel "Crescer" no detail da parceria com  ║
-- ║ foco em CONVERSAO + efeito WOW.                                          ║
-- ║                                                                          ║
-- ║ Esta migration adiciona 1 RPC agregadora que retorna em 1 round-trip:   ║
-- ║                                                                          ║
-- ║   { partnership: {...},                                                  ║
-- ║     impact: { score_0_100, vouchers_redeemed, nps, reach, ... },         ║
-- ║     trend: { current_health, history_90d, direction },                   ║
-- ║     cost: { vouchers_brl, events_brl, total_brl, monthly_cap_brl,        ║
-- ║             over_cap, voucher_unit_cost_brl },                           ║
-- ║     conversion_lifetime: { total_issued, purchased, conv_pct },          ║
-- ║     pitch_stats: { partnerships_count, vouchers_redeemed_total,          ║
-- ║                    nps_global }  // pra Pitch Mode                       ║
-- ║   }                                                                      ║
-- ║                                                                          ║
-- ║ Sem isso a UI faria 4 RPCs separados (impact + trend + cost + funnel).  ║
-- ║                                                                          ║
-- ║ Audiencia: authenticated (UI admin) + service_role.                      ║
-- ║ GOLD #3 (search_path), #5 (.down), #7 (sanity).                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.b2b_partner_growth_panel(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid       uuid := public.app_clinic_id();
  v_p         b2b_partnerships%ROWTYPE;
  v_v_total   int;
  v_v_redeemed int;
  v_v_purchased int;
  v_v_unit_cost numeric := 0;
  v_v_cost_total numeric := 0;
  v_monthly_cap numeric;
  v_nps_responses int := 0;
  v_nps_score numeric;
  v_health_curr text;
  v_health_first text;
  v_health_changes int := 0;
  v_health_history jsonb := '[]'::jsonb;
  v_health_direction text := 'stable';
  v_pitch_partnerships int := 0;
  v_pitch_redeemed int := 0;
  v_pitch_nps numeric;
  v_defaults jsonb;
BEGIN
  -- Valida partnership existe
  SELECT * INTO v_p FROM public.b2b_partnerships
   WHERE id = p_partnership_id AND clinic_id = v_cid;
  IF v_p.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  -- ── Vouchers (lifetime) ────────────────────────────────────────────
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE status IN ('redeemed','purchased'))::int,
    count(*) FILTER (WHERE status = 'purchased')::int
  INTO v_v_total, v_v_redeemed, v_v_purchased
    FROM public.b2b_vouchers
   WHERE clinic_id = v_cid
     AND partnership_id = p_partnership_id
     AND COALESCE(is_demo, false) = false;

  -- ── Defaults da clinica (custo unit + cap mensal) ──────────────────
  SELECT settings -> 'b2b_defaults' INTO v_defaults
    FROM public.clinics WHERE id = v_cid;

  v_v_unit_cost := COALESCE(
    (v_defaults ->> 'voucher_unit_cost_brl')::numeric,
    0
  );
  v_v_cost_total := v_v_redeemed::numeric * v_v_unit_cost;
  v_monthly_cap := v_p.monthly_value_cap_brl;

  -- ── NPS especifico da parceria (se tem responses) ──────────────────
  BEGIN
    SELECT count(*)::int,
           CASE WHEN count(*) > 0
             THEN ROUND(AVG(score)::numeric, 1)
             ELSE NULL END
      INTO v_nps_responses, v_nps_score
      FROM public.b2b_nps_responses
     WHERE clinic_id = v_cid
       AND partnership_id = p_partnership_id
       AND score IS NOT NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_nps_responses := 0;
    v_nps_score := NULL;
  END;

  -- ── Health current ────────────────────────────────────────────────
  v_health_curr := COALESCE(v_p.health_color, 'unknown');

  -- ── Health history 90d (best-effort se tabela existir) ─────────────
  BEGIN
    SELECT jsonb_agg(
      jsonb_build_object(
        'at',       to_char(changed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'color',    new_color,
        'previous', old_color
      ) ORDER BY changed_at DESC
    ) INTO v_health_history
      FROM (
        SELECT changed_at, new_color, old_color
          FROM public.b2b_health_log
         WHERE clinic_id = v_cid
           AND partnership_id = p_partnership_id
           AND changed_at >= now() - interval '90 days'
         ORDER BY changed_at DESC
         LIMIT 20
      ) hist;
    SELECT count(*)::int INTO v_health_changes
      FROM public.b2b_health_log
     WHERE clinic_id = v_cid
       AND partnership_id = p_partnership_id
       AND changed_at >= now() - interval '90 days';
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_health_history := '[]'::jsonb;
    v_health_changes := 0;
  END;

  -- Direction: pega primeiro registro mais antigo na janela vs atual
  v_health_first := v_health_curr;
  IF jsonb_array_length(v_health_history) > 0 THEN
    -- ultimo elemento da history (mais antigo dado ORDER BY DESC) tem o old_color
    v_health_first := COALESCE(
      (v_health_history -> (jsonb_array_length(v_health_history) - 1) ->> 'previous'),
      v_health_curr
    );
    v_health_direction := CASE
      WHEN v_health_first = 'red' AND v_health_curr IN ('yellow','green') THEN 'improving'
      WHEN v_health_first = 'yellow' AND v_health_curr = 'green' THEN 'improving'
      WHEN v_health_first = 'green' AND v_health_curr IN ('yellow','red') THEN 'worsening'
      WHEN v_health_first = 'yellow' AND v_health_curr = 'red' THEN 'worsening'
      ELSE 'stable'
    END;
  END IF;

  -- ── Pitch stats (programa inteiro · pra fullscreen apresentacao) ───
  SELECT count(*)::int INTO v_pitch_partnerships
    FROM public.b2b_partnerships
   WHERE clinic_id = v_cid
     AND status = 'active';

  SELECT count(*)::int INTO v_pitch_redeemed
    FROM public.b2b_vouchers
   WHERE clinic_id = v_cid
     AND status IN ('redeemed','purchased')
     AND COALESCE(is_demo, false) = false;

  BEGIN
    SELECT CASE WHEN count(*) > 0
      THEN ROUND(AVG(score)::numeric, 0)
      ELSE NULL END
    INTO v_pitch_nps
      FROM public.b2b_nps_responses
     WHERE clinic_id = v_cid
       AND score IS NOT NULL;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_pitch_nps := NULL;
  END;

  -- ── Build final blob ──────────────────────────────────────────────
  RETURN jsonb_build_object(
    'ok', true,
    'partnership', jsonb_build_object(
      'id',               v_p.id,
      'name',             v_p.name,
      'pillar',           v_p.pillar,
      'tier',             v_p.tier,
      'is_image_partner', COALESCE(v_p.is_image_partner, false),
      'status',           v_p.status,
      'created_at',       v_p.created_at
    ),
    'conversion_lifetime', jsonb_build_object(
      'vouchers_total',     v_v_total,
      'vouchers_redeemed',  v_v_redeemed,
      'vouchers_purchased', v_v_purchased,
      'conv_pct', CASE WHEN v_v_total > 0
        THEN ROUND((v_v_purchased::numeric / v_v_total) * 100, 1)
        ELSE 0 END
    ),
    'cost', jsonb_build_object(
      'voucher_unit_cost_brl', v_v_unit_cost,
      'vouchers_brl',          v_v_cost_total,
      'monthly_cap_brl',       v_monthly_cap,
      'over_cap',              CASE WHEN v_monthly_cap IS NOT NULL AND v_v_cost_total > v_monthly_cap
                                 THEN true ELSE false END
    ),
    'nps', jsonb_build_object(
      'responses', v_nps_responses,
      'score',     v_nps_score
    ),
    'trend', jsonb_build_object(
      'current',    v_health_curr,
      'first',      v_health_first,
      'direction',  v_health_direction,
      'changes_90d', v_health_changes,
      'history',    v_health_history
    ),
    'impact', jsonb_build_object(
      -- Score 0-100 = (vouchers_purchased * 10) + (nps_norm * 30) + (reach_norm * 20) - cost_pen
      -- Simplificado pra comecar · evolui depois
      'score', LEAST(100, GREATEST(0,
        (v_v_purchased * 5)
        + COALESCE(v_nps_score, 0) * 3
        + (v_v_redeemed * 2)
        - LEAST(20, v_v_cost_total / 100)::int
      )::int)
    ),
    'pitch_stats', jsonb_build_object(
      'partnerships_count',  v_pitch_partnerships,
      'vouchers_redeemed',   v_pitch_redeemed,
      'nps',                 v_pitch_nps
    )
  );
END
$$;

-- GRANTs
REVOKE EXECUTE ON FUNCTION public.b2b_partner_growth_panel(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.b2b_partner_growth_panel(uuid) TO authenticated, service_role;

-- Sanity check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'b2b_partner_growth_panel'
  ) THEN
    RAISE EXCEPTION '[mig 800-17] funcao b2b_partner_growth_panel nao foi criada';
  END IF;
  RAISE NOTICE '[mig 800-17] ok · b2b_partner_growth_panel criada';
END
$$;
