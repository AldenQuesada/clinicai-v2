-- ============================================================================
-- Migration 160 · DOWN · DROP ordenado das 2 tick fns
-- ============================================================================
--
-- Aditiva · seguro · só remove as 2 funções novas. Zero impacto em tabelas,
-- triggers, dados, ou outras funções. Reuso de _enqueue_agenda_alert /
-- _render_appt_template / _appt_professional_phone permanece.
--
-- Atenção: se em fase futura um cron já estiver chamando estas fns em prod,
-- rolar este down faz o cron quebrar (erro "function does not exist"). Antes
-- de aplicar este down em produção, desligar o(s) cron(s) que chamam estas
-- fns OU criar forward migration nova com CREATE OR REPLACE.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public._agenda_alert_d_before_tick();
DROP FUNCTION IF EXISTS public._agenda_alert_d_zero_tick();

NOTIFY pgrst, 'reload schema';

COMMIT;
