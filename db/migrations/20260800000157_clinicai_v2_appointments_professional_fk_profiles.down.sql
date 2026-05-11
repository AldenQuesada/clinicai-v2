-- ============================================================================
-- Migration 157 · DOWN · NO-OP defensivo
-- ============================================================================
--
-- Forward-only. Rollback DEVE ser feito via FORWARD migration nova.
--
-- Por que NO-OP:
--   - Restaurar FK para app_users(id) reintroduziria o drift que esta mig
--     corrige (escritas via UI/helper continuariam violando).
--   - Não há como restaurar os professional_id antigos setados para NULL
--     pelo backfill defensivo (informação não preservada · era órfão).
--   - Dropar a FK nova quebraria o invariante de referência.
--
-- Rollback correto:
--   1. Criar mig 158 forward com ALTER TABLE/ADD CONSTRAINT desejado.
--   2. Aplicar mig 158 + repair tracker.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  RAISE NOTICE
    'mig 157 DOWN é NO-OP defensivo · rollback exige forward migration nova';
END $$;

COMMIT;
