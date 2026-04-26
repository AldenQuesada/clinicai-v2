-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-26 · clinicai-v2 · b2b_funnel_benchmarks (config por clinica)║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26 (TODO em /b2b/analytics page.tsx · constante     ║
-- ║ FUNNEL_BENCHMARKS hardcoded com targets 90/60/50/80/35).                 ║
-- ║                                                                          ║
-- ║ "Benchmarks de step-rate hoje sao constante hardcoded em codigo. Quero  ║
-- ║  que sejam CONFIGURAVEIS por clinica · admin define meta de cada etapa  ║
-- ║  do funil (delivered/opened/scheduled/redeemed/purchased)."             ║
-- ║                                                                          ║
-- ║ Esta mig adiciona:                                                       ║
-- ║   1. Tabela b2b_funnel_benchmarks (clinic_id, stage CHECK in 5 valores, ║
-- ║      target_pct CHECK 0-100, label, sort_order). PK (clinic_id, stage). ║
-- ║                                                                          ║
-- ║   2. RLS clinic_id = app_clinic_id() · authenticated.                    ║
-- ║                                                                          ║
-- ║   3. RPC b2b_funnel_benchmark_list()                · ordered.           ║
-- ║   4. RPC b2b_funnel_benchmark_upsert(p_payload)     · UPSERT.            ║
-- ║                                                                          ║
-- ║   5. Seed defaults (90/60/50/80/35) pra clinicas que ja tem rows ·      ║
-- ║      ON CONFLICT DO NOTHING.                                             ║
-- ║                                                                          ║
-- ║ Audiencia: authenticated. RPCs SECURITY DEFINER · escopo via             ║
-- ║ app_clinic_id() do JWT. Espelha mig 800-25 (b2b_tier_configs).           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Tabela b2b_funnel_benchmarks
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.b2b_funnel_benchmarks (
  clinic_id   uuid        NOT NULL,
  stage       text        NOT NULL CHECK (stage IN ('delivered','opened','scheduled','redeemed','purchased')),
  target_pct  int         NOT NULL CHECK (target_pct BETWEEN 0 AND 100),
  label       text        NOT NULL,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, stage)
);

COMMENT ON TABLE public.b2b_funnel_benchmarks IS
  'Benchmarks de step-rate do funil de conversao B2B por clinica · 5 stages (delivered/opened/scheduled/redeemed/purchased) · substitui hardcode FUNNEL_BENCHMARKS em /b2b/analytics. Mig 800-26.';
COMMENT ON COLUMN public.b2b_funnel_benchmarks.stage IS
  'Etapa do funil · delivered (entrega WA) / opened (abertura) / scheduled (agendamento) / redeemed (comparecimento) / purchased (fechamento).';
COMMENT ON COLUMN public.b2b_funnel_benchmarks.target_pct IS
  'Meta da etapa em % (0-100) · acima = verde, 50-100% da meta = amarelo, abaixo = vermelho.';
COMMENT ON COLUMN public.b2b_funnel_benchmarks.label IS
  'Texto exibido na legenda explicativa do funil (ex.: "Taxa de entrega · WhatsApp aceito").';

ALTER TABLE public.b2b_funnel_benchmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_funnel_benchmarks_tenant" ON public.b2b_funnel_benchmarks;
CREATE POLICY "b2b_funnel_benchmarks_tenant" ON public.b2b_funnel_benchmarks
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_funnel_benchmarks TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. RPC b2b_funnel_benchmark_list()
--    Retorna 5 rows da clinica · ordem por sort_order ASC.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_funnel_benchmark_list()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid    uuid := public.app_clinic_id();
  v_result jsonb;
BEGIN
  IF v_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic', 'rows', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.sort_order ASC, t.stage ASC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        clinic_id,
        stage,
        target_pct,
        label,
        sort_order,
        created_at,
        updated_at
      FROM public.b2b_funnel_benchmarks
      WHERE clinic_id = v_cid
    ) t;

  RETURN jsonb_build_object('ok', true, 'rows', v_result);
END $$;

COMMENT ON FUNCTION public.b2b_funnel_benchmark_list() IS
  'Lista 5 benchmarks de funil da clinica (ordem por sort_order ASC) · mig 800-26.';

GRANT EXECUTE ON FUNCTION public.b2b_funnel_benchmark_list() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. RPC b2b_funnel_benchmark_upsert(p_payload jsonb)
--    UPSERT por (clinic_id, stage). Stage + target_pct obrigatorios.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_funnel_benchmark_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid     uuid := public.app_clinic_id();
  v_stage   text;
  v_target  int;
  v_label   text;
