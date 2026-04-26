-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-16 · clinicai-v2 · partner_conversion_monthly              ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-25:                                                 ║
-- ║   "estadisiticas de conversao para os parceiros no funil do voucher     ║
-- ║    com feedback mensal"                                                  ║
-- ║                                                                          ║
-- ║ b2b_partner_performance(rolling_days) ja retorna conv % rolling 90d mas ║
-- ║ NAO segmentado por mes calendario · feedback mensal precisa de:         ║
-- ║   "Em Abril/2026 voce emitiu 12 vouchers · 8 agendaram · 5 vieram · 3   ║
-- ║    pagaram (25% conv) · vs Marco/2026 (15 emit, 20% conv)"              ║
-- ║                                                                          ║
-- ║ Esta migration adiciona:                                                 ║
-- ║                                                                          ║
-- ║ 1. b2b_partner_conversion_monthly(year_month, partnership_id?)          ║
-- ║      → metricas detalhadas com comparacao mes anterior                  ║
-- ║                                                                          ║
-- ║ 2. b2b_partner_conversion_monthly_all(year_month)                       ║
-- ║      → todas parcerias ativas no mes (UI ranking mensal)                ║
-- ║                                                                          ║
-- ║ Audiencia: authenticated only (UI admin) + service_role (cron mensal).  ║
-- ║                                                                          ║
-- ║ GOLD #3 (search_path), #5 (.down), #7 (sanity).                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Helper interno: stats de uma parceria num mes ──────────────────────
CREATE OR REPLACE FUNCTION public._b2b_partner_conv_month_stats(
  p_clinic_id      uuid,
  p_partnership_id uuid,
  p_year_month     text  -- 'YYYY-MM'
)
RETURNS TABLE (
  vouchers_issued     int,
  vouchers_delivered  int,
  vouchers_opened     int,
  vouchers_scheduled  int,
  vouchers_redeemed   int,
  vouchers_purchased  int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_start date;
  v_end   date;
BEGIN
  -- Parse 'YYYY-MM' → range [start, end+1month)
  v_start := to_date(p_year_month || '-01', 'YYYY-MM-DD');
  v_end   := v_start + interval '1 month';

  RETURN QUERY
    SELECT
      count(*)::int                                             AS vouchers_issued,
      count(*) FILTER (WHERE delivered_at IS NOT NULL)::int     AS vouchers_delivered,
      count(*) FILTER (WHERE opened_at    IS NOT NULL)::int     AS vouchers_opened,
      count(*) FILTER (WHERE status IN ('scheduled','redeemed','purchased'))::int
                                                                AS vouchers_scheduled,
      count(*) FILTER (WHERE status IN ('redeemed','purchased'))::int
                                                                AS vouchers_redeemed,
      count(*) FILTER (WHERE status = 'purchased')::int         AS vouchers_purchased
    FROM public.b2b_vouchers
    WHERE clinic_id      = p_clinic_id
      AND partnership_id = p_partnership_id
      AND issued_at     >= v_start
      AND issued_at      < v_end
      AND COALESCE(is_demo, false) = false;
END
$$;

-- ── b2b_partner_conversion_monthly(year_month, partnership_id) ─────────
-- Retorna 1 linha (a parceria solicitada · com comparacao mes anterior)
-- ou erro se partnership_id invalido.
CREATE OR REPLACE FUNCTION public.b2b_partner_conversion_monthly(
  p_year_month     text,
  p_partnership_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid   uuid := public.app_clinic_id();
  v_p     b2b_partnerships%ROWTYPE;
  v_curr  RECORD;
  v_prev  RECORD;
  v_prev_ym text;
  v_curr_dt date;
  v_conv_total numeric;
  v_conv_prev  numeric;
BEGIN
  -- Valida partnership existe e pertence a clinica
  SELECT * INTO v_p FROM public.b2b_partnerships
   WHERE id = p_partnership_id AND clinic_id = v_cid;
  IF v_p.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  -- Calcula mes anterior (ex: '2026-04' → '2026-03')
  v_curr_dt := to_date(p_year_month || '-01', 'YYYY-MM-DD');
  v_prev_ym := to_char(v_curr_dt - interval '1 month', 'YYYY-MM');

  -- Stats do mes atual
  SELECT * INTO v_curr
    FROM public._b2b_partner_conv_month_stats(v_cid, p_partnership_id, p_year_month);

  -- Stats do mes anterior
  SELECT * INTO v_prev
    FROM public._b2b_partner_conv_month_stats(v_cid, p_partnership_id, v_prev_ym);

  -- Conversao total: pagaram / emitidos
  v_conv_total := CASE WHEN v_curr.vouchers_issued > 0
    THEN ROUND((v_curr.vouchers_purchased::numeric / v_curr.vouchers_issued) * 100, 1)
    ELSE 0 END;

  v_conv_prev := CASE WHEN v_prev.vouchers_issued > 0
    THEN ROUND((v_prev.vouchers_purchased::numeric / v_prev.vouchers_issued) * 100, 1)
    ELSE 0 END;

  RETURN jsonb_build_object(
    'ok', true,
    'partnership_id',   v_p.id,
    'partnership_name', v_p.name,
    'is_image_partner', COALESCE(v_p.is_image_partner, false),
    'pillar',           v_p.pillar,
    'year_month',       p_year_month,
    'prev_year_month',  v_prev_ym,
    'current', jsonb_build_object(
      'vouchers_issued',    v_curr.vouchers_issued,
      'vouchers_delivered', v_curr.vouchers_delivered,
      'vouchers_opened',    v_curr.vouchers_opened,
      'vouchers_scheduled', v_curr.vouchers_scheduled,
      'vouchers_redeemed',  v_curr.vouchers_redeemed,
      'vouchers_purchased', v_curr.vouchers_purchased,
      'conv_issued_to_scheduled_pct',  CASE WHEN v_curr.vouchers_issued > 0
        THEN ROUND((v_curr.vouchers_scheduled::numeric / v_curr.vouchers_issued) * 100, 1) ELSE 0 END,
      'conv_scheduled_to_redeemed_pct', CASE WHEN v_curr.vouchers_scheduled > 0
        THEN ROUND((v_curr.vouchers_redeemed::numeric / v_curr.vouchers_scheduled) * 100, 1) ELSE 0 END,
      'conv_redeemed_to_purchased_pct', CASE WHEN v_curr.vouchers_redeemed > 0
        THEN ROUND((v_curr.vouchers_purchased::numeric / v_curr.vouchers_redeemed) * 100, 1) ELSE 0 END,
      'conv_total_pct', v_conv_total
    ),
    'previous', jsonb_build_object(
      'vouchers_issued',    v_prev.vouchers_issued,
      'vouchers_purchased', v_prev.vouchers_purchased,
      'conv_total_pct',     v_conv_prev
    ),
    'delta', jsonb_build_object(
      'issued_pct',  CASE WHEN v_prev.vouchers_issued > 0
        THEN ROUND(((v_curr.vouchers_issued - v_prev.vouchers_issued)::numeric / v_prev.vouchers_issued) * 100, 1) ELSE NULL END,
      'conv_pp',     ROUND(v_conv_total - v_conv_prev, 1)  -- percentage points
    )
  );
END
$$;

-- ── b2b_partner_conversion_monthly_all(year_month) ─────────────────────
-- Retorna TODAS as parcerias com stats do mes · usado em UI ranking mensal
-- + cron mensal (loop pra disparar feedback).
-- Inclui apenas parcerias que tiveram >= 1 voucher no mes OU mes anterior
-- (pra mostrar quedas quando parou de emitir).
CREATE OR REPLACE FUNCTION public.b2b_partner_conversion_monthly_all(
  p_year_month text
)
RETURNS TABLE (
  partnership_id     uuid,
  partnership_name   text,
  is_image_partner   boolean,
  pillar             text,
  status             text,
  vouchers_issued    int,
  vouchers_purchased int,
  conv_total_pct     numeric,
  vouchers_issued_prev int,
  conv_total_pct_prev  numeric,
  delta_issued_pct     numeric,
  delta_conv_pp        numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid   uuid := public.app_clinic_id();
  v_curr_dt date;
  v_prev_ym text;
BEGIN
  v_curr_dt := to_date(p_year_month || '-01', 'YYYY-MM-DD');
  v_prev_ym := to_char(v_curr_dt - interval '1 month', 'YYYY-MM');

  RETURN QUERY
    WITH curr AS (
      SELECT p.id, p.name, COALESCE(p.is_image_partner, false) AS is_image_partner,
             p.pillar, p.status,
             (s.*).*
        FROM public.b2b_partnerships p
        LEFT JOIN LATERAL (
          SELECT * FROM public._b2b_partner_conv_month_stats(v_cid, p.id, p_year_month)
        ) s ON true
       WHERE p.clinic_id = v_cid
    ),
    prev AS (
      SELECT p.id,
             (s.*).*
        FROM public.b2b_partnerships p
        LEFT JOIN LATERAL (
          SELECT * FROM public._b2b_partner_conv_month_stats(v_cid, p.id, v_prev_ym)
        ) s ON true
       WHERE p.clinic_id = v_cid
    )
    SELECT
      c.id,
      c.name,
      c.is_image_partner,
      c.pillar,
      c.status,
      COALESCE(c.vouchers_issued, 0)::int    AS vouchers_issued,
      COALESCE(c.vouchers_purchased, 0)::int AS vouchers_purchased,
      CASE WHEN COALESCE(c.vouchers_issued, 0) > 0
        THEN ROUND((c.vouchers_purchased::numeric / c.vouchers_issued) * 100, 1)
        ELSE 0 END AS conv_total_pct,
      COALESCE(pr.vouchers_issued, 0)::int    AS vouchers_issued_prev,
      CASE WHEN COALESCE(pr.vouchers_issued, 0) > 0
        THEN ROUND((pr.vouchers_purchased::numeric / pr.vouchers_issued) * 100, 1)
        ELSE 0 END AS conv_total_pct_prev,
      CASE WHEN COALESCE(pr.vouchers_issued, 0) > 0
        THEN ROUND(((c.vouchers_issued - pr.vouchers_issued)::numeric / pr.vouchers_issued) * 100, 1)
        ELSE NULL END AS delta_issued_pct,
      ROUND(
        CASE WHEN COALESCE(c.vouchers_issued, 0) > 0
          THEN (c.vouchers_purchased::numeric / c.vouchers_issued) * 100 ELSE 0 END
        -
        CASE WHEN COALESCE(pr.vouchers_issued, 0) > 0
          THEN (pr.vouchers_purchased::numeric / pr.vouchers_issued) * 100 ELSE 0 END
      , 1) AS delta_conv_pp
    FROM curr c
    LEFT JOIN prev pr ON pr.id = c.id
    WHERE COALESCE(c.vouchers_issued, 0) > 0
       OR COALESCE(pr.vouchers_issued, 0) > 0
    ORDER BY
      c.is_image_partner DESC,
      COALESCE(c.vouchers_issued, 0) DESC,
      c.name;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- GRANTs · authenticated + service_role
-- ═══════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public._b2b_partner_conv_month_stats(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.b2b_partner_conversion_monthly(text, uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.b2b_partner_conversion_monthly_all(text)        FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION public._b2b_partner_conv_month_stats(uuid, uuid, text) TO service_role;
GRANT  EXECUTE ON FUNCTION public.b2b_partner_conversion_monthly(text, uuid)      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.b2b_partner_conversion_monthly_all(text)        TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- Seed: novo cron mira-monthly-partner-feedback no registry (mig 800-15)
-- ═══════════════════════════════════════════════════════════════════════
-- Pula se mig 800-15 nao foi aplicada (mira_cron_jobs nao existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'mira_cron_jobs'
  ) THEN
    INSERT INTO public.mira_cron_jobs
      (clinic_id, job_name, display_name, description, category, cron_expr)
    SELECT c.id,
           'mira-monthly-partner-feedback',
           'Feedback mensal para parceiras',
           'Dia 1 de cada mes envia pra cada parceria com voucher emitido no mes anterior um resumo da performance (stats + comparacao vs mes anterior)',
           'digest',
           '0 12 1 * *'  -- 09h SP (12h UTC) dia 1
      FROM public.clinics c
      ON CONFLICT (clinic_id, job_name) DO NOTHING;
    RAISE NOTICE '[mig 800-16] cron mira-monthly-partner-feedback seedado';
  ELSE
    RAISE NOTICE '[mig 800-16] mira_cron_jobs nao existe · pule seed do cron · aplique mig 800-15 primeiro';
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Sanity check (GOLD #7)
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc
   WHERE proname IN (
     '_b2b_partner_conv_month_stats',
     'b2b_partner_conversion_monthly',
     'b2b_partner_conversion_monthly_all'
   );
  IF v_count <> 3 THEN
    RAISE EXCEPTION '[mig 800-16] esperado 3 funcoes · encontradas %', v_count;
  END IF;
  RAISE NOTICE '[mig 800-16] ok · 3 RPCs criadas';
END
$$;
