-- Rollback Mig 179 · CRM_PHASE_CONTROL.2 Alexa cleanup
-- ============================================================================
-- AÇÃO A reversa · GRANT EXECUTE de volta para authenticated nas 2 RPCs
-- com REVOKE em mig 179 (get_alexa_config / upsert_alexa_config).
--
-- AÇÃO B reversa · NÃO recria as 7 RPCs dropadas porque elas dependem de
-- tabelas (`alexa_announce_log`, `alexa_devices`) que JÁ NÃO EXISTEM em prod
-- (foram dropadas em migração anterior · mig 095). Restaurar as RPCs sem as
-- tabelas resultaria em funções broken (mesmo estado pré-mig 179 · sem
-- valor). Para rollback completo seria necessário primeiro recriar as
-- tabelas a partir de backup · escopo fora do down automático.
-- ============================================================================

BEGIN;

GRANT EXECUTE ON FUNCTION public.get_alexa_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_alexa_config(text, text, text, text, boolean, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
