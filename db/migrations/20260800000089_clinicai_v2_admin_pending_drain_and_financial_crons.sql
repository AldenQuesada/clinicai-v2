-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-89 · clinicai-v2                                           ║
-- ║   Parte A · pick/complete RPCs pra drain real do admin-direct-dispatch  ║
-- ║   Parte B · 4 RPCs financeiras (daily_revenue, monthly_goal,            ║
-- ║              churn_alert, ai_cost_cap) consumidas por crons financeiros ║
-- ║              que enchem a categoria fantasma 'financeiro' do mig 800-88 ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Por que aqui · mig 800-88 introduziu fila b2b_pending_dispatches +      ║
-- ║   _b2b_invoke_edge guard. Admin-direct-dispatch (defer:true em          ║
-- ║   dispatchAdminText) ficava como audit trail · TS worker novo precisa   ║
-- ║   de RPCs pick/complete pra processar.                                  ║
-- ║                                                                          ║
-- ║ Por que financial · UI /configuracoes mostra 4 toggles de financeiro    ║
-- ║   mas zero cron disparava com `category='financeiro'`. Marci marcava    ║
-- ║   "so financeiro" e nao recebia nada. Esses 4 RPCs viram base dos crons ║
-- ║   reais que cobrem a expectativa.                                       ║
-- ║                                                                          ║
-- ║ Cada RPC financial retorna TEXT (ou NULL se nao ha dado pra reportar).  ║
-- ║   Cron handler envia via dispatchAdminText. Padrao tryRpcText (igual    ║
-- ║   wa_pro_anomaly_check). NULL = skip silencioso (sem mensagem em dia    ║
-- ║   sem dado relevante).                                                  ║
-- ║                                                                          ║
-- ║ ai_cost_cap retorna NULL ate tabela de AI usage existir · estrutural    ║
-- ║   pronto pra quando tracking for criado. Hoje: zero mensagens.          ║
-- ║                                                                          ║
-- ║ GOLD #3 (search_path), #5 (.down), #7 (sanity), #10 (NOTIFY).           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- A. b2b_admin_pending_pick + b2b_admin_pending_complete
-- ═══════════════════════════════════════════════════════════════════════════

-- Pick: marca rows admin-direct-dispatch elegiveis como 'processing'
-- elegivel = status='pending' AND scheduled_for<=now() AND
-- _b2b_is_within_business_hours(clinic_id)=true. Retorna lote pra
-- worker TS processar (worker chama dispatchAdminText com bypass=true).
CREATE OR REPLACE FUNCTION public.b2b_admin_pending_pick(
  p_limit int DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_limit   int;
  v_results jsonb := '[]'::jsonb;
  v_row     record;
BEGIN
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));

  FOR v_row IN
    UPDATE public.b2b_pending_dispatches
       SET status          = 'processing',
           attempts        = attempts + 1,
           last_attempt_at = now()
     WHERE id IN (
       SELECT id FROM public.b2b_pending_dispatches
        WHERE status = 'pending'
          AND edge_path = 'admin-direct-dispatch'
          AND scheduled_for <= now()
          AND public._b2b_is_within_business_hours(clinic_id, now()) = true
        ORDER BY scheduled_for ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT v_limit
     )
    RETURNING id, clinic_id, payload, attempts, source_event_key
  LOOP
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'id',                v_row.id,
      'clinic_id',         v_row.clinic_id,
      'payload',           v_row.payload,
      'attempts',          v_row.attempts,
      'source_event_key',  v_row.source_event_key
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'items', v_results);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_admin_pending_pick(int)
  TO service_role;


