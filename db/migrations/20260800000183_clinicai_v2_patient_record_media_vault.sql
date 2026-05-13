-- =============================================================================
-- CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT (LOCAL · NÃO APLICADA)
-- Migration 183 · destrava `medical_record_attachments` para uso clínico seguro.
-- =============================================================================
--
-- Contexto:
--   - A tabela `public.medical_record_attachments` existia com schema mínimo
--     (id, patient_id, file_path, created_at) e 0 rows.
--   - RLS estava habilitada com **0 policies** → ninguém acessa pelo client
--     (mesmo com grants amplos · explicação: RLS bloqueia tudo sem policy).
--   - Esta migration converte a tabela em vault clínico tenant-aware,
--     reusando os helpers `app_clinic_id()` (uuid · SECURITY DEFINER) e
--     `app_role()` (text · SECURITY DEFINER) já canônicos no projeto.
--   - Storage: reusa bucket `media` (privado · path-tenant via policies
--     `Clinics can only X their own media`). Path canônico:
--       {clinic_id}/medical-records/{patient_id}/{attachment_id}/{file}
--     A primeira pasta é {clinic_id} · cumpre o predicate das policies
--     existentes: `(storage.foldername(name))[1] = app_clinic_id()::text`.
--
-- Apply: somente após autorização explícita
--   (CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_APPLY).
--
-- Rollback:
--   docs/database/rollback-notes/20260800000183_clinicai_v2_patient_record_media_vault.md
--
-- O que esta migration NÃO toca:
--   - Bucket `media` (já privado · policies tenant-aware reusadas)
--   - Hard gate clínico (`appointment_finalize`, `appointment_clinical_gate_status`,
--     `appointment_anamnesis_*`, `complete_anamnesis_form`)
--   - Painel-TV / Recepção
--   - `wa_outbox`, cron, job 71, env/secrets
--   - PROPOSED Alexa, FK procedure_id (já entregue em mig 182)
--
-- Pré-condições (validadas em preflight):
--   - public.medical_record_attachments existe · row_count=0
--   - storage.buckets WHERE id='media' · public=false
--   - app_clinic_id(), app_role() presentes
-- =============================================================================


-- ── 1) ALTER TABLE · ampliar schema mínimo ───────────────────────────────────
-- Tabela tem 0 rows · safe pra adicionar NOT NULL diretamente.
ALTER TABLE public.medical_record_attachments
  ADD COLUMN IF NOT EXISTS clinic_id uuid NOT NULL,
  ADD COLUMN IF NOT EXISTS appointment_id uuid NULL,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid NULL,
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS storage_path text NOT NULL,
  ADD COLUMN IF NOT EXISTS file_name text NOT NULL,
  ADD COLUMN IF NOT EXISTS mime_type text NOT NULL,
  ADD COLUMN IF NOT EXISTS size_bytes bigint NULL,
  ADD COLUMN IF NOT EXISTS category text NULL,
  ADD COLUMN IF NOT EXISTS description text NULL,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'clinical',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- Promover patient_id de nullable para NOT NULL (0 rows · safe)
ALTER TABLE public.medical_record_attachments
  ALTER COLUMN patient_id SET NOT NULL;

