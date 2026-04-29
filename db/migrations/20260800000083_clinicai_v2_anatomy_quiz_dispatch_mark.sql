-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-83 · clinicai-v2 · anatomy_quiz_dispatch_mark RPC          ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Camada 10b · P2 · RPC wrap pro UPDATE de anatomy_quiz_lara_dispatch     ║
-- ║                                                                          ║
-- ║ Motivacao (auditoria 2026-04-29):                                        ║
-- ║   apps/lara/src/app/api/cold-open/route.ts faz UPDATE direto na tabela  ║
-- ║   anatomy_quiz_lara_dispatch (status='dispatched' + audit fields). Isso  ║
-- ║   viola ADR-005 (boundary): writes de tabela do dominio Lara saindo do   ║
-- ║   app sem RPC. Esta migration introduz wrap canonico.                    ║
-- ║                                                                          ║
-- ║ Campos cobertos (bate exato com o UPDATE atual no route.ts):             ║
-- ║   · status              · text   · obrigatorio · CHECK whitelist         ║
-- ║   · message_text        · text   · COALESCE-preserva existente           ║
-- ║   · template_id         · uuid   · COALESCE-preserva                     ║
-- ║   · template_version    · int    · COALESCE-preserva                     ║
-- ║   · template_variant    · text   · COALESCE-preserva                     ║
-- ║   · dispatched_at       · auto · setado quando status='dispatched'      ║
-- ║                                                                          ║
-- ║ Tabela NAO tem updated_at · nao toca.                                    ║
-- ║                                                                          ║
-- ║ Nota types: template_version e INTEGER no schema (packages/supabase/    ║
-- ║ src/types.ts:976) · NAO text como template anterior sugeria.            ║
-- ║                                                                          ║
-- ║ GOLD #3: SECURITY DEFINER + SET search_path = public, pg_catalog        ║
-- ║ GOLD #5: .down.sql pareado                                              ║
-- ║ GOLD #7: sanity check final                                             ║
-- ║ GOLD #10: NOTIFY pgrst reload schema                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── DROP versao anterior (idempotencia) ───────────────────────────────────
DROP FUNCTION IF EXISTS public.anatomy_quiz_lara_dispatch_mark(uuid, text, text, uuid, integer, text);

-- ── RPC: anatomy_quiz_lara_dispatch_mark ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.anatomy_quiz_lara_dispatch_mark(
  p_dispatch_id      uuid,
  p_status           text,
  p_message_text     text    DEFAULT NULL,
  p_template_id      uuid    DEFAULT NULL,
  p_template_version integer DEFAULT NULL,
  p_template_variant text    DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_allowed_statuses text[] := ARRAY['dispatched', 'failed', 'skipped'];
  v_updated          int;
BEGIN
  -- Whitelist defensivo · evita app passar status arbitrario
  IF NOT (p_status = ANY(v_allowed_statuses)) THEN
    RAISE EXCEPTION 'invalid_status: % (allowed: %)', p_status, v_allowed_statuses;
  END IF;

  -- COALESCE preserva valores existentes quando caller passa NULL
  -- (semantica casa com o UPDATE atual · so toca quando tem novo valor)
  UPDATE public.anatomy_quiz_lara_dispatch
     SET status            = p_status,
         message_text      = COALESCE(p_message_text, message_text),
         template_id       = COALESCE(p_template_id, template_id),
         template_version  = COALESCE(p_template_version, template_version),
         template_variant  = COALESCE(p_template_variant, template_variant),
         dispatched_at     = CASE
                               WHEN p_status = 'dispatched' THEN now()
                               ELSE dispatched_at
                             END
   WHERE id = p_dispatch_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- ── Permissions ───────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.anatomy_quiz_lara_dispatch_mark(uuid, text, text, uuid, integer, text)
  TO authenticated, service_role;

-- ── Sanity check ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn    boolean;
  v_grant boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'anatomy_quiz_lara_dispatch_mark'
  ) INTO v_fn;

  SELECT has_function_privilege(
    'authenticated',
    'public.anatomy_quiz_lara_dispatch_mark(uuid, text, text, uuid, integer, text)',
    'EXECUTE'
  ) INTO v_grant;

  IF NOT (v_fn AND v_grant) THEN
    RAISE EXCEPTION 'Sanity 800-83 FAIL · fn=% grant=%', v_fn, v_grant;
  END IF;

  RAISE NOTICE 'Migration 800-83 OK · anatomy_quiz_lara_dispatch_mark criada';
END $$;

NOTIFY pgrst, 'reload schema';
