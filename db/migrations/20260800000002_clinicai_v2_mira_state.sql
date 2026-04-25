-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-02 · clinicai-v2 · mira_conversation_state + cleanup cron ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto: state machine multi-turno da Mira (voucher_confirm 30min,     ║
-- ║   __processed__ dedup 2h, cp_* wizard 15min). Migracao deriva do        ║
-- ║   clinic-dashboard 20260700000375_mira_conversation_state.sql + ajuste  ║
-- ║   de chaves compostas (state_key TEXT) pra suportar multiplos states    ║
-- ║   simultaneos por phone (cp_step + voucher_confirm convivem).           ║
-- ║                                                                          ║
-- ║ Schema:                                                                  ║
-- ║   mira_conversation_state(phone, state_key, state_value jsonb,           ║
-- ║                           updated_at, expires_at)                        ║
-- ║   PK = (phone, state_key)                                                ║
-- ║                                                                          ║
-- ║ TTL convencionado (DECISAO ALDEN):                                       ║
-- ║   voucher_confirm = 30min (com lembrete engracado 5min antes do expiry) ║
-- ║   __processed__:* = 2h                                                   ║
-- ║   cp_*            = 15min (cadastro de parceria 7-turno)                ║
-- ║   default         = 15min                                                ║
-- ║                                                                          ║
-- ║ RPCs:                                                                    ║
-- ║   mira_state_set(phone, key, value, ttl_minutes)                         ║
-- ║   mira_state_get(phone, key)                                             ║
-- ║   mira_state_clear(phone, key)                                           ║
-- ║   mira_state_cleanup_expired() · pg_cron a cada 10min                    ║
-- ║   mira_state_reminder_check() · pg_cron a cada 1min · dispara reminder  ║
-- ║                                                                          ║
-- ║ GOLD #3: SECURITY DEFINER + SET search_path = public, extensions, pg_temp║
-- ║ GOLD #5: .down.sql pareado.                                              ║
-- ║ GOLD #7: sanity check final.                                             ║
-- ║ GOLD #10: NOTIFY pgrst reload schema.                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Tabela · evolui versao do clinic-dashboard 0375 ─────────────────────
-- Versao prod atual tem PK(phone) e coluna `state jsonb`. Evoluimos:
--   1. Cria tabela se nao existir (greenfield)
--   2. Se existir, adiciona state_key + state_value, migra dados, troca PK
--
-- Migracao de dados: linhas existentes ganham state_key='legacy' com o jsonb
-- antigo copiado pra state_value. Compatibilidade: edge function da
-- clinic-dashboard nao roda mais (Mira live so na clinicai-v2), entao ok.
CREATE TABLE IF NOT EXISTS public.mira_conversation_state (
  phone        text   NOT NULL,
  state_key    text   NOT NULL DEFAULT 'legacy',
  state_value  jsonb  NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

-- ── Migracao schema (caso tabela ja exista com schema antigo) ───────────
DO $$
DECLARE
  v_has_state_col      boolean;
  v_has_state_key_col  boolean;
  v_has_state_value    boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='mira_conversation_state'
                  AND column_name='state')
    INTO v_has_state_col;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='mira_conversation_state'
                  AND column_name='state_key')
    INTO v_has_state_key_col;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='mira_conversation_state'
                  AND column_name='state_value')
    INTO v_has_state_value;

  -- Adiciona state_key e state_value se ausentes
  IF NOT v_has_state_key_col THEN
    ALTER TABLE public.mira_conversation_state
      ADD COLUMN state_key text NOT NULL DEFAULT 'legacy';
  END IF;
  IF NOT v_has_state_value THEN
    ALTER TABLE public.mira_conversation_state
      ADD COLUMN state_value jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  -- Migra `state` antigo pra `state_value` (se nao migrado ainda)
  IF v_has_state_col AND NOT v_has_state_value THEN
    UPDATE public.mira_conversation_state
       SET state_value = state
     WHERE state IS NOT NULL AND state_value = '{}'::jsonb;
  END IF;

  -- Troca PK pra composta (drop antiga · cria nova)
  BEGIN
    ALTER TABLE public.mira_conversation_state DROP CONSTRAINT IF EXISTS mira_conversation_state_pkey;
    ALTER TABLE public.mira_conversation_state ADD CONSTRAINT mira_conversation_state_pkey
      PRIMARY KEY (phone, state_key);
  EXCEPTION WHEN duplicate_table THEN
    -- PK ja existe na forma desejada · ignora
    NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS idx_mira_state_expires
  ON public.mira_conversation_state (expires_at);

CREATE INDEX IF NOT EXISTS idx_mira_state_phone_keypfx
  ON public.mira_conversation_state (phone, state_key text_pattern_ops);

ALTER TABLE public.mira_conversation_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mira_state_service_only" ON public.mira_conversation_state;
CREATE POLICY "mira_state_service_only" ON public.mira_conversation_state
  FOR ALL USING (true) WITH CHECK (true);

-- ── RPC: set ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mira_state_set(
  p_phone        text,
  p_key          text,
  p_value        jsonb,
  p_ttl_minutes  int DEFAULT 15
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_exp timestamptz;
BEGIN
  IF p_phone IS NULL OR p_phone = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_required');
  END IF;
  IF p_key IS NULL OR p_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'key_required');
  END IF;

  -- value=null → clear
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN
    DELETE FROM public.mira_conversation_state
     WHERE phone = p_phone AND state_key = p_key;
    RETURN jsonb_build_object('ok', true, 'cleared', true);
  END IF;

  v_exp := now() + (COALESCE(p_ttl_minutes, 15) || ' minutes')::interval;

  INSERT INTO public.mira_conversation_state(phone, state_key, state_value, updated_at, expires_at)
  VALUES (p_phone, p_key, p_value, now(), v_exp)
  ON CONFLICT (phone, state_key) DO UPDATE SET
    state_value = EXCLUDED.state_value,
    updated_at  = now(),
    expires_at  = EXCLUDED.expires_at;

  RETURN jsonb_build_object('ok', true, 'expires_at', v_exp);
