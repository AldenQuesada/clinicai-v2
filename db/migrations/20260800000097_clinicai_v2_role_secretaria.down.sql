-- Rollback Mig 97 · cuidado · vai falhar se algum profile estiver com role='secretaria'
-- Pra ser safe, primeiro rebaixa secretaria→receptionist:
UPDATE public.profiles SET role='receptionist' WHERE role='secretaria';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner', 'admin', 'therapist', 'receptionist', 'viewer'));
