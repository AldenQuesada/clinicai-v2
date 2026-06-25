-- =============================================================================
-- 20260800000202_clinicai_v2_lara_recovery_persistence  ·  RECOVERY RADAR · Prompt 3
--
-- Camada de PERSISTÊNCIA do Recovery Radar. Deixa de ter candidatos efêmeros
-- (RPC 201) e passa a registrar scans + findings com status operacional.
--
-- Próximo número livre real do namespace Lara/secretaria (última = 201).
--
-- SEM IA · SEM UI · SEM cron · SEM envio WhatsApp · SEM tocar wa-disparos/worker.
-- NÃO altera lara_recovery_candidates (201). NÃO toca commercial_recovery_workflow_items.
-- suggested_message / suggested_action ficam NULL aqui (IA é Prompt 4).
--
-- Design de segurança (FASE 5):
--   · authenticated: SOMENTE SELECT (read p/ UI), via policy clinic_id=app_clinic_id().
--   · Toda ESCRITA via RPC SECURITY DEFINER (run_scan / set_status) que valida
--     tenant internamente. Sem policy de insert/update direto do front.
--   · anon: zero. service_role: tudo.
-- =============================================================================

-- ── TABELA 1 · lara_recovery_scans (registro de cada varredura) ───────────────
CREATE TABLE IF NOT EXISTS public.lara_recovery_scans (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null,
  kind              text not null,
  window_hours      integer not null default 72,
  candidate_limit   integer not null default 100,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'running',
  total_candidates  integer not null default 0,
  total_findings    integer not null default 0,
  p0_count          integer not null default 0,
  p1_count          integer not null default 0,
  p2_count          integer not null default 0,
  p3_count          integer not null default 0,
  optout_count      integer not null default 0,
  error_message     text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint lara_recovery_scans_kind_chk
    check (kind in ('morning','midday','evening','manual','backfill','test')),
  constraint lara_recovery_scans_status_chk
    check (status in ('running','completed','failed','cancelled'))
);

-- ── TABELA 2 · lara_recovery_findings (oportunidades persistidas) ─────────────
CREATE TABLE IF NOT EXISTS public.lara_recovery_findings (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null,
  scan_id            uuid references public.lara_recovery_scans(id) on delete set null,
  conversation_id    uuid not null,
  lead_id            uuid,
  phone              text,
  lead_name          text,
  inbox_role         text,
  context_type       text,

  failure_type       text not null,
  all_failure_types  text[] not null default '{}',
  priority           text not null,
  recovery_score     integer not null default 0,
  stage_hint         text,
  candidate_reason   text,
  evidence           jsonb not null default '[]'::jsonb,

  suggested_message  text,           -- NULL aqui · IA preenche no Prompt 4
  suggested_action   text,           -- NULL aqui · IA preenche no Prompt 4
  recommended_owner  text,           -- NULL aqui · IA preenche no Prompt 4
  action_deadline_at timestamptz,    -- NULL aqui · IA preenche no Prompt 4

  status             text not null default 'open',
  status_at          timestamptz not null default now(),
  status_by          uuid,
  status_note        text,

  dedup_key          text not null,
  source             text not null default 'lara_recovery_candidates',

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint lara_recovery_findings_status_chk
    check (status in ('open','accepted','dismissed','sent','recovered','lost','snoozed')),
  constraint lara_recovery_findings_priority_chk
    check (priority in ('P0','P1','P2','P3')),
  constraint lara_recovery_findings_score_chk
    check (recovery_score between 0 and 100),
  -- DEDUP: 1 finding por (clínica, conversa, failure_type, dia). dedup_key = dia BRT.
  -- Não duplica o mesmo finding nos 3 scans do dia; permite novo finding em outro dia.
  constraint lara_recovery_findings_dedup_uk
    unique (clinic_id, conversation_id, failure_type, dedup_key)
);

