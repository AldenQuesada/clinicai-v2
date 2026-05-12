-- ============================================================================
-- Migration 159 · DOWN · DROP ordenado (RPCs antes da view)
-- ============================================================================
--
-- Reversal real: a mig 159 só CRIA (CREATE OR REPLACE VIEW + 2 funções novas)
-- · zero alteração de dados · zero alteração em triggers/tabelas existentes.
-- Portanto rollback seguro é possível via DROP simples.
--
-- Ordem DROP:
--   1. RPCs primeiro (dependem da view via RETURNS SETOF ...).
--   2. View depois.
--
-- IMPORTANTE: se em fase futura algum código TS já estiver consumindo
-- get_secretaria_mih_inbox()/health_check() em prod, rolar este down quebra
-- esses consumers. Recomendação: forward migration nova que faz CREATE OR
-- REPLACE para versão antiga / desativa flag de feature antes de drop.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.get_secretaria_mih_health_check();
DROP FUNCTION IF EXISTS public.get_secretaria_mih_inbox(int, timestamptz);
DROP VIEW IF EXISTS public.secretaria_mih_conversations_view;

NOTIFY pgrst, 'reload schema';

COMMIT;
