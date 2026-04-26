-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-15 · clinicai-v2 · mira_cron_registry                      ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Feature pedida pelo Alden (2026-04-25):                                  ║
-- ║   "preciso registro por horarios do que a Mira vai enviar para os admins ║
-- ║    e temos que ter controle disso"                                       ║
-- ║                                                                          ║
-- ║ Hoje os 11 cron endpoints proativos da Mira (digests, alerts, reminders) ║
-- ║ rodam silenciosamente via GitHub Actions sem registro de execucao nem    ║
-- ║ controle ON/OFF por clinica. Esta migration adiciona:                    ║
-- ║                                                                          ║
-- ║ 1. mira_cron_jobs · 1 row por (clinic_id, job_name) · enabled toggle     ║
-- ║ 2. mira_cron_runs · log de cada execucao (start/finish/items/error)      ║
-- ║                                                                          ║
-- ║ Cada cron endpoint, ANTES de rodar, chama mira_cron_run_start(job_name)  ║
-- ║ que retorna run_id ou NULL (job desabilitado · ack imediato sem fazer    ║
-- ║ nada). Apos rodar, chama mira_cron_run_finish(run_id, status, items, err)║
-- ║                                                                          ║
-- ║ UI em /b2b/config/rotinas mostra os 11 jobs com toggle + ultimas 50      ║
-- ║ execucoes por job + success rate. Owner/admin only.                      ║
-- ║                                                                          ║
-- ║ Audiencia (security checklist):                                          ║
-- ║   - mira_cron_jobs: authenticated only · scoped clinic_id = app_clinic_id║
-- ║   - mira_cron_runs: authenticated only · idem                            ║
-- ║   - RPCs run_start/run_finish: authenticated only (cron endpoint usa     ║
-- ║     service_role no server, mas ainda eh authenticated path)             ║
-- ║                                                                          ║
-- ║ GOLD #3 (search_path), #5 (.down), #7 (sanity).                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Tabela: mira_cron_jobs (catalogo + enabled toggle) ──────────────────
CREATE TABLE IF NOT EXISTS public.mira_cron_jobs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL DEFAULT public._default_clinic_id(),
  job_name        text        NOT NULL
                                CHECK (job_name ~ '^[a-z][a-z0-9-]+$'),
  display_name    text        NOT NULL,
  description     text        NULL,
  category        text        NOT NULL DEFAULT 'other'
                                CHECK (category IN ('alert','digest','reminder','suggestion','maintenance','worker','other')),
  cron_expr       text        NULL,
  enabled         boolean     NOT NULL DEFAULT true,
  notes           text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, job_name)
);

COMMENT ON TABLE public.mira_cron_jobs IS
  'Catalogo de cron jobs da Mira por clinica. enabled=false → cron pula (mig 800-15).';
COMMENT ON COLUMN public.mira_cron_jobs.category IS
  'alert|digest|reminder|suggestion|maintenance|worker|other · usado pra agrupar UI';
COMMENT ON COLUMN public.mira_cron_jobs.cron_expr IS
  'Informativo · UTC · espelha .github/workflows/mira-crons.yml';

-- ── Tabela: mira_cron_runs (log de execucoes) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.mira_cron_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL DEFAULT public._default_clinic_id(),
  job_name        text        NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz NULL,
  status          text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','success','failed','skipped','disabled')),
  items_processed int         NOT NULL DEFAULT 0,
  error_message   text        NULL,
  meta            jsonb       NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.mira_cron_runs IS
  'Log de execucoes dos cron jobs. UI mostra ultimas 50 por job · TTL 90d via cron limpa.';

