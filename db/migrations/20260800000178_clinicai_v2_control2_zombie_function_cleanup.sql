-- ============================================================================
-- Migration 178 · CRM_PHASE_CONTROL.2 · ZOMBIE TRIGGER FUNCTIONS CLEANUP
-- ============================================================================
--
-- Propósito:
--   Drop de 3 funções trigger ORPHANS (rettype=trigger MAS sem trigger attached).
--   CONTROL.1 + CONTROL.2 audit confirmaram:
--     - cada uma é TRIGGER function (não pode ser invocada como RPC normal)
--     - NÃO está attached a nenhum trigger ativo
--     - ZERO callers via pg_depend
--     - ZERO referências em apps/v2 (apenas em docs históricos)
--
-- Funções alvo:
--   1. _b2b_trigger_voucher_attended()           · órfã desde mig 011A
--   2. _trg_agenda_alert_on_status_change()      · órfã pós-refactor agenda
--   3. _vpi_appt_revert_on_cancel()              · órfã pós-VPI canonical
--
-- Funções AFINS que MANTÊM (em uso ativo · NÃO DROP):
--   - _appt_upsert_one              · 2 callers (appt_sync_batch, appt_upsert)
--   - _find_target_appointments     · 2 callers (wa_pro_stage_*)
--   - cashflow_auto_reconcile       · legacy JS cashflow.repository.js usa
--   - cashflow_get_suggestions      · legacy JS cashflow.repository.js usa
--   - wa_pro_* família (9 fns)      · interconectada · Mira WhatsApp Pro
--   - _agenda_alert_min_before_tick · em cron ativo
--   - _b2b_attribution_convert_on_voucher_status · em trigger ativo
--   - appointment_attend            · LIVE V2 RPC
--   - appointment_arrival_internal_alert · LIVE V2 RPC
--   - appointment_finalize          · LIVE V2 RPC (literal perdido legítimo)
--
-- Termos `em_consulta`/`pre_consulta`/`compareceu`/`reagendado` em demais
-- funções aparecem APENAS em comentários (`/* Remove: em_consulta */`).
-- Stripping de comentários confirmou: código executável usa status canon.
--
-- Rollback (down): recria stub vazio que retorna NEW. Sem efeito operacional.
-- ============================================================================

BEGIN;

-- 1. _b2b_trigger_voucher_attended ──────────────────────────────────────────
DROP FUNCTION IF EXISTS public._b2b_trigger_voucher_attended();

-- 2. _trg_agenda_alert_on_status_change ─────────────────────────────────────
DROP FUNCTION IF EXISTS public._trg_agenda_alert_on_status_change();

-- 3. _vpi_appt_revert_on_cancel ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public._vpi_appt_revert_on_cancel();


-- SANITY DO BLOCK ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_remaining_orphans integer;
BEGIN
  -- Confirma que as 3 funções foram dropadas
  SELECT count(*) INTO v_remaining_orphans
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('_b2b_trigger_voucher_attended','_trg_agenda_alert_on_status_change','_vpi_appt_revert_on_cancel');

  IF v_remaining_orphans > 0 THEN
    RAISE EXCEPTION 'sanity: % órfãos trigger fns ainda presentes', v_remaining_orphans;
  END IF;

  -- Confirma que MANTER list está intacto
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend') THEN
    RAISE EXCEPTION 'sanity: appointment_attend foi removida indevidamente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_agenda_alert_min_before_tick') THEN
    RAISE EXCEPTION 'sanity: _agenda_alert_min_before_tick foi removida indevidamente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_b2b_attribution_convert_on_voucher_status') THEN
    RAISE EXCEPTION 'sanity: _b2b_attribution_convert_on_voucher_status foi removida indevidamente';
  END IF;

  RAISE NOTICE 'mig 178 · 3 orphan trigger fns dropped · MANTER list intacto';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
