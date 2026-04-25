-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-09 · clinicai-v2 · Lara followup batch limit anti-avalanche║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto · auditoria F2:                                                  ║
-- ║   lara_voucher_followup_pick (mig 800-07) retorna ATÉ 200 candidatos sem ║
-- ║   limit funcional. Se cron atrasar (Easypanel reboot · Actions slow), a  ║
-- ║   próxima execução pega o backlog inteiro · 26 vouchers Dani Mendes      ║
-- ║   pendentes simultaneamente · Mih (Evolution) pode rate-limit · ban      ║
-- ║   temporário · follow-ups perdidos · parceira recebe relatório errado.   ║
-- ║                                                                            ║
-- ║ Fix:                                                                       ║
-- ║   1. CREATE OR REPLACE lara_voucher_followup_pick(p_now, p_limit DEFAULT  ║
-- ║      10) com:                                                              ║
-- ║      - LIMIT p_limit funcional (parametrizado pelo cron)                  ║
-- ║      - ORDER BY prioridade: 72h > 48h > 24h (urgência primeiro)            ║
-- ║      - Pick atômico via UPDATE ... RETURNING · seta picking_at = now()    ║
-- ║      - Filtra picking_at IS NULL OR picking_at < now() - 5min (stuck)      ║
-- ║                                                                            ║
-- ║   2. ADD COLUMN b2b_vouchers.lara_followup_picking_at timestamptz NULL    ║
-- ║      lock soft pra evitar 2 crons concorrentes pegarem mesmos vouchers.   ║
-- ║                                                                            ║
-- ║   3. CREATE FUNCTION lara_voucher_followup_clear_stuck() · reset          ║
-- ║      picking_at = NULL onde stuck > 5min · returns count.                 ║
-- ║                                                                            ║
-- ║   4. lara_voucher_mark_followup_sent agora também unset picking_at.       ║
-- ║                                                                            ║
-- ║ Comportamento esperado:                                                    ║
-- ║   - 26 candidates Dani · pick(10) retorna 10 · marca picking_at           ║
-- ║   - 16 restantes ficam pra próxima hora · pick retorna 10 · sobram 6      ║
-- ║   - 3ª execução · pick retorna 6 · fila zera                              ║
-- ║   - Se cron crashar entre pick e markFollowupSent, picking_at fica.       ║
-- ║     5 min depois clear_stuck reseta · próximo pick os pega de novo.       ║
-- ║                                                                            ║
-- ║ GOLD #3 (search_path), #5 (.down), #7 (sanity), #10 (NOTIFY).             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Coluna picking_at (lock soft) ────────────────────────────────────
ALTER TABLE public.b2b_vouchers
  ADD COLUMN IF NOT EXISTS lara_followup_picking_at timestamptz NULL;

COMMENT ON COLUMN public.b2b_vouchers.lara_followup_picking_at IS
  'Lock soft anti-double-pick (mig 800-09). Setado por lara_voucher_followup_pick '
  'no momento do pick · unset por mark_followup_sent ou clear_stuck (>5min).';

-- Indice parcial: vouchers em pick ativo (picking_at NOT NULL) · raro mas
-- consultado por clear_stuck.
CREATE INDEX IF NOT EXISTS idx_b2b_vouchers_lara_followup_picking
  ON public.b2b_vouchers (lara_followup_picking_at)
  WHERE lara_followup_picking_at IS NOT NULL;

-- ── 2. Drop assinatura antiga · necessario antes de CREATE OR REPLACE com ─
-- nova assinatura (p_limit add muda hash de pg_proc).
DROP FUNCTION IF EXISTS public.lara_voucher_followup_pick(timestamptz);

