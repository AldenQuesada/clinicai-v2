-- ============================================================================
-- Auto-greeting da secretaria · atomic claim · cobertura dos 4 bugs
-- ============================================================================
--
-- Contexto (audit 2026-05-04 ·): a guard atual `inboundsToday===1` no webhook
-- (Cloud + Evolution) tinha 4 problemas:
--   1. Ignora se Luciana já tá conversando (outbound humano antes do inbound)
--   2. Race window entre count + saveOutbound · 2 inbounds simultâneos = 2 greetings
--   3. setHours(0,0,0,0) em server timezone (UTC) · Maringá tem off-by-3h
--   4. Falha no send pula greeting silenciosa pra sempre (count=2 na próxima)
--
-- Fix: fonte canônica via RPC atomic.
--
-- Regras do RPC `wa_secretaria_auto_greeting_claim(conv_id)`:
--   ❌ NÃO claima se houve qualquer outbound humano (sender='humano') nas últimas 6h
--      → cobre cenário 1 (Luciana acabou de mandar) + 4 (auto-greeting prévio recente)
--   ❌ NÃO claima se last_auto_greeting_at > NOW() - 24h
--      → idempotency robusto · não duplica num burst rajada inbound
--   ✅ Claim atomic via UPDATE com WHERE clause · race-safe (2 webhooks concorrentes
--      = exatamente 1 retorna true)
--
-- Pra rollback de send fail · `wa_secretaria_auto_greeting_unclaim(conv_id)` reseta
-- last_auto_greeting_at pra NULL · próxima inbound do paciente reentregaria.
--
-- ADR-029: SECURITY DEFINER + SET search_path · GRANT só service_role.

BEGIN;

-- ── 1. Coluna last_auto_greeting_at ────────────────────────────────────────

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS last_auto_greeting_at TIMESTAMPTZ;

COMMENT ON COLUMN public.wa_conversations.last_auto_greeting_at IS
  'Timestamp do último auto-greeting da secretaria · NULL = nunca mandado · usado pra cooldown 24h.';

-- Index parcial · só rows com greeting · query "claim" usa pra filtro recente
CREATE INDEX IF NOT EXISTS idx_wa_conversations_last_auto_greeting
  ON public.wa_conversations (last_auto_greeting_at)
  WHERE last_auto_greeting_at IS NOT NULL;

-- ── 2. RPC claim · atomic check + flag ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_secretaria_auto_greeting_claim(
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_recent_outbound BOOLEAN;
  v_claimed UUID;
BEGIN
  -- Guard 1: outbound humano nas últimas 6h (cobre Luciana ativa + auto-greeting recente)
  SELECT EXISTS (
    SELECT 1 FROM public.wa_messages
    WHERE conversation_id = p_conversation_id
      AND direction = 'outbound'
      AND sender = 'humano'
      AND sent_at > NOW() - INTERVAL '6 hours'
  ) INTO v_recent_outbound;

  IF v_recent_outbound THEN
    RETURN false;
  END IF;

  -- Guard 2: claim atomic · UPDATE com WHERE garante race-safety.
  -- last_auto_greeting_at < NOW() - 24h cobre cooldown · NULL cobre primeiríssimo claim.
  UPDATE public.wa_conversations
  SET last_auto_greeting_at = NOW()
  WHERE id = p_conversation_id
    AND (last_auto_greeting_at IS NULL
         OR last_auto_greeting_at < NOW() - INTERVAL '24 hours')
  RETURNING id INTO v_claimed;

  -- v_claimed = NULL se: (a) conv não existe, OU (b) cooldown ainda ativo
  RETURN v_claimed IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.wa_secretaria_auto_greeting_claim(UUID) IS
  'Claim atomic pra auto-greeting da secretaria · true=worker pode mandar · false=skip (Luciana ativa OU cooldown 24h).';

-- ── 3. RPC unclaim · rollback se send falhar ──────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_secretaria_auto_greeting_unclaim(
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  -- Só desfaz se foi claimed nos últimos 5min · evita unclaim acidental de
  -- claim antigo legitimo
  UPDATE public.wa_conversations
  SET last_auto_greeting_at = NULL
  WHERE id = p_conversation_id
    AND last_auto_greeting_at IS NOT NULL
    AND last_auto_greeting_at > NOW() - INTERVAL '5 minutes';

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.wa_secretaria_auto_greeting_unclaim(UUID) IS
  'Reverte claim recente (≤5min) se Cloud/Evolution send falhar · próxima inbound re-tenta.';

-- ── 4. Security · revoke anon · grant só service_role ─────────────────────

REVOKE ALL ON FUNCTION public.wa_secretaria_auto_greeting_claim(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_secretaria_auto_greeting_unclaim(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_secretaria_auto_greeting_claim(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_secretaria_auto_greeting_unclaim(UUID) TO service_role;

-- ── 5. Sanity check ────────────────────────────────────────────────────────

DO $$
DECLARE
  v_definer_count INT;
  v_anon_count INT;
BEGIN
  SELECT count(*) INTO v_definer_count
  FROM pg_proc
  WHERE pronamespace='public'::regnamespace
    AND proname IN ('wa_secretaria_auto_greeting_claim','wa_secretaria_auto_greeting_unclaim')
    AND prosecdef = true;
  IF v_definer_count <> 2 THEN
    RAISE EXCEPTION 'mig 114 · esperado 2 RPCs DEFINER, encontrou %', v_definer_count;
  END IF;

  SELECT count(*) INTO v_anon_count
  FROM information_schema.role_routine_grants
  WHERE routine_schema='public'
    AND routine_name LIKE 'wa_secretaria_auto_greeting_%'
    AND grantee IN ('anon','PUBLIC');
  IF v_anon_count > 0 THEN
    RAISE EXCEPTION 'mig 114 SECURITY · % grants pra anon/PUBLIC', v_anon_count;
  END IF;

  RAISE NOTICE 'mig 114 · sanity OK · 2 RPCs DEFINER · zero grants anon';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
