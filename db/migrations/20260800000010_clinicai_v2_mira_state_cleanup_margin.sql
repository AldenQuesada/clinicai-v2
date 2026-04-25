-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-10 · clinicai-v2 · Mira state cleanup buffer + grace get  ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Fix F3 (State cleanup margin de buffer)                                 ║
-- ║                                                                          ║
-- ║ Problema (auditoria 2026-04-25):                                         ║
-- ║   mira_state_cleanup_expired() (mig 800-02) faz                          ║
-- ║     DELETE FROM mira_conversation_state WHERE expires_at < now()         ║
-- ║   mira_state_get() faz lazy cleanup com mesma condicao.                  ║
-- ║                                                                          ║
-- ║ Cenario do bug:                                                          ║
-- ║   t=10:00 · "Confere · SIM/NAO" enviado · state expires_at=10:30         ║
-- ║   t=10:30:00 · cron mira-state-cleanup roda · DELETE pega o state        ║
-- ║   t=10:30:01 · Dani digita "sim" · webhook chama miraState.get()         ║
-- ║   t=10:30:01 · get retorna null · classifier vai pra partner.other       ║
-- ║   t=10:30:01 · voucher NAO emitido · Dani recebe menu confuso            ║
-- ║                                                                          ║
-- ║ Janela de risco: alguns segundos antes/depois do expires_at exato.       ║
-- ║                                                                          ║
-- ║ Fix:                                                                     ║
-- ║   1. cleanup_expired troca `< now()` por `< now() - interval '2 min'`   ║
-- ║   2. mira_state_get amplia janela de "ainda valido" pra mesma margem    ║
-- ║   3. Nova mira_state_get_with_metadata expoe in_grace_window pra caller  ║
-- ║                                                                          ║
-- ║ Por que 2min (decisao Alden):                                            ║
-- ║   · Suficiente pra skew DB↔worker (10ms-1s) + retry humano (parceira    ║
-- ║     pensa antes de mandar SIM)                                           ║
-- ║   · Nao acumula lixo significativo · cron limpa a cada 10min mesmo      ║
-- ║   · Trade-off: mais e desperdicio, menos e fragil                       ║
-- ║                                                                          ║
-- ║ Compatibilidade:                                                         ║
-- ║   · Assinatura de mira_state_get(text, text) MANTIDA · callers          ║
-- ║     existentes (webhook + 5 handlers) seguem funcionando                ║
-- ║   · mira_state_get_with_metadata e funcao NOVA · opcional                ║
-- ║   · cleanup_expired retorno (int) preservado                             ║
-- ║                                                                          ║
-- ║ GOLD #3: SECURITY DEFINER + SET search_path = public, extensions, pg_temp║
-- ║ GOLD #5: .down.sql pareado · restaura cleanup sem buffer                 ║
-- ║ GOLD #7: sanity check final                                              ║
-- ║ GOLD #10: NOTIFY pgrst reload schema                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── RPC: cleanup_expired (com buffer 2min) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.mira_state_cleanup_expired()
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_count int;
BEGIN
  -- Buffer de 2min · cobre skew DB↔worker + race timing humano.
  -- Cleanup proxima rodada (10min depois) coleta o que ficou.
  DELETE FROM public.mira_conversation_state
   WHERE expires_at < now() - interval '2 minutes';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

-- ── RPC: get (com grace window 2min) ───────────────────────────────────
-- Mantem assinatura legacy (text, text) -> jsonb {value, expires_at}.
-- Dentro de grace window (expires_at < now() mas > now()-2min), retorna
-- mesmo assim · permite responder "sim" segundos depois do expiry.
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
  -- Lazy cleanup so do par solicitado · mesma margem do cleanup global
  DELETE FROM public.mira_conversation_state
   WHERE phone = p_phone
     AND state_key = p_key
     AND expires_at < now() - interval '2 minutes';

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

-- ── RPC: get_with_metadata (versao extendida com in_grace_window) ──────
-- Caller que quer detectar grace usa essa funcao. Retorna o mesmo jsonb
-- de mira_state_get + flag in_grace_window=true se expires_at ja passou
-- mas state ainda esta dentro da margem de 2min.
--
-- Convencao webhook (decisao Alden):
--   in_grace_window=true · OK responder mas NAO estender TTL · estado e
--   "ultima chance" · proxima cleanup vai limpar.
CREATE OR REPLACE FUNCTION public.mira_state_get_with_metadata(
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
  -- Lazy cleanup do par · respeita grace
  DELETE FROM public.mira_conversation_state
   WHERE phone = p_phone
     AND state_key = p_key
     AND expires_at < now() - interval '2 minutes';

  SELECT state_value, expires_at INTO v_row
    FROM public.mira_conversation_state
   WHERE phone = p_phone AND state_key = p_key
   LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'value',            v_row.state_value,
    'expires_at',       v_row.expires_at,
    'in_grace_window',  (v_row.expires_at < now())
  );
END
$$;

-- ── Permissions ─────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.mira_state_cleanup_expired()                  TO service_role;
GRANT EXECUTE ON FUNCTION public.mira_state_get(text, text)                    TO service_role;
GRANT EXECUTE ON FUNCTION public.mira_state_get_with_metadata(text, text)      TO service_role;

-- ── Sanity check ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_clean   boolean;
  v_get     boolean;
  v_get_md  boolean;
  v_clean_src text;
  v_get_src   text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mira_state_cleanup_expired')
    INTO v_clean;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mira_state_get'
                  AND pg_get_function_arguments(p.oid) = 'p_phone text, p_key text')
    INTO v_get;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='mira_state_get_with_metadata')
    INTO v_get_md;

  -- Confirma que o body do cleanup tem o buffer de 2min
  SELECT pg_get_functiondef(p.oid) INTO v_clean_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='mira_state_cleanup_expired';
  -- Filtra a overload (text, text) · existe legacy mira_state_get(text) na DB
  SELECT pg_get_functiondef(p.oid) INTO v_get_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='mira_state_get'
     AND pg_get_function_arguments(p.oid) = 'p_phone text, p_key text';

  IF NOT (v_clean AND v_get AND v_get_md) THEN
    RAISE EXCEPTION 'Sanity 800-10: funcoes ausentes · clean=% get=% get_md=%',
      v_clean, v_get, v_get_md;
  END IF;
  IF v_clean_src NOT LIKE '%2 minutes%' THEN
    RAISE EXCEPTION 'Sanity 800-10: cleanup_expired sem buffer 2min · body=%', v_clean_src;
  END IF;
  IF v_get_src NOT LIKE '%2 minutes%' THEN
    RAISE EXCEPTION 'Sanity 800-10: mira_state_get sem buffer 2min · body=%', v_get_src;
  END IF;

  RAISE NOTICE 'Migration 800-10 OK · cleanup buffer 2min + grace window em get + metadata variant';
END $$;

NOTIFY pgrst, 'reload schema';