-- ── 2) Constraints (CHECK) ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_mra_storage_path_not_empty') THEN
    ALTER TABLE public.medical_record_attachments
      ADD CONSTRAINT chk_mra_storage_path_not_empty CHECK (storage_path <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_mra_file_name_not_empty') THEN
    ALTER TABLE public.medical_record_attachments
      ADD CONSTRAINT chk_mra_file_name_not_empty CHECK (file_name <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_mra_mime_type_not_empty') THEN
    ALTER TABLE public.medical_record_attachments
      ADD CONSTRAINT chk_mra_mime_type_not_empty CHECK (mime_type <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_mra_size_bytes_nonneg') THEN
    ALTER TABLE public.medical_record_attachments
      ADD CONSTRAINT chk_mra_size_bytes_nonneg CHECK (size_bytes IS NULL OR size_bytes >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_mra_visibility') THEN
    ALTER TABLE public.medical_record_attachments
      ADD CONSTRAINT chk_mra_visibility
      CHECK (visibility IN ('clinical','administrative','commercial'));
  END IF;
END $$;

-- ── 3) FKs ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mra_clinic_id_fkey') THEN
    ALTER TABLE public.medical_record_attachments
      ADD CONSTRAINT mra_clinic_id_fkey
      FOREIGN KEY (clinic_id) REFERENCES public.clinics(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT; -- bloqueia drop de clinic com attachments · audit safety
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mra_patient_id_fkey') THEN
    ALTER TABLE public.medical_record_attachments
      ADD CONSTRAINT mra_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES public.patients(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT; -- bloqueia drop de patient com attachments
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mra_appointment_id_fkey') THEN
    ALTER TABLE public.medical_record_attachments
      ADD CONSTRAINT mra_appointment_id_fkey
      FOREIGN KEY (appointment_id) REFERENCES public.appointments(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL; -- delete de appointment desvincula · preserva attachment
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mra_uploaded_by_fkey') THEN
    ALTER TABLE public.medical_record_attachments
      ADD CONSTRAINT mra_uploaded_by_fkey
      FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

-- ── 4) Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mra_clinic_patient_created
  ON public.medical_record_attachments (clinic_id, patient_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mra_appointment_id
  ON public.medical_record_attachments (appointment_id)
  WHERE appointment_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mra_clinic_id
  ON public.medical_record_attachments (clinic_id);

-- ── 5) Comments ──────────────────────────────────────────────────────────────
COMMENT ON TABLE public.medical_record_attachments IS
  'Vault clínico tenant-aware (mig 183 · CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT). '
  'Storage: bucket privado `media` · path canônico {clinic_id}/medical-records/{patient_id}/{attachment_id}/{file}. '
  'Acesso só via signed URL server-side. NUNCA expor storage_path no client.';

COMMENT ON COLUMN public.medical_record_attachments.storage_path IS
  'Path completo no bucket `media`. Formato: {clinic_id}/medical-records/{patient_id}/{attachment_id}/{file}. '
  'Primeira pasta = clinic_id (cumpre policies tenant-aware de storage.objects). '
  'NUNCA viajar pro client · sempre converter em signed URL via createSignedUrl (TTL 5min).';

COMMENT ON COLUMN public.medical_record_attachments.visibility IS
  '`clinical` (default · só clinical staff) | `administrative` | `commercial`. '
  'Refina filtros downstream sem proliferar tabelas.';

-- ── 6) updated_at trigger ────────────────────────────────────────────────────
-- Reusa pattern: NÃO criar função nova se já há `set_updated_at()` no projeto.
-- Defense-in-depth · cria função se não existir.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='set_updated_at') THEN
    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_mra_set_updated_at') THEN
    CREATE TRIGGER trg_mra_set_updated_at
    BEFORE UPDATE ON public.medical_record_attachments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ── 7) REVOKE perigoso + GRANT mínimo ────────────────────────────────────────
-- Antes da migration, `anon` tinha INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES
-- · só RLS impedia. Reduzimos a superfície zerando anon + GRANT limitado ao
-- authenticated. RLS continua sendo o gate real · isso é defense-in-depth.
REVOKE ALL ON public.medical_record_attachments FROM PUBLIC;
REVOKE ALL ON public.medical_record_attachments FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.medical_record_attachments TO authenticated;
-- service_role permanece com all (intocado · sem REVOKE específico).

-- ── 8) RLS Policies ──────────────────────────────────────────────────────────
-- Garante RLS habilitada (já estava · defense-in-depth).
ALTER TABLE public.medical_record_attachments ENABLE ROW LEVEL SECURITY;

-- 8.1 SELECT · clinical staff da própria clínica · soft-deleted oculto
CREATE POLICY mra_select_clinical_staff
  ON public.medical_record_attachments
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND deleted_at IS NULL
    AND public.app_role() IN ('owner','admin','professional','receptionist')
  );

-- 8.2 INSERT · clinical staff que escrevem dados clínicos
CREATE POLICY mra_insert_clinical_staff
  ON public.medical_record_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','professional')
  );

-- 8.3 UPDATE · clinical staff podem corrigir metadata · soft-delete usa este UPDATE
CREATE POLICY mra_update_clinical_staff
  ON public.medical_record_attachments
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','professional')
  )
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','professional')
  );

-- 8.4 service_role bypass · operations server-side (signed URL, edge functions)
CREATE POLICY mra_service_role_full
  ON public.medical_record_attachments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE intencionalmente NÃO tem policy · use soft-delete (UPDATE deleted_at).
-- Hard DELETE só via service_role/postgres em manutenção pontual.

-- ── 9) Verificação final (não-bloqueante · só para o output do apply) ──────
SELECT
  'mra_post_apply_check' AS check_id,
  jsonb_build_object(
    'columns_count', (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='medical_record_attachments'),
    'policy_count', (SELECT count(*) FROM pg_policy WHERE polrelid='public.medical_record_attachments'::regclass),
    'fk_count', (SELECT count(*) FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid WHERE src.relname='medical_record_attachments' AND c.contype='f'),
    'check_count', (SELECT count(*) FROM pg_constraint c JOIN pg_class src ON src.oid=c.conrelid WHERE src.relname='medical_record_attachments' AND c.contype='c')
  ) AS data;

-- =============================================================================
-- Pós-apply esperado:
--   columns_count  ≥ 16 (id, clinic_id, patient_id, appointment_id, uploaded_by,
--                        bucket, storage_path, file_name, mime_type, size_bytes,
--                        category, description, visibility, file_path (legacy),
--                        created_at, updated_at, deleted_at)
--   policy_count   = 4 (select/insert/update + service_role)
--   fk_count       = 4 (clinic, patient, appointment, uploaded_by)
--   check_count    = 5 (storage_path, file_name, mime_type, size_bytes, visibility) + pkey
-- =============================================================================
