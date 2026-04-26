-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-25 · clinicai-v2 · b2b_tier_configs (config por clinica)   ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26 (item #13 do roadmap):                           ║
-- ║   "Tiers (1/2/3) hoje sao hardcoded com labels Premium/Padrão/Apoio em   ║
-- ║    codigo. Quero que sejam CONFIGURAVEIS por clinica · admin define     ║
-- ║    labels, cores, descricoes, defaults (cap mensal, combo padrão,       ║
-- ║    validade voucher, etc) que herdam ao cadastrar parceria."            ║
-- ║                                                                          ║
-- ║ Esta mig adiciona:                                                       ║
-- ║   1. Tabela b2b_tier_configs (clinic_id, tier 1-3, label, color_hex,    ║
-- ║      description, default_monthly_cap_brl, default_voucher_combo,       ║
-- ║      default_voucher_validity_days, default_voucher_monthly_cap, sort). ║
-- ║      PRIMARY KEY (clinic_id, tier).                                      ║
-- ║                                                                          ║
-- ║   2. RLS clinic_id = app_clinic_id() · authenticated.                    ║
-- ║                                                                          ║
-- ║   3. RPC b2b_tier_config_upsert(p_payload jsonb)  · UPSERT.              ║
-- ║   4. RPC b2b_tier_config_list()                    · listSequences.      ║
-- ║                                                                          ║
-- ║   5. Seed defaults (1=Premium, 2=Padrão, 3=Apoio) pra clinicas que ja   ║
-- ║      tem rows · ON CONFLICT DO NOTHING.                                  ║
-- ║                                                                          ║
-- ║ Audiencia: authenticated. RPCs SECURITY DEFINER · escopo via             ║
-- ║ app_clinic_id() do JWT.                                                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Tabela b2b_tier_configs
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.b2b_tier_configs (
  clinic_id                       uuid        NOT NULL,
  tier                            int         NOT NULL CHECK (tier BETWEEN 1 AND 3),
  label                           text        NOT NULL,
  description                     text        NULL,
  color_hex                       text        NOT NULL DEFAULT '#C9A96E',
  default_monthly_cap_brl         numeric     NULL,
  default_voucher_combo           text        NULL,
  default_voucher_validity_days   int         NOT NULL DEFAULT 30,
  default_voucher_monthly_cap     int         NULL,
  sort_order                      int         NOT NULL DEFAULT 0,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, tier)
);

COMMENT ON TABLE public.b2b_tier_configs IS
  'Configuracao de tiers (1/2/3) por clinica · labels/cores/defaults editaveis. Substitui hardcode Premium/Padrão/Apoio. Mig 800-25.';
COMMENT ON COLUMN public.b2b_tier_configs.label IS
  'Nome exibido pro tier (ex.: "Premium", "Padrão", "Apoio") · editavel por admin.';
COMMENT ON COLUMN public.b2b_tier_configs.color_hex IS
  'Cor hex usada em pills/badges do tier (ex.: #C9A96E).';
COMMENT ON COLUMN public.b2b_tier_configs.default_monthly_cap_brl IS
  'Teto mensal default em R$ aplicado ao cadastrar parceria neste tier · NULL = nao aplica.';
COMMENT ON COLUMN public.b2b_tier_configs.default_voucher_combo IS
  'Combo de voucher default herdado · referencia label de b2b_voucher_combos · texto livre.';
COMMENT ON COLUMN public.b2b_tier_configs.default_voucher_validity_days IS
  'Validade default em dias do voucher · herdado ao cadastrar parceria neste tier.';
COMMENT ON COLUMN public.b2b_tier_configs.default_voucher_monthly_cap IS
  'Cap mensal default de vouchers (un) · NULL = nao aplica · herdado ao cadastrar.';

