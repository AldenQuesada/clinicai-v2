-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-28 · clinicai-v2 · playbook_template CRUD RPCs             ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26 · /b2b/config/playbooks UI nova.                 ║
-- ║                                                                          ║
-- ║ Mig 800-22 ja criou b2b_playbook_templates + RPC b2b_apply_playbook,     ║
-- ║ mas faltou expor RPCs de UPSERT/DELETE pra UI de configuracao editar     ║
-- ║ os 3 templates seedados (prospect_to_active, retention, renewal).        ║
-- ║                                                                          ║
-- ║ Esta mig adiciona:                                                       ║
-- ║   1. RPC b2b_playbook_template_upsert(p_payload jsonb)                  ║
-- ║      UPSERT por (clinic_id, kind, name) · valida tasks/contents/metas    ║
-- ║      sao arrays jsonb. Se p_payload.is_default=true, limpa demais        ║
-- ║      defaults da mesma (clinic, kind) primeiro (so 1 default por kind).  ║
-- ║                                                                          ║
-- ║   2. RPC b2b_playbook_template_delete(p_kind text, p_name text)         ║
-- ║      DELETE row. Idempotente · retorna ok mesmo se nao achou.            ║
-- ║                                                                          ║
-- ║ Audiencia: authenticated. SECURITY DEFINER · escopo via app_clinic_id().║
-- ║ Padrao espelha mig 800-25 (tier_configs) + 800-26 (funnel_benchmarks).   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. RPC b2b_playbook_template_upsert(p_payload jsonb)
--    UPSERT por (clinic_id, kind, name).
--    Payload esperado:
--      { kind, name, description?, tasks[], contents[], metas[], is_default? }
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_playbook_template_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid          uuid := public.app_clinic_id();
  v_kind         text;
  v_name         text;
  v_description  text;
  v_tasks        jsonb;
  v_contents     jsonb;
  v_metas        jsonb;
  v_is_default   boolean;
BEGIN
  IF v_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;
  IF p_payload IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_payload');
  END IF;

  v_kind := NULLIF(btrim(p_payload->>'kind'), '');
  IF v_kind IS NULL OR v_kind NOT IN ('prospect_to_active','retention','renewal') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;

  v_name := NULLIF(btrim(p_payload->>'name'), '');
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_name');
  END IF;
  IF length(v_name) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_too_short');
  END IF;

  v_description := NULLIF(btrim(p_payload->>'description'), '');

  -- Tasks/contents/metas devem ser arrays jsonb (default '[]')
  v_tasks := COALESCE(p_payload->'tasks', '[]'::jsonb);
  IF jsonb_typeof(v_tasks) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tasks_not_array');
  END IF;

  v_contents := COALESCE(p_payload->'contents', '[]'::jsonb);
  IF jsonb_typeof(v_contents) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contents_not_array');
  END IF;

  v_metas := COALESCE(p_payload->'metas', '[]'::jsonb);
  IF jsonb_typeof(v_metas) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'metas_not_array');
  END IF;

  v_is_default := COALESCE((p_payload->>'is_default')::boolean, false);

  -- Se virando default, zera demais defaults da mesma (clinic, kind)
  -- pra respeitar UNIQUE INDEX uq_playbook_templates_default.
  IF v_is_default THEN
    UPDATE public.b2b_playbook_templates
       SET is_default = false
     WHERE clinic_id = v_cid
       AND kind      = v_kind
       AND name      <> v_name
       AND is_default = true;
  END IF;

  INSERT INTO public.b2b_playbook_templates (
    clinic_id, kind, name, description, tasks, contents, metas, is_default
  ) VALUES (
    v_cid, v_kind, v_name, v_description, v_tasks, v_contents, v_metas, v_is_default
  )
  ON CONFLICT (clinic_id, kind, name) DO UPDATE SET
    description = EXCLUDED.description,
    tasks       = EXCLUDED.tasks,
    contents    = EXCLUDED.contents,
    metas       = EXCLUDED.metas,
    is_default  = EXCLUDED.is_default;

  RETURN jsonb_build_object(
    'ok',         true,
    'kind',       v_kind,
    'name',       v_name,
    'is_default', v_is_default
  );
END $$;

COMMENT ON FUNCTION public.b2b_playbook_template_upsert(jsonb) IS
  'Upsert template de playbook B2B (clinic_id, kind, name) · valida arrays jsonb · garante 1 default por kind. Mig 800-27.';

GRANT EXECUTE ON FUNCTION public.b2b_playbook_template_upsert(jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. RPC b2b_playbook_template_delete(p_kind text, p_name text)
--    DELETE row · idempotente.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_playbook_template_delete(
  p_kind text,
  p_name text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid     uuid := public.app_clinic_id();
  v_deleted int;
BEGIN
  IF v_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;
  IF p_kind IS NULL OR p_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_args');
  END IF;
  IF p_kind NOT IN ('prospect_to_active','retention','renewal') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;

  DELETE FROM public.b2b_playbook_templates
   WHERE clinic_id = v_cid
     AND kind      = p_kind
     AND name      = p_name;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END $$;

COMMENT ON FUNCTION public.b2b_playbook_template_delete(text, text) IS
  'Deleta template de playbook B2B por (clinic_id, kind, name) · idempotente. Mig 800-27.';

GRANT EXECUTE ON FUNCTION public.b2b_playbook_template_delete(text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERTS
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_playbook_template_upsert') THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_playbook_template_upsert nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_playbook_template_delete') THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_playbook_template_delete nao existe';
  END IF;
  RAISE NOTICE '✅ Mig 800-27 OK — playbook_template upsert/delete RPCs prontos';
END $$;

COMMIT;
