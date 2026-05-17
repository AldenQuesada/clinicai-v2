-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-186 · clinicai-v2 · leads INSERT → init pipeline positions ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Objetivo: prevenir reincidência da causa raiz catalogada em 3.5N.1:      ║
-- ║   leads novos entram em public.leads sem position correspondente em     ║
-- ║   public.lead_pipeline_positions · cron sdr_advance_day_buckets()        ║
-- ║   roda mas não tem o que avançar (leads_advanced=0 em todos runs).      ║
-- ║                                                                          ║
-- ║ Causa estrutural:                                                        ║
-- ║   public.sdr_init_lead_pipelines(uuid) existe e é idempotente · porém   ║
-- ║   depende de _sdr_clinic_id() (JWT) · inviável chamar via PAT/service.  ║
-- ║   Zero trigger AFTER INSERT em public.leads · nenhum fluxo inicializa    ║
-- ║   positions automaticamente (webhook · import · manual).                ║
-- ║                                                                          ║
-- ║ Esta migration cria:                                                     ║
-- ║   1. Função trigger public.leads_init_pipeline_positions_after_insert() ║
-- ║      SECURITY DEFINER · SET search_path · sem dependência de JWT.       ║
-- ║      Usa NEW.clinic_id diretamente.                                     ║
-- ║   2. Trigger AFTER INSERT em public.leads que chama a função pra todo   ║
-- ║      lead novo com phase='lead' AND lifecycle_status='ativo' AND        ║
-- ║      deleted_at IS NULL AND clinic_id IS NOT NULL.                      ║
-- ║                                                                          ║
-- ║ Comportamento:                                                           ║
-- ║   - Insere positions em TODOS pipelines ativos da mesma clinic_id.      ║
-- ║   - Stage inicial: menor sort_order entre stages ativos do pipeline.    ║
-- ║   - seven_days → sem_data (sort_order=0).                                ║
-- ║   - evolution  → novo     (sort_order=10).                               ║
-- ║   - origin = 'auto'.                                                     ║
-- ║   - ON CONFLICT (lead_id, pipeline_id) DO NOTHING (idempotente).        ║
-- ║                                                                          ║
-- ║ Esta migration NÃO:                                                      ║
-- ║   - faz backfill (leads existentes intocados · 3.5N.2 já cobriu 120).   ║
-- ║   - executa sdr_advance_day_buckets() · sdr_init_lead_pipelines().      ║
-- ║   - altera cron · grants · cobertura outros pipelines.                  ║
-- ║   - toca leads.day_bucket (sync acontece via cron diário).              ║
-- ║   - cobre UPDATE de phase (lead em outra phase virando 'lead' depois).  ║
-- ║   - dispara WhatsApp · provider · wa_outbox · Job 71.                   ║
-- ║                                                                          ║
-- ║ Rollback: ver db/migrations/20260800000186_*.down.sql                    ║
-- ║   DROP TRIGGER + DROP FUNCTION · positions já criadas permanecem.       ║
-- ║                                                                          ║
-- ║ Risco residual:                                                          ║
-- ║   - Se fluxo cria lead com phase != 'lead' (ex: import direto pra       ║
-- ║     'paciente'), não recebe position · intencional · escopo seven_days  ║
-- ║     é só pra leads operacionais.                                         ║
-- ║                                                                          ║
-- ║ Padrão V2 · mig 116 (wa_messages sync trigger) · ADR-029 (DEFINER+path).║
-- ║ GOLD-STANDARD: idempotente · sanity check · zero side-effect externo.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Pré-checks defensivos (lição do trigger zumbi · mig 178)
-- ═══════════════════════════════════════════════════════════════════════════
-- Confirma que TODAS as colunas alvo de NEW existem em public.leads
-- (lifecycle_status veio em mig 150 · phase desde mig 60 · deleted_at desde mig 60).
-- Confirma que a UNIQUE constraint alvo do ON CONFLICT existe.

DO $precheck$
DECLARE
  v_cols INT;
  v_uniq INT;
BEGIN
  SELECT count(*) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'leads'
    AND column_name IN ('id','clinic_id','phase','lifecycle_status','deleted_at');

  IF v_cols <> 5 THEN
    RAISE EXCEPTION
      '[mig 186 precheck] public.leads não tem as 5 colunas alvo · encontrou %', v_cols;
  END IF;

  SELECT count(*) INTO v_uniq
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'lead_pipeline_positions'
    AND con.conname = 'lead_pipeline_positions_lead_id_pipeline_id_key';

  IF v_uniq <> 1 THEN
    RAISE EXCEPTION
      '[mig 186 precheck] UNIQUE (lead_id, pipeline_id) ausente em lead_pipeline_positions';
  END IF;
