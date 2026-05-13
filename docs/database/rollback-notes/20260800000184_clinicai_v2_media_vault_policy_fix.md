# Rollback notes · mig 184 · CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_POLICY_FIX

> Migration: `db/migrations/20260800000184_clinicai_v2_media_vault_policy_fix.sql`
> · prepared local (LOCAL · NOT APPLIED até autorização explícita
> `CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_POLICY_FIX_APPLY`).

## O que a migration faz (quando aplicada)

- DROP IF EXISTS das 4 RLS policies de `public.medical_record_attachments`:
  - `mra_select_clinical_staff`
  - `mra_insert_clinical_staff`
  - `mra_update_clinical_staff`
  - `mra_service_role_full`
- CREATE 4 policies novas trocando role literal `'professional'` → `'therapist'`.

Semântica preservada:

| Policy | USING / CHECK | Roles habilitados |
|---|---|---|
| `mra_select_clinical_staff` | `clinic_id=app_clinic_id() AND deleted_at IS NULL AND app_role() IN (...)` | owner, admin, **therapist**, receptionist |
| `mra_insert_clinical_staff` | `clinic_id=app_clinic_id() AND app_role() IN (...)` | owner, admin, **therapist** |
| `mra_update_clinical_staff` | idem (USING + WITH CHECK) | owner, admin, **therapist** |
| `mra_service_role_full` | `true / true` | service_role |

DELETE continua sem policy · soft-delete obrigatório.

## O que a migration NÃO toca

- Schema da tabela (zero ALTER · zero ADD COLUMN · zero DROP COLUMN).
- Grants (anon segue revogado · authenticated/service_role inalterados).
- Triggers / indexes / constraints / FKs (mig 183 intacta).
- Bucket `media` e storage policies (35 policies em `storage.objects` inalteradas).
- Hard gate clínico (5/5 funcs).
- `appointments.procedure_id`/FK (mig 182).
- `wa_outbox`, `cron`, `job 71`, env/secrets.

## Sem dado alterado

A migration toca **apenas RLS policies** · zero linha lida/escrita em
`medical_record_attachments`. Aplicar ou reverter não corre risco de
perda/corrupção de dados.

## Como reverter (rollback de emergência)

Voltar para o estado pré-184 (com `'professional'` literal) reativa o gap
restritivo · therapist volta a ser bloqueado. Owner/admin/receptionist
continuam funcionando. Receita:

```sql
-- 1. Remover policies "corrigidas"
DROP POLICY IF EXISTS mra_select_clinical_staff ON public.medical_record_attachments;
DROP POLICY IF EXISTS mra_insert_clinical_staff ON public.medical_record_attachments;
DROP POLICY IF EXISTS mra_update_clinical_staff ON public.medical_record_attachments;
DROP POLICY IF EXISTS mra_service_role_full     ON public.medical_record_attachments;

-- 2. Recriar as policies originais (vide mig 183)
CREATE POLICY mra_select_clinical_staff
  ON public.medical_record_attachments
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND deleted_at IS NULL
    AND public.app_role() IN ('owner','admin','professional','receptionist')
  );

CREATE POLICY mra_insert_clinical_staff
  ON public.medical_record_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','professional')
  );

CREATE POLICY mra_update_clinical_staff
  ON public.medical_record_attachments
  FOR UPDATE TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','professional')
  )
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','professional')
  );

CREATE POLICY mra_service_role_full
  ON public.medical_record_attachments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

**Aviso:** rollback bloqueia therapist novamente. Use apenas se houver
problema descoberto pós-apply.

## Por que não há `.down.sql` automático

Operação somente em policies · receita simétrica é trivial e
auto-documentada (vide acima). Manter um `.down.sql` paralelo aumenta
manutenção e divergência. O ground truth é esta nota.

## Validação pós-apply esperada

- `medical_record_attachments_policy_count`: 4 (inalterado)
- `medical_record_attachments_anon_grants`: 0 (inalterado)
- `current_policies_use_professional`: **false**
- `current_policies_use_therapist`: **true**
- `tracker_184` registrado em `supabase_migrations.schema_migrations`
- Hard gate clínico intacto
- Bucket `media` privado · 35 storage policies intactas
- Zero `medical_record_attachments` rows alteradas (a fase é só de policies)
