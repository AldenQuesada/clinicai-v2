-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-49 · register 3 cronJobs novos (gaps 4, 7, 10 fixed)       ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-27: registrar os 3 crons criados em apps/mira:    ║
-- ║                                                                          ║
-- ║   - mira-voucher-validity-reminder · 10h SP · D-3 antes valid_until    ║
-- ║   - mira-voucher-expired-sweep    · 02h SP · marca expired             ║
-- ║   - mira-voucher-post-purchase-upsell · 14h SP · D+7 apos compra       ║
-- ║                                                                          ║
-- ║ Idempotente · ON CONFLICT DO NOTHING.                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

INSERT INTO public.mira_cron_jobs (clinic_id, job_name, display_name, description, category, cron_expr)
SELECT c.id, j.job_name, j.display_name, j.description, j.category, j.cron_expr
  FROM public.clinics c
 CROSS JOIN (VALUES
  ('mira-voucher-validity-reminder',
   'Lembrete D-3 voucher',
   'Convidadas com voucher emitido mas nao agendado · D-3 antes da expiracao (10h SP)',
   'reminder',
   '0 13 * * *'),
  ('mira-voucher-expired-sweep',
   'Expirar vouchers vencidos',
   'Marca status=expired e dispara voucher_expired_partner (02h SP · madrugada)',
   'maintenance',
   '0 5 * * *'),
  ('mira-voucher-post-purchase-upsell',
   'Upsell pos-compra',
   'Convidadas que viraram paciente · D+7 envia upsell delicado (14h SP)',
   'suggestion',
   '0 17 * * *')
) AS j(job_name, display_name, description, category, cron_expr)
ON CONFLICT (clinic_id, job_name) DO NOTHING;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(DISTINCT job_name) INTO v_count
    FROM public.mira_cron_jobs
   WHERE job_name IN (
     'mira-voucher-validity-reminder',
     'mira-voucher-expired-sweep',
     'mira-voucher-post-purchase-upsell'
   );
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'ASSERT FAIL: esperados 3 cronJobs · achados %', v_count;
  END IF;
  RAISE NOTICE '✅ Mig 800-49 OK · 3 cronJobs voucher registrados';
END $$;

COMMIT;
