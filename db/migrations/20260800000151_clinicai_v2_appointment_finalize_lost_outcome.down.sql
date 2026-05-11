-- ============================================================================
-- Migration 151 · DOWN · NO-OP defensivo
-- ============================================================================
--
-- Esta migration é forward-only. Rollback DEVE ser feito via FORWARD
-- migration nova · NÃO via restore da versão antiga de appointment_finalize.
--
-- Por que NO-OP:
--   - Restaurar a versão antiga RE-INTRODUZIRIA o bug fixado (RPC rejeitando
--     outcome='perdido' enquanto UI/TS oferecem).
--   - A versão antiga de appointment_finalize não está versionada em mig
--     local (drift entre mig 065 e prod conhecido · banco real é fonte da
--     verdade · pg_get_functiondef foi a única referência atual).
--   - Restaurar mig 065 quebraria 'paciente_orcamento' (banco real aceita
--     este outcome · mig 065 não).
--
-- Quando usar este down:
--   - Nunca em prod.
--   - Em dev/preview que aceita resetar: rodar com noverify ciente da quebra.
--
-- Rollback correto:
--   1. Criar mig 152 forward com CREATE OR REPLACE FUNCTION
--      public.appointment_finalize(...) restaurando a função desejada.
--   2. Aplicar mig 152 + repair tracker.
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE
    'mig 20260800000151 DOWN é NO-OP defensivo · rollback exige forward migration nova (não revert)';
END $$;
