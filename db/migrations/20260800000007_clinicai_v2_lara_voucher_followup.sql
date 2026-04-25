-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-07 · clinicai-v2 · Lara voucher follow-up                 ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto: hoje o ciclo de voucher B2B termina quando Mira manda audio + ║
-- ║   texto + link pra recipient (audio_sent_at preenchido). Se a recipient  ║
-- ║   nao responde, secretaria humana TEM que entrar pra retomar · perde     ║
-- ║   janela. Alden quer que a Lara assuma:                                  ║
-- ║                                                                          ║
-- ║   - Recipient responde dentro de 72h → Lara detecta voucher recente     ║
-- ║     no webhook · marca engaged · entra em fluxo de agendamento direto.  ║
-- ║   - Recipient nao responde → cron envia follow-ups engracados em        ║
-- ║     24h / 48h / 72h. Apos 72h sem resposta, marca cold_72h e relata     ║
-- ║     pra parceira.                                                        ║
-- ║                                                                          ║
-- ║ Schema delta em b2b_vouchers:                                            ║
-- ║   ADD lara_followup_state text DEFAULT 'pending' CHECK (...)             ║
-- ║   ADD lara_engaged_at timestamptz NULL                                   ║
-- ║   ADD lara_followup_sent_24h_at timestamptz NULL                         ║
-- ║   ADD lara_followup_sent_48h_at timestamptz NULL                         ║
-- ║   ADD lara_followup_sent_72h_at timestamptz NULL                         ║
-- ║                                                                          ║
-- ║ Indice: (lara_followup_state, audio_sent_at) parcial · cron query rapido ║
-- ║                                                                          ║
-- ║ RPCs:                                                                    ║
-- ║   lara_voucher_followup_pick(p_now timestamptz) → vouchers candidatos    ║
-- ║   lara_voucher_mark_engaged(p_voucher_id uuid)  → seta engaged + ts      ║
-- ║   lara_voucher_mark_followup_sent(p_voucher_id, p_bucket, p_state)       ║
-- ║                                                                          ║
-- ║ GOLD #3 (search_path), #5 (.down), #7 (sanity), #10 (NOTIFY).            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Colunas ───────────────────────────────────────────────────────────
ALTER TABLE public.b2b_vouchers
  ADD COLUMN IF NOT EXISTS lara_followup_state text NOT NULL DEFAULT 'pending';

ALTER TABLE public.b2b_vouchers
  ADD COLUMN IF NOT EXISTS lara_engaged_at timestamptz NULL;

ALTER TABLE public.b2b_vouchers
  ADD COLUMN IF NOT EXISTS lara_followup_sent_24h_at timestamptz NULL;

ALTER TABLE public.b2b_vouchers
  ADD COLUMN IF NOT EXISTS lara_followup_sent_48h_at timestamptz NULL;

ALTER TABLE public.b2b_vouchers
  ADD COLUMN IF NOT EXISTS lara_followup_sent_72h_at timestamptz NULL;

-- CHECK constraint · idempotente. ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS
-- nao existe pra CHECK · usa DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'b2b_vouchers_lara_followup_state_chk'
       AND conrelid = 'public.b2b_vouchers'::regclass
  ) THEN
    ALTER TABLE public.b2b_vouchers
      ADD CONSTRAINT b2b_vouchers_lara_followup_state_chk
        CHECK (lara_followup_state IN (
          'pending',
          'engaged',
          'cold_24h',
          'cold_48h',
          'cold_72h',
          'scheduled',
          'cancelled'
        ));
  END IF;
END $$;

COMMENT ON COLUMN public.b2b_vouchers.lara_followup_state IS
  'Estado do follow-up automatico da Lara · pending=audio recem-enviado, '
  'engaged=recipient respondeu (Lara cuida), cold_<N>h=follow-up enviado mas '
  'sem resposta, scheduled=lead virou consulta, cancelled=parceira/admin abortou.';

COMMENT ON COLUMN public.b2b_vouchers.lara_engaged_at IS
  'Quando recipient respondeu pela primeira vez no Whats apos voucher emitido. '
  'Setado pelo webhook Lara via RPC lara_voucher_mark_engaged.';

