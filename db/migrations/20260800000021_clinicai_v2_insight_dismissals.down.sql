-- Down 800-21 · clinicai-v2 · b2b_insight_dismissals
--
-- Drop em ordem inversa: RPCs novas, tabela, e re-cria b2b_insights_global
-- na shape original (sem dismissed_count, sem filtro NOT EXISTS).
-- Apos rollback, ainda existe migration 800-19 → re-aplicar 800-19 deixa
-- o RPC restaurado. Pra simplicidade, este down so dropa o adicional.

BEGIN;

DROP FUNCTION IF EXISTS public.b2b_insight_undo_dismiss(text, uuid);
DROP FUNCTION IF EXISTS public.b2b_insight_dismiss(text, uuid, int);

DROP TABLE IF EXISTS public.b2b_insight_dismissals;

-- Re-cria b2b_insights_global na versao 800-19 (sem dismissed_count nem filtro)
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
BEGIN
  SELECT settings -> 'b2b_defaults' INTO v_defaults
    FROM public.clinics WHERE id = v_cid;
  v_unit_cost := COALESCE((v_defaults ->> 'voucher_unit_cost_brl')::numeric, 0);

  FOR v_p IN
    SELECT id, name, pillar, status, health_color, monthly_value_cap_brl, created_at
      FROM public.b2b_partnerships
     WHERE clinic_id = v_cid
       AND status IN ('active', 'review', 'contract')
  LOOP
    v_count_partnerships := v_count_partnerships + 1;

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

    IF v_p.monthly_value_cap_brl IS NOT NULL
       AND v_p.monthly_value_cap_brl > 0
       AND v_cost_brl > v_p.monthly_value_cap_brl THEN
      v_insights := v_insights || jsonb_build_object(
        'kind', 'over_cap', 'severity', 'critical',
        'title', 'Custo acima do teto',
        'message', format('%s passou de R$ %s do teto (R$ %s acumulado).',
                          v_p.name,
                          to_char(v_p.monthly_value_cap_brl, 'FM999G990D00'),
                          to_char(v_cost_brl, 'FM999G990D00')),
        'partnership_id', v_p.id, 'partnership_name', v_p.name,
        'action_url', '/partnerships/' || v_p.id, 'score', 95
      );
    END IF;

    IF v_p.health_color = 'red' THEN
      v_insights := v_insights || jsonb_build_object(
        'kind', 'health_red', 'severity', 'critical',
        'title', 'Saúde vermelha',
        'message', format('Parceria %s está em saúde crítica. Considere ligar ou aplicar playbook de retenção.', v_p.name),
        'partnership_id', v_p.id, 'partnership_name', v_p.name,
        'action_url', '/partnerships/' || v_p.id || '?tab=crescer', 'score', 90
      );
    END IF;

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
          v_insights := v_insights || jsonb_build_object(
            'kind', 'health_worsening', 'severity', 'warning',
            'title', 'Saúde piorando (90d)',
            'message', format('%s caiu de %s para %s nos últimos 90 dias.', v_p.name, v_health_first, v_health_curr),
            'partnership_id', v_p.id, 'partnership_name', v_p.name,
            'action_url', '/partnerships/' || v_p.id || '?tab=crescer', 'score', 75
          );
        END IF;
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    IF v_v_total >= 5 AND v_conv_pct < 15 THEN
      v_insights := v_insights || jsonb_build_object(
        'kind', 'low_conversion', 'severity', 'warning',
        'title', 'Conversão baixa',
        'message', format('%s · conv %s%% em %s vouchers. Reveja combo configurado.', v_p.name, v_conv_pct, v_v_total),
        'partnership_id', v_p.id, 'partnership_name', v_p.name,
        'action_url', '/partnerships/' || v_p.id || '?tab=crescer', 'score', 70
      );
    END IF;

    IF v_p.status = 'active'
       AND (v_last_voucher IS NULL OR v_last_voucher < now() - interval '60 days') THEN
      v_insights := v_insights || jsonb_build_object(
        'kind', 'no_activity_60d', 'severity', 'info',
        'title', 'Sem atividade (60d)',
        'message', format('%s não emitiu vouchers nos últimos 60 dias. Risco de esfriamento.', v_p.name),
        'partnership_id', v_p.id, 'partnership_name', v_p.name,
        'action_url', '/partnerships/' || v_p.id || '?tab=vouchers', 'score', 50
      );
    END IF;

    BEGIN
      SELECT CASE WHEN count(*) > 0 THEN ROUND(AVG(score)::numeric, 1) ELSE NULL END
      INTO v_nps_score
        FROM public.b2b_nps_responses
       WHERE clinic_id = v_cid AND partnership_id = v_p.id AND score IS NOT NULL;
      IF v_nps_score IS NOT NULL AND v_nps_score >= 8 THEN
        v_insights := v_insights || jsonb_build_object(
          'kind', 'nps_excellent', 'severity', 'success',
          'title', 'NPS excelente',
          'message', format('%s · NPS %s. Use Pitch Mode pra reforçar parceria + propor upgrade.', v_p.name, v_nps_score),
          'partnership_id', v_p.id, 'partnership_name', v_p.name,
          'action_url', '/partnerships/' || v_p.id || '?tab=crescer', 'score', 60
        );
      END IF;
    EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
    END;

    IF v_v_purchased >= 10 THEN
      v_insights := v_insights || jsonb_build_object(
        'kind', 'high_impact', 'severity', 'success',
        'title', 'Alto impacto',
        'message', format('%s já converteu %s vouchers em pagantes. Considere parceria de imagem.', v_p.name, v_v_purchased),
        'partnership_id', v_p.id, 'partnership_name', v_p.name,
        'action_url', '/partnerships/' || v_p.id || '?tab=crescer', 'score', 55
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',                 true,
    'generated_at',       now(),
    'partnerships_scanned', v_count_partnerships,
    'count',              jsonb_array_length(v_insights),
    'insights',           v_insights
  );
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_insights_global() TO authenticated;

COMMIT;