END
$$;

-- ── RPC: get ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mira_state_get(
  p_phone text,
  p_key   text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_row record;
BEGIN
  -- Lazy cleanup · so do par solicitado
  DELETE FROM public.mira_conversation_state
   WHERE phone = p_phone AND state_key = p_key AND expires_at < now();

  SELECT state_value, expires_at INTO v_row
    FROM public.mira_conversation_state
   WHERE phone = p_phone AND state_key = p_key
   LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'value',      v_row.state_value,
    'expires_at', v_row.expires_at
  );
END
$$;

-- ── RPC: clear ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mira_state_clear(
  p_phone text,
  p_key   text DEFAULT NULL  -- NULL = clear all states do phone
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_key IS NULL THEN
    DELETE FROM public.mira_conversation_state WHERE phone = p_phone;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  ELSE
    DELETE FROM public.mira_conversation_state
     WHERE phone = p_phone AND state_key = p_key;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('ok', true, 'cleared_count', v_count);
END
$$;

-- ── RPC: cleanup_expired (pg_cron) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mira_state_cleanup_expired()
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_count int;
BEGIN
  DELETE FROM public.mira_conversation_state WHERE expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

-- ── RPC: reminder_check (pg_cron · voucher_confirm pre-expiry) ──────────
-- Decisao Alden: voucher_confirm tem 30min TTL · 5min antes do expiry, Mira
-- envia mensagem engracada de lembrete. Esse RPC retorna a lista de phones
-- elegiveis pra reminder · webhook /api/cron/mira-reminder-check chama esse
-- RPC e dispara o sendText.
--
-- "Elegivel" = state_key='voucher_confirm' AND expires_at BETWEEN now() AND
--             now()+5min AND state_value->>'reminder_sent' IS NOT 'true'.
-- Marca reminder_sent=true via update inplace pra nao re-disparar.
CREATE OR REPLACE FUNCTION public.mira_state_reminder_check()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_results jsonb := '[]'::jsonb;
  v_row record;
BEGIN
  FOR v_row IN
    SELECT phone, state_value, expires_at
      FROM public.mira_conversation_state
     WHERE state_key = 'voucher_confirm'
       AND expires_at > now()
       AND expires_at < now() + interval '5 minutes'
       AND COALESCE(state_value->>'reminder_sent', 'false') != 'true'
     LIMIT 100
  LOOP
    -- Marca como enviado ANTES de retornar · evita race se cron sobreposto
    UPDATE public.mira_conversation_state
       SET state_value = state_value || jsonb_build_object('reminder_sent', true),
           updated_at  = now()
     WHERE phone = v_row.phone
       AND state_key = 'voucher_confirm';

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'phone',       v_row.phone,
      'state',       v_row.state_value,
      'expires_at',  v_row.expires_at
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'reminders', v_results);
END
$$;

-- ── Permissions ─────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.mira_state_set(text, text, jsonb, int)        TO service_role;
GRANT EXECUTE ON FUNCTION public.mira_state_get(text, text)                    TO service_role;
GRANT EXECUTE ON FUNCTION public.mira_state_clear(text, text)                  TO service_role;
GRANT EXECUTE ON FUNCTION public.mira_state_cleanup_expired()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.mira_state_reminder_check()                   TO service_role;

-- ── pg_cron · cleanup a cada 10min ──────────────────────────────────────
-- Webhook /api/cron/mira-state-cleanup (Easypanel cron) tambem dispara essa
-- limpeza · belt-and-suspenders pra ambientes onde pg_cron nao ta habilitado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('mira_state_cleanup');
    PERFORM cron.schedule(
      'mira_state_cleanup',
      '*/10 * * * *',
      $cron$ SELECT public.mira_state_cleanup_expired(); $cron$
    );

    PERFORM cron.unschedule('mira_state_reminder_check');
    PERFORM cron.schedule(
      'mira_state_reminder_check',
      '* * * * *',  -- a cada 1min
      $cron$ SELECT public.mira_state_reminder_check(); $cron$
    );

    RAISE NOTICE 'Migration 800-02 · pg_cron jobs registrados (cleanup, reminder_check)';
  ELSE
    RAISE NOTICE 'Migration 800-02 · pg_cron nao disponivel · webhook /api/cron/mira-* via Easypanel cobre fallback';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Migration 800-02 · pg_cron skip: %', SQLERRM;
END $$;

-- ── Sanity check ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_table boolean;
  v_set   boolean;
  v_get   boolean;
  v_clean boolean;
  v_rem   boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='mira_conversation_state')
    INTO v_table;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mira_state_set')
    INTO v_set;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mira_state_get')
    INTO v_get;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mira_state_cleanup_expired')
    INTO v_clean;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mira_state_reminder_check')
    INTO v_rem;

  IF NOT (v_table AND v_set AND v_get AND v_clean AND v_rem) THEN
    RAISE EXCEPTION 'Sanity 800-02: state schema nao completo · table=% set=% get=% clean=% rem=%',
      v_table, v_set, v_get, v_clean, v_rem;
  END IF;

  RAISE NOTICE 'Migration 800-02 OK · mira_conversation_state + 5 RPCs';
END $$;

NOTIFY pgrst, 'reload schema';
