# Rollback notes · mig 183 · CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT

> Migration: `db/migrations/20260800000183_clinicai_v2_patient_record_media_vault.sql`
> · prepared local (LOCAL · NOT APPLIED até autorização explícita
> `CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_APPLY`).

## O que a migration adiciona (quando aplicada)

### Schema em `public.medical_record_attachments`

| Coluna | Tipo | Notas |
|---|---|---|
| `clinic_id` | uuid NOT NULL | FK → `clinics(id)` · ON DELETE RESTRICT |
| `appointment_id` | uuid NULL | FK → `appointments(id)` · ON DELETE SET NULL |
| `uploaded_by` | uuid NULL | FK → `auth.users(id)` · ON DELETE SET NULL |
| `bucket` | text NOT NULL DEFAULT `'media'` | sempre privado |
| `storage_path` | text NOT NULL | `medical-records/{clinic_id}/{patient_id}/{id}/{file}` |
| `file_name` | text NOT NULL | nome lógico para UI |
| `mime_type` | text NOT NULL | MIME canônico |
| `size_bytes` | bigint NULL | informativo · não enforçado |
| `category` | text NULL | rótulo livre (exame, laudo, foto pré/pós, etc.) |
| `description` | text NULL | obs do clínico |
| `visibility` | text NOT NULL DEFAULT `'clinical'` | `clinical` / `administrative` / `commercial` |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | mantido por trigger `set_updated_at` |
| `deleted_at` | timestamptz NULL | soft-delete (não há policy de DELETE) |

`patient_id` é promovido de nullable para **NOT NULL** (0 rows · safe).

### Constraints

- `chk_mra_storage_path_not_empty`
- `chk_mra_file_name_not_empty`
- `chk_mra_mime_type_not_empty`
- `chk_mra_size_bytes_nonneg`
- `chk_mra_visibility` (`clinical | administrative | commercial`)

### Indexes

- `idx_mra_clinic_patient_created` (parcial · WHERE deleted_at IS NULL)
- `idx_mra_appointment_id` (parcial · WHERE appointment_id IS NOT NULL AND deleted_at IS NULL)
- `idx_mra_clinic_id` (básico para joins)

### Trigger

- `trg_mra_set_updated_at` · BEFORE UPDATE · usa `public.set_updated_at()` (cria a função se não existir · idempotente)

### Grants

- `REVOKE ALL ON medical_record_attachments FROM PUBLIC, anon` (reduz superfície · anon hoje tem todos privilégios mesmo com RLS)
- `GRANT SELECT, INSERT, UPDATE ON medical_record_attachments TO authenticated`
- `service_role` intocado (mantém ALL)

### RLS Policies (4 · idempotente)

1. **`mra_select_clinical_staff`** (SELECT · authenticated) · `clinic_id=app_clinic_id() AND deleted_at IS NULL AND app_role() IN ('owner','admin','professional','receptionist')`
2. **`mra_insert_clinical_staff`** (INSERT · authenticated) · `clinic_id=app_clinic_id() AND app_role() IN ('owner','admin','professional')`
3. **`mra_update_clinical_staff`** (UPDATE · authenticated) · idem INSERT roles · também escrita
4. **`mra_service_role_full`** (ALL · service_role) · bypass operacional

DELETE intencionalmente não tem policy · use soft-delete (`UPDATE deleted_at`).

### Storage

A migration **NÃO mexe** em `storage.buckets` ou `storage.objects`:
- Bucket `media` já é privado.
- Policies `Clinics can only read/update/delete their own media` já são
  tenant-aware via `(storage.foldername(name))[1] = app_clinic_id()::text`.
- Path canônico (`medical-records/{clinic_id}/...`) cumpre essa convenção:
  primeira pasta é sempre `clinic_id` · políticas existentes cobrem.

## O que a migration NÃO toca

- `storage.buckets` (zero criação · zero alteração de visibilidade)
- `storage.objects` (zero policy nova)
- Hard gate clínico (`appointment_finalize`, `appointment_clinical_gate_status`, `appointment_anamnesis_upsert`, `appointment_anamnesis_mark_complete`, `complete_anamnesis_form`)
- `wa_outbox` · cron · job 71 · env/secrets
- `medical_record_attachments.file_path` legacy (mantido temporariamente · novos uploads usam `storage_path` · cleanup em fase futura)
- Painel-TV / Recepção