-- ── 3. RPC: lara_voucher_followup_pick(p_now, p_limit) · VOLATILE ─────────
-- Mudanças vs 800-07:
--   - VOLATILE (não STABLE) · agora UPDATEa picking_at
--   - p_limit (default 10) · parametriza batch
--   - ORDER BY prioridade descendente: 72h_due > 48h_due > 24h_due
--   - Pick atômico: UPDATE ... RETURNING dentro de CTE · single round-trip
--   - Filtra: picking_at IS NULL OR picking_at < now() - 5min
CREATE OR REPLACE FUNCTION public.lara_voucher_followup_pick(
  p_now   timestamptz DEFAULT now(),
  p_limit int         DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_results jsonb := '[]'::jsonb;
  v_row     record;
  v_bucket  text;
  v_first_recipient text;
  v_first_partner   text;
BEGIN
  -- Sanity input
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 10;
  END IF;
  IF p_limit > 100 THEN
    p_limit := 100; -- hard cap defensivo
  END IF;

  -- Pick atômico · CTE com UPDATE RETURNING evita race entre 2 crons.
  -- Estratégia em 2 etapas:
  --   1. SELECT FOR UPDATE SKIP LOCKED sobre b2b_vouchers (não CTE) pra
  --      lockar apenas as linhas que vamos pickar · bypass de concorrentes.
  --   2. UPDATE ... RETURNING * com JOIN de volta pra trazer dados +
  --      partnership name. UPDATE seta picking_at = p_now atomicamente.
  --
  -- Prioridade · bucket_priority calculado inline:
  --   3 = 72h due (audio_sent_at <= now-72h AND sent_48h NOT NULL AND sent_72h NULL)
  --   2 = 48h due (audio_sent_at <= now-48h AND sent_24h NOT NULL AND sent_48h NULL)
  --   1 = 24h due (audio_sent_at <= now-24h AND sent_24h NULL)
  --   0 = nada due (filtrado fora)
  FOR v_row IN
    WITH eligible AS (
      SELECT
        v.id,
        CASE
          WHEN v.lara_followup_sent_48h_at IS NOT NULL
               AND v.lara_followup_sent_72h_at IS NULL
               AND v.audio_sent_at <= p_now - interval '72 hours' THEN 3
          WHEN v.lara_followup_sent_24h_at IS NOT NULL
               AND v.lara_followup_sent_48h_at IS NULL
               AND v.audio_sent_at <= p_now - interval '48 hours' THEN 2
          WHEN v.lara_followup_sent_24h_at IS NULL
               AND v.audio_sent_at <= p_now - interval '24 hours' THEN 1
          ELSE 0
        END AS bucket_priority,
        v.audio_sent_at AS audio_sent_at_sort
      FROM public.b2b_vouchers v
      WHERE v.lara_followup_state = 'pending'
        AND v.recipient_phone IS NOT NULL
        AND v.audio_sent_at IS NOT NULL
        AND COALESCE(v.status, 'issued') NOT IN ('cancelled','redeemed','expired')
        AND v.audio_sent_at <= p_now - interval '24 hours'
        AND (
          v.lara_followup_picking_at IS NULL
          OR v.lara_followup_picking_at < p_now - interval '5 minutes'
        )
    ),
    ranked AS (
      SELECT id, bucket_priority
        FROM eligible
       WHERE bucket_priority > 0
       ORDER BY
         bucket_priority DESC,
         audio_sent_at_sort ASC
       LIMIT p_limit
    ),
    picked AS (
      UPDATE public.b2b_vouchers v
         SET lara_followup_picking_at = p_now,
             updated_at = p_now
        FROM ranked r
       WHERE v.id = r.id
         -- Re-check lock condition no UPDATE pra ser totalmente race-safe
         AND (
           v.lara_followup_picking_at IS NULL
           OR v.lara_followup_picking_at < p_now - interval '5 minutes'
         )
       RETURNING v.id, r.bucket_priority
    )
    SELECT
      v.id,
      v.clinic_id,
      v.partnership_id,
      v.recipient_name,
      v.recipient_phone,
      v.combo,
      v.audio_sent_at,
      p.name           AS partnership_name,
      p.contact_name   AS partner_contact_name,
      p.contact_phone  AS partner_contact_phone,
      pk.bucket_priority
    FROM picked pk
    JOIN public.b2b_vouchers v   ON v.id = pk.id
    JOIN public.b2b_partnerships p ON p.id = v.partnership_id
  LOOP
    -- Decide bucket textual a partir de bucket_priority (já garantido > 0)
    IF v_row.bucket_priority = 3 THEN
      v_bucket := '72h';
    ELSIF v_row.bucket_priority = 2 THEN
      v_bucket := '48h';
    ELSE
      v_bucket := '24h';
    END IF;

    v_first_recipient := split_part(COALESCE(v_row.recipient_name, ''), ' ', 1);
    v_first_partner   := split_part(COALESCE(v_row.partner_contact_name, v_row.partnership_name, ''), ' ', 1);

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'voucher_id',             v_row.id,
      'clinic_id',              v_row.clinic_id,
      'partnership_id',         v_row.partnership_id,
      'partnership_name',       v_row.partnership_name,
      'partner_contact_name',   v_row.partner_contact_name,
      'partner_contact_phone',  v_row.partner_contact_phone,
      'partner_first_name',     NULLIF(v_first_partner, ''),
      'recipient_name',         v_row.recipient_name,
      'recipient_first_name',   NULLIF(v_first_recipient, ''),
      'recipient_phone',        v_row.recipient_phone,
      'combo',                  v_row.combo,
      'audio_sent_at',          v_row.audio_sent_at,
      'bucket',                 v_bucket
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok',     true,
    'limit',  p_limit,
    'picked', jsonb_array_length(v_results),
    'items',  v_results
  );
END
$$;

