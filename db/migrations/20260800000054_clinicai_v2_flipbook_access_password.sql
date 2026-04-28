-- Adiciona coluna pra hash bcrypt da senha de acesso a flipbooks privados.
--
-- Modo single: hash bcrypt único compartilhado (acesso por senha).
-- Outros modos (user/google/magic) ficam pra fase 2 e podem agregar
-- estrutura adicional (ex: per-user em settings.password.allowlist).
--
-- A coluna é nullable porque a maioria dos livros é público.
BEGIN;

ALTER TABLE public.flipbooks
  ADD COLUMN IF NOT EXISTS access_password_hash text;

COMMIT;
NOTIFY pgrst, 'reload schema';
