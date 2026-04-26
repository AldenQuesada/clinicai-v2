-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-20 · clinicai-v2 · mira-daily-top-insight cron seed        ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Feature pedida pelo Alden (2026-04-26):                                  ║
-- ║   "todo dia 08h BRT a Mira me manda no whats o insight critico do dia,   ║
-- ║    se nao tiver critico/warning, NAO manda (no spam)"                    ║
-- ║                                                                          ║
-- ║ Esta mig apenas registra o novo cron job no registry (mig 800-15). O     ║
-- ║ handler vive em apps/mira/src/app/api/cron/mira-daily-top-insight e o    ║
-- ║ scheduler em apps/mira/scripts/cron.ts dispara o endpoint via HTTP.      ║
-- ║                                                                          ║
-- ║ Schedule: 0 11 * * *  (08h SP / 11h UTC, todo dia)                       ║
-- ║                                                                          ║
-- ║ Fonte de dados: RPC b2b_insights_global() (mig 800-19) ja faz o scan e   ║
-- ║ priorizacao. Handler filtra critical+warning, pega top score, envia pros ║
-- ║ admins ativos em b2b_admin_phones via Evolution Mira.                    ║
-- ║                                                                          ║
-- ║ Idempotente: ON CONFLICT DO NOTHING garante re-aplicar nao duplica.      ║
-- ║                                                                          ║
-- ║ GOLD #5 (.down disponivel · remove o seed).                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- Seed: novo cron mira-daily-top-insight no registry (mig 800-15)
-- ═══════════════════════════════════════════════════════════════════════
-- Pula se mig 800-15 nao foi aplicada (mira_cron_jobs nao existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'mira_cron_jobs'
  ) THEN
    INSERT INTO public.mira_cron_jobs
      (clinic_id, job_name, display_name, description, category, cron_expr, enabled)
    SELECT c.id,
           'mira-daily-top-insight',
           'Top insight diário',
           'Todo dia 08h SP, se houver insight critical/warning aberto, manda o de maior score pros admins via WhatsApp. Sem critico = nao envia (no spam).',
           'alert',
           '0 11 * * *',  -- 08h SP (11h UTC) diario
           true
      FROM public.clinics c
      ON CONFLICT (clinic_id, job_name) DO NOTHING;
    RAISE NOTICE '[mig 800-20] cron mira-daily-top-insight seedado';
  ELSE
    RAISE NOTICE '[mig 800-20] mira_cron_jobs nao existe · pule seed do cron · aplique mig 800-15 primeiro';
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Sanity check (GOLD #7)
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'mira_cron_jobs'
  ) THEN
    SELECT count(*) INTO v_count
      FROM public.mira_cron_jobs
     WHERE job_name = 'mira-daily-top-insight';
    RAISE NOTICE '[mig 800-20] mira-daily-top-insight: % rows (1 por clinica)', v_count;
  END IF;
END
$$;
