-- ============================================================================
-- Rollback de mig 120 · drop FK composta + UNIQUE (id, clinic_id)
-- ============================================================================
--
-- Este DOWN reverte a defesa estrutural cross-tenant, voltando ao estado
-- onde wa_messages tem APENAS as 2 FKs simples independentes:
--   - wa_messages_conversation_id_fkey  (conversation_id) → wa_conversations(id)
--   - fk_wa_messages_clinic             (clinic_id)       → clinics(id)
--
-- ⚠️  ATENÇÃO · ROLLBACK REABRE BRECHA CROSS-TENANT ⚠️
--
-- Após este DOWN, o banco volta a NÃO bloquear INSERT em wa_messages onde
-- (conversation_id, clinic_id) não casem entre si. RLS (ADR-028) e código
-- aplicacional voltam a ser as únicas defesas. Use apenas em rollback de
-- investigação · em produção normal NÃO há motivo pra reverter.
--
-- Ordem do drop · obrigatória:
--   1. FK composta primeiro (depende do UNIQUE)
--   2. UNIQUE depois
--
-- Idempotente · DROP IF EXISTS · reaplicar = no-op.
--
-- Não toca: FK simples wa_messages_conversation_id_fkey · FK simples
-- fk_wa_messages_clinic · dados · outras constraints.

BEGIN;

-- ── 1. Drop FK composta primeiro ──────────────────────────────────────────

ALTER TABLE public.wa_messages
  DROP CONSTRAINT IF EXISTS fk_wa_messages_conversation_clinic;

-- ── 2. Drop UNIQUE depois (target da FK · ordem importa) ──────────────────

ALTER TABLE public.wa_conversations
  DROP CONSTRAINT IF EXISTS uq_wa_conversations_id_clinic_id;

-- ── 3. Sanity check ───────────────────────────────────────────────────────

DO $$
DECLARE
  v_uniq_exists  INT;
  v_fk_exists    INT;
  v_simple_fk    INT;
  v_simple_clinic INT;
BEGIN
  SELECT count(*) INTO v_uniq_exists
  FROM pg_constraint
  WHERE conrelid = 'public.wa_conversations'::regclass
    AND conname  = 'uq_wa_conversations_id_clinic_id';
  IF v_uniq_exists <> 0 THEN
    RAISE EXCEPTION 'mig 120 DOWN · uq_wa_conversations_id_clinic_id ainda existe · DROP falhou';
  END IF;

  SELECT count(*) INTO v_fk_exists
  FROM pg_constraint
  WHERE conrelid = 'public.wa_messages'::regclass
    AND conname  = 'fk_wa_messages_conversation_clinic';
  IF v_fk_exists <> 0 THEN
    RAISE EXCEPTION 'mig 120 DOWN · fk_wa_messages_conversation_clinic ainda existe · DROP falhou';
  END IF;

  -- Confirma que as FKs simples preexistentes continuam intactas
  SELECT count(*) INTO v_simple_fk
  FROM pg_constraint
  WHERE conrelid = 'public.wa_messages'::regclass
    AND conname  = 'wa_messages_conversation_id_fkey';
  IF v_simple_fk <> 1 THEN
    RAISE WARNING 'mig 120 DOWN · wa_messages_conversation_id_fkey (FK simples preexistente) NÃO está presente · estado inesperado';
  END IF;

  SELECT count(*) INTO v_simple_clinic
  FROM pg_constraint
  WHERE conrelid = 'public.wa_messages'::regclass
    AND conname  = 'fk_wa_messages_clinic';
  IF v_simple_clinic <> 1 THEN
    RAISE WARNING 'mig 120 DOWN · fk_wa_messages_clinic (FK simples preexistente) NÃO está presente · estado inesperado';
  END IF;

  RAISE NOTICE 'mig 120 DOWN · FK composta + UNIQUE removidos · FKs simples preservadas · ATENÇÃO cross-tenant unprotected no DB';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
