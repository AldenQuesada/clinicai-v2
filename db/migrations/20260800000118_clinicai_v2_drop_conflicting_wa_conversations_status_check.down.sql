-- ============================================================================
-- Rollback de mig 118 · recria chk_wa_conversations_status (legacy · 3 valores)
-- ============================================================================
--
-- ⚠️  ATENÇÃO · ROLLBACK PODE FALHAR ⚠️
--
-- A partir do momento em que a mig 118 foi aplicada em prod, conversas podem
-- ter sido inseridas/atualizadas com status 'paused', 'blocked' ou
-- 'handoff_secretaria'. Esses valores são INVÁLIDOS para a constraint legacy
-- restritiva (`status IN ('active','archived','closed')`).
--
-- Se houver QUALQUER linha em wa_conversations com um desses 3 status no
-- momento do rollback, o `ADD CONSTRAINT` vai abortar com:
--   ERROR: check constraint "chk_wa_conversations_status" violated by some row
--
-- Antes de rodar este DOWN:
--   1. Rodar SELECT status, count(*) FROM public.wa_conversations
--      WHERE status IN ('paused','blocked','handoff_secretaria')
--      GROUP BY status;
--   2. Decidir: migrar essas linhas pra um dos 3 valores legacy
--      ('active'/'archived'/'closed') OU desistir do rollback.
--   3. Só então rodar este DOWN.
--
-- O rollback só recria a constraint se ela NÃO existir (DO block defensivo) ·
-- evita erro 42710 ("constraint already exists") ao reaplicar.
--
-- Não toca: check_wa_conv_status (canônica) · dados · outras constraints.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wa_conversations'::regclass
      AND conname  = 'chk_wa_conversations_status'
  ) THEN
    ALTER TABLE public.wa_conversations
      ADD CONSTRAINT chk_wa_conversations_status
      CHECK (status = ANY (ARRAY['active'::text, 'archived'::text, 'closed'::text]));

    RAISE NOTICE 'mig 118 DOWN · chk_wa_conversations_status (legacy · 3 valores) recriada';
  ELSE
    RAISE NOTICE 'mig 118 DOWN · chk_wa_conversations_status já existe · skip';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
