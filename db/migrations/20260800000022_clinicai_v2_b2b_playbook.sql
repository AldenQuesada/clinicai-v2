-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-22 · clinicai-v2 · b2b_playbook (templates + apply RPC)    ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Materializa "Aplicar Playbook" (1-clique) em /partnerships/[id] · botao  ║
-- ║ ja existia (DISABLED) com tooltip "Em breve · vamos integrar com         ║
-- ║ b2b_apply_playbook RPC". Esta mig cria toda a infra:                     ║
-- ║                                                                          ║
-- ║   1. Tabela b2b_playbook_templates · 1 row por (clinic, kind, name).     ║
-- ║      Carrega tasks/contents/metas declarativos em jsonb. is_default      ║
-- ║      flag pra escolher template canonico por kind.                       ║
-- ║                                                                          ║
-- ║   2. Tabela b2b_partnership_tasks/contents/metas · alvos pelo apply.     ║
-- ║      Estes nao existiam em prod ainda · criados aqui ja com RLS+grant.   ║
-- ║      Schema minimo · sem state machine pesada (status simples + due).    ║
-- ║                                                                          ║
-- ║   3. Tabela b2b_playbook_applications · historico (auditoria).           ║
-- ║                                                                          ║
-- ║   4. RPC b2b_apply_playbook(p_partnership_id uuid, p_kind text)          ║
-- ║      RETURNS jsonb · pega template default (clinic+kind+is_default), ITER║
-- ║      tasks/contents/metas inserindo idempotente (skip se ja tem mesmo    ║
-- ║      title pra essa parceria), registra row em applications, retorna     ║
-- ║      { ok, applied_tasks, applied_contents, applied_metas }.             ║
-- ║                                                                          ║
-- ║   5. Seed · 3 templates default (prospect_to_active, retention,          ║
-- ║      renewal) por clinica que ja tem parcerias · razoaveis pra estetica. ║
-- ║                                                                          ║
-- ║ Audiencia: authenticated. RLS clinic_id = app_clinic_id() em todas.      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Tabela b2b_playbook_templates
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.b2b_playbook_templates (
  clinic_id   uuid        NOT NULL,
  kind        text        NOT NULL
                            CHECK (kind IN ('prospect_to_active','retention','renewal')),
  name        text        NOT NULL,
  description text        NULL,
  tasks       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  contents    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  metas       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_default  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, kind, name)
);

COMMENT ON TABLE public.b2b_playbook_templates IS
  'Templates de playbook por clinica · 1 default por kind (prospect_to_active/retention/renewal). Mig 800-22.';
COMMENT ON COLUMN public.b2b_playbook_templates.tasks IS
  'jsonb array de {title text, days_offset int, owner_role text}. days_offset=0 = hoje.';
COMMENT ON COLUMN public.b2b_playbook_templates.contents IS
  'jsonb array de {title text, kind text, schedule text}. kind=post/story/reels/email.';
COMMENT ON COLUMN public.b2b_playbook_templates.metas IS
  'jsonb array de {kind text, target numeric}. kind=vouchers_month/conversion_pct/nps_min.';

-- Garante so 1 default por (clinic, kind)
CREATE UNIQUE INDEX IF NOT EXISTS uq_playbook_templates_default
  ON public.b2b_playbook_templates (clinic_id, kind)
  WHERE is_default = true;

ALTER TABLE public.b2b_playbook_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_playbook_templates_tenant" ON public.b2b_playbook_templates;
CREATE POLICY "b2b_playbook_templates_tenant" ON public.b2b_playbook_templates
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_playbook_templates TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Tabelas alvo do apply (tasks/contents/metas)
--    Schema minimo · evolucionavel sem breaking change.
-- ═══════════════════════════════════════════════════════════════════════

