-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-23 · clinicai-v2 · voucher bulk scheduled dispatch         ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Feature pedida pelo Alden (2026-04-26):                                  ║
-- ║   "Permitir agendar bulk voucher dispatch · UI com 'Agora' ou 'Agendar   ║
-- ║    pra DD/MM HH:MM' · cron processa scheduled_at <= now()"               ║
-- ║                                                                          ║
-- ║ DESCOBERTA importante (auditoria 2026-04-26):                            ║
-- ║   O schema JA SUPORTA scheduling nativamente desde mig 800-06!           ║
-- ║                                                                          ║
-- ║   - b2b_voucher_dispatch_queue.scheduled_at ja existe (NOT NULL,         ║
-- ║     default now()) com 1 row por recipient                               ║
-- ║                                                                          ║
-- ║   - b2b_dispatch_queue_pick() (mig 800-06) ja filtra:                    ║
-- ║       WHERE status='pending' AND scheduled_at <= now()                   ║
-- ║                                                                          ║
-- ║   - O worker /api/cron/b2b-voucher-dispatch-worker ja roda a cada 1min   ║
-- ║     (cron `* * * * *` em apps/mira/scripts/cron.ts) e drena items        ║
-- ║     elegiveis. Items futuros simplesmente sao ignorados ate vencer.      ║
-- ║                                                                          ║
-- ║ Nao existe tabela b2b_voucher_bulk_batches separada · "batch" e apenas   ║
-- ║ o batch_id agrupador na propria queue.                                   ║
-- ║                                                                          ║
-- ║ Conclusao: NAO precisa nova tabela, novo status, nem cron novo de 5min   ║
-- ║   (que seria duplicata do worker de 1min). A unica mudanca real e        ║
-- ║   front-end · esta migration apenas:                                     ║
-- ║                                                                          ║
-- ║   1. Garante que b2b-voucher-dispatch-worker esta no mira_cron_jobs      ║
-- ║      registry com display_name decente (antes era auto-criado pelo       ║
-- ║      run_start com display_name=job_name e category='other').            ║
-- ║                                                                          ║
-- ║   2. Reforca o COMMENT em scheduled_at explicando o uso pra UI bulk      ║
-- ║      (futuro dev nao precisa garimpar mig 800-06 pra entender).          ║
-- ║                                                                          ║
-- ║ GOLD #5 (.down disponivel · remove o seed e reverte comment).            ║
-- ║ GOLD #7 (sanity check no fim).                                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Seed do worker no mira_cron_jobs registry (mig 800-15)
-- ═══════════════════════════════════════════════════════════════════════
-- Pula se mig 800-15 nao foi aplicada
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'mira_cron_jobs'
  ) THEN
    INSERT INTO public.mira_cron_jobs
      (clinic_id, job_name, display_name, description, category, cron_expr, enabled)
    SELECT c.id,
           'b2b-voucher-dispatch-worker',
           'Disparar vouchers agendados',
           'Drena fila b2b_voucher_dispatch_queue · emite vouchers pendentes com scheduled_at <= now() · suporta bulk dispatch agendado (mig 800-23). Roda cada 1min · pickPending(10) · 2s entre items.',
           'worker',
           '* * * * *',
           true
      FROM public.clinics c
      ON CONFLICT (clinic_id, job_name) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        description  = EXCLUDED.description,
        category     = EXCLUDED.category,
        cron_expr    = EXCLUDED.cron_expr;
    RAISE NOTICE '[mig 800-23] cron b2b-voucher-dispatch-worker registrado/atualizado no registry';
  ELSE
    RAISE NOTICE '[mig 800-23] mira_cron_jobs nao existe · pule seed do registry · aplique mig 800-15 primeiro';
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Reforca COMMENT em scheduled_at (clareza pra futuro dev)
-- ═══════════════════════════════════════════════════════════════════════
COMMENT ON COLUMN public.b2b_voucher_dispatch_queue.scheduled_at IS
  'Timestamp UTC pra dispatch · default now() = imediato. UI bulk (/vouchers/bulk) '
  'aceita "Agora" (= now()) ou "Agendar" (datetime futuro). Worker '
  'b2b-voucher-dispatch-worker filtra WHERE scheduled_at <= now() na RPC '
  'b2b_dispatch_queue_pick · items futuros sao ignorados ate vencer (mig 800-23).';

-- ═══════════════════════════════════════════════════════════════════════
-- Sanity check (GOLD #7)
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_col_exists       boolean;
  v_pick_filters_now boolean;
  v_registry_seeded  int;
BEGIN
  -- 1. scheduled_at existe e e timestamptz NOT NULL
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'b2b_voucher_dispatch_queue'
       AND column_name  = 'scheduled_at'
       AND data_type    = 'timestamp with time zone'
       AND is_nullable  = 'NO'
  ) INTO v_col_exists;

  -- 2. RPC pick filtra scheduled_at <= now() (texto da definicao contem o filtro)
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'b2b_dispatch_queue_pick'
       AND pg_get_functiondef(p.oid) ILIKE '%scheduled_at <= now()%'
  ) INTO v_pick_filters_now;

  -- 3. Registry tem o worker seedado (so se mig 800-15 ta aplicada)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'mira_cron_jobs'
  ) THEN
    SELECT count(*) INTO v_registry_seeded
      FROM public.mira_cron_jobs
     WHERE job_name = 'b2b-voucher-dispatch-worker';
  ELSE
    v_registry_seeded := -1;  -- mig 800-15 nao aplicada · pular check
  END IF;

  IF NOT (v_col_exists AND v_pick_filters_now) THEN
    RAISE EXCEPTION 'Sanity 800-23 FAIL · scheduled_at_col=% pick_filters_now=%',
      v_col_exists, v_pick_filters_now;
  END IF;

  RAISE NOTICE '[mig 800-23] OK · scheduled_at=% pick_filters_now=% registry_rows=% (>=0 = mig 800-15 aplicada)',
    v_col_exists, v_pick_filters_now, v_registry_seeded;
END $$;

NOTIFY pgrst, 'reload schema';