-- Complete: marca row como done OR failed (com retry policy)
-- p_status: 'done' | 'failed' | 'retry'
-- 'retry' volta pra pending (incrementa attempts ja foi feito no pick · so
-- desmarca processing). Apos 3 attempts falhos, caller deve mandar 'failed'.
CREATE OR REPLACE FUNCTION public.b2b_admin_pending_complete(
  p_id     uuid,
  p_status text,
  p_error  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count int;
  v_new_status text;
BEGIN
  IF p_status NOT IN ('done', 'failed', 'retry') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  v_new_status := CASE p_status
    WHEN 'retry' THEN 'pending'
    ELSE p_status
  END;

  UPDATE public.b2b_pending_dispatches
     SET status        = v_new_status,
         last_error    = CASE WHEN p_error IS NOT NULL THEN LEFT(p_error, 1000) ELSE last_error END,
         last_attempt_at = now()
   WHERE id = p_id
     AND status = 'processing';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',         v_count > 0,
    'updated',    v_count,
    'new_status', v_new_status
  );
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_admin_pending_complete(uuid, text, text)
  TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- B. RPCs financeiras · TEXT-builders · NULL = skip
-- ═══════════════════════════════════════════════════════════════════════════

-- B.1 mira_financial_daily_revenue_text · 8h SP
-- Compara receita ONTEM vs avg ultimos 7 dias uteis. Retorna texto pronto
-- pra mensagem WhatsApp · NULL se ontem foi feriado ou sem appointments.
CREATE OR REPLACE FUNCTION public.mira_financial_daily_revenue_text(
  p_clinic_id uuid
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_yesterday  date;
  v_revenue    numeric;
  v_avg_7d     numeric;
  v_count      int;
  v_pct_diff   numeric;
  v_emoji      text;
  v_trend      text;
BEGIN
  v_yesterday := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1;

  -- Receita ontem
  SELECT
    COALESCE(SUM((p->>'valor')::numeric), 0),
    COUNT(DISTINCT a.id)
  INTO v_revenue, v_count
  FROM public.appointments a
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.pagamentos, '[]'::jsonb)) p
  WHERE a.clinic_id = p_clinic_id
    AND a.status = 'finalizado'
    AND a.payment_status IN ('pago','parcial')
    AND (a.appointment_at AT TIME ZONE 'America/Sao_Paulo')::date = v_yesterday;

  -- Sem dado · skipa
  IF v_count = 0 OR v_revenue = 0 THEN
    RETURN NULL;
  END IF;

  -- Media 7 dias uteis anteriores (seg-sex)
  SELECT COALESCE(AVG(daily), 0) INTO v_avg_7d FROM (
    SELECT (a.appointment_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
           SUM((p->>'valor')::numeric) AS daily
      FROM public.appointments a
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.pagamentos, '[]'::jsonb)) p
     WHERE a.clinic_id = p_clinic_id
       AND a.status = 'finalizado'
       AND a.payment_status IN ('pago','parcial')
       AND (a.appointment_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_yesterday - 9 AND v_yesterday - 1
       AND EXTRACT(ISODOW FROM a.appointment_at AT TIME ZONE 'America/Sao_Paulo') BETWEEN 1 AND 5
     GROUP BY 1
  ) sub;

  v_pct_diff := CASE WHEN v_avg_7d > 0
                     THEN ((v_revenue - v_avg_7d) / v_avg_7d) * 100
                     ELSE 0 END;

  IF v_pct_diff >= 20 THEN
    v_emoji := '🚀'; v_trend := 'acima da media';
  ELSIF v_pct_diff >= 5 THEN
    v_emoji := '✅'; v_trend := 'em linha';
  ELSIF v_pct_diff >= -10 THEN
    v_emoji := '📊'; v_trend := 'estavel';
  ELSIF v_pct_diff >= -25 THEN
    v_emoji := '⚠️'; v_trend := 'abaixo da media';
  ELSE
    v_emoji := '🔴'; v_trend := 'queda relevante';
  END IF;

  RETURN format(
    '%s Revenue %s · R$ %s (%s%% vs avg 7d) · %s pagamentos',
    v_emoji,
    to_char(v_yesterday, 'DD/MM'),
    to_char(v_revenue, 'FM999G999G990D00'),
    to_char(round(v_pct_diff), 'FM+999;FM-999'),
    v_count
  ) || ' · ' || v_trend;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[mira_financial_daily_revenue_text] %', SQLERRM;
  RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.mira_financial_daily_revenue_text(uuid)
  TO authenticated, service_role;


