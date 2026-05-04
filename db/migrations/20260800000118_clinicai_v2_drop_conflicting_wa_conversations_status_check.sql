-- ============================================================================
-- Drop CHECK constraint conflitante em wa_conversations.status
-- ============================================================================
--
-- Contexto · audit 2026-05-04:
--
-- Em produção coexistiam DUAS CHECK constraints sobre `wa_conversations.status`:
--
--   1. check_wa_conv_status (canônica · 6 valores)
--      CHECK (status IN ('active','paused','archived','blocked',
--                        'handoff_secretaria','closed'))
--
--   2. chk_wa_conversations_status (restritiva legacy · 3 valores)
--      CHECK (status IN ('active','archived','closed'))
--
-- Em PG, quando há múltiplas CHECKs no mesmo campo, TODAS precisam passar →
-- a mais restritiva ganha. Isso significava que tentar inserir/atualizar
-- conversa com status 'paused', 'blocked' ou 'handoff_secretaria' falhava
-- silenciosamente, mesmo o app esperando esses valores.
--
-- A constraint restritiva foi REMOVIDA manualmente no Supabase Studio.
-- Agora apenas check_wa_conv_status (6 valores) está em vigor, alinhado
-- com:
--   - app code (status='paused' usado em ai_paused / handoff)
--   - check do CHECK próprio: wa_conversations_inbox_role_check
--   - estados produzidos por triggers / RPCs
--
-- Esta migration apenas VERSIONA no git a remoção já aplicada em prod.
-- DROP IF EXISTS é idempotente · reaplicar em prod = no-op.
--
-- Não toca: check_wa_conv_status (canônica) · dados · outras constraints.

BEGIN;

-- ── 1. Drop constraint conflitante ────────────────────────────────────────

ALTER TABLE public.wa_conversations
  DROP CONSTRAINT IF EXISTS chk_wa_conversations_status;

-- ── 2. Sanity check ────────────────────────────────────────────────────────

DO $$
DECLARE
  v_legacy_exists  INT;
  v_canonical      TEXT;
BEGIN
  -- (a) chk_wa_conversations_status NÃO deve mais existir
  SELECT count(*) INTO v_legacy_exists
  FROM pg_constraint
  WHERE conrelid = 'public.wa_conversations'::regclass
    AND conname  = 'chk_wa_conversations_status';

  IF v_legacy_exists <> 0 THEN
    RAISE EXCEPTION 'mig 118 · chk_wa_conversations_status (legacy) ainda existe · DROP falhou';
  END IF;

  -- (b) check_wa_conv_status (canônica) DEVE existir
  SELECT pg_get_constraintdef(oid) INTO v_canonical
  FROM pg_constraint
  WHERE conrelid = 'public.wa_conversations'::regclass
    AND conname  = 'check_wa_conv_status';

  IF v_canonical IS NULL THEN
    RAISE EXCEPTION 'mig 118 · check_wa_conv_status (canônica) NÃO existe · estado inconsistente';
  END IF;

  -- (c) canônica DEVE conter os 3 status que estavam bloqueados
  IF v_canonical NOT LIKE '%paused%'
     OR v_canonical NOT LIKE '%blocked%'
     OR v_canonical NOT LIKE '%handoff_secretaria%' THEN
    RAISE EXCEPTION 'mig 118 · check_wa_conv_status não cobre paused/blocked/handoff_secretaria · def=%', v_canonical;
  END IF;

  RAISE NOTICE 'mig 118 · chk_wa_conversations_status removida · check_wa_conv_status canônica intacta · OK';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