END
$precheck$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Função trigger · SECURITY DEFINER · sem JWT
-- ═══════════════════════════════════════════════════════════════════════════
-- Por que SECURITY DEFINER: o caller pode ser anon/authenticated/postgres
-- (webhook · import · manual). DEFINER garante que o INSERT em
-- lead_pipeline_positions execute com privilégio do owner (postgres) ·
-- independente das policies RLS do caller. NEW.clinic_id resolve tenant
-- explicitamente · sem precisar de _sdr_clinic_id() JWT.

CREATE OR REPLACE FUNCTION public.leads_init_pipeline_positions_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  -- Guard 1: lead soft-deleted no momento do INSERT · skip.
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Guard 2: só inicializa positions pra leads operacionais.
  -- Lead que nasce em outra phase (ex: import direto pra 'paciente') não
  -- entra em pipeline de leads · intencional.
  IF NEW.phase IS DISTINCT FROM 'lead' THEN
    RETURN NEW;
  END IF;

  -- Guard 3: lifecycle terminal (perdido · recuperacao · arquivado) não
  -- recebe position auto · só 'ativo' (default da coluna mig 150).
  IF COALESCE(NEW.lifecycle_status, 'ativo') IS DISTINCT FROM 'ativo' THEN
    RETURN NEW;
  END IF;

  -- Guard 4: clinic_id é tenant key · sem ele, position não tem destino.
  IF NEW.clinic_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Insere positions em todos pipelines ativos da mesma clinic.
  -- Stage inicial = ativo de menor sort_order por pipeline.
  -- ON CONFLICT garante idempotência caso outro fluxo já tenha criado
  -- (defesa em profundidade contra race condition).
  INSERT INTO public.lead_pipeline_positions (
    lead_id,
    pipeline_id,
    stage_id,
    origin
  )
  SELECT
    NEW.id,
    p.id,
    ps.id,
    'auto'
  FROM public.pipelines p
  JOIN LATERAL (
    SELECT ps2.id
    FROM public.pipeline_stages ps2
    WHERE ps2.pipeline_id = p.id
      AND ps2.is_active = true
    ORDER BY ps2.sort_order ASC
    LIMIT 1
  ) ps ON true
  WHERE p.is_active = true
    AND p.clinic_id = NEW.clinic_id
  ON CONFLICT (lead_id, pipeline_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.leads_init_pipeline_positions_after_insert() IS
  'Initializes CRM lead_pipeline_positions for new public.leads rows where phase=lead AND lifecycle_status=ativo AND deleted_at IS NULL AND clinic_id IS NOT NULL. Inserts one position per active pipeline of the same clinic, picking the active stage with the lowest sort_order. origin=auto. ON CONFLICT (lead_id, pipeline_id) DO NOTHING. Created in mig 800-186 to close reincidence gap from 3.5N · no JWT dependency · safe for webhook/import/manual callers.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Grants da função trigger
-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger function NÃO é chamada por clients diretamente · postgres invoca
-- automaticamente no INSERT. REVOKE FROM PUBLIC + anon + authenticated é
-- defesa em profundidade (evita execução manual indevida). GRANT só pra
-- postgres + service_role (roles operacionais).

REVOKE EXECUTE ON FUNCTION public.leads_init_pipeline_positions_after_insert()
  FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.leads_init_pipeline_positions_after_insert()
  FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.leads_init_pipeline_positions_after_insert()
  TO postgres, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Trigger · AFTER INSERT em public.leads · FOR EACH ROW
-- ═══════════════════════════════════════════════════════════════════════════
-- DROP IF EXISTS torna a migration idempotente (re-run safe).

DROP TRIGGER IF EXISTS trg_leads_init_pipeline_positions_after_insert
  ON public.leads;

CREATE TRIGGER trg_leads_init_pipeline_positions_after_insert
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.leads_init_pipeline_positions_after_insert();

COMMENT ON TRIGGER trg_leads_init_pipeline_positions_after_insert ON public.leads IS
  'Creates initial lead_pipeline_positions (one per active pipeline of NEW.clinic_id) for each new lead with phase=lead AND lifecycle_status=ativo AND deleted_at IS NULL. Prevents reincidence of 3.5N gap (122 leads sem position). origin=auto.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Sanity check final (regra GOLD #7) · zero side-effect · zero INSERT
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_func_exists      INT;
  v_func_definer     BOOLEAN;
  v_trigger_exists   INT;
  v_trigger_enabled  CHAR;
  v_constraint_ok    INT;
  v_grant_postgres   INT;
  v_grant_service    INT;
  v_grant_anon       INT;
  v_grant_auth       INT;
BEGIN
  -- 6.1 · função existe
  SELECT count(*) INTO v_func_exists
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname = 'leads_init_pipeline_positions_after_insert';
  IF v_func_exists <> 1 THEN
    RAISE EXCEPTION
      '[mig 186 sanity] function leads_init_pipeline_positions_after_insert não criada · count=%', v_func_exists;
  END IF;

  -- 6.2 · função é SECURITY DEFINER
  SELECT prosecdef INTO v_func_definer
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname = 'leads_init_pipeline_positions_after_insert';
  IF v_func_definer IS NOT TRUE THEN
    RAISE EXCEPTION
      '[mig 186 sanity] function não é SECURITY DEFINER';
  END IF;

  -- 6.3 · trigger existe E está habilitado (tgenabled='O' = origin = enabled normal)
  SELECT count(*), MIN(tgenabled) INTO v_trigger_exists, v_trigger_enabled
  FROM pg_trigger t
  JOIN pg_class c    ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'leads'
    AND t.tgname  = 'trg_leads_init_pipeline_positions_after_insert'
    AND NOT t.tgisinternal;
  IF v_trigger_exists <> 1 THEN
    RAISE EXCEPTION
      '[mig 186 sanity] trigger trg_leads_init_pipeline_positions_after_insert não criada · count=%', v_trigger_exists;
  END IF;
  IF v_trigger_enabled <> 'O' THEN
    RAISE EXCEPTION
      '[mig 186 sanity] trigger criada mas desabilitada · tgenabled=%', v_trigger_enabled;
  END IF;

  -- 6.4 · UNIQUE constraint alvo ainda existe (lock estrutural)
  SELECT count(*) INTO v_constraint_ok
  FROM pg_constraint con
  JOIN pg_class c    ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'lead_pipeline_positions'
    AND con.conname = 'lead_pipeline_positions_lead_id_pipeline_id_key';
  IF v_constraint_ok <> 1 THEN
    RAISE EXCEPTION
      '[mig 186 sanity] UNIQUE (lead_id, pipeline_id) sumiu durante apply · investigar';
  END IF;

  -- 6.5 · grants conforme política
  SELECT count(*) INTO v_grant_postgres
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name   = 'leads_init_pipeline_positions_after_insert'
    AND grantee        = 'postgres'
    AND privilege_type = 'EXECUTE';

  SELECT count(*) INTO v_grant_service
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name   = 'leads_init_pipeline_positions_after_insert'
    AND grantee        = 'service_role'
    AND privilege_type = 'EXECUTE';

  SELECT count(*) INTO v_grant_anon
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name   = 'leads_init_pipeline_positions_after_insert'
    AND grantee        = 'anon'
    AND privilege_type = 'EXECUTE';

  SELECT count(*) INTO v_grant_auth
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name   = 'leads_init_pipeline_positions_after_insert'
    AND grantee        = 'authenticated'
    AND privilege_type = 'EXECUTE';

  IF v_grant_postgres < 1 THEN
    RAISE EXCEPTION
      '[mig 186 sanity] GRANT EXECUTE TO postgres ausente';
  END IF;
  IF v_grant_service < 1 THEN
    RAISE EXCEPTION
      '[mig 186 sanity] GRANT EXECUTE TO service_role ausente';
  END IF;
  IF v_grant_anon > 0 THEN
    RAISE EXCEPTION
      '[mig 186 sanity] anon NÃO deve ter EXECUTE · REVOKE falhou';
  END IF;
  IF v_grant_auth > 0 THEN
    RAISE EXCEPTION
      '[mig 186 sanity] authenticated NÃO deve ter EXECUTE · REVOKE falhou';
  END IF;

  RAISE NOTICE
    '[mig 186] sanity OK · function + trigger criados · DEFINER · enabled=O · grants=postgres+service_role · anon/auth revoked';
END
$sanity$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- POST-APPLY VALIDATION (rodar separado · NÃO faz parte do BEGIN/COMMIT)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   -- 1. Confirmar trigger criado e habilitado
--   SELECT tgname, tgenabled
--     FROM pg_trigger t
--     JOIN pg_class c    ON c.oid = t.tgrelid
--     JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public'
--      AND c.relname = 'leads'
--      AND NOT t.tgisinternal;
--   -- Esperado incluir: trg_leads_init_pipeline_positions_after_insert · tgenabled=O
--
--   -- 2. Confirmar function definição
--   SELECT proname, prosecdef, prolang::regtype
--     FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace
--      AND proname = 'leads_init_pipeline_positions_after_insert';
--   -- Esperado: 1 row · prosecdef=true · plpgsql
--
--   -- 3. Smoke transacional (rollback no final · zero side-effect operacional)
--   --    Bloco separado · NÃO faz parte desta migration.
--
-- ═══════════════════════════════════════════════════════════════════════════
