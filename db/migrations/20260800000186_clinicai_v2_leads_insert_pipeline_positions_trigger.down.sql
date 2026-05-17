-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ DOWN · Migration 800-186 · clinicai-v2 · drop leads init trigger        ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Remove trigger AFTER INSERT em public.leads + função associada.         ║
-- ║                                                                          ║
-- ║ Idempotente · DROP IF EXISTS.                                            ║
-- ║                                                                          ║
-- ║ ⚠️ Não deleta lead_pipeline_positions já criadas (rollback só desliga    ║
-- ║ prevenção futura · positions seedadas em 3.5N.2 + criadas pelo trigger  ║
-- ║ durante o período em que esteve ativo permanecem).                      ║
-- ║                                                                          ║
-- ║ Após o rollback:                                                         ║
-- ║   - Novos leads phase='lead' voltam a entrar SEM position.              ║
-- ║   - Cron sdr_advance_day_buckets() continua rodando mas não tem o que    ║
-- ║     avançar pros novos leads.                                            ║
-- ║   - Reincidência do gap 3.5N volta · aceitar só em troubleshoot         ║
-- ║     temporário ou rollback de emergência.                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Drop trigger (depende da função · drop primeiro)
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_leads_init_pipeline_positions_after_insert
  ON public.leads;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Drop function
-- ═══════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.leads_init_pipeline_positions_after_insert();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Reload PostgREST schema cache
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Sanity: confirmar remoção
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_trigger_count INT;
  v_func_count    INT;
BEGIN
  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger t
  JOIN pg_class c    ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'leads'
    AND t.tgname  = 'trg_leads_init_pipeline_positions_after_insert'
    AND NOT t.tgisinternal;

  IF v_trigger_count <> 0 THEN
    RAISE EXCEPTION
      '[mig 186 DOWN sanity] trigger ainda existe após DROP · count=%', v_trigger_count;
  END IF;

  SELECT count(*) INTO v_func_count
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname = 'leads_init_pipeline_positions_after_insert';

  IF v_func_count <> 0 THEN
    RAISE EXCEPTION
      '[mig 186 DOWN sanity] function ainda existe após DROP · count=%', v_func_count;
  END IF;

  RAISE NOTICE '[mig 186 DOWN] sanity OK · trigger + function removidos';
END
$sanity$;

COMMIT;