-- ── Indices ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mira_cron_runs_recent
  ON public.mira_cron_runs (clinic_id, job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_mira_cron_runs_status
  ON public.mira_cron_runs (clinic_id, status, started_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.mira_cron_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mira_cron_jobs_tenant" ON public.mira_cron_jobs;
CREATE POLICY "mira_cron_jobs_tenant" ON public.mira_cron_jobs
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

ALTER TABLE public.mira_cron_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mira_cron_runs_tenant" ON public.mira_cron_runs;
CREATE POLICY "mira_cron_runs_tenant" ON public.mira_cron_runs
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

-- ── Trigger updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._mira_cron_jobs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_mira_cron_jobs_updated_at ON public.mira_cron_jobs;
CREATE TRIGGER trg_mira_cron_jobs_updated_at
  BEFORE UPDATE ON public.mira_cron_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public._mira_cron_jobs_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════════════════════

-- ── mira_cron_jobs_list() · UI ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mira_cron_jobs_list()
RETURNS TABLE (
  id              uuid,
  job_name        text,
  display_name    text,
  description     text,
  category        text,
  cron_expr       text,
  enabled         boolean,
  notes           text,
  last_run_at     timestamptz,
  last_status     text,
  runs_24h        int,
  failures_24h    int,
  updated_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
BEGIN
  RETURN QUERY
    SELECT
      j.id,
      j.job_name,
      j.display_name,
      j.description,
      j.category,
      j.cron_expr,
      j.enabled,
      j.notes,
      lr.started_at AS last_run_at,
      lr.status     AS last_status,
      COALESCE(stats.runs_24h, 0)     AS runs_24h,
      COALESCE(stats.failures_24h, 0) AS failures_24h,
      j.updated_at
    FROM public.mira_cron_jobs j
    LEFT JOIN LATERAL (
      SELECT started_at, status
        FROM public.mira_cron_runs r
       WHERE r.clinic_id = j.clinic_id AND r.job_name = j.job_name
       ORDER BY started_at DESC
       LIMIT 1
    ) lr ON true
    LEFT JOIN LATERAL (
      SELECT
        count(*)::int                              AS runs_24h,
        count(*) FILTER (WHERE status='failed')::int AS failures_24h
        FROM public.mira_cron_runs r
       WHERE r.clinic_id = j.clinic_id
         AND r.job_name = j.job_name
         AND r.started_at >= now() - interval '24 hours'
    ) stats ON true
    WHERE j.clinic_id = v_cid
    ORDER BY j.category, j.display_name;
END
$$;

-- ── mira_cron_set_enabled(job_name, enabled, notes) ─────────────────────
CREATE OR REPLACE FUNCTION public.mira_cron_set_enabled(
  p_job_name text,
  p_enabled  boolean,
  p_notes    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_id  uuid;
BEGIN
  UPDATE public.mira_cron_jobs
     SET enabled = p_enabled,
         notes   = COALESCE(p_notes, notes)
   WHERE clinic_id = v_cid AND job_name = p_job_name
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END
$$;

-- ── mira_cron_run_start(job_name) → uuid|null ───────────────────────────
-- Cron endpoint chama ANTES de executar:
--   - Se job nao existe ou enabled=false: retorna NULL (cron faz noop)
--   - Se enabled: cria run pending + retorna id
CREATE OR REPLACE FUNCTION public.mira_cron_run_start(
  p_job_name text,
  p_clinic_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid     uuid := COALESCE(p_clinic_id, public.app_clinic_id());
  v_enabled boolean;
  v_run_id  uuid;
BEGIN
  -- Auto-create job entry se nao existe (onboarding novo cron sem migration)
  INSERT INTO public.mira_cron_jobs (clinic_id, job_name, display_name, category)
       VALUES (v_cid, p_job_name, p_job_name, 'other')
  ON CONFLICT (clinic_id, job_name) DO NOTHING;

  SELECT enabled INTO v_enabled
    FROM public.mira_cron_jobs
   WHERE clinic_id = v_cid AND job_name = p_job_name;

  IF NOT COALESCE(v_enabled, false) THEN
    -- Loga "skipped/disabled" pro audit visivel na UI
    INSERT INTO public.mira_cron_runs (clinic_id, job_name, status, finished_at)
         VALUES (v_cid, p_job_name, 'disabled', now());
    RETURN NULL;
  END IF;

  INSERT INTO public.mira_cron_runs (clinic_id, job_name, status)
       VALUES (v_cid, p_job_name, 'pending')
       RETURNING id INTO v_run_id;

  RETURN v_run_id;
END
$$;

-- ── mira_cron_run_finish(run_id, status, items, error, meta) ────────────
CREATE OR REPLACE FUNCTION public.mira_cron_run_finish(
  p_run_id        uuid,
  p_status        text,
  p_items         int   DEFAULT 0,
  p_error         text  DEFAULT NULL,
  p_meta          jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('success','failed','skipped') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  UPDATE public.mira_cron_runs
     SET finished_at     = now(),
         status          = p_status,
         items_processed = COALESCE(p_items, 0),
         error_message   = p_error,
         meta            = COALESCE(p_meta, '{}'::jsonb)
   WHERE id = p_run_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END
$$;

-- ── mira_cron_runs_recent(job_name, limit) · UI list ────────────────────
CREATE OR REPLACE FUNCTION public.mira_cron_runs_recent(
  p_job_name text,
  p_limit    int DEFAULT 50
)
RETURNS TABLE (
  id               uuid,
  started_at       timestamptz,
  finished_at      timestamptz,
  status           text,
  items_processed  int,
  error_message    text,
  meta             jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
BEGIN
  RETURN QUERY
    SELECT r.id, r.started_at, r.finished_at, r.status,
           r.items_processed, r.error_message, r.meta
      FROM public.mira_cron_runs r
     WHERE r.clinic_id = v_cid
       AND r.job_name = p_job_name
     ORDER BY r.started_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 200));
END
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- GRANTs · authenticated only · sem anon
-- ═══════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.mira_cron_jobs_list()                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mira_cron_set_enabled(text, boolean, text)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mira_cron_run_start(text, uuid)                         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mira_cron_run_finish(uuid, text, int, text, jsonb)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mira_cron_runs_recent(text, int)                        FROM PUBLIC, anon;

GRANT  EXECUTE ON FUNCTION public.mira_cron_jobs_list()                                   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.mira_cron_set_enabled(text, boolean, text)              TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.mira_cron_run_start(text, uuid)                         TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.mira_cron_run_finish(uuid, text, int, text, jsonb)      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.mira_cron_runs_recent(text, int)                        TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- Seed dos 11 jobs proativos da Mira
-- ═══════════════════════════════════════════════════════════════════════
-- Roda pra TODA clinic existente · idempotent (UNIQUE clinic_id,job_name)

INSERT INTO public.mira_cron_jobs (clinic_id, job_name, display_name, description, category, cron_expr)
SELECT c.id, j.job_name, j.display_name, j.description, j.category, j.cron_expr
  FROM public.clinics c
 CROSS JOIN (VALUES
  ('mira-state-cleanup',         'Limpeza de estado',           'Remove session state expirado de conversas (1min)',                            'maintenance', '* * * * *'),
  ('mira-state-reminder-check',  'Lembrar continuação',         'Notifica admin se conversa ficou parada sem resposta (1min)',                  'reminder',    '* * * * *'),
  ('mira-daily-digest',          'Digest matinal',              'Resumo do dia anterior · agenda de hoje · stats (10h SP, seg-sáb)',            'digest',      '0 13 * * 1-6'),
  ('mira-evening-digest',        'Digest noturno',              'Fechamento do dia · tarefas amanhã · alertas (23h SP, seg-sáb)',               'digest',      '0 2 * * 2-7'),
  ('mira-weekly-roundup',        'Resumo semanal',              'Performance da semana + projeções (segunda 10h SP)',                           'digest',      '0 13 * * 1'),
  ('mira-preconsult-alerts',     'Alerta pré-consulta',         '30min antes da consulta avisa profissional + paciente',                        'alert',       '*/5 11-23 * * 1-6'),
  ('mira-anomaly-check',         'Anomalias diárias',           'Detecta padrões anormais no dia anterior (01h)',                               'alert',       '0 1 * * *'),
  ('mira-birthday-alerts',       'Aniversários do dia',         'Alerta admin sobre aniversários de pacientes/parceiras (10h)',                 'alert',       '0 10 * * *'),
  ('mira-task-reminders',        'Lembretes de tarefa',         'Tasks vencendo/vencidas (cada 5min)',                                          'reminder',    '*/5 * * * *'),
  ('mira-followup-suggestions',  'Sugestões de follow-up',      'Sugere follow-ups baseado em padrões (12h)',                                   'suggestion',  '0 12 * * *'),
  ('mira-inactivity-radar',      'Radar de inatividade',        'Parcerias/leads inativos há 30+ dias (sex 21h)',                               'alert',       '0 21 * * 5')
) AS j(job_name, display_name, description, category, cron_expr)
ON CONFLICT (clinic_id, job_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- Sanity check (GOLD #7)
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_jobs_count int;
  v_clinics_count int;
BEGIN
  SELECT count(*) INTO v_clinics_count FROM public.clinics;
  SELECT count(*) INTO v_jobs_count FROM public.mira_cron_jobs;
  RAISE NOTICE '[mig 800-15] mira_cron_jobs: % rows (esperado: 11 × % clinics = %)',
    v_jobs_count, v_clinics_count, v_clinics_count * 11;
END
$$;
