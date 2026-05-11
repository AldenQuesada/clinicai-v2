-- ============================================================================
-- Migration 150 · DOWN · DEFENSIVE / NO-OP em prod
-- ============================================================================
--
-- ⚠️ ATENÇÃO: esta migration é RETROAPPLY de estado já existente em prod.
-- Aplicar este .down.sql em prod **não restaura o estado anterior real**
-- porque o estado anterior NÃO ERA o schema antigo (clean slate) — ERA
-- exatamente o que esta migration descreve, aplicado fora do path versionado.
--
-- Por isso este .down.sql é INTENCIONALMENTE DEFENSIVO:
--   1. NÃO dropa colunas (lifecycle_status, lost_from_phase, archived_*)
--      porque elas são contrato vivo do banco
--   2. NÃO dropa a view crm_operational_view porque é fonte canônica do
--      frontend Lara v2 (telas e KPIs dependem)
--   3. NÃO reverte os CHECK constraints para a versão 7-phase legada
--      porque isso quebraria callers que assumem o contrato v2 (4 phases)
--
-- Se você PRECISA reverter por algum motivo (dev/preview branch · debug):
--   - Faça manualmente via Studio com revisão explícita
--   - Considere snapshot point-in-time do Supabase (7d retention free / 30d Pro)
--   - Leia: docs/database/rollback-notes/20260800000150_*.md
--
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '⚠️ Migration 150 .down.sql é defensiva e NÃO reverte nada automaticamente.';
  RAISE NOTICE '   Razão: as estruturas que esta migration versiona JÁ EXISTIAM em prod.';
  RAISE NOTICE '   Reverter dropparia lifecycle_status, crm_operational_view, etc — quebraria runtime.';
  RAISE NOTICE '   Para rollback explícito, leia: docs/database/rollback-notes/20260800000150_*.md';
END $$;
