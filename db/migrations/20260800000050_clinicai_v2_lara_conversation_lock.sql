-- ============================================================================
-- Lara · lock atômico por conversation pra eliminar race condition no debounce
-- ============================================================================
--
-- Audit 2026-04-27 · achado N4 (race window herdado da Lara legacy + repetido
-- na implementação do Ivan que usava UPDATE com .or() do PostgREST · não é
-- single-statement quando lockResult precisa ser checado depois).
--
-- Esta migration adiciona:
--  1. Colunas processing_lock_id + processing_locked_at em wa_conversations
--  2. RPC wa_claim_conversation(conv_id, ttl_sec) · lock atômico real via
--     SELECT FOR UPDATE SKIP LOCKED dentro de UPDATE single-statement
--  3. RPC wa_release_conversation(conv_id, lock_id) · libera lock após processo
--  4. RPC wa_clear_stuck_locks() · limpeza periódica de zumbis
--
-- Diferente da impl do Ivan (clinicai-lara), aqui o lock é PROVADAMENTE atômico
-- porque usa CTE com SELECT FOR UPDATE SKIP LOCKED · 2 workers concorrentes
-- não conseguem passar do SELECT antes do UPDATE.
--
-- ADR-029: SECURITY DEFINER + SET search_path = public, extensions, pg_temp.
-- GOLD-STANDARD: idempotente, com sanity check final.

BEGIN;

-- ── 1. Colunas em wa_conversations ─────────────────────────────────────────
ALTER TABLE wa_conversations
  ADD COLUMN IF NOT EXISTS processing_lock_id UUID,
  ADD COLUMN IF NOT EXISTS processing_locked_at TIMESTAMPTZ;

COMMENT ON COLUMN wa_conversations.processing_lock_id IS
  'UUID do worker que detém o lock de processamento (audit fix N4 · 2026-04-27).';
COMMENT ON COLUMN wa_conversations.processing_locked_at IS
  'Quando o lock foi adquirido. Locks > ttl_sec são considerados zumbis.';

CREATE INDEX IF NOT EXISTS idx_wa_conversations_processing_locked_at
  ON wa_conversations (processing_locked_at)
  WHERE processing_lock_id IS NOT NULL;

-- ── 2. RPC wa_claim_conversation ───────────────────────────────────────────
-- Tenta adquirir lock atômico pra processar uma conversation.
-- Retorna o lock_id se conseguiu, NULL se outro worker já tem o lock.
--
-- Atomicidade garantida por: CTE com SELECT FOR UPDATE SKIP LOCKED
--   - SELECT FOR UPDATE bloqueia o row do conversation
--   - SKIP LOCKED faz workers concorrentes pularem em vez de esperar
--   - UPDATE só acontece se o SELECT retornou row (i.e., não estava lockado)
--
-- TTL: locks adquiridos há mais de ttl_sec segundos são considerados zumbis
-- e podem ser sobrescritos (worker original morreu/timed-out).

CREATE OR REPLACE FUNCTION wa_claim_conversation(
  p_conversation_id UUID,
  p_ttl_sec INT DEFAULT 30
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_lock_id UUID;
BEGIN
  v_lock_id := gen_random_uuid();

  -- CTE com FOR UPDATE SKIP LOCKED garante que apenas 1 worker passa.
  -- Se a conv já tem lock vivo (< ttl_sec), o SELECT retorna 0 rows e
  -- o UPDATE não acontece · função retorna NULL.
  WITH locked AS (
    SELECT id
    FROM wa_conversations
    WHERE id = p_conversation_id
      AND (
        processing_lock_id IS NULL
        OR processing_locked_at < NOW() - (p_ttl_sec || ' seconds')::INTERVAL
      )
    FOR UPDATE SKIP LOCKED
  )
  UPDATE wa_conversations c
  SET
    processing_lock_id = v_lock_id,
    processing_locked_at = NOW()
  FROM locked
  WHERE c.id = locked.id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN v_lock_id;
END;
$$;

COMMENT ON FUNCTION wa_claim_conversation(UUID, INT) IS
  'Tenta adquirir lock atômico em wa_conversations. Retorna lock_id ou NULL. Audit fix N4.';

-- ── 3. RPC wa_release_conversation ─────────────────────────────────────────
-- Libera o lock APENAS se o caller é dono dele (conferência via lock_id).
-- Idempotente · seguro chamar mesmo se outro worker já liberou.

CREATE OR REPLACE FUNCTION wa_release_conversation(
  p_conversation_id UUID,
  p_lock_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  UPDATE wa_conversations
  SET
    processing_lock_id = NULL,
    processing_locked_at = NULL
  WHERE id = p_conversation_id
    AND processing_lock_id = p_lock_id;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION wa_release_conversation(UUID, UUID) IS
  'Libera lock APENAS se o lock_id confere · evita worker liberar lock alheio.';

-- ── 4. RPC wa_clear_stuck_locks (manutenção) ───────────────────────────────
-- Limpa locks órfãos (worker morreu sem liberar). Pode rodar via pg_cron
-- a cada 5min como camada defensiva (TTL no claim já cobre, mas isso
-- normaliza quando processo cai antes de release).

CREATE OR REPLACE FUNCTION wa_clear_stuck_locks(p_older_than_sec INT DEFAULT 60)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE wa_conversations
  SET
    processing_lock_id = NULL,
    processing_locked_at = NULL
  WHERE processing_lock_id IS NOT NULL
    AND processing_locked_at < NOW() - (p_older_than_sec || ' seconds')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION wa_clear_stuck_locks(INT) IS
  'Limpa locks órfãos (worker crashed sem release). Executar via pg_cron a cada 5min.';

-- ── GRANTS ─────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION wa_claim_conversation(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION wa_release_conversation(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION wa_clear_stuck_locks(INT) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ── SANITY CHECK ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wa_conversations' AND column_name = 'processing_lock_id'
  ) THEN
    RAISE EXCEPTION 'sanity: processing_lock_id column not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'wa_claim_conversation'
  ) THEN
    RAISE EXCEPTION 'sanity: wa_claim_conversation function not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'wa_release_conversation'
  ) THEN
    RAISE EXCEPTION 'sanity: wa_release_conversation function not created';
  END IF;

  RAISE NOTICE 'mig 20260800000050 · lara conversation lock OK';
END $$;

COMMIT;
