-- ============================================================================
-- Migration 161 · DOWN · DROP ordenado
-- ============================================================================
--
-- Mig 161 é aditiva: cria tabela + 4 funções novas + RLS policies + grants.
-- Rollback drop em ordem reversa (funções primeiro, depois tabela com CASCADE).
--
-- ATENÇÃO: se em fase futura algum TS já consome estas RPCs em prod, rolar
-- este down quebra os consumers. Desativar feature flag no app + cancelar
-- cron antes (não há cron nesta mig · ok).
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.appointment_arrival_internal_alert(uuid);
DROP FUNCTION IF EXISTS public._appointment_not_confirmed_alert_tick();
DROP FUNCTION IF EXISTS public.appointment_internal_alert_mark_read(uuid);
DROP FUNCTION IF EXISTS public.appointment_internal_alert_create(uuid, text, text, uuid, jsonb);

DROP TABLE IF EXISTS public.appointment_internal_alerts;

NOTIFY pgrst, 'reload schema';

COMMIT;
