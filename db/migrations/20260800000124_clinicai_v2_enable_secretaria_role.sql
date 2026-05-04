-- ============================================================================
-- Habilitar role 'secretaria' end-to-end (3 CHECKs + 2 RPCs)
-- ============================================================================
--
-- Contexto · audit Auth/RBAC 2026-05-04:
--
-- A role 'secretaria' (Mig 97 · 2026-05-03) estava parcialmente implementada:
--   ✅ profiles_role_check já aceitava
--   ✅ apps/lara/src/lib/permissions.ts reconhece com hierarquia/ações dedicadas
--      (secretaria:view-inbox, agenda:view-secretaria, patients:view-secretaria)
--   ❌ clinic_invitations_role_check rejeitava
--   ❌ clinic_module_permissions_role_check rejeitava
--   ❌ invite_staff RPC rejeitava com 'invalid_role'
--   ❌ update_staff_role RPC rejeitava com 'invalid_role'
--
-- Resultado prático: era impossível convidar uma secretária via UI ou
-- promover usuário existente para a role.
--
-- Esta mig versiona a correção JÁ aplicada manualmente em prod hoje:
-- alinha as 3 CHECKs e os 2 allowlists de RPC pra incluir 'secretaria'.
--
-- Estado em prod no momento de versionar (audit 2026-05-04):
--   profiles_role_check                  → owner, admin, therapist, receptionist, viewer, secretaria
--   clinic_invitations_role_check        → admin, therapist, receptionist, viewer, secretaria
--   clinic_module_permissions_role_check → owner, admin, therapist, receptionist, viewer, secretaria
--   invite_staff (allowlist)             → admin, therapist, receptionist, viewer, secretaria
--   update_staff_role (allowlist)        → owner, admin, therapist, receptionist, viewer, secretaria
--
-- Idempotente: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT idempotente via DO
-- block · CREATE OR REPLACE FUNCTION é idempotente por natureza.
--
-- O QUE NÃO FAZ:
--   - NÃO cria usuários
--   - NÃO altera profiles existentes
--   - NÃO altera convites existentes
--   - NÃO altera professional_profiles
--   - NÃO toca em auth.users
--   - NÃO mexe em rows de clinic_module_permissions / user_module_permissions

BEGIN;

-- ── 1. profiles_role_check · adiciona secretaria ──────────────────────────

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
      'viewer'::text,
      'secretaria'::text
    ]));

  RAISE NOTICE 'mig 124 · profiles_role_check com secretaria · OK';
END $$;

-- ── 2. clinic_invitations_role_check · adiciona secretaria ────────────────

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
      'viewer'::text,
      'secretaria'::text
    ]));

  RAISE NOTICE 'mig 124 · clinic_invitations_role_check com secretaria · OK';
END $$;

-- ── 3. clinic_module_permissions_role_check · adiciona secretaria ─────────

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
      'viewer'::text,
      'secretaria'::text
    ]));

  RAISE NOTICE 'mig 124 · clinic_module_permissions_role_check com secretaria · OK';
END $$;

-- ── 4. invite_staff · allowlist com secretaria ────────────────────────────
-- Corpo preservado · única mudança vs versão anterior: 'secretaria' adicionada
-- ao IF NOT IN do p_role check.

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

  -- Allowlist atualizada: inclui 'secretaria' (mig 124)
  IF p_role NOT IN ('admin','therapist','receptionist','viewer','secretaria') THEN
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

  -- Reaproveita convite pendente para o mesmo email+clinic sem duplicar.
  UPDATE public.clinic_invitations
  SET accepted_at = NOW(),
      expires_at = NOW()
  WHERE clinic_id = v_clinic_id
    AND lower(email) = v_norm_email
    AND accepted_at IS NULL;

  -- Valida professional_id pertence a esta clínica.
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

-- ── 5. update_staff_role · allowlist com secretaria ───────────────────────
-- Corpo preservado · única mudança vs versão anterior: 'secretaria' adicionada
-- ao IF NOT IN do p_new_role check.

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
  -- Allowlist atualizada: inclui 'secretaria' (mig 124)
  IF p_new_role NOT IN ('owner','admin','therapist','receptionist','viewer','secretaria') THEN
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

-- ── 6. Sanity final ───────────────────────────────────────────────────────

DO $$
DECLARE
  v_profiles_def         text;
  v_invitations_def      text;
  v_module_perms_def     text;
  v_invite_def           text;
  v_update_role_def      text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_profiles_def
  FROM pg_constraint
  WHERE conrelid='public.profiles'::regclass AND conname='profiles_role_check';

  SELECT pg_get_constraintdef(oid) INTO v_invitations_def
  FROM pg_constraint
  WHERE conrelid='public.clinic_invitations'::regclass AND conname='clinic_invitations_role_check';

  SELECT pg_get_constraintdef(oid) INTO v_module_perms_def
  FROM pg_constraint
  WHERE conrelid='public.clinic_module_permissions'::regclass AND conname='clinic_module_permissions_role_check';

  IF v_profiles_def NOT LIKE '%secretaria%' THEN
    RAISE EXCEPTION 'mig 124 · profiles_role_check sem secretaria · def=%', v_profiles_def;
  END IF;
  IF v_invitations_def NOT LIKE '%secretaria%' THEN
    RAISE EXCEPTION 'mig 124 · clinic_invitations_role_check sem secretaria · def=%', v_invitations_def;
  END IF;
  IF v_module_perms_def NOT LIKE '%secretaria%' THEN
    RAISE EXCEPTION 'mig 124 · clinic_module_permissions_role_check sem secretaria · def=%', v_module_perms_def;
  END IF;

  SELECT pg_get_functiondef(oid) INTO v_invite_def
  FROM pg_proc
  WHERE pronamespace='public'::regnamespace AND proname='invite_staff';
  IF v_invite_def NOT LIKE '%secretaria%' THEN
    RAISE EXCEPTION 'mig 124 · invite_staff sem secretaria no allowlist';
  END IF;

  SELECT pg_get_functiondef(oid) INTO v_update_role_def
  FROM pg_proc
  WHERE pronamespace='public'::regnamespace AND proname='update_staff_role';
  IF v_update_role_def NOT LIKE '%secretaria%' THEN
    RAISE EXCEPTION 'mig 124 · update_staff_role sem secretaria no allowlist';
  END IF;

  RAISE NOTICE 'mig 124 · 3 CHECKs + 2 RPCs com secretaria · OK';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