-- ── 2. Indices ──────────────────────────────────────────────────────────
-- Cron query · pending vouchers ordenados por audio_sent_at (oldest primeiro)
CREATE INDEX IF NOT EXISTS idx_b2b_vouchers_lara_followup_pick
  ON public.b2b_vouchers (lara_followup_state, audio_sent_at)
  WHERE lara_followup_state = 'pending' AND audio_sent_at IS NOT NULL;

-- Webhook lookup · recipient_phone + recente (audio_sent_at)
CREATE INDEX IF NOT EXISTS idx_b2b_vouchers_recipient_phone_recent
  ON public.b2b_vouchers (clinic_id, recipient_phone, audio_sent_at DESC)
  WHERE recipient_phone IS NOT NULL AND audio_sent_at IS NOT NULL;

-- ── 3. RPC: lara_voucher_followup_pick ─────────────────────────────────
-- Retorna jsonb { ok, items: [...] } · cada item:
--   { voucher_id, clinic_id, partnership_id, partnership_name, partner_first_name,
--     recipient_name, recipient_first_name, recipient_phone, combo, audio_sent_at,
--     bucket: '24h' | '48h' | '72h' }
-- Buckets:
--   24h: audio_sent_at <= now() - 24h AND lara_followup_sent_24h_at IS NULL
--   48h: audio_sent_at <= now() - 48h AND lara_followup_sent_48h_at IS NULL
--        AND lara_followup_sent_24h_at IS NOT NULL  -- so apos 24h enviado
--   72h: audio_sent_at <= now() - 72h AND lara_followup_sent_72h_at IS NULL
--        AND lara_followup_sent_48h_at IS NOT NULL  -- so apos 48h enviado
-- Filtra: lara_followup_state = 'pending' (nao engaged, nao cancelled, nao scheduled)
--         AND status NOT IN ('cancelled','redeemed')
--         AND recipient_phone IS NOT NULL
CREATE OR REPLACE FUNCTION public.lara_voucher_followup_pick(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
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
  FOR v_row IN
    SELECT
      v.id,
      v.clinic_id,
      v.partnership_id,
      v.recipient_name,
      v.recipient_phone,
      v.combo,
      v.audio_sent_at,
      v.lara_followup_sent_24h_at,
      v.lara_followup_sent_48h_at,
      v.lara_followup_sent_72h_at,
      p.name              AS partnership_name,
      p.contact_name      AS partner_contact_name,
      p.contact_phone     AS partner_contact_phone
    FROM public.b2b_vouchers v
    JOIN public.b2b_partnerships p ON p.id = v.partnership_id
    WHERE v.lara_followup_state = 'pending'
      AND v.recipient_phone IS NOT NULL
      AND v.audio_sent_at IS NOT NULL
      AND COALESCE(v.status, 'issued') NOT IN ('cancelled','redeemed','expired')
      AND v.audio_sent_at <= p_now - interval '24 hours'
    ORDER BY v.audio_sent_at ASC
    LIMIT 200
  LOOP
    -- Decide qual bucket disparar (escalada estrita: 24h → 48h → 72h)
    IF v_row.lara_followup_sent_24h_at IS NULL THEN
      v_bucket := '24h';
    ELSIF v_row.lara_followup_sent_48h_at IS NULL
          AND v_row.audio_sent_at <= p_now - interval '48 hours' THEN
      v_bucket := '48h';
    ELSIF v_row.lara_followup_sent_72h_at IS NULL
          AND v_row.audio_sent_at <= p_now - interval '72 hours' THEN
      v_bucket := '72h';
    ELSE
      CONTINUE; -- ja enviou todos applicaveis · skip
    END IF;

    -- Primeiros nomes (cosmetico · evita fallback feio em mensagem)
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

  RETURN jsonb_build_object('ok', true, 'items', v_results);
END
$$;

-- ── 4. RPC: lara_voucher_mark_engaged ──────────────────────────────────
-- Setado pelo webhook Lara quando detecta resposta da recipient.
-- Idempotente: so atualiza se state ainda 'pending' (nao sobrescreve cold/cancelled).
CREATE OR REPLACE FUNCTION public.lara_voucher_mark_engaged(p_voucher_id uuid)
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
     SET lara_followup_state = 'engaged',
         lara_engaged_at     = COALESCE(lara_engaged_at, now()),
         updated_at          = now()
   WHERE id = p_voucher_id
     AND lara_followup_state IN ('pending','cold_24h','cold_48h','cold_72h');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_count > 0, 'updated', v_count);
