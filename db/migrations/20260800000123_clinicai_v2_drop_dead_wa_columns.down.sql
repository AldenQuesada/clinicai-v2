-- ============================================================================
-- Rollback de mig 123 · recria 3 colunas mortas dropadas
-- ============================================================================
--
-- ⚠️  ATENÇÃO · DADOS NÃO SÃO RESTAURADOS ⚠️
--
-- Este DOWN apenas recria as 3 colunas com seus tipos/defaults originais ·
-- NÃO restaura nenhum valor histórico porque, no momento do DROP (mig UP),
-- as 3 colunas tinham 0 dados relevantes em prod (audit 2026-05-04 · 0/111
-- daily_ai_responses>0 · 0/917 read_at populados · 0/917 debounce_processed=true).
--
-- Use este DOWN APENAS se:
--   1. Houve erro de avaliação no audit e alguma das colunas vai voltar a ser
--      usada por feature nova, OU
--   2. Você quer reverter mig 123 isoladamente para investigação.
--
-- Tipos / defaults restaurados:
--   - public.wa_conversations.daily_ai_responses  → integer · DEFAULT 0 · NULLABLE
--   - public.wa_messages.read_at                  → timestamptz · NULLABLE · sem default
--   - public.wa_messages.debounce_processed       → boolean · DEFAULT false · NULLABLE
--
-- Idempotente · ADD COLUMN IF NOT EXISTS · reaplicar = no-op.

BEGIN;

-- ── 1. Recria wa_conversations.daily_ai_responses ─────────────────────────

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS daily_ai_responses integer DEFAULT 0;

-- ── 2. Recria wa_messages.read_at ─────────────────────────────────────────

ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- ── 3. Recria wa_messages.debounce_processed ──────────────────────────────

ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS debounce_processed boolean DEFAULT false;

-- ── 4. Sanity pós · confirma as 3 colunas voltaram ────────────────────────

DO $$
DECLARE
  v_present INT;
BEGIN
  SELECT count(*) INTO v_present
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'wa_conversations' AND column_name = 'daily_ai_responses')
      OR (table_name = 'wa_messages' AND column_name = 'read_at')
      OR (table_name = 'wa_messages' AND column_name = 'debounce_processed')
    );

  IF v_present <> 3 THEN
    RAISE EXCEPTION 'mig 123 DOWN · esperado 3 colunas presentes · encontrou %', v_present;
  END IF;

  RAISE NOTICE 'mig 123 DOWN · 3 colunas recriadas · ATENÇÃO dados históricos NÃO restaurados (não havia)';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
