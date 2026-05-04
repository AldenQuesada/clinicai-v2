-- ============================================================================
-- Rollback de mig 125 · remove matriz explícita da role 'secretaria'
-- ============================================================================
--
-- ⚠️  ATENÇÃO · ROLLBACK REMOVE A MATRIZ DE PERMISSÕES DA SECRETARIA ⚠️
--
-- Este DOWN deleta apenas as 13 rows que a mig 125 inseriu para
-- (clinic_id = 00000000-...-000000000001, role = 'secretaria').
--
-- Após o rollback, a role 'secretaria' continua VÁLIDA (mig 124 mantida),
-- mas sem rows em clinic_module_permissions. Resultado: o front-end cai
-- no default permissivo de apps/lara/src/lib/permissions.ts (definido no
-- código), o que pode acidentalmente liberar páginas que estavam bloqueadas
-- em DB. Use este DOWN apenas em rollback de investigação.
--
-- O QUE NÃO FAZ:
--   - NÃO mexe em rows de outras roles
--   - NÃO mexe em profiles
--   - NÃO mexe em auth.users / professional_profiles / user_module_permissions
--   - NÃO mexe em CHECK constraints (mig 124 segue intocada)
--   - NÃO mexe em invite_staff / update_staff_role (mig 124 segue intocada)
--
-- Idempotente · DELETE com WHERE escopado · reaplicar = no-op (0 rows).

BEGIN;

DELETE FROM public.clinic_module_permissions
WHERE clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND role      = 'secretaria'
  AND (module_id, page_id) IN (
    ('whatsapp',             'inbox'),
    ('whatsapp',             'analytics-wa'),
    ('whatsapp',             'birthday-campaigns'),
    ('whatsapp',             'growth-wa-links'),
    ('whatsapp',             'page-builder'),
    ('whatsapp',             'settings-automation'),
    ('whatsapp',             'short-links'),
    ('whatsapp',             'wa-disparos'),
    ('dashboard',            'dashboard-overview'),
    ('financeiro',           'fin-goals'),
    ('financeiro',           'fin-reports'),
    ('captacao-fullface',    'leads-fullface'),
    ('captacao-protocolos',  'leads-protocolos')
  );

-- Sanity pós · confirma que sobraram 0 rows desta role (ou avisa se ficaram outras
-- que possivelmente foram criadas fora desta mig).

DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM public.clinic_module_permissions
  WHERE clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
    AND role      = 'secretaria';

  IF v_remaining > 0 THEN
    RAISE WARNING 'mig 125 DOWN · ainda restam % rows com role=secretaria · não criadas pela mig 125 · inspecionar manualmente', v_remaining;
  ELSE
    RAISE NOTICE 'mig 125 DOWN · 0 rows secretaria restantes · matriz removida';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
