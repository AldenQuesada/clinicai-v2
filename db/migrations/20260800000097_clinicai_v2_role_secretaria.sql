-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 97 · clinicai-v2 · adiciona role 'secretaria' em profiles      ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ DB como fonte da verdade (sidebar+permissoes filtram por role).          ║
-- ║                                                                          ║
-- ║ Role secretaria = perfil dedicado pra atendente da inbox /secretaria:    ║
-- ║   - acesso EXCLUSIVO a /secretaria, /agenda (view), /pacientes (view)    ║
-- ║   - SEM acesso a /conversas (Lara), /templates, /prompts, /midia,        ║
-- ║     /campanhas, /configuracoes (sidebar restrita pra perfil idoso)      ║
-- ║                                                                          ║
-- ║ Hierarquia: secretaria fica abaixo de receptionist (mais restrita)       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'therapist', 'receptionist', 'viewer', 'secretaria'));

COMMENT ON COLUMN public.profiles.role IS
  'Role do membro · controla sidebar visivel + permissoes via @/lib/permissions. Roles: owner, admin, therapist, receptionist, viewer, secretaria.';