ALTER TABLE public.b2b_tier_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_tier_configs_tenant" ON public.b2b_tier_configs;
CREATE POLICY "b2b_tier_configs_tenant" ON public.b2b_tier_configs
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_tier_configs TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. RPC b2b_tier_config_list()
--    Retorna 3 rows da clinica · ordem por tier ASC.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_tier_config_list()
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

  SELECT COALESCE(jsonb_agg(t ORDER BY t.tier ASC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT
        clinic_id,
        tier,
        label,
        description,
        color_hex,
        default_monthly_cap_brl,
        default_voucher_combo,
        default_voucher_validity_days,
        default_voucher_monthly_cap,
        sort_order,
        created_at,
        updated_at
      FROM public.b2b_tier_configs
      WHERE clinic_id = v_cid
    ) t;

  RETURN jsonb_build_object('ok', true, 'rows', v_result);
END $$;

COMMENT ON FUNCTION public.b2b_tier_config_list() IS
  'Lista 3 tiers da clinica (ordenado por tier ASC) · mig 800-25.';

GRANT EXECUTE ON FUNCTION public.b2b_tier_config_list() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. RPC b2b_tier_config_upsert(p_payload jsonb)
--    UPSERT por (clinic_id, tier). Tier obrigatorio no payload.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_tier_config_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid    uuid := public.app_clinic_id();
  v_tier   int;
  v_label  text;
BEGIN
  IF v_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;
  IF p_payload IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_payload');
  END IF;

  v_tier := NULLIF(p_payload->>'tier', '')::int;
  IF v_tier IS NULL OR v_tier < 1 OR v_tier > 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_tier');
  END IF;

  v_label := NULLIF(btrim(p_payload->>'label'), '');
  IF v_label IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_label');
  END IF;

  INSERT INTO public.b2b_tier_configs (
    clinic_id,
    tier,
    label,
    description,
    color_hex,
    default_monthly_cap_brl,
    default_voucher_combo,
    default_voucher_validity_days,
    default_voucher_monthly_cap,
    sort_order,
    updated_at
  ) VALUES (
    v_cid,
    v_tier,
    v_label,
    NULLIF(btrim(p_payload->>'description'), ''),
    COALESCE(NULLIF(btrim(p_payload->>'color_hex'), ''), '#C9A96E'),
    NULLIF(p_payload->>'default_monthly_cap_brl', '')::numeric,
    NULLIF(btrim(p_payload->>'default_voucher_combo'), ''),
    COALESCE(NULLIF(p_payload->>'default_voucher_validity_days', '')::int, 30),
    NULLIF(p_payload->>'default_voucher_monthly_cap', '')::int,
    COALESCE(NULLIF(p_payload->>'sort_order', '')::int, 0),
    now()
  )
  ON CONFLICT (clinic_id, tier) DO UPDATE SET
    label                          = EXCLUDED.label,
    description                    = EXCLUDED.description,
    color_hex                      = EXCLUDED.color_hex,
    default_monthly_cap_brl        = EXCLUDED.default_monthly_cap_brl,
    default_voucher_combo          = EXCLUDED.default_voucher_combo,
    default_voucher_validity_days  = EXCLUDED.default_voucher_validity_days,
    default_voucher_monthly_cap    = EXCLUDED.default_voucher_monthly_cap,
    sort_order                     = EXCLUDED.sort_order,
    updated_at                     = now();

  RETURN jsonb_build_object('ok', true, 'tier', v_tier);
END $$;

COMMENT ON FUNCTION public.b2b_tier_config_upsert(jsonb) IS
  'Upsert config de 1 tier (1-3) da clinica · mig 800-25.';

GRANT EXECUTE ON FUNCTION public.b2b_tier_config_upsert(jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. SEED · 3 rows defaults pra cada clinica existente (idempotente)
--    Defaults: 1=Premium (gold), 2=Padrão (champagne), 3=Apoio (graphite)
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO public.b2b_tier_configs (
  clinic_id, tier, label, description, color_hex,
  default_monthly_cap_brl, default_voucher_combo,
  default_voucher_validity_days, default_voucher_monthly_cap, sort_order
)
SELECT c.id, 1, 'Premium',
       'Parcerias estrategicas · alta exposicao + prioridade no calendario.',
       '#C9A96E',
       NULL, NULL, 30, 8, 1
FROM public.clinics c
ON CONFLICT (clinic_id, tier) DO NOTHING;

INSERT INTO public.b2b_tier_configs (
  clinic_id, tier, label, description, color_hex,
  default_monthly_cap_brl, default_voucher_combo,
  default_voucher_validity_days, default_voucher_monthly_cap, sort_order
)
SELECT c.id, 2, 'Padrão',
       'Parcerias regulares · cadencia mensal de conteudo + voucher.',
       '#9CA3AF',
       NULL, NULL, 30, 5, 2
FROM public.clinics c
ON CONFLICT (clinic_id, tier) DO NOTHING;

INSERT INTO public.b2b_tier_configs (
  clinic_id, tier, label, description, color_hex,
  default_monthly_cap_brl, default_voucher_combo,
  default_voucher_validity_days, default_voucher_monthly_cap, sort_order
)
SELECT c.id, 3, 'Apoio',
       'Parcerias institucionais leves · troca pontual · sem meta dura.',
       '#6B7280',
       NULL, NULL, 30, 3, 3
FROM public.clinics c
ON CONFLICT (clinic_id, tier) DO NOTHING;

-- ─── ASSERTS ──────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relname='b2b_tier_configs' AND relkind='r'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: tabela b2b_tier_configs nao existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='b2b_tier_config_list'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_tier_config_list nao existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname='b2b_tier_config_upsert'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_tier_config_upsert nao existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public'
       AND tablename='b2b_tier_configs'
       AND policyname='b2b_tier_configs_tenant'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: RLS policy b2b_tier_configs_tenant nao existe';
  END IF;

  -- Sanity: cada clinica deve ter 3 rows seed (se a clinica existe)
  IF EXISTS (
    SELECT 1
      FROM public.clinics c
     WHERE (SELECT count(*) FROM public.b2b_tier_configs t WHERE t.clinic_id = c.id) NOT IN (0, 3)
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: alguma clinica tem qtd diferente de 0 ou 3 tier_configs';
  END IF;

  RAISE NOTICE '✅ Mig 800-25 OK — b2b_tier_configs tabela + RLS + RPCs + seed prontos';
END $$;

COMMIT;
