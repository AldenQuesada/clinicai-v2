-- ============================================================================
-- Rollback de mig 124 · remove suporte à role 'secretaria'
-- ============================================================================
--
-- ⚠️  ATENÇÃO · ROLLBACK REMOVE SUPORTE À ROLE secretaria ⚠️
--
-- Este DOWN reverte as 3 CHECKs e os 2 allowlists de RPC para o estado
-- pré-mig-124 (sem 'secretaria'). Se houver QUALQUER linha em prod usando
-- role='secretaria' nas tabelas afetadas, este rollback ABORTA antes de
-- destruir dados.
--
-- Pré-checks (aborta se houver dados secretaria):
--   public.profiles · role='secretaria'
--   public.clinic_invitations · role='secretaria' (pendentes ou aceitos)
--   public.clinic_module_permissions · role='secretaria'
--
-- Use este DOWN apenas em rollback de investigação ou se decidir descontinuar
-- a role 'secretaria'. Não esquecer de também ajustar
-- apps/lara/src/lib/permissions.ts se for descontinuar permanentemente.
--
-- Idempotente: DROP CONSTRAINT IF EXISTS + ADD via DO block · CREATE OR REPLACE
-- FUNCTION é idempotente.

BEGIN;

-- ── 0. Sanity pré-condição · aborta se houver dados secretaria ────────────

DO $$
DECLARE
  v_profiles_count       int;
  v_invitations_count    int;
  v_module_perms_count   int;
BEGIN
  SELECT count(*) INTO v_profiles_count
  FROM public.profiles WHERE role = 'secretaria';

  IF v_profiles_count > 0 THEN
    RAISE EXCEPTION 'mig 124 DOWN ABORT · % rows em public.profiles com role=secretaria · re-atribuir antes de reverter', v_profiles_count;
  END IF;

  SELECT count(*) INTO v_invitations_count
  FROM public.clinic_invitations WHERE role = 'secretaria';

  IF v_invitations_count > 0 THEN
    RAISE EXCEPTION 'mig 124 DOWN ABORT · % rows em public.clinic_invitations com role=secretaria · limpar antes de reverter', v_invitations_count;
  END IF;

  SELECT count(*) INTO v_module_perms_count
  FROM public.clinic_module_permissions WHERE role = 'secretaria';

  IF v_module_perms_count > 0 THEN
    RAISE EXCEPTION 'mig 124 DOWN ABORT · % rows em public.clinic_module_permissions com role=secretaria · limpar antes de reverter', v_module_perms_count;
  END IF;

  RAISE NOTICE 'mig 124 DOWN · sanity OK · 0 dados secretaria nas 3 tabelas';
END $$;

-- ── 1. profiles_role_check · sem secretaria ───────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname  = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role = ANY (ARRAY[
      'owner'::text,
      'admin'::text,
      'therapist'::text,
      'receptionist'::text,
      'viewer'::text
    ]));

  RAISE NOTICE 'mig 124 DOWN · profiles_role_check restaurada (sem secretaria)';
END $$;

-- ── 2. clinic_invitations_role_check · sem secretaria ─────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clinic_invitations'::regclass
      AND conname  = 'clinic_invitations_role_check'
  ) THEN
    ALTER TABLE public.clinic_invitations DROP CONSTRAINT clinic_invitations_role_check;
  END IF;

  ALTER TABLE public.clinic_invitations
    ADD CONSTRAINT clinic_invitations_role_check
    CHECK (role = ANY (ARRAY[
      'admin'::text,
      'therapist'::text,
      'receptionist'::text,
      'viewer'::text
    ]));

  RAISE NOTICE 'mig 124 DOWN · clinic_invitations_role_check restaurada (sem secretaria)';
END $$;

-- ── 3. clinic_module_permissions_role_check · sem secretaria ──────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clinic_module_permissions'::regclass
      AND conname  = 'clinic_module_permissions_role_check'
  ) THEN
    ALTER TABLE public.clinic_module_permissions DROP CONSTRAINT clinic_module_permissions_role_check;
  END IF;

  ALTER TABLE public.clinic_module_permissions
    ADD CONSTRAINT clinic_module_permissions_role_check
    CHECK (role = ANY (ARRAY[
      'owner'::text,
      'admin'::text,
      'therapist'::text,
      'receptionist'::text,
      'viewer'::text
    ]));

  RAISE NOTICE 'mig 124 DOWN · clinic_module_permissions_role_check restaurada (sem secretaria)';
END $$;

-- ── 4. invite_staff · allowlist sem secretaria ────────────────────────────

CREATE OR REPLACE FUNCTION public.invite_staff(
  p_email           text,
  p_role            text,
  p_first_name      text  DEFAULT ''::text,
  p_last_name       text  DEFAULT ''::text,
  p_permissions     jsonb DEFAULT NULL::jsonb,
  p_professional_id uuid  DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
  v_clinic_id   uuid := public.app_clinic_id();
  v_caller      uuid := auth.uid();
  v_caller_role text;
  v_raw_token   text;
  v_token_hash  text;
  v_invite_id   uuid;
  v_norm_email  text := lower(trim(p_email));
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  IF p_role NOT IN ('admin','therapist','receptionist','viewer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller
    AND clinic_id = v_clinic_id;

  IF p_role = 'admin' AND v_caller_role != 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only_owner_can_invite_admin');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(u.email) = v_norm_email
      AND p.clinic_id = v_clinic_id
      AND p.is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_member');
  END IF;

  UPDATE public.clinic_invitations
  SET accepted_at = NOW(),
      expires_at = NOW()
  WHERE clinic_id = v_clinic_id
    AND lower(email) = v_norm_email
    AND accepted_at IS NULL;

  IF p_professional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.professional_profiles
    WHERE id = p_professional_id
      AND clinic_id = v_clinic_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'professional_not_found');
  END IF;

  v_raw_token  := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(sha256(v_raw_token::bytea), 'hex');

  INSERT INTO public.clinic_invitations (
    clinic_id,
    email,
    role,
    token_hash,
    invited_by,
    module_permissions,
    professional_id
  )
  VALUES (
    v_clinic_id,
    v_norm_email,
    p_role,
    v_token_hash,
    v_caller,
    p_permissions,
    p_professional_id
  )
  RETURNING id INTO v_invite_id;

  RETURN jsonb_build_object(
    'ok',              true,
    'invite_id',       v_invite_id,
    'email',           v_norm_email,
    'role',            p_role,
    'raw_token',       v_raw_token,
    'professional_id', p_professional_id
  );
END;
$function$;

-- ── 5. update_staff_role · allowlist sem secretaria ───────────────────────

CREATE OR REPLACE FUNCTION public.update_staff_role(
  p_user_id  uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF p_new_role NOT IN ('owner','admin','therapist','receptionist','viewer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  IF p_new_role IN ('owner','admin') AND public.app_role() != 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only_owner_can_set_admin');
  END IF;

  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_change_own_role');
  END IF;

  UPDATE public.profiles
  SET role = p_new_role,
      updated_at = NOW()
  WHERE id = p_user_id
    AND clinic_id = public.app_clinic_id();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
