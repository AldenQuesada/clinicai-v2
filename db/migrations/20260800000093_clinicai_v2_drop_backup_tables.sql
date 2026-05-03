-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 93 · clinicai-v2 · DROP backup tables (zero risk cleanup)      ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Drop 3 backup tables consolidadas que nao sao referenciadas em codigo:   ║
-- ║   - leads_backup_pre_refactor (569 rows · backup do REFACTOR_LEAD_MODEL  ║
-- ║     de Abr 2026 · refactor ja consolidado na leads atual)                ║
-- ║   - appointments_backup_pre_wipe_2026_04_24 (3 rows · backup do wipe     ║
-- ║     de Abr 24 · nao necessario)                                          ║
-- ║   - clinic_backup_log (0 rows · tabela vazia · nunca foi usada)         ║
-- ║                                                                          ║
-- ║ Liberado: ~530 KB. Auditoria: docs/audits/2026-05-03-database-audit.html ║
-- ║ Rollback: ../20260800000093_clinicai_v2_drop_backup_tables.down.sql      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP TABLE IF EXISTS public.leads_backup_pre_refactor CASCADE;
DROP TABLE IF EXISTS public.appointments_backup_pre_wipe_2026_04_24 CASCADE;
DROP TABLE IF EXISTS public.clinic_backup_log CASCADE;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN (
     'leads_backup_pre_refactor',
     'appointments_backup_pre_wipe_2026_04_24',
     'clinic_backup_log'
   );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Mig 93: % backup tables nao foram dropadas', v_count;
  END IF;
  RAISE NOTICE 'Mig 93 OK · 3 backup tables dropadas';
END $$;