END
$$;

-- ── 5. RPC: lara_voucher_mark_followup_sent ────────────────────────────
-- Caller (cron) passa bucket ('24h'|'48h'|'72h') e novo state ('cold_24h'|'cold_48h'|'cold_72h').
-- Atualiza coluna timestamp do bucket + state.
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
       SET lara_followup_sent_24h_at = COALESCE(lara_followup_sent_24h_at, now()),
           lara_followup_state       = v_new_state,
           updated_at                = now()
     WHERE id = p_voucher_id
       AND lara_followup_state = 'pending';
  ELSIF p_bucket = '48h' THEN
    UPDATE public.b2b_vouchers
       SET lara_followup_sent_48h_at = COALESCE(lara_followup_sent_48h_at, now()),
           lara_followup_state       = v_new_state,
           updated_at                = now()
     WHERE id = p_voucher_id
       AND lara_followup_state = 'cold_24h';
  ELSE -- 72h
    UPDATE public.b2b_vouchers
       SET lara_followup_sent_72h_at = COALESCE(lara_followup_sent_72h_at, now()),
           lara_followup_state       = v_new_state,
           updated_at                = now()
     WHERE id = p_voucher_id
       AND lara_followup_state = 'cold_48h';
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_count > 0, 'updated', v_count, 'new_state', v_new_state);
END
$$;

-- ── 6. Permissions · service_role apenas (worker + webhook) ────────────
GRANT EXECUTE ON FUNCTION public.lara_voucher_followup_pick(timestamptz)        TO service_role;
GRANT EXECUTE ON FUNCTION public.lara_voucher_mark_engaged(uuid)                TO service_role;
GRANT EXECUTE ON FUNCTION public.lara_voucher_mark_followup_sent(uuid, text)    TO service_role;

-- ── 7. Sanity check ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_col_state    boolean;
  v_col_engaged  boolean;
  v_col_24       boolean;
  v_col_48       boolean;
  v_col_72       boolean;
  v_chk          boolean;
  v_idx_pick     boolean;
  v_idx_phone    boolean;
  v_rpc_pick     boolean;
  v_rpc_engaged  boolean;
  v_rpc_sent     boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='b2b_vouchers'
                  AND column_name='lara_followup_state') INTO v_col_state;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='b2b_vouchers'
                  AND column_name='lara_engaged_at') INTO v_col_engaged;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='b2b_vouchers'
                  AND column_name='lara_followup_sent_24h_at') INTO v_col_24;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='b2b_vouchers'
                  AND column_name='lara_followup_sent_48h_at') INTO v_col_48;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='b2b_vouchers'
                  AND column_name='lara_followup_sent_72h_at') INTO v_col_72;
  SELECT EXISTS(SELECT 1 FROM pg_constraint
                WHERE conname='b2b_vouchers_lara_followup_state_chk') INTO v_chk;
  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
                  AND indexname='idx_b2b_vouchers_lara_followup_pick') INTO v_idx_pick;
  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
                  AND indexname='idx_b2b_vouchers_recipient_phone_recent') INTO v_idx_phone;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='lara_voucher_followup_pick') INTO v_rpc_pick;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='lara_voucher_mark_engaged') INTO v_rpc_engaged;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='lara_voucher_mark_followup_sent') INTO v_rpc_sent;

  IF NOT (v_col_state AND v_col_engaged AND v_col_24 AND v_col_48 AND v_col_72
          AND v_chk AND v_idx_pick AND v_idx_phone
          AND v_rpc_pick AND v_rpc_engaged AND v_rpc_sent) THEN
    RAISE EXCEPTION 'Sanity 800-07 FAIL · cols(state=% engaged=% 24=% 48=% 72=%) chk=% idx(pick=% phone=%) rpcs(pick=% engaged=% sent=%)',
      v_col_state, v_col_engaged, v_col_24, v_col_48, v_col_72, v_chk,
      v_idx_pick, v_idx_phone, v_rpc_pick, v_rpc_engaged, v_rpc_sent;
  END IF;

  RAISE NOTICE 'Migration 800-07 OK · b2b_vouchers + 5 cols + 2 idx + 3 RPCs';
END $$;

NOTIFY pgrst, 'reload schema';