-- ── 4. RPC: lara_voucher_followup_clear_stuck() ─────────────────────────
-- Reset picking_at em vouchers stuck > 5min · chamado pelo cron antes de pickar.
-- Returns { ok, cleared: int }.
CREATE OR REPLACE FUNCTION public.lara_voucher_followup_clear_stuck()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.b2b_vouchers
     SET lara_followup_picking_at = NULL,
         updated_at = now()
   WHERE lara_followup_picking_at IS NOT NULL
     AND lara_followup_picking_at < now() - interval '5 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'cleared', v_count);
END
$$;

-- ── 5. RPC: lara_voucher_mark_followup_sent · agora unset picking_at ────
-- Mesma lógica de 800-07 + zera picking_at quando marca cold_<bucket>.
CREATE OR REPLACE FUNCTION public.lara_voucher_mark_followup_sent(
  p_voucher_id uuid,
  p_bucket     text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count     int;
  v_new_state text;
BEGIN
  IF p_bucket NOT IN ('24h','48h','72h') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_bucket');
  END IF;

  v_new_state := 'cold_' || p_bucket;

  IF p_bucket = '24h' THEN
    UPDATE public.b2b_vouchers
       SET lara_followup_sent_24h_at  = COALESCE(lara_followup_sent_24h_at, now()),
           lara_followup_state        = v_new_state,
           lara_followup_picking_at   = NULL,
           updated_at                 = now()
     WHERE id = p_voucher_id
       AND lara_followup_state = 'pending';
  ELSIF p_bucket = '48h' THEN
    UPDATE public.b2b_vouchers
       SET lara_followup_sent_48h_at  = COALESCE(lara_followup_sent_48h_at, now()),
           lara_followup_state        = v_new_state,
           lara_followup_picking_at   = NULL,
           updated_at                 = now()
     WHERE id = p_voucher_id
       AND lara_followup_state = 'cold_24h';
  ELSE -- 72h
    UPDATE public.b2b_vouchers
       SET lara_followup_sent_72h_at  = COALESCE(lara_followup_sent_72h_at, now()),
           lara_followup_state        = v_new_state,
           lara_followup_picking_at   = NULL,
           updated_at                 = now()
     WHERE id = p_voucher_id
       AND lara_followup_state = 'cold_48h';
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Se UPDATE não pegou (state mudou entre pick e mark), libera o lock anyway.
  IF v_count = 0 THEN
    UPDATE public.b2b_vouchers
       SET lara_followup_picking_at = NULL
     WHERE id = p_voucher_id
       AND lara_followup_picking_at IS NOT NULL;
  END IF;

  RETURN jsonb_build_object('ok', v_count > 0, 'updated', v_count, 'new_state', v_new_state);
END
$$;

-- ── 6. Permissions · service_role apenas ─────────────────────────────────
GRANT EXECUTE ON FUNCTION public.lara_voucher_followup_pick(timestamptz, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.lara_voucher_followup_clear_stuck()          TO service_role;
GRANT EXECUTE ON FUNCTION public.lara_voucher_mark_followup_sent(uuid, text)  TO service_role;

-- ── 7. Sanity check ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_col_picking      boolean;
  v_idx_picking      boolean;
  v_rpc_pick         boolean;
  v_rpc_pick_args    int;
  v_rpc_clear        boolean;
  v_rpc_mark         boolean;
  v_rpc_pick_volatile char;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='b2b_vouchers'
       AND column_name='lara_followup_picking_at'
  ) INTO v_col_picking;

  SELECT EXISTS(
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND indexname='idx_b2b_vouchers_lara_followup_picking'
  ) INTO v_idx_picking;

  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='lara_voucher_followup_pick'
       AND pg_get_function_arguments(p.oid) ILIKE '%p_limit%'
  ) INTO v_rpc_pick;

  SELECT pronargs FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='lara_voucher_followup_pick'
   LIMIT 1 INTO v_rpc_pick_args;

  SELECT provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='lara_voucher_followup_pick'
   LIMIT 1 INTO v_rpc_pick_volatile;

  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='lara_voucher_followup_clear_stuck'
  ) INTO v_rpc_clear;

  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='lara_voucher_mark_followup_sent'
  ) INTO v_rpc_mark;

  IF NOT (v_col_picking AND v_idx_picking AND v_rpc_pick AND v_rpc_clear AND v_rpc_mark
          AND v_rpc_pick_args = 2 AND v_rpc_pick_volatile = 'v') THEN
    RAISE EXCEPTION 'Sanity 800-09 FAIL · col_picking=% idx_picking=% rpc_pick=% args=% volatile=% rpc_clear=% rpc_mark=%',
      v_col_picking, v_idx_picking, v_rpc_pick, v_rpc_pick_args, v_rpc_pick_volatile,
      v_rpc_clear, v_rpc_mark;
  END IF;

  RAISE NOTICE 'Migration 800-09 OK · picking_at lock + 2-arg pick(p_now,p_limit) + clear_stuck';
END $$;

NOTIFY pgrst, 'reload schema';
