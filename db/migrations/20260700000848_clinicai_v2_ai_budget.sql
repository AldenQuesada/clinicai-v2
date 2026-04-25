-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 848 · clinicai-v2 · _ai_budget (cost control IA)              ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto: Gap 2 do MIGRATION_DOCTRINE · toda chamada Claude/Groq passa  ║
-- ║   por _ai_budget_check ANTES + _ai_budget_record DEPOIS. Default daily  ║
-- ║   limit USD 5/clinic · override via clinic_data.settings.               ║
-- ║                                                                          ║
-- ║ Schema agregado por (clinic_id, day, source) · evita 1 row por call.    ║
-- ║ Multi-tenant: clinic_id obrigatorio · RLS authenticated read.           ║
-- ║                                                                          ║
-- ║ Idempotência: CREATE TABLE IF NOT EXISTS, todas DDL safe pra re-run.    ║
-- ║ Rollback: 20260700000848_clinicai_v2_ai_budget.down.sql                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public._ai_budget (
  clinic_id      uuid           NOT NULL DEFAULT public._default_clinic_id(),
  day_bucket     date           NOT NULL DEFAULT current_date,
  source         text           NOT NULL,                  -- 'lara.webhook' | 'mira.cold-open' | etc
  model          text           NOT NULL,                  -- 'claude-sonnet-4-6' | 'whisper-large-v3' | etc
  input_tokens   bigint         NOT NULL DEFAULT 0,
  output_tokens  bigint         NOT NULL DEFAULT 0,
  cost_usd       numeric(10,6)  NOT NULL DEFAULT 0,
  call_count     int            NOT NULL DEFAULT 0,
  updated_at     timestamptz    NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, day_bucket, source, model)
);

CREATE INDEX IF NOT EXISTS idx_ai_budget_clinic_day
  ON public._ai_budget (clinic_id, day_bucket DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public._ai_budget ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_budget_select_own_clinic ON public._ai_budget;
CREATE POLICY ai_budget_select_own_clinic
  ON public._ai_budget FOR SELECT
  TO authenticated
  USING (clinic_id = public.app_clinic_id());

GRANT SELECT ON public._ai_budget TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public._ai_budget TO service_role;

-- ── RPC budget_check · checa se clínica tem budget hoje ─────────────────
CREATE OR REPLACE FUNCTION public._ai_budget_check(
  p_clinic_id        uuid,
  p_daily_limit_usd  numeric DEFAULT 5.0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_used_usd numeric;
BEGIN
  IF p_clinic_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used_usd', 0,
      'limit_usd', p_daily_limit_usd,
      'reason', 'clinic_id ausente'
    );
  END IF;

  SELECT COALESCE(SUM(cost_usd), 0)
    INTO v_used_usd
    FROM public._ai_budget
   WHERE clinic_id = p_clinic_id
     AND day_bucket = current_date;

  IF v_used_usd >= p_daily_limit_usd THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'used_usd', v_used_usd,
      'limit_usd', p_daily_limit_usd,
      'reason', format('daily limit exceeded: $%.4f / $%.2f', v_used_usd, p_daily_limit_usd)
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'used_usd', v_used_usd,
    'limit_usd', p_daily_limit_usd
  );
END
$$;

GRANT EXECUTE ON FUNCTION public._ai_budget_check(uuid, numeric) TO service_role;
-- authenticated NÃO tem acesso · checagem é interna do backend.

-- ── RPC budget_record · UPSERT agregando uso ────────────────────────────
CREATE OR REPLACE FUNCTION public._ai_budget_record(
  p_clinic_id     uuid,
  p_user_id       uuid,
  p_source        text,
  p_model         text,
  p_input_tokens  bigint,
  p_output_tokens bigint,
  p_cost_usd      numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_clinic_id IS NULL OR p_source IS NULL OR p_model IS NULL THEN
    RAISE EXCEPTION '_ai_budget_record: clinic_id, source, model obrigatorios';
  END IF;

  INSERT INTO public._ai_budget (
    clinic_id, day_bucket, source, model,
    input_tokens, output_tokens, cost_usd, call_count, updated_at
  )
  VALUES (
    p_clinic_id, current_date, p_source, p_model,
    p_input_tokens, p_output_tokens, p_cost_usd, 1, now()
  )
  ON CONFLICT (clinic_id, day_bucket, source, model)
  DO UPDATE SET
    input_tokens  = public._ai_budget.input_tokens  + EXCLUDED.input_tokens,
    output_tokens = public._ai_budget.output_tokens + EXCLUDED.output_tokens,
    cost_usd      = public._ai_budget.cost_usd      + EXCLUDED.cost_usd,
    call_count    = public._ai_budget.call_count    + 1,
    updated_at    = now();
END
$$;

GRANT EXECUTE ON FUNCTION public._ai_budget_record(uuid, uuid, text, text, bigint, bigint, numeric)
  TO service_role;

-- ── View resumida pra dashboard (read-only · authenticated) ─────────────
CREATE OR REPLACE VIEW public.v_ai_budget_today AS
SELECT
  clinic_id,
  day_bucket,
  SUM(input_tokens)  AS total_input_tokens,
  SUM(output_tokens) AS total_output_tokens,
  SUM(cost_usd)      AS total_cost_usd,
  SUM(call_count)    AS total_calls,
  jsonb_object_agg(source || '.' || model, jsonb_build_object(
    'input_tokens',  input_tokens,
    'output_tokens', output_tokens,
    'cost_usd',      cost_usd,
    'calls',         call_count
  )) AS breakdown
FROM public._ai_budget
WHERE day_bucket = current_date
GROUP BY clinic_id, day_bucket;

ALTER VIEW public.v_ai_budget_today SET (security_invoker = on);
GRANT SELECT ON public.v_ai_budget_today TO authenticated;

-- ── Sanity check ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_table boolean;
  v_func_check boolean;
  v_func_record boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='_ai_budget')
    INTO v_table;
  IF NOT v_table THEN RAISE EXCEPTION 'Sanity: _ai_budget nao foi criada'; END IF;

  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='_ai_budget_check')
    INTO v_func_check;
  IF NOT v_func_check THEN RAISE EXCEPTION 'Sanity: _ai_budget_check RPC nao foi criada'; END IF;

  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='_ai_budget_record')
    INTO v_func_record;
  IF NOT v_func_record THEN RAISE EXCEPTION 'Sanity: _ai_budget_record RPC nao foi criada'; END IF;

  RAISE NOTICE 'Migration 848 OK · _ai_budget + 2 RPCs + view criadas';
END $$;

NOTIFY pgrst, 'reload schema';