-- ── ÍNDICES (FASE 4) ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lara_recovery_scans_clinic_created
  ON public.lara_recovery_scans (clinic_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_lara_recovery_scans_clinic_status
  ON public.lara_recovery_scans (clinic_id, status);

CREATE INDEX IF NOT EXISTS idx_lara_recovery_findings_clinic_status_priority
  ON public.lara_recovery_findings (clinic_id, status, priority, created_at desc);
CREATE INDEX IF NOT EXISTS idx_lara_recovery_findings_clinic_conversation
  ON public.lara_recovery_findings (clinic_id, conversation_id, created_at desc);
CREATE INDEX IF NOT EXISTS idx_lara_recovery_findings_scan
  ON public.lara_recovery_findings (clinic_id, scan_id);
CREATE INDEX IF NOT EXISTS idx_lara_recovery_findings_created
  ON public.lara_recovery_findings (created_at desc);
-- idx_..._dedup: já coberto pela unique constraint lara_recovery_findings_dedup_uk
-- (cria índice único em (clinic_id, conversation_id, failure_type, dedup_key)).

-- ── updated_at trigger (convenção canon v2 · set_updated_at) ──────────────────
DROP TRIGGER IF EXISTS lara_recovery_findings_updated_at ON public.lara_recovery_findings;
CREATE TRIGGER lara_recovery_findings_updated_at
  BEFORE UPDATE ON public.lara_recovery_findings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS (FASE 5) · authenticated SÓ SELECT da própria clínica ─────────────────
ALTER TABLE public.lara_recovery_scans    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lara_recovery_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lara_recovery_scans_select ON public.lara_recovery_scans;
CREATE POLICY lara_recovery_scans_select ON public.lara_recovery_scans
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS lara_recovery_findings_select ON public.lara_recovery_findings;
CREATE POLICY lara_recovery_findings_select ON public.lara_recovery_findings
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());
-- SEM policy de INSERT/UPDATE/DELETE p/ authenticated: escrita só via RPC SECURITY DEFINER.

-- ── GRANTS · REVOKE anon + authenticated · authenticated só SELECT · service_role tudo
-- IMPORTANTE: Supabase default ACL no schema public concede ALL p/ anon E authenticated
-- em tabelas novas. Sem REVOKE explícito de authenticated, o GRANT SELECT abaixo seria
-- ADITIVO sobre o ALL default (deixando INSERT/UPDATE/DELETE indevidos). REVOKE primeiro.
REVOKE ALL ON public.lara_recovery_scans    FROM anon, authenticated;
REVOKE ALL ON public.lara_recovery_findings FROM anon, authenticated;
GRANT SELECT ON public.lara_recovery_scans    TO authenticated;
GRANT SELECT ON public.lara_recovery_findings TO authenticated;
GRANT ALL ON public.lara_recovery_scans    TO service_role;
GRANT ALL ON public.lara_recovery_findings TO service_role;

