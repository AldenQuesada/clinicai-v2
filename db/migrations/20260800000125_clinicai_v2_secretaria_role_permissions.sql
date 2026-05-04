-- ============================================================================
-- Matriz de permissões da role 'secretaria' em clinic_module_permissions
-- ============================================================================
--
-- Contexto · 2026-05-04 (sequência da mig 124):
--
-- A role 'secretaria' foi habilitada na mig 124 (3 CHECKs + 2 RPCs) · mas
-- não tinha rows em public.clinic_module_permissions · qualquer toggle
-- de UI dependia do default permissivo do código (lib/permissions.ts).
-- Esta mig versiona a matriz aplicada manualmente em prod hoje.
--
-- Filosofia da matriz: 'secretaria' = atendente sênior na inbox WhatsApp.
-- Acesso permitido: 1 página · whatsapp/inbox.
-- Tudo mais bloqueado: dashboard, financeiro, captação, broadcasts, links,
-- analytics, automação, page-builder.
--
-- Estado pós-mig:
--   role         = 'secretaria'
--   total_rules  = 13
--   allowed      = 1   (whatsapp/inbox)
--   denied       = 12  (resto)
--
-- Idempotente · INSERT ON CONFLICT DO UPDATE usa o UNIQUE
-- (clinic_id, module_id, page_id, role).
--
-- O QUE NÃO FAZ:
--   - NÃO mexe em rows de outras roles (owner/admin/therapist/receptionist/viewer)
--   - NÃO toca em profiles
--   - NÃO toca em auth.users
--   - NÃO toca em professional_profiles
--   - NÃO toca em user_module_permissions

BEGIN;

-- ── 1. UPSERT das 13 regras da role secretaria ────────────────────────────

INSERT INTO public.clinic_module_permissions (clinic_id, module_id, page_id, role, allowed)
VALUES
  -- Permitido (1)
  ('00000000-0000-0000-0000-000000000001', 'whatsapp',             'inbox',                'secretaria', true),
  -- Bloqueado WhatsApp (7)
  ('00000000-0000-0000-0000-000000000001', 'whatsapp',             'analytics-wa',         'secretaria', false),
  ('00000000-0000-0000-0000-000000000001', 'whatsapp',             'birthday-campaigns',   'secretaria', false),
  ('00000000-0000-0000-0000-000000000001', 'whatsapp',             'growth-wa-links',      'secretaria', false),
  ('00000000-0000-0000-0000-000000000001', 'whatsapp',             'page-builder',         'secretaria', false),
  ('00000000-0000-0000-0000-000000000001', 'whatsapp',             'settings-automation',  'secretaria', false),
  ('00000000-0000-0000-0000-000000000001', 'whatsapp',             'short-links',          'secretaria', false),
  ('00000000-0000-0000-0000-000000000001', 'whatsapp',             'wa-disparos',          'secretaria', false),
  -- Bloqueado dashboard (1)
  ('00000000-0000-0000-0000-000000000001', 'dashboard',            'dashboard-overview',   'secretaria', false),
  -- Bloqueado financeiro (2)
  ('00000000-0000-0000-0000-000000000001', 'financeiro',           'fin-goals',            'secretaria', false),
  ('00000000-0000-0000-0000-000000000001', 'financeiro',           'fin-reports',          'secretaria', false),
  -- Bloqueado captação (2)
  ('00000000-0000-0000-0000-000000000001', 'captacao-fullface',    'leads-fullface',       'secretaria', false),
  ('00000000-0000-0000-0000-000000000001', 'captacao-protocolos',  'leads-protocolos',     'secretaria', false)
ON CONFLICT (clinic_id, module_id, page_id, role) DO UPDATE
  SET allowed    = EXCLUDED.allowed,
      updated_at = NOW();

-- ── 2. Sanity final ───────────────────────────────────────────────────────

DO $$
DECLARE
  v_total    int;
  v_allowed  int;
  v_denied   int;
  v_inbox    boolean;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE allowed = true),
         count(*) FILTER (WHERE allowed = false)
    INTO v_total, v_allowed, v_denied
  FROM public.clinic_module_permissions
  WHERE clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND role      = 'secretaria';

  IF v_total <> 13 THEN
    RAISE EXCEPTION 'mig 125 · esperado 13 rows secretaria, encontrou %', v_total;
  END IF;
  IF v_allowed <> 1 THEN
    RAISE EXCEPTION 'mig 125 · esperado 1 allowed=true, encontrou %', v_allowed;
  END IF;
  IF v_denied <> 12 THEN
    RAISE EXCEPTION 'mig 125 · esperado 12 allowed=false, encontrou %', v_denied;
  END IF;

  SELECT allowed INTO v_inbox
  FROM public.clinic_module_permissions
  WHERE clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND role      = 'secretaria'
    AND module_id = 'whatsapp'
    AND page_id   = 'inbox';

  IF v_inbox IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'mig 125 · whatsapp/inbox da secretaria não está allowed=true · valor=%', v_inbox;
  END IF;

  RAISE NOTICE 'mig 125 · matriz secretaria · 13 rules · 1 allowed (whatsapp/inbox) · 12 denied · OK';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