-- ── b2b_partnership_tasks ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_partnership_tasks (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       uuid        NOT NULL,
  partnership_id  uuid        NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  owner_role      text        NULL,
  due_at          timestamptz NULL,
  status          text        NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open','done','skipped')),
  source          text        NULL, -- ex: 'playbook:retention'
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_partnership_tasks_clinic_partnership
  ON public.b2b_partnership_tasks (clinic_id, partnership_id);
CREATE INDEX IF NOT EXISTS idx_b2b_partnership_tasks_status_due
  ON public.b2b_partnership_tasks (clinic_id, status, due_at);

ALTER TABLE public.b2b_partnership_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_partnership_tasks_tenant" ON public.b2b_partnership_tasks;
CREATE POLICY "b2b_partnership_tasks_tenant" ON public.b2b_partnership_tasks
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_partnership_tasks TO authenticated;

-- ── b2b_partnership_contents ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_partnership_contents (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       uuid        NOT NULL,
  partnership_id  uuid        NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  kind            text        NOT NULL DEFAULT 'post'
                                CHECK (kind IN ('post','story','reels','email','wa_broadcast')),
  schedule        text        NULL, -- ex: 'D+0', 'D+7', 'monthly'
  status          text        NOT NULL DEFAULT 'planned'
                                CHECK (status IN ('planned','published','skipped')),
  source          text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_partnership_contents_clinic_partnership
  ON public.b2b_partnership_contents (clinic_id, partnership_id);

ALTER TABLE public.b2b_partnership_contents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_partnership_contents_tenant" ON public.b2b_partnership_contents;
CREATE POLICY "b2b_partnership_contents_tenant" ON public.b2b_partnership_contents
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_partnership_contents TO authenticated;

-- ── b2b_partnership_metas ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_partnership_metas (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       uuid        NOT NULL,
  partnership_id  uuid        NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  kind            text        NOT NULL
                                CHECK (kind IN ('vouchers_month','conversion_pct','nps_min','contents_month')),
  target          numeric     NOT NULL,
  source          text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, partnership_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_b2b_partnership_metas_clinic_partnership
  ON public.b2b_partnership_metas (clinic_id, partnership_id);

ALTER TABLE public.b2b_partnership_metas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_partnership_metas_tenant" ON public.b2b_partnership_metas;
CREATE POLICY "b2b_partnership_metas_tenant" ON public.b2b_partnership_metas
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_partnership_metas TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Tabela b2b_playbook_applications (audit trail)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.b2b_playbook_applications (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id       uuid        NOT NULL,
  partnership_id  uuid        NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  template_kind   text        NOT NULL
                                CHECK (template_kind IN ('prospect_to_active','retention','renewal')),
  template_name   text        NULL,
  applied_at      timestamptz NOT NULL DEFAULT now(),
  applied_by      uuid        NULL,
  summary         jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_b2b_playbook_applications_partnership
  ON public.b2b_playbook_applications (clinic_id, partnership_id, applied_at DESC);

ALTER TABLE public.b2b_playbook_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_playbook_applications_tenant" ON public.b2b_playbook_applications;
CREATE POLICY "b2b_playbook_applications_tenant" ON public.b2b_playbook_applications
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT ON public.b2b_playbook_applications TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. RPC b2b_apply_playbook(p_partnership_id, p_kind)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_apply_playbook(
  p_partnership_id uuid,
  p_kind           text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid               uuid := public.app_clinic_id();
  v_uid               uuid := auth.uid();
  v_partnership_cid   uuid;
  v_template          public.b2b_playbook_templates%ROWTYPE;
  v_task              jsonb;
  v_content           jsonb;
  v_meta              jsonb;
  v_applied_tasks     int  := 0;
  v_applied_contents  int  := 0;
  v_applied_metas     int  := 0;
  v_due               timestamptz;
  v_source            text;
  v_app_id            uuid;
BEGIN
  IF v_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;
  IF p_partnership_id IS NULL OR p_kind IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_args');
  END IF;
  IF p_kind NOT IN ('prospect_to_active','retention','renewal') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;

  -- Confirma parceria pertence a clinica do caller
  SELECT clinic_id INTO v_partnership_cid
    FROM public.b2b_partnerships
   WHERE id = p_partnership_id;
  IF v_partnership_cid IS NULL OR v_partnership_cid <> v_cid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  -- Pega template default (clinic, kind)
  SELECT * INTO v_template
    FROM public.b2b_playbook_templates
   WHERE clinic_id  = v_cid
     AND kind       = p_kind
     AND is_default = true
   LIMIT 1;

  IF v_template.name IS NULL THEN
    -- Fallback: 1o template do kind nessa clinica
    SELECT * INTO v_template
      FROM public.b2b_playbook_templates
     WHERE clinic_id = v_cid AND kind = p_kind
     ORDER BY created_at ASC
     LIMIT 1;
  END IF;

  IF v_template.name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_template_for_kind');
  END IF;

  v_source := 'playbook:' || p_kind;

  -- ── Tasks (idempotente por title+source pra essa parceria) ──────────
  FOR v_task IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.tasks, '[]'::jsonb))
  LOOP
    v_due := now() + make_interval(days => COALESCE((v_task->>'days_offset')::int, 0));
    IF NOT EXISTS (
      SELECT 1 FROM public.b2b_partnership_tasks
       WHERE clinic_id      = v_cid
         AND partnership_id = p_partnership_id
         AND title          = v_task->>'title'
    ) THEN
      INSERT INTO public.b2b_partnership_tasks (
        clinic_id, partnership_id, title, owner_role, due_at, status, source
      ) VALUES (
        v_cid,
        p_partnership_id,
        v_task->>'title',
        v_task->>'owner_role',
        v_due,
        'open',
        v_source
      );
      v_applied_tasks := v_applied_tasks + 1;
    END IF;
  END LOOP;

  -- ── Contents (idempotente por title) ────────────────────────────────
  FOR v_content IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.contents, '[]'::jsonb))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.b2b_partnership_contents
       WHERE clinic_id      = v_cid
         AND partnership_id = p_partnership_id
         AND title          = v_content->>'title'
    ) THEN
      INSERT INTO public.b2b_partnership_contents (
        clinic_id, partnership_id, title, kind, schedule, status, source
      ) VALUES (
        v_cid,
        p_partnership_id,
        v_content->>'title',
        COALESCE(v_content->>'kind', 'post'),
        v_content->>'schedule',
        'planned',
        v_source
      );
      v_applied_contents := v_applied_contents + 1;
    END IF;
  END LOOP;

  -- ── Metas (idempotente por kind · UNIQUE(clinic,partnership,kind)) ──
  FOR v_meta IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.metas, '[]'::jsonb))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.b2b_partnership_metas
       WHERE clinic_id      = v_cid
         AND partnership_id = p_partnership_id
         AND kind           = v_meta->>'kind'
    ) THEN
      INSERT INTO public.b2b_partnership_metas (
        clinic_id, partnership_id, kind, target, source
      ) VALUES (
        v_cid,
        p_partnership_id,
        v_meta->>'kind',
        COALESCE((v_meta->>'target')::numeric, 0),
        v_source
      );
      v_applied_metas := v_applied_metas + 1;
    END IF;
  END LOOP;

  -- ── Audit row ────────────────────────────────────────────────────────
  INSERT INTO public.b2b_playbook_applications (
    clinic_id, partnership_id, template_kind, template_name, applied_by, summary
  ) VALUES (
    v_cid,
    p_partnership_id,
    p_kind,
    v_template.name,
    v_uid,
    jsonb_build_object(
      'applied_tasks',    v_applied_tasks,
      'applied_contents', v_applied_contents,
      'applied_metas',    v_applied_metas
    )
  ) RETURNING id INTO v_app_id;

  RETURN jsonb_build_object(
    'ok',                true,
    'application_id',    v_app_id,
    'template_name',     v_template.name,
    'template_kind',     p_kind,
    'applied_tasks',     v_applied_tasks,
    'applied_contents',  v_applied_contents,
    'applied_metas',     v_applied_metas
  );
