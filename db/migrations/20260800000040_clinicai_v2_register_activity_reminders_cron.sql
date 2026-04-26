-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-40 · clinicai-v2 · Registro cron mira-activity-reminders  ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: ONDA 1.5 · cron novo que avisa admin sobre    ║
-- ║ atividades de parceria pending vencendo nas proximas 48h (mig 800-34   ║
-- ║ criou b2b_partnership_activities · ate hoje ninguem consumia).         ║
-- ║                                                                          ║
-- ║ Schedule: 09h SP diario (cron `0 12 * * *` UTC) · 1 digest/dia evita   ║
-- ║ N mensagens. Agrupa atividades por parceria.                            ║
-- ║                                                                          ║
-- ║ Route handler: apps/mira/src/app/api/cron/mira-activity-reminders.       ║
-- ║                                                                          ║
-- ║ Idempotente · ON CONFLICT (clinic_id, job_name) DO NOTHING.             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

INSERT INTO public.mira_cron_jobs (clinic_id, job_name, display_name, description, category, cron_expr)
SELECT
  c.id,
  'mira-activity-reminders',
  'Lembretes de atividades B2B',
  'Atividades de parceria pendentes vencendo nas proximas 48h (09h SP diario)',
  'reminder',
  '0 12 * * *'
  FROM public.clinics c
ON CONFLICT (clinic_id, job_name) DO NOTHING;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.mira_cron_jobs
   WHERE job_name = 'mira-activity-reminders';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ASSERT FAIL: cron mira-activity-reminders nao registrado';
  END IF;
  RAISE NOTICE '✅ Mig 800-40 OK · cron mira-activity-reminders registrado em % clinicas', v_count;
END $$;

COMMIT;