-- =============================================================================
-- RPC 1 · lara_recovery_run_scan · executa varredura + persiste findings
-- =============================================================================
CREATE OR REPLACE FUNCTION public.lara_recovery_run_scan(
  p_kind text DEFAULT 'manual',
  p_window_hours integer DEFAULT 72,
  p_limit integer DEFAULT 100
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_clinic uuid := public.app_clinic_id();
  v_scan_id uuid;
  v_dedup_key text := to_char(timezone('America/Sao_Paulo', now()), 'YYYY-MM-DD');
  v_total int := 0;
  v_inserted int := 0;
  v_p0 int := 0; v_p1 int := 0; v_p2 int := 0; v_p3 int := 0;
begin
  if v_clinic is null then
    return jsonb_build_object('status','failed','error','no_tenant');
  end if;
  if p_kind not in ('morning','midday','evening','manual','backfill','test') then
    return jsonb_build_object('status','failed','error','invalid_kind');
  end if;

  -- 1. cria o scan (status running) ANTES do bloco protegido (sobrevive a exception)
  insert into public.lara_recovery_scans (clinic_id, kind, window_hours, candidate_limit, status)
  values (v_clinic, p_kind, p_window_hours, p_limit, 'running')
  returning id into v_scan_id;

  begin
    -- 2+3+4. chama a RPC de candidatos, insere findings, dedup via ON CONFLICT,
    --        e conta tudo numa só passagem.
    with cand as (
      select * from public.lara_recovery_candidates(p_window_hours, p_limit, false)
    ),
    ins as (
      insert into public.lara_recovery_findings (
        clinic_id, scan_id, conversation_id, lead_id, phone, lead_name, inbox_role, context_type,
        failure_type, all_failure_types, priority, recovery_score, stage_hint, candidate_reason, evidence,
        dedup_key, source
      )
      select
        v_clinic, v_scan_id, c.conversation_id, c.lead_id, c.phone, c.lead_name, c.inbox_role, c.context_type,
        c.primary_failure_type, c.all_failure_types, c.priority_hint, c.score_hint, c.stage_hint,
        c.candidate_reason, c.evidence,
        v_dedup_key, c.source
      from cand c
      on conflict (clinic_id, conversation_id, failure_type, dedup_key) do nothing
      returning 1
    )
    select
      (select count(*) from cand),
      (select count(*) from ins),
      (select count(*) filter (where priority_hint = 'P0') from cand),
      (select count(*) filter (where priority_hint = 'P1') from cand),
      (select count(*) filter (where priority_hint = 'P2') from cand),
      (select count(*) filter (where priority_hint = 'P3') from cand)
    into v_total, v_inserted, v_p0, v_p1, v_p2, v_p3;

    -- 5. fecha o scan como completed
    update public.lara_recovery_scans
    set status = 'completed', finished_at = now(),
        total_candidates = v_total, total_findings = v_inserted,
        p0_count = v_p0, p1_count = v_p1, p2_count = v_p2, p3_count = v_p3,
        optout_count = 0   -- opt-out é excluído na origem (candidates chamado com false)
    where id = v_scan_id;

  exception when others then
    -- 6. erro: marca scan failed + error truncado, retorna json de erro
    update public.lara_recovery_scans
    set status = 'failed', finished_at = now(), error_message = left(coalesce(SQLERRM,''), 500)
    where id = v_scan_id;
    return jsonb_build_object('scan_id', v_scan_id, 'status', 'failed', 'error', left(coalesce(SQLERRM,''), 500));
  end;

  return jsonb_build_object(
    'scan_id', v_scan_id,
    'status', 'completed',
    'total_candidates', v_total,
    'inserted_findings', v_inserted,
    'deduped_findings', v_total - v_inserted,
    'p0_count', v_p0, 'p1_count', v_p1, 'p2_count', v_p2, 'p3_count', v_p3
  );
end;
$function$;

-- =============================================================================
-- RPC 2 · lara_recovery_finding_set_status · muda status operacional
-- =============================================================================
CREATE OR REPLACE FUNCTION public.lara_recovery_finding_set_status(
  p_finding_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_clinic uuid := public.app_clinic_id();
  v_old text;
  v_updated_at timestamptz;
begin
  if v_clinic is null then
    return jsonb_build_object('error','no_tenant');
  end if;
  if p_status not in ('open','accepted','dismissed','sent','recovered','lost','snoozed') then
    return jsonb_build_object('error','invalid_status');
  end if;

  -- valida tenant + existência
  select status into v_old
  from public.lara_recovery_findings
  where id = p_finding_id and clinic_id = v_clinic;

  if v_old is null then
    return jsonb_build_object('error','not_found');
  end if;

  update public.lara_recovery_findings
  set status = p_status,
      status_at = now(),
      status_by = auth.uid(),
      status_note = p_note,
      updated_at = now()
  where id = p_finding_id and clinic_id = v_clinic
  returning updated_at into v_updated_at;

  return jsonb_build_object(
    'finding_id', p_finding_id,
    'old_status', v_old,
    'new_status', p_status,
    'updated_at', v_updated_at
  );
end;
$function$;

-- =============================================================================
-- RPC 3 · lara_recovery_findings_list · listagem ordenada p/ UI futura
--   SECURITY DEFINER + filtro interno por clinic (bypassa RLS, filtra tenant).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.lara_recovery_findings_list(
  p_status text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
 RETURNS SETOF public.lara_recovery_findings
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select f.*
  from public.lara_recovery_findings f
  where f.clinic_id = public.app_clinic_id()
    and (p_status is null or f.status = p_status)
    and (p_priority is null or f.priority = p_priority)
  order by
    case f.priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end,
    f.recovery_score desc,
    f.created_at desc
  limit greatest(coalesce(p_limit, 100), 1);
$function$;

-- ── GRANTS das RPCs · REVOKE anon · authenticated + service_role ──────────────
REVOKE ALL ON FUNCTION public.lara_recovery_run_scan(text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lara_recovery_finding_set_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.lara_recovery_findings_list(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lara_recovery_run_scan(text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lara_recovery_finding_set_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lara_recovery_findings_list(text, text, integer) TO authenticated, service_role;

-- ── COMMENTS ──────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.lara_recovery_scans IS
  'Recovery Radar · registro de cada varredura (3x/dia + manual). Prompt 3. Sem IA/cron/UI ainda.';
COMMENT ON TABLE public.lara_recovery_findings IS
  'Recovery Radar · oportunidades persistidas com status operacional (open→accepted→sent→recovered/lost). Prompt 3. suggested_message NULL até IA (Prompt 4). Dedup 1/conversa/failure_type/dia.';