-- B.2 mira_financial_monthly_goal_text · qua e sex 9h SP
-- Compara receita do mes corrente vs target. Target vem de
-- clinics.settings->>'financial_monthly_target_brl'. NULL se nao setado.
CREATE OR REPLACE FUNCTION public.mira_financial_monthly_goal_text(
  p_clinic_id uuid
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_target     numeric;
  v_revenue    numeric;
  v_pct        numeric;
  v_dom        int;        -- day-of-month em SP
  v_month_days int;
  v_emoji      text;
  v_status     text;
BEGIN
  -- Target (opcional na config). Pode estar em settings JSONB.
  BEGIN
    SELECT NULLIF(settings->>'financial_monthly_target_brl', '')::numeric
      INTO v_target
      FROM public.clinics
     WHERE id = p_clinic_id;
  EXCEPTION WHEN undefined_column THEN v_target := NULL;
  END;

  IF v_target IS NULL OR v_target <= 0 THEN
    RETURN NULL;
  END IF;

  -- Receita mes corrente em SP
  SELECT COALESCE(SUM((p->>'valor')::numeric), 0)
    INTO v_revenue
    FROM public.appointments a
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.pagamentos, '[]'::jsonb)) p
   WHERE a.clinic_id = p_clinic_id
     AND a.status = 'finalizado'
     AND a.payment_status IN ('pago','parcial')
     AND date_trunc('month', a.appointment_at AT TIME ZONE 'America/Sao_Paulo')
       = date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'));

  v_pct := (v_revenue / v_target) * 100;
  v_dom := EXTRACT(DAY FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  v_month_days := EXTRACT(DAY FROM
    (date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo')) + interval '1 month - 1 day')
  )::int;

  -- Pace · % esperado se receita fosse linear no mes
  -- ex: dia 15 de mes 30 dias = 50% expected
  IF v_pct >= 100 THEN
    v_emoji := '🏆'; v_status := 'meta atingida';
  ELSIF v_pct >= ((v_dom::numeric / v_month_days) * 100) + 5 THEN
    v_emoji := '🚀'; v_status := 'acelerada';
  ELSIF v_pct >= ((v_dom::numeric / v_month_days) * 100) - 10 THEN
    v_emoji := '✅'; v_status := 'no ritmo';
  ELSIF v_pct >= ((v_dom::numeric / v_month_days) * 100) - 25 THEN
    v_emoji := '⚠️'; v_status := 'em risco';
  ELSE
    v_emoji := '🔴'; v_status := 'longe da meta';
  END IF;

  RETURN format(
    '%s Meta %s · R$ %s / R$ %s (%s%%) · dia %s/%s · %s',
    v_emoji,
    to_char((now() AT TIME ZONE 'America/Sao_Paulo'), 'MM/YYYY'),
    to_char(v_revenue, 'FM999G999G990D00'),
    to_char(v_target,  'FM999G999G990D00'),
    to_char(round(v_pct), 'FM999'),
    v_dom, v_month_days, v_status
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[mira_financial_monthly_goal_text] %', SQLERRM;
  RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.mira_financial_monthly_goal_text(uuid)
  TO authenticated, service_role;


-- B.3 mira_financial_churn_alert_text · sex 9h SP
-- Conta pacientes "silent": tinha appointment finalizado nos ultimos 365
-- dias mas zero atividade nos ultimos `p_silent_days` (default 60).
CREATE OR REPLACE FUNCTION public.mira_financial_churn_alert_text(
  p_clinic_id   uuid,
  p_silent_days int DEFAULT 60
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_silent_days int;
  v_silent_count int;
  v_total_active int;
  v_pct numeric;
BEGIN
  v_silent_days := GREATEST(7, COALESCE(p_silent_days, 60));

  -- Pacientes silent · ultimo appointment finalizado entre 365d e silent_days
  SELECT COUNT(DISTINCT a.patient_phone) INTO v_silent_count
    FROM public.appointments a
   WHERE a.clinic_id = p_clinic_id
     AND a.status = 'finalizado'
     AND length(regexp_replace(COALESCE(a.patient_phone, ''), '\D', '', 'g')) >= 10
     AND a.appointment_at >= now() - interval '365 days'
     AND a.appointment_at <= now() - make_interval(days => v_silent_days)
     AND NOT EXISTS (
       SELECT 1 FROM public.appointments a2
        WHERE a2.clinic_id = p_clinic_id
          AND a2.patient_phone = a.patient_phone
          AND a2.appointment_at > now() - make_interval(days => v_silent_days)
     );

  IF v_silent_count = 0 THEN
    RETURN NULL;
  END IF;

  -- Total ativo · base 365d
  SELECT COUNT(DISTINCT a.patient_phone) INTO v_total_active
    FROM public.appointments a
   WHERE a.clinic_id = p_clinic_id
     AND a.status = 'finalizado'
     AND length(regexp_replace(COALESCE(a.patient_phone, ''), '\D', '', 'g')) >= 10
     AND a.appointment_at >= now() - interval '365 days';

  v_pct := CASE WHEN v_total_active > 0
                THEN (v_silent_count::numeric / v_total_active) * 100
                ELSE 0 END;

  RETURN format(
    '⚠️ Churn radar · %s pacientes silent (%sd+ sem atividade) · %s%% da base 365d. Considerar campanha reativacao.',
    v_silent_count,
    v_silent_days,
    to_char(round(v_pct, 1), 'FM999D0')
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[mira_financial_churn_alert_text] %', SQLERRM;
  RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.mira_financial_churn_alert_text(uuid, int)
  TO authenticated, service_role;


-- B.4 mira_financial_ai_cost_text · seg 9h SP
-- ESTRUTURAL: tabela mira_ai_usage NAO existe ainda. RPC retorna NULL.
-- Quando tracking for criado, body do RPC se atualiza · cron ja roda + UI
-- ja tem toggle financeiro.ai_cost_cap.
CREATE OR REPLACE FUNCTION public.mira_financial_ai_cost_text(
  p_clinic_id uuid
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_has_table boolean;
  v_cap       numeric;
  v_used      numeric;
  v_pct       numeric;
  v_emoji     text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='mira_ai_usage')
    INTO v_has_table;

  IF NOT v_has_table THEN
    RETURN NULL; -- estrutural · espera tabela existir
  END IF;

  BEGIN
    SELECT NULLIF(settings->>'ai_monthly_cost_cap_brl', '')::numeric
      INTO v_cap
      FROM public.clinics
     WHERE id = p_clinic_id;
  EXCEPTION WHEN OTHERS THEN v_cap := NULL;
  END;

  IF v_cap IS NULL OR v_cap <= 0 THEN
    RETURN NULL;
  END IF;

  -- Quando mira_ai_usage existir, query real aqui · por ora retorna NULL
  -- (estrutural). Implementacao final virara quando tabela for criada.
  RETURN NULL;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[mira_financial_ai_cost_text] %', SQLERRM;
  RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.mira_financial_ai_cost_text(uuid)
  TO authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- ASSERTS · sanity
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_pick boolean;
  v_complete boolean;
  v_revenue boolean;
  v_goal boolean;
  v_churn boolean;
  v_ai boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='b2b_admin_pending_pick')
    INTO v_pick;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='b2b_admin_pending_complete')
    INTO v_complete;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mira_financial_daily_revenue_text')
    INTO v_revenue;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mira_financial_monthly_goal_text')
    INTO v_goal;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mira_financial_churn_alert_text')
    INTO v_churn;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mira_financial_ai_cost_text')
    INTO v_ai;

  IF NOT (v_pick AND v_complete AND v_revenue AND v_goal AND v_churn AND v_ai) THEN
    RAISE EXCEPTION 'Sanity 800-89 FAIL · pick=% complete=% revenue=% goal=% churn=% ai=%',
      v_pick, v_complete, v_revenue, v_goal, v_churn, v_ai;
  END IF;

  RAISE NOTICE 'Migration 800-89 OK · 2 admin-pending RPCs + 4 financial text builders';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
