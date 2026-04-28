-- Tabelas `flipbook_comm_event_keys` + `flipbook_comm_templates` · catálogo de
-- mensagens transacionais e de marketing do funil de venda do flipbook.
--
-- Diferente de `b2b_comm_*` (clinic_id multi-tenant): aqui é single-tenant
-- (biblioteca pessoal do Alden). Sem clinic_id.
--
-- event_keys são strings estáveis usadas como chave por:
--   - webhook /api/webhooks/asaas (dispara buyer_purchase_confirmed direto)
--   - edge flipbook-sequences-tick (lê sequence_steps e mapeia → templates)
--
-- Templates suportam placeholders `{{var}}` resolvidos no momento do dispatch
-- com snapshot do buyer/product/offer/grant.
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- flipbook_comm_event_keys · catálogo editável de events
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flipbook_comm_event_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text NOT NULL UNIQUE,
  label         text NOT NULL,
  category      text NOT NULL DEFAULT 'transactional'
                CHECK (category IN ('transactional','sequence_lead','sequence_buyer')),
  trigger_desc  text,
  is_system     boolean NOT NULL DEFAULT false,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    integer NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flipbook_comm_event_keys_category_idx
  ON public.flipbook_comm_event_keys (category, sort_order);

DROP TRIGGER IF EXISTS flipbook_comm_event_keys_set_updated_at ON public.flipbook_comm_event_keys;
CREATE TRIGGER flipbook_comm_event_keys_set_updated_at
  BEFORE UPDATE ON public.flipbook_comm_event_keys
  FOR EACH ROW EXECUTE FUNCTION public._flipbook_commerce_set_updated_at();

ALTER TABLE public.flipbook_comm_event_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flipbook_comm_event_keys_authed_all ON public.flipbook_comm_event_keys;
CREATE POLICY flipbook_comm_event_keys_authed_all
  ON public.flipbook_comm_event_keys
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- flipbook_comm_templates · corpo da mensagem por event_key
-- ═══════════════════════════════════════════════════════════════════════════
-- 1 event_key pode ter múltiplos templates (versão A/B, idiomas), mas exatamente
-- UM `active=true` por event_key+channel é o vigente.
CREATE TABLE IF NOT EXISTS public.flipbook_comm_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key    text NOT NULL REFERENCES public.flipbook_comm_event_keys(key) ON UPDATE CASCADE,
  channel      text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','email')),
  language     char(2) NOT NULL DEFAULT 'pt',

  body         text NOT NULL,
  -- placeholders esperados (referencial; renderer não falha se faltar):
  -- {{buyer_name}} {{book_title}} {{book_slug}} {{access_link}} {{price}} {{offer_name}}
  variables    jsonb NOT NULL DEFAULT '[]'::jsonb,

  is_active    boolean NOT NULL DEFAULT true,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT flipbook_comm_templates_body_min CHECK (length(body) >= 5)
);

-- Apenas UM template active por event_key+channel+language
CREATE UNIQUE INDEX IF NOT EXISTS flipbook_comm_templates_active_unique
  ON public.flipbook_comm_templates (event_key, channel, language)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS flipbook_comm_templates_event_idx
  ON public.flipbook_comm_templates (event_key, channel);

DROP TRIGGER IF EXISTS flipbook_comm_templates_set_updated_at ON public.flipbook_comm_templates;
CREATE TRIGGER flipbook_comm_templates_set_updated_at
  BEFORE UPDATE ON public.flipbook_comm_templates
  FOR EACH ROW EXECUTE FUNCTION public._flipbook_commerce_set_updated_at();

ALTER TABLE public.flipbook_comm_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flipbook_comm_templates_authed_all ON public.flipbook_comm_templates;
CREATE POLICY flipbook_comm_templates_authed_all
  ON public.flipbook_comm_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;
NOTIFY pgrst, 'reload schema';
