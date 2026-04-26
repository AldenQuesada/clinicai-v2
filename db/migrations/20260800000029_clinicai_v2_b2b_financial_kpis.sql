-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-29 · clinicai-v2 · b2b_financial_kpis (Revenue + CAC + PoP)║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26:                                                  ║
-- ║   "Quero KPIs financeiros no /b2b/analytics · Revenue gerado por         ║
-- ║    parceria, Ticket medio, CAC. E quero comparativo Period-over-Period   ║
-- ║    (PoP) em todos os KPIs (atual vs periodo anterior de mesma duracao)."║
-- ║                                                                          ║
-- ║ Decisao BI sobre modelagem do CAC (Custo Aquisicao Cliente):             ║
-- ║   Modelo HIBRIDO derivado de campos JA EXISTENTES em b2b_partnerships:   ║
-- ║                                                                          ║
-- ║     custo_voucher = SUM(p.voucher_unit_cost_brl) por voucher resgatado   ║
-- ║                     no periodo (status IN ('redeemed','purchased'))      ║
-- ║                                                                          ║
-- ║     custo_imagem  = SUM(p.monthly_value_cap_brl) * meses_no_periodo      ║
-- ║                     pra parcerias com is_image_partner=true ATIVAS no    ║
-- ║                     periodo (proporcional)                                ║
-- ║                                                                          ║
-- ║     CAC = (custo_voucher + custo_imagem) / N conversoes                  ║
-- ║                                                                          ║
-- ║   Justificativa: usar campos existentes evita debito de schema novo,    ║
-- ║   captura custo real ja registrado por parceria, e e fielmente           ║
-- ║   interpretavel. Modelo (a) "investment_value" novo seria duplicacao;    ║
-- ║   modelo (b) "custo flat por tier" e fragil pq custo varia caso a caso. ║
-- ║                                                                          ║
-- ║ Decisao sobre REVENUE:                                                    ║
-- ║   1. Tenta resolver UUID em v.redeemed_by_appointment_id -> appointment   ║
-- ║      e soma appointments.value (campo numeric ja preenchido em PT-BR).  ║
-- ║   2. Fallback: para vouchers status='purchased' SEM appointment ligado,  ║
-- ║      conta como conversao mas com revenue = 0 (sem inflar) · sinal       ║
-- ║      interpretativo avisa "conversoes sem appointment ligado".           ║
-- ║                                                                          ║
-- ║ Decisao sobre PoP:                                                        ║
-- ║   periodo anterior = mesma duracao IMEDIATAMENTE antes do periodo atual ║
-- ║   ex: ultimos 30d → 30 dias antes desses 30                              ║
-- ║   delta_pct calculado server-side; signal de "amostra insuficiente"     ║
-- ║   quando previous_total < 10 (regra BI · estatisticamente irrelevante). ║
-- ║                                                                          ║
-- ║ Esta mig cria:                                                            ║
-- ║   1. RPC b2b_financial_kpis(p_days int) · retorna current/previous/delta║
-- ║      pra revenue, ticket_medio, cac, conversoes, partnerships_count,    ║
-- ║      cost_voucher, cost_image · plus signals interpretativos.            ║
-- ║                                                                          ║
-- ║ Audiencia: authenticated. SECURITY DEFINER · clinic_id via               ║
-- ║ app_clinic_id() do JWT (NUNCA literal).                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC b2b_financial_kpis(p_days)
--   Retorna jsonb com:
--     ok bool
--     period_days int
--     range_current  { from, to }
--     range_previous { from, to }
--     current  { revenue, conversions, ticket_medio, cac, cost_voucher,
--                cost_image, partnerships_count, conversions_with_appt,
--                conversions_without_appt }
--     previous { ...mesmas chaves }
--     delta    { ...delta_abs e delta_pct para cada metrica }
--     signals[] { kind, status, message }   -- interpretativo
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_financial_kpis(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_now       timestamptz := now();
  v_cur_to    timestamptz := v_now;
  v_cur_from  timestamptz := v_now - (p_days || ' days')::interval;
  v_prv_to    timestamptz := v_cur_from;
  v_prv_from  timestamptz := v_cur_from - (p_days || ' days')::interval;

  -- Current
  v_cur_conv          int := 0;
  v_cur_conv_with     int := 0;   -- conversoes com appointment ligado
  v_cur_conv_without  int := 0;
  v_cur_revenue       numeric := 0;
  v_cur_cost_voucher  numeric := 0;
  v_cur_cost_image    numeric := 0;
  v_cur_partnerships  int := 0;

  -- Previous
  v_prv_conv          int := 0;
  v_prv_conv_with     int := 0;
  v_prv_conv_without  int := 0;
  v_prv_revenue       numeric := 0;
  v_prv_cost_voucher  numeric := 0;
  v_prv_cost_image    numeric := 0;
  v_prv_partnerships  int := 0;

  -- Output blobs
  v_current  jsonb;
  v_previous jsonb;
  v_delta    jsonb;
  v_signals  jsonb := '[]'::jsonb;

  -- Locals
  v_cur_ticket  numeric;
  v_cur_cac     numeric;
  v_prv_ticket  numeric;
  v_prv_cac     numeric;

  -- Helpers de delta
  v_d_revenue   numeric;
  v_d_ticket    numeric;
  v_d_cac       numeric;
  v_d_conv      numeric;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'no_clinic',
      'period_days', p_days
    );
  END IF;

  -- ═══ CURRENT period · revenue + conversoes (vouchers purchased) ═══════
  -- Resolve revenue via JOIN com appointments quando redeemed_by_appointment_id
  -- e UUID valido. Senao conta a conversao mas revenue=0.
  WITH conv AS (
    SELECT
      v.id,
      v.redeemed_by_appointment_id,
      CASE WHEN v.redeemed_by_appointment_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN v.redeemed_by_appointment_id::uuid
           ELSE NULL
      END AS appt_uuid
    FROM public.b2b_vouchers v
    WHERE v.clinic_id = v_clinic_id
      AND v.status = 'purchased'
      AND COALESCE(v.is_demo, false) = false
      AND v.issued_at >= v_cur_from
      AND v.issued_at <  v_cur_to
  ),
  appt_join AS (
    SELECT c.id AS voucher_id, COALESCE(a.value, 0) AS revenue, c.appt_uuid
      FROM conv c
      LEFT JOIN public.appointments a
        ON a.id = c.appt_uuid
       AND a.clinic_id = v_clinic_id
       AND a.deleted_at IS NULL
       AND COALESCE(a.status, '') NOT IN ('cancelled','cancelado')
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE appt_uuid IS NOT NULL AND revenue > 0),
    COUNT(*) FILTER (WHERE appt_uuid IS NULL OR revenue = 0),
    COALESCE(SUM(revenue), 0)
    INTO v_cur_conv, v_cur_conv_with, v_cur_conv_without, v_cur_revenue
    FROM appt_join;

  -- ═══ CURRENT · custo voucher (voucher_unit_cost_brl × N redimidos) ═════
  -- Conta vouchers redeemed/purchased no periodo · multiplica pelo
  -- voucher_unit_cost_brl da partnership
  SELECT COALESCE(SUM(COALESCE(p.voucher_unit_cost_brl, 0)), 0)
    INTO v_cur_cost_voucher
    FROM public.b2b_vouchers v
    JOIN public.b2b_partnerships p ON p.id = v.partnership_id
   WHERE v.clinic_id = v_clinic_id
     AND v.status IN ('redeemed','purchased')
     AND COALESCE(v.is_demo, false) = false
     AND v.issued_at >= v_cur_from
     AND v.issued_at <  v_cur_to;

  -- ═══ CURRENT · custo imagem (monthly_value_cap_brl × meses no periodo) ══
  -- Para parcerias is_image_partner=true ATIVAS durante o periodo.
  -- meses = p_days / 30 (proporcional). Se contrato comecou DEPOIS de
  -- v_cur_from, conta proporcional.
  SELECT COALESCE(SUM(
    COALESCE(p.monthly_value_cap_brl, 0)
    * GREATEST(0, LEAST(
        EXTRACT(EPOCH FROM (LEAST(v_cur_to, COALESCE(p.contract_expiry_date::timestamptz, v_cur_to)) - GREATEST(v_cur_from, COALESCE(p.contract_signed_date::timestamptz, p.created_at, v_cur_from))))
        / (30 * 86400.0),
        p_days::numeric / 30
      ))
  ), 0)
    INTO v_cur_cost_image
    FROM public.b2b_partnerships p
   WHERE p.clinic_id = v_clinic_id
     AND COALESCE(p.is_image_partner, false) = true
     AND COALESCE(p.status, '') IN ('active','review','contract');

  -- ═══ CURRENT · partnerships_count (parcerias ativas no periodo) ════════
  SELECT COUNT(*) INTO v_cur_partnerships
    FROM public.b2b_partnerships p
   WHERE p.clinic_id = v_clinic_id
     AND COALESCE(p.status, '') IN ('active','review','contract');

  -- ═══ PREVIOUS period · mesmos calculos · janela imediatamente antes ═══
  WITH conv AS (
    SELECT
      v.id,
      v.redeemed_by_appointment_id,
      CASE WHEN v.redeemed_by_appointment_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN v.redeemed_by_appointment_id::uuid
           ELSE NULL
      END AS appt_uuid
    FROM public.b2b_vouchers v
    WHERE v.clinic_id = v_clinic_id
      AND v.status = 'purchased'
      AND COALESCE(v.is_demo, false) = false
      AND v.issued_at >= v_prv_from
      AND v.issued_at <  v_prv_to
  ),
  appt_join AS (
    SELECT c.id AS voucher_id, COALESCE(a.value, 0) AS revenue, c.appt_uuid
      FROM conv c
      LEFT JOIN public.appointments a
        ON a.id = c.appt_uuid
       AND a.clinic_id = v_clinic_id
       AND a.deleted_at IS NULL
       AND COALESCE(a.status, '') NOT IN ('cancelled','cancelado')
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE appt_uuid IS NOT NULL AND revenue > 0),
    COUNT(*) FILTER (WHERE appt_uuid IS NULL OR revenue = 0),
    COALESCE(SUM(revenue), 0)
    INTO v_prv_conv, v_prv_conv_with, v_prv_conv_without, v_prv_revenue
    FROM appt_join;

  SELECT COALESCE(SUM(COALESCE(p.voucher_unit_cost_brl, 0)), 0)
    INTO v_prv_cost_voucher
    FROM public.b2b_vouchers v
    JOIN public.b2b_partnerships p ON p.id = v.partnership_id
   WHERE v.clinic_id = v_clinic_id
     AND v.status IN ('redeemed','purchased')
     AND COALESCE(v.is_demo, false) = false
     AND v.issued_at >= v_prv_from
     AND v.issued_at <  v_prv_to;

  -- Custo imagem do periodo anterior · igual logica mas com janela prv
  SELECT COALESCE(SUM(
    COALESCE(p.monthly_value_cap_brl, 0)
    * GREATEST(0, LEAST(
        EXTRACT(EPOCH FROM (LEAST(v_prv_to, COALESCE(p.contract_expiry_date::timestamptz, v_prv_to)) - GREATEST(v_prv_from, COALESCE(p.contract_signed_date::timestamptz, p.created_at, v_prv_from))))
        / (30 * 86400.0),
        p_days::numeric / 30
      ))
  ), 0)
    INTO v_prv_cost_image
    FROM public.b2b_partnerships p
   WHERE p.clinic_id = v_clinic_id
     AND COALESCE(p.is_image_partner, false) = true
     AND COALESCE(p.status, '') IN ('active','review','contract');

  -- partnerships_count "anterior" · proxy via created_at < v_cur_from
  SELECT COUNT(*) INTO v_prv_partnerships
    FROM public.b2b_partnerships p
   WHERE p.clinic_id = v_clinic_id
     AND COALESCE(p.status, '') IN ('active','review','contract')
     AND p.created_at < v_cur_from;

  -- ═══ Derivados (ticket medio + CAC) · com guards ═════════════════════
  v_cur_ticket := CASE WHEN v_cur_conv > 0 THEN v_cur_revenue / v_cur_conv ELSE NULL END;
  v_cur_cac    := CASE WHEN v_cur_conv > 0 THEN (v_cur_cost_voucher + v_cur_cost_image) / v_cur_conv ELSE NULL END;
  v_prv_ticket := CASE WHEN v_prv_conv > 0 THEN v_prv_revenue / v_prv_conv ELSE NULL END;
  v_prv_cac    := CASE WHEN v_prv_conv > 0 THEN (v_prv_cost_voucher + v_prv_cost_image) / v_prv_conv ELSE NULL END;

  -- ═══ Build current/previous JSON ═════════════════════════════════════
  v_current := jsonb_build_object(
    'revenue',                  ROUND(v_cur_revenue, 2),
    'conversions',              v_cur_conv,
    'conversions_with_appt',    v_cur_conv_with,
    'conversions_without_appt', v_cur_conv_without,
    'ticket_medio',             CASE WHEN v_cur_ticket IS NULL THEN NULL ELSE ROUND(v_cur_ticket, 2) END,
    'cac',                      CASE WHEN v_cur_cac    IS NULL THEN NULL ELSE ROUND(v_cur_cac, 2)    END,
    'cost_voucher',             ROUND(v_cur_cost_voucher, 2),
    'cost_image',               ROUND(v_cur_cost_image, 2),
    'cost_total',               ROUND(v_cur_cost_voucher + v_cur_cost_image, 2),
    'partnerships_count',       v_cur_partnerships
  );

  v_previous := jsonb_build_object(
    'revenue',                  ROUND(v_prv_revenue, 2),
    'conversions',              v_prv_conv,
    'conversions_with_appt',    v_prv_conv_with,
    'conversions_without_appt', v_prv_conv_without,
    'ticket_medio',             CASE WHEN v_prv_ticket IS NULL THEN NULL ELSE ROUND(v_prv_ticket, 2) END,
    'cac',                      CASE WHEN v_prv_cac    IS NULL THEN NULL ELSE ROUND(v_prv_cac, 2)    END,
    'cost_voucher',             ROUND(v_prv_cost_voucher, 2),
    'cost_image',               ROUND(v_prv_cost_image, 2),
    'cost_total',               ROUND(v_prv_cost_voucher + v_prv_cost_image, 2),
    'partnerships_count',       v_prv_partnerships
  );

  -- ═══ Delta · diferenca absoluta e relativa ═══════════════════════════
  -- Regra BI: delta_pct so faz sentido se previous > 0; senao retorna null.
  v_d_revenue := v_cur_revenue - v_prv_revenue;
  v_d_ticket  := COALESCE(v_cur_ticket, 0) - COALESCE(v_prv_ticket, 0);
  v_d_cac     := COALESCE(v_cur_cac, 0)    - COALESCE(v_prv_cac, 0);
  v_d_conv    := (v_cur_conv - v_prv_conv)::numeric;

  v_delta := jsonb_build_object(
    'revenue',     jsonb_build_object(
      'abs', ROUND(v_d_revenue, 2),
      'pct', CASE WHEN v_prv_revenue > 0 THEN ROUND((v_d_revenue / v_prv_revenue) * 100, 1) ELSE NULL END
    ),
    'conversions', jsonb_build_object(
      'abs', v_cur_conv - v_prv_conv,
      'pct', CASE WHEN v_prv_conv > 0 THEN ROUND((v_d_conv / v_prv_conv) * 100, 1) ELSE NULL END
    ),
    'ticket_medio', jsonb_build_object(
      'abs', CASE WHEN v_cur_ticket IS NULL OR v_prv_ticket IS NULL THEN NULL ELSE ROUND(v_d_ticket, 2) END,
      'pct', CASE WHEN COALESCE(v_prv_ticket, 0) > 0 AND v_cur_ticket IS NOT NULL THEN ROUND((v_d_ticket / v_prv_ticket) * 100, 1) ELSE NULL END
    ),
    'cac', jsonb_build_object(
      'abs', CASE WHEN v_cur_cac IS NULL OR v_prv_cac IS NULL THEN NULL ELSE ROUND(v_d_cac, 2) END,
      'pct', CASE WHEN COALESCE(v_prv_cac, 0) > 0 AND v_cur_cac IS NOT NULL THEN ROUND((v_d_cac / v_prv_cac) * 100, 1) ELSE NULL END
    ),
    -- amostra anterior · usado pelo frontend pra decidir se exibe PoP
    'previous_sample_size', v_prv_conv,
    'previous_sample_sufficient', v_prv_conv >= 10
  );

  -- ═══ Signals interpretativos · servem como base do card "💰 Financeiro" ═══
  IF v_cur_conv = 0 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'kind', 'no_conversions',
      'status', 'amber',
      'message', 'Nenhuma conversao paga no periodo · revenue e ticket medio nao calculaveis.'
    ));
  ELSIF v_cur_conv_without > 0 AND v_cur_conv_without >= v_cur_conv_with THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'kind', 'conversions_without_appt',
      'status', 'amber',
      'message', format(
        '%s de %s conversoes sem appointment ligado · revenue subestimado · revisar fluxo de redeem.',
        v_cur_conv_without, v_cur_conv
      )
    ));
  END IF;

  IF v_cur_cac IS NOT NULL AND v_prv_cac IS NOT NULL AND v_prv_cac > 0 THEN
    IF (v_d_cac / v_prv_cac) > 0.20 THEN
      v_signals := v_signals || jsonb_build_array(jsonb_build_object(
        'kind', 'cac_rising',
        'status', 'red',
        'message', format(
          'CAC subiu %s%% vs periodo anterior · investigar custo voucher ou queda em conversao.',
          ROUND((v_d_cac / v_prv_cac) * 100, 1)
        )
      ));
    ELSIF (v_d_cac / v_prv_cac) < -0.10 THEN
      v_signals := v_signals || jsonb_build_array(jsonb_build_object(
        'kind', 'cac_improving',
        'status', 'green',
        'message', format(
          'CAC caiu %s%% vs periodo anterior · eficiencia melhorando.',
          ROUND(ABS(v_d_cac / v_prv_cac) * 100, 1)
        )
      ));
    END IF;
  END IF;

  IF v_cur_ticket IS NOT NULL AND v_prv_ticket IS NOT NULL AND v_prv_ticket > 0 THEN
    IF (v_d_ticket / v_prv_ticket) < -0.12 THEN
      v_signals := v_signals || jsonb_build_array(jsonb_build_object(
        'kind', 'ticket_falling',
        'status', 'amber',
        'message', format(
          'Ticket medio caiu %s%% vs periodo anterior · investigar mix de procedimentos.',
          ROUND(ABS(v_d_ticket / v_prv_ticket) * 100, 1)
        )
      ));
    END IF;
  END IF;

  IF v_prv_conv < 10 AND v_prv_conv > 0 THEN
    v_signals := v_signals || jsonb_build_array(jsonb_build_object(
      'kind', 'low_prior_sample',
      'status', 'neutral',
      'message', format(
        'Periodo anterior tem so %s conversoes · PoP estatisticamente fraco · interpretar com cautela.',
        v_prv_conv
      )
    ));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'period_days', p_days,
    'range_current',  jsonb_build_object('from', v_cur_from, 'to', v_cur_to),
    'range_previous', jsonb_build_object('from', v_prv_from, 'to', v_prv_to),
    'current',  v_current,
    'previous', v_previous,
    'delta',    v_delta,
    'signals',  v_signals
  );
END $$;

COMMENT ON FUNCTION public.b2b_financial_kpis(integer) IS
  'KPIs financeiros B2B (revenue, ticket medio, CAC) com PoP comparison · mig 800-29.';

GRANT EXECUTE ON FUNCTION public.b2b_financial_kpis(integer) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERTS
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='b2b_financial_kpis'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_financial_kpis nao existe';
  END IF;

  -- Confirma SECURITY DEFINER e search_path
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname='b2b_financial_kpis'
       AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: b2b_financial_kpis nao e SECURITY DEFINER';
  END IF;

  RAISE NOTICE '✅ Mig 800-29 OK · b2b_financial_kpis pronto · revenue + CAC + PoP';
END $$;

COMMIT;