END $$;

COMMENT ON FUNCTION public.b2b_apply_playbook(uuid, text) IS
  'Aplica template de playbook (kind in prospect_to_active/retention/renewal) na parceria. Idempotente · skip se task/content/meta ja existir. Mig 800-22.';

GRANT EXECUTE ON FUNCTION public.b2b_apply_playbook(uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Seed · 3 templates default por clinica que ja tem parceria
--    Razoavel pra clinica de estetica · pode ser editado depois.
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO public.b2b_playbook_templates (
  clinic_id, kind, name, description, tasks, contents, metas, is_default
)
SELECT
  c.id,
  'prospect_to_active',
  'Onboarding parceira (estetica)',
  'Sequencia padrao pra ativar parceira nova nos primeiros 30 dias.',
  '[
    {"title":"Enviar contrato + brief de DNA","days_offset":0,"owner_role":"owner"},
    {"title":"Agendar reuniao de kickoff (videocall 30min)","days_offset":2,"owner_role":"account_manager"},
    {"title":"Cadastrar parceira no painel + emitir 1o voucher de teste","days_offset":3,"owner_role":"account_manager"},
    {"title":"Treinar parceira no fluxo (script de entrega + WhatsApp)","days_offset":5,"owner_role":"account_manager"},
    {"title":"Check-in 15d (feedback inicial + ajuste de combo)","days_offset":15,"owner_role":"account_manager"},
    {"title":"Review 30d (KPIs iniciais + decisao de continuidade)","days_offset":30,"owner_role":"owner"}
  ]'::jsonb,
  '[
    {"title":"Post de anuncio da parceria","kind":"post","schedule":"D+3"},
    {"title":"Story conjunto de bastidores","kind":"story","schedule":"D+7"},
    {"title":"Reels com rotina/depoimento da parceira","kind":"reels","schedule":"D+15"}
  ]'::jsonb,
  '[
    {"kind":"vouchers_month","target":8},
    {"kind":"conversion_pct","target":20},
    {"kind":"contents_month","target":3}
  ]'::jsonb,
  true