BEGIN
  IF v_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;
  IF p_payload IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_payload');
  END IF;

  v_stage := NULLIF(btrim(p_payload->>'stage'), '');
  IF v_stage IS NULL OR v_stage NOT IN ('delivered','opened','scheduled','redeemed','purchased') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_stage');
  END IF;

  v_target := NULLIF(p_payload->>'target_pct', '')::int;
  IF v_target IS NULL OR v_target < 0 OR v_target > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_target_pct');
  END IF;

  v_label := NULLIF(btrim(p_payload->>'label'), '');
  IF v_label IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_label');
  END IF;

  INSERT INTO public.b2b_funnel_benchmarks (
    clinic_id,
    stage,
    target_pct,
    label,
    sort_order,
    updated_at
  ) VALUES (
    v_cid,
    v_stage,
    v_target,
    v_label,
    COALESCE(NULLIF(p_payload->>'sort_order', '')::int, 0),
    now()
  )
  ON CONFLICT (clinic_id, stage) DO UPDATE SET
    target_pct  = EXCLUDED.target_pct,
    label       = EXCLUDED.label,
    sort_order  = EXCLUDED.sort_order,
    updated_at  = now();

  RETURN jsonb_build_object('ok', true, 'stage', v_stage);
END $$;

COMMENT ON FUNCTION public.b2b_funnel_benchmark_upsert(jsonb) IS
  'Upsert benchmark de 1 stage do funil B2B (5 stages permitidos) · mig 800-26.';

GRANT EXECUTE ON FUNCTION public.b2b_funnel_benchmark_upsert(jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. SEED · 5 rows defaults pra cada clinica existente (idempotente)
--    Defaults BI-derived (decididos com Alden 2026-04-26):
--      delivered  · 90% (taxa de entrega WhatsApp aceitavel)
--      opened     · 60% (taxa de abertura · convidada engajou)
--      scheduled  · 50% (CTA do voucher funcionou)
--      redeemed   · 80% (no-show < 20%)
--      purchased  · 35% (combo case + scripts ok)
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO public.b2b_funnel_benchmarks (
  clinic_id, stage, target_pct, label, sort_order
)
SELECT c.id, 'delivered', 90, 'Taxa de entrega · WhatsApp aceito', 1
FROM public.clinics c
ON CONFLICT (clinic_id, stage) DO NOTHING;

INSERT INTO public.b2b_funnel_benchmarks (
  clinic_id, stage, target_pct, label, sort_order
)
SELECT c.id, 'opened', 60, 'Taxa de abertura · convidada engajou', 2
FROM public.clinics c
ON CONFLICT (clinic_id, stage) DO NOTHING;

INSERT INTO public.b2b_funnel_benchmarks (
  clinic_id, stage, target_pct, label, sort_order
)
SELECT c.id, 'scheduled', 50, 'Taxa de agendamento · CTA do voucher funcionou', 3
FROM public.clinics c
ON CONFLICT (clinic_id, stage) DO NOTHING;

INSERT INTO public.b2b_funnel_benchmarks (
  clinic_id, stage, target_pct, label, sort_order
)
SELECT c.id, 'redeemed', 80, 'Taxa de comparecimento · no-show < 20%', 4
FROM public.clinics c
ON CONFLICT (clinic_id, stage) DO NOTHING;

INSERT INTO public.b2b_funnel_benchmarks (
  clinic_id, stage, target_pct, label, sort_order
)
SELECT c.id, 'purchased', 35, 'Taxa de fechamento · combo case, scripts ok', 5
FROM public.clinics c
ON CONFLICT (clinic_id, stage) DO NOTHING;

-- ─── ASSERTS ──────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname='b2b_funnel_benchmarks' AND relkind='r'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: tabela b2b_funnel_benchmarks nao existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='b2b_funnel_benchmark_list'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_funnel_benchmark_list nao existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='b2b_funnel_benchmark_upsert'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_funnel_benchmark_upsert nao existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public'
       AND tablename='b2b_funnel_benchmarks'
       AND policyname='b2b_funnel_benchmarks_tenant'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: RLS policy b2b_funnel_benchmarks_tenant nao existe';
  END IF;

  -- Sanity: cada clinica deve ter 0 ou 5 rows seed
  IF EXISTS (
    SELECT 1
      FROM public.clinics c
     WHERE (SELECT count(*) FROM public.b2b_funnel_benchmarks t WHERE t.clinic_id = c.id) NOT IN (0, 5)
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: alguma clinica tem qtd diferente de 0 ou 5 funnel_benchmarks';
  END IF;

  RAISE NOTICE '✅ Mig 800-26 OK — b2b_funnel_benchmarks tabela + RLS + RPCs + seed prontos';
END $$;

COMMIT;
