-- ============================================================================
-- Migration 180 · clinicai-v2 · PATIENT PROFILE + RECEPTION PHOTO CONSENT
-- ============================================================================
--
-- Propósito (CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_BASE):
--   Base do prontuário/cadastro estendido da paciente · foco em:
--     - Foto oficial (path no storage privado `media`)
--     - Consentimento explícito para exibição na recepção/TV
--     - Preferência de nome de exibição
--     - Flag de boas-vindas (welcome) + estilo de animação
--   Painel-TV (já entregue em 2ALEXA.2) é minimalista hoje · próxima fase
--   evolui pra consumir foto+consent via `getReceptionDisplayProfile()`.
--
-- DESIGN:
--   - Tabela 1:1 com `patients` via UNIQUE(patient_id)
--   - Multi-tenant via clinic_id + RLS
--   - Storage: reusa bucket privado `media` com prefixo
--     `patient-profiles/{clinic_id}/{patient_id}/...`
--   - Consentimento LGPD-friendly: granted/revoked com timestamps + auditor
--   - Welcome só fica true quando consent=granted AND photo_path NOT NULL
--     (enforced via CHECK constraint cross-coluna)
--
-- O QUE NÃO FAZ:
--   - Não cria coluna em `patients` (preserva tabela canon)
--   - Não cria novo bucket (reusa privado existente)
--   - Não busca foto externa (Instagram/Facebook/WhatsApp)
--   - Não popula nenhuma row · só schema
--   - Não dispara WhatsApp/provider/cron
--
-- ROLLBACK: down DROP TABLE + DROP POLICIES.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABELA · patient_profiles_extended
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.patient_profiles_extended (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                       uuid NOT NULL,
  patient_id                      uuid NOT NULL,

  -- Display preferences
  display_name                    text,
  preferred_name                  text,

  -- Photo (path no bucket privado `media` · NUNCA URL publica)
  profile_photo_path              text,
  profile_photo_uploaded_by       uuid,
  profile_photo_uploaded_at       timestamptz,

  -- Reception preferences
  reception_welcome_enabled       boolean NOT NULL DEFAULT false,
  reception_photo_consent_status  text    NOT NULL DEFAULT 'none',
  reception_photo_consent_at      timestamptz,
  reception_photo_consent_recorded_by uuid,
  reception_photo_consent_revoked_at  timestamptz,
  reception_photo_consent_note    text,
  reception_animation_style       text NOT NULL DEFAULT 'premium_soft',

  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  -- 1:1 com patients
  CONSTRAINT patient_profiles_extended_patient_id_unique UNIQUE (patient_id),

  -- Enums via CHECK
  CONSTRAINT chk_pp_consent_status CHECK (
    reception_photo_consent_status IN ('none','granted','revoked')
  ),
  CONSTRAINT chk_pp_animation_style CHECK (
    reception_animation_style IN ('premium_soft','premium_glow','premium_clean')
  ),

  -- Consistência: granted → consent_at NOT NULL
  CONSTRAINT chk_pp_granted_has_consent_at CHECK (
    reception_photo_consent_status != 'granted'
    OR reception_photo_consent_at IS NOT NULL
  ),

  -- Consistência: welcome enabled → consent=granted AND photo NOT NULL
  CONSTRAINT chk_pp_welcome_requires_consent_and_photo CHECK (
    reception_welcome_enabled = false
    OR (
      reception_photo_consent_status = 'granted'
      AND profile_photo_path IS NOT NULL
    )
  ),

  -- Consistência: revoked → welcome OFF
  CONSTRAINT chk_pp_revoked_disables_welcome CHECK (
    reception_photo_consent_status != 'revoked'
    OR reception_welcome_enabled = false
  )
);

-- ── FK patient_id (deferred · pra suportar fixtures em smoke) ──────────────
ALTER TABLE public.patient_profiles_extended
  ADD CONSTRAINT patient_profiles_extended_patient_fk
  FOREIGN KEY (patient_id) REFERENCES public.patients(id)
  ON DELETE CASCADE;

ALTER TABLE public.patient_profiles_extended
  ADD CONSTRAINT patient_profiles_extended_clinic_fk
  FOREIGN KEY (clinic_id) REFERENCES public.clinics(id)
  ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pp_extended_clinic
  ON public.patient_profiles_extended (clinic_id);
CREATE INDEX IF NOT EXISTS idx_pp_extended_patient
  ON public.patient_profiles_extended (patient_id);
CREATE INDEX IF NOT EXISTS idx_pp_extended_welcome_ready
  ON public.patient_profiles_extended (clinic_id, reception_welcome_enabled)
  WHERE reception_welcome_enabled = true;

COMMENT ON TABLE public.patient_profiles_extended IS
  'Mig 180 (CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_BASE) · cadastro estendido '
  '1:1 com patients · foto/consent/welcome pra recepção. Painel-TV consome via '
  'getReceptionDisplayProfile (só retorna foto se welcome=true AND consent=granted).';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. RLS · multi-tenant + role gate
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.patient_profiles_extended ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated da clínica
CREATE POLICY pp_extended_select ON public.patient_profiles_extended
  FOR SELECT TO authenticated
  USING (clinic_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'clinic_id', '')::uuid);

-- INSERT/UPDATE: owner/admin/receptionist
CREATE POLICY pp_extended_insert ON public.patient_profiles_extended
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'clinic_id', '')::uuid
    AND coalesce(current_setting('request.jwt.claims', true)::jsonb->>'app_role', '') IN ('owner','admin','receptionist')
  );

CREATE POLICY pp_extended_update ON public.patient_profiles_extended
  FOR UPDATE TO authenticated
  USING (
    clinic_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'clinic_id', '')::uuid
    AND coalesce(current_setting('request.jwt.claims', true)::jsonb->>'app_role', '') IN ('owner','admin','receptionist')
  )
  WITH CHECK (
    clinic_id = coalesce(current_setting('request.jwt.claims', true)::jsonb->>'clinic_id', '')::uuid
    AND coalesce(current_setting('request.jwt.claims', true)::jsonb->>'app_role', '') IN ('owner','admin','receptionist')
  );

-- service_role bypass para emergency/admin direto
CREATE POLICY pp_extended_service ON public.patient_profiles_extended
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

GRANT SELECT, INSERT, UPDATE ON public.patient_profiles_extended TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_profiles_extended TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS pp_extended_set_updated_at ON public.patient_profiles_extended;
CREATE TRIGGER pp_extended_set_updated_at
  BEFORE UPDATE ON public.patient_profiles_extended
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ────────────────────────────────────────────────────────────────────────────
-- 4. SANITY DO BLOCK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_table_ok boolean;
  v_constraints_count integer;
  v_policies_count integer;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='patient_profiles_extended')
    INTO v_table_ok;
  IF NOT v_table_ok THEN
    RAISE EXCEPTION 'sanity: patient_profiles_extended não criada';
  END IF;

  SELECT count(*) INTO v_constraints_count
  FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
  WHERE r.relname='patient_profiles_extended' AND c.contype='c';
  IF v_constraints_count < 4 THEN
    RAISE EXCEPTION 'sanity: faltam CHECK constraints · count=%', v_constraints_count;
  END IF;

  SELECT count(*) INTO v_policies_count
  FROM pg_policy WHERE polrelid='public.patient_profiles_extended'::regclass;
  IF v_policies_count < 3 THEN
    RAISE EXCEPTION 'sanity: faltam RLS policies · count=%', v_policies_count;
  END IF;

  RAISE NOTICE 'mig 180 · patient_profiles_extended OK · % CHECKs · % policies', v_constraints_count, v_policies_count;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