## Como reverter (rollback de emergência)

Migration é incremental e segura · zero rows na tabela antes do apply, zero
risco de perda de dado se rollback executado pouco depois do apply. Se já
houver uploads quando o rollback for executado, **fazer backup do bucket
`media/medical-records/`** antes de qualquer DROP COLUMN.

```sql
-- 1. Remover policies (RLS continua habilitado · zero policy = inacessível)
DROP POLICY IF EXISTS mra_select_clinical_staff   ON public.medical_record_attachments;
DROP POLICY IF EXISTS mra_insert_clinical_staff   ON public.medical_record_attachments;
DROP POLICY IF EXISTS mra_update_clinical_staff   ON public.medical_record_attachments;
DROP POLICY IF EXISTS mra_service_role_full       ON public.medical_record_attachments;

-- 2. Remover trigger
DROP TRIGGER IF EXISTS trg_mra_set_updated_at ON public.medical_record_attachments;

-- 3. Remover indexes
DROP INDEX IF EXISTS public.idx_mra_clinic_patient_created;
DROP INDEX IF EXISTS public.idx_mra_appointment_id;
DROP INDEX IF EXISTS public.idx_mra_clinic_id;

-- 4. Remover FKs
ALTER TABLE public.medical_record_attachments
  DROP CONSTRAINT IF EXISTS mra_clinic_id_fkey,
  DROP CONSTRAINT IF EXISTS mra_patient_id_fkey,
  DROP CONSTRAINT IF EXISTS mra_appointment_id_fkey,
  DROP CONSTRAINT IF EXISTS mra_uploaded_by_fkey;

-- 5. Remover constraints CHECK
ALTER TABLE public.medical_record_attachments
  DROP CONSTRAINT IF EXISTS chk_mra_storage_path_not_empty,
  DROP CONSTRAINT IF EXISTS chk_mra_file_name_not_empty,
  DROP CONSTRAINT IF EXISTS chk_mra_mime_type_not_empty,
  DROP CONSTRAINT IF EXISTS chk_mra_size_bytes_nonneg,
  DROP CONSTRAINT IF EXISTS chk_mra_visibility;

-- 6. Re-permitir patient_id nullable
ALTER TABLE public.medical_record_attachments
  ALTER COLUMN patient_id DROP NOT NULL;

-- 7. Drop colunas novas (zero dados perdidos se rollback for imediato pós-apply)
ALTER TABLE public.medical_record_attachments
  DROP COLUMN IF EXISTS clinic_id,
  DROP COLUMN IF EXISTS appointment_id,
  DROP COLUMN IF EXISTS uploaded_by,
  DROP COLUMN IF EXISTS bucket,
  DROP COLUMN IF EXISTS storage_path,
  DROP COLUMN IF EXISTS file_name,
  DROP COLUMN IF EXISTS mime_type,
  DROP COLUMN IF EXISTS size_bytes,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS visibility,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS deleted_at;

-- 8. Grants para anon (não recomendado · só se rollback exigir 1:1 com pré-apply)
-- GRANT ALL ON public.medical_record_attachments TO anon;  -- INSEGURO · ponderar
```

**Cuidados:**

- Se houver uploads em produção, **NÃO** rodar passo 7 sem backup.
- Objetos físicos em `storage.objects` no path `medical-records/...` precisam
  ser deletados separadamente (ou movidos para backup) · NÃO faz parte deste
  rollback automático.
- Não reverter os grants de `anon` (passo 8) · pré-apply era cenário inseguro.

## Validação pós-apply esperada

- `medical_record_attachments_rls_enabled`: true
- `medical_record_attachments_policy_count`: **4**
- `medical_record_attachments_has_tenant_guard`: true (`clinic_id` NOT NULL com FK)
- `medical_record_attachments_has_storage_path`: true
- `media_vault_migration_created_not_applied`: false (após apply)
- `tracker_183` registrado em `supabase_migrations.schema_migrations`
- Hard gate clínico intacto
- Bucket `media` continua privado · policies existentes intactas
