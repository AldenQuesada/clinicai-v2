-- =============================================================================
-- CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_POLICY_FIX (LOCAL · NÃO APLICADA)
-- Migration 184 · corrige naming de role nas policies de
-- `public.medical_record_attachments`.
-- =============================================================================
--
-- Contexto:
--   - Mig 183 (CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_APPLY) criou 4 RLS
--     policies usando literal `'professional'` no `app_role() IN (...)`.
--   - O role canônico do projeto para clinical staff é **`therapist`**
--     (vide `apps/lara/src/lib/permissions.ts` linha 17 · `StaffRole`
--     = 'owner' | 'admin' | 'therapist' | 'receptionist' | 'viewer' | 'secretaria').
--   - Resultado pré-184:
--       owner / admin ........... acesso normal (matchavam por outros valores do IN)
--       therapist ............... bloqueado (RLS rejeita · 'professional' nunca bate)
--       receptionist ............ SELECT funciona (estava no IN do SELECT)
--   - Gap é **restritivo, não permissivo** · zero risco de privacidade.
--   - TS já alinhado ao role real (`therapist`) em
--     `_documents-actions.ts` (`WRITE_ROLES`) e `page.tsx` (`canWriteDocuments`).
--
-- O que esta migration faz:
--   - DROP IF EXISTS das 4 policies de MRA.
--   - CREATE 4 policies novas trocando `'professional'` → `'therapist'`.
--   - Demais semânticas idênticas (clinic_id = app_clinic_id, deleted_at IS NULL
--     no SELECT, DELETE bloqueado, service_role bypass).
--
-- O que esta migration NÃO toca:
--   - Schema da tabela (zero ALTER · zero ADD COLUMN · zero DROP COLUMN).
--   - Grants (anon_grants permanece 0; authenticated/service_role intactos).
--   - Triggers / indexes / constraints / FKs (mig 183 intacta).
--   - Bucket `media` e suas storage policies (35 storage policies inalteradas).
--   - Hard gate clínico (`appointment_finalize`, `appointment_clinical_gate_status`,
--     `appointment_anamnesis_*`, `complete_anamnesis_form`).
--   - `appointments.procedure_id`/FK (mig 182 intacta).
--   - `wa_outbox`, `cron`, `job 71`, env/secrets.
--
-- Apply: somente após autorização explícita
--   (`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_POLICY_FIX_APPLY`).
--
-- Rollback note:
--   docs/database/rollback-notes/20260800000184_clinicai_v2_media_vault_policy_fix.md
--
-- Estilo:
--   - DROP POLICY IF EXISTS · idempotente.
--   - CREATE POLICY (sem OR REPLACE · PG não suporta · daí o DROP prévio).
--   - Zero CASCADE.
-- =============================================================================

-- ── 1) DROP das 4 policies atuais (idempotente) ──────────────────────────────
DROP POLICY IF EXISTS mra_select_clinical_staff ON public.medical_record_attachments;
DROP POLICY IF EXISTS mra_insert_clinical_staff ON public.medical_record_attachments;
DROP POLICY IF EXISTS mra_update_clinical_staff ON public.medical_record_attachments;
DROP POLICY IF EXISTS mra_service_role_full     ON public.medical_record_attachments;

-- ── 2) Recreate · `professional` → `therapist` ───────────────────────────────

-- 2.1 SELECT · clinical staff (owner/admin/therapist/receptionist)
CREATE POLICY mra_select_clinical_staff
  ON public.medical_record_attachments
  FOR SELECT
  TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND deleted_at IS NULL
    AND public.app_role() IN ('owner','admin','therapist','receptionist')
  );

-- 2.2 INSERT · apenas clinical staff que escreve dados clínicos
CREATE POLICY mra_insert_clinical_staff
  ON public.medical_record_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','therapist')
  );

-- 2.3 UPDATE · mesmo subset · suporta também soft-delete (UPDATE deleted_at)
CREATE POLICY mra_update_clinical_staff
  ON public.medical_record_attachments
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','therapist')
  )
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','therapist')
  );

-- 2.4 service_role · bypass total (operações server-side · signed URL,
--     cleanup físico, edge functions)
CREATE POLICY mra_service_role_full
  ON public.medical_record_attachments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- DELETE intencionalmente continua sem policy · soft-delete obrigatório
-- (UPDATE deleted_at). Hard DELETE só via service_role/postgres em
-- manutenção pontual.

-- =============================================================================
-- Pós-apply esperado:
--   policy_count                 = 4 (inalterado)
--   anon_grants                  = 0 (inalterado)
--   current_policies_use_professional = false ✓
--   current_policies_use_therapist    = true  ✓
--   hard gate clínico            · intacto
--   storage_media bucket         · intacto
--   medical_record_attachments rows · inalterado (esta migration NÃO toca dados)
-- =============================================================================