FROM public.clinics c
WHERE EXISTS (SELECT 1 FROM public.b2b_partnerships p WHERE p.clinic_id = c.id)
ON CONFLICT (clinic_id, kind, name) DO NOTHING;

INSERT INTO public.b2b_playbook_templates (
  clinic_id, kind, name, description, tasks, contents, metas, is_default
)
SELECT
  c.id,
  'retention',
  'Retencao parceira em risco',
  'Aplicar quando saude amarela/vermelha · resgate proativo.',
  '[
    {"title":"Ligar pra parceira (voz, nao WhatsApp)","days_offset":0,"owner_role":"owner"},
    {"title":"Marcar cafe presencial pra revisar parceria","days_offset":3,"owner_role":"account_manager"},
    {"title":"Revisar combo · trocar por mais atrativo","days_offset":5,"owner_role":"account_manager"},
    {"title":"Emitir 3 vouchers cortesia pra reaquecer","days_offset":7,"owner_role":"account_manager"},
    {"title":"Check de saude 30d apos retomada","days_offset":30,"owner_role":"owner"}
  ]'::jsonb,
  '[
    {"title":"Story reforcando parceria (gratidao publica)","kind":"story","schedule":"D+1"},
    {"title":"Post de cliente VIP convertida via parceria","kind":"post","schedule":"D+10"}
  ]'::jsonb,
  '[
    {"kind":"vouchers_month","target":5},
    {"kind":"conversion_pct","target":18},
    {"kind":"nps_min","target":7}
  ]'::jsonb,
  true
FROM public.clinics c
WHERE EXISTS (SELECT 1 FROM public.b2b_partnerships p WHERE p.clinic_id = c.id)
ON CONFLICT (clinic_id, kind, name) DO NOTHING;

INSERT INTO public.b2b_playbook_templates (
  clinic_id, kind, name, description, tasks, contents, metas, is_default
)
SELECT
  c.id,
  'renewal',
  'Renovacao 12m de parceria',
  'Sequencia 60d antes do fim do contrato pra renovar com upgrade.',
  '[
    {"title":"Preparar relatorio de impacto 12m (vouchers, conv, NPS, ROI)","days_offset":0,"owner_role":"owner"},
    {"title":"Reuniao de renovacao com a parceira (Pitch Mode)","days_offset":7,"owner_role":"owner"},
    {"title":"Propor upgrade de combo OU expansao (+1 servico)","days_offset":7,"owner_role":"owner"},
    {"title":"Assinar novo contrato (12m) + atualizar painel","days_offset":15,"owner_role":"account_manager"},
    {"title":"Post de renovacao publica (selo de parceria 1+ ano)","days_offset":20,"owner_role":"account_manager"}
  ]'::jsonb,
  '[
    {"title":"Reels de retrospectiva 12m da parceria","kind":"reels","schedule":"D+15"},
    {"title":"Email de agradecimento as beneficiarias","kind":"email","schedule":"D+20"}
  ]'::jsonb,
  '[
    {"kind":"vouchers_month","target":10},
    {"kind":"conversion_pct","target":25},
    {"kind":"nps_min","target":8}
  ]'::jsonb,
  true
FROM public.clinics c
WHERE EXISTS (SELECT 1 FROM public.b2b_partnerships p WHERE p.clinic_id = c.id)
ON CONFLICT (clinic_id, kind, name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERTS
-- ═══════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='b2b_playbook_templates' AND relkind='r') THEN
    RAISE EXCEPTION 'ASSERT FAIL: tabela b2b_playbook_templates nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='b2b_partnership_tasks' AND relkind='r') THEN
    RAISE EXCEPTION 'ASSERT FAIL: tabela b2b_partnership_tasks nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='b2b_partnership_contents' AND relkind='r') THEN
    RAISE EXCEPTION 'ASSERT FAIL: tabela b2b_partnership_contents nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='b2b_partnership_metas' AND relkind='r') THEN
    RAISE EXCEPTION 'ASSERT FAIL: tabela b2b_partnership_metas nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='b2b_playbook_applications' AND relkind='r') THEN
    RAISE EXCEPTION 'ASSERT FAIL: tabela b2b_playbook_applications nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_apply_playbook') THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_apply_playbook nao existe';
  END IF;
  RAISE NOTICE '✅ Mig 800-22 OK — b2b_playbook_templates + tabelas alvo + RPC + seed prontos';
END $$;

COMMIT;
