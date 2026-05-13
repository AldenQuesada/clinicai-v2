# CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_POLICY_FIX · Corrigir role canônico nas policies do vault

> Migration `db/migrations/20260800000184_clinicai_v2_media_vault_policy_fix.sql`
> criada local · **NÃO APLICADA**. Troca o literal `'professional'` por
> `'therapist'` nas 4 RLS policies de `medical_record_attachments` (mig 183),
> alinhando o banco ao role canônico do projeto. Zero alteração em schema,
> grants, storage, código TS ou UI.

---

## 1 · Objetivo

Corrigir o gap de naming entre as policies criadas na mig 183 e o role
canônico `therapist`. Owner/admin/receptionist seguem operando · therapist
passa a ser reconhecido pela RLS após apply.

---

## 2 · Contexto do gap

| Camada | Estado pré-184 |
|---|---|
| `apps/lara/src/lib/permissions.ts` | `StaffRole = 'owner' \| 'admin' \| 'therapist' \| 'receptionist' \| 'viewer' \| 'secretaria'` |
| `_documents-actions.ts` `WRITE_ROLES` | `['owner','admin','therapist']` ✓ |
| `page.tsx` `canWriteDocuments` | usa `'therapist'` ✓ |
| RLS `mra_select_clinical_staff` | `IN ('owner','admin',`**`'professional'`**`,'receptionist')` ✗ |
| RLS `mra_insert_clinical_staff` | `IN ('owner','admin',`**`'professional'`**`)` ✗ |
| RLS `mra_update_clinical_staff` | idem (USING + CHECK) ✗ |
| RLS `mra_service_role_full` | `true` / `true` ✓ |

### Estado de acesso pré-184

| Role | SELECT | INSERT | UPDATE |
|---|---|---|---|
| owner | ✓ | ✓ | ✓ |
| admin | ✓ | ✓ | ✓ |
| **therapist** | **✗** (bloqueado por RLS) | **✗** | **✗** |
| receptionist | ✓ (estava no SELECT IN) | bloqueado (intencional) | bloqueado (intencional) |
| anon | bloqueado (grants revogados + sem policy) | bloqueado | bloqueado |
| service_role | bypass | bypass | bypass |

---

## 3 · Por que é gap restritivo (não permissivo)

- Therapist é **bloqueado** pela RLS · não tem acesso indevido.
- Nenhum role ganhou privilégio que não devia ter.
- Sem documento clínico vazado, sem URL pública, sem path bruto exposto.
- TS já trata therapist como autorizado e gera UI com botões habilitados;
  ao clicar, RLS rejeita server-side e retorna erro.
- Owner/admin seguem fluxo completo · receptionist segue só SELECT.

Logo: **zero risco de privacidade**, mas há limitação operacional para
clínica que dependa de therapists fazerem upload/soft-delete.

---

## 4 · Auditoria pré-184 (read-only · executada)

```json
{
  "mra_policy_count": 4,
  "mra_anon_grants": 0,
  "mra_policies_full": [
    {"name":"mra_insert_clinical_staff","cmd":"a","check":"... IN ('owner','admin','professional')"},
    {"name":"mra_select_clinical_staff","cmd":"r","qual":"... IN ('owner','admin','professional','receptionist')"},
    {"name":"mra_service_role_full","cmd":"*","qual":"true","check":"true"},
    {"name":"mra_update_clinical_staff","cmd":"w","qual/check":"... IN ('owner','admin','professional')"}
  ],
  "current_policies_use_professional": true,
  "current_policies_use_therapist": false,
  "storage_media_private": true,
  "storage_policy_count": 35,
  "hard_gate_untouched": true,
  "tracker_183_present": true,
  "tracker_184_already": false,
  "can_continue": true
}
```

Tudo OK · cleared para preparar a mig 184.

---

## 5 · Migration 184 · escopo

Arquivo: `db/migrations/20260800000184_clinicai_v2_media_vault_policy_fix.sql`

```sql
-- 1. DROP (idempotente)
DROP POLICY IF EXISTS mra_select_clinical_staff ON public.medical_record_attachments;
DROP POLICY IF EXISTS mra_insert_clinical_staff ON public.medical_record_attachments;
DROP POLICY IF EXISTS mra_update_clinical_staff ON public.medical_record_attachments;
DROP POLICY IF EXISTS mra_service_role_full     ON public.medical_record_attachments;

-- 2. CREATE com role canônico
CREATE POLICY mra_select_clinical_staff
  ON public.medical_record_attachments FOR SELECT TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND deleted_at IS NULL
    AND public.app_role() IN ('owner','admin','therapist','receptionist')
  );

CREATE POLICY mra_insert_clinical_staff
  ON public.medical_record_attachments FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','therapist')
  );

CREATE POLICY mra_update_clinical_staff
  ON public.medical_record_attachments FOR UPDATE TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','therapist')
  )
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','therapist')
  );

CREATE POLICY mra_service_role_full
  ON public.medical_record_attachments FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

DELETE continua **sem policy** · soft-delete obrigatório.

---

## 6 · Trilha escolhida

**Trilha A · migration nullable de policies só · zero schema change.**

Razões:

1. Operação puramente lógica · apenas RLS.
2. Zero linha tocada · `medical_record_attachments` continua com `documents_rows_total=0`.
3. Storage intocado · bucket `media` continua privado · 35 storage policies inalteradas.
4. UI/code TS já estão alinhados ao `therapist` (fase WIRE).

Migration **idempotente** (DROP IF EXISTS + CREATE). Sem CASCADE.
Sem grants novos · sem ALTER TABLE.

---

## 7 · Policies corrigidas (resumo)

| Policy | Comando | Roles após 184 |
|---|---|---|
| `mra_select_clinical_staff` | SELECT | owner, admin, **therapist**, receptionist |
| `mra_insert_clinical_staff` | INSERT | owner, admin, **therapist** |
| `mra_update_clinical_staff` | UPDATE | owner, admin, **therapist** (USING+CHECK) |
| `mra_service_role_full` | ALL | service_role (bypass) |
| DELETE | — | **bloqueado** · soft-delete obrigatório |

---

## 8 · O que NÃO muda

- Schema da tabela (17 colunas, 4 FKs, 5 CHECKs, 4 indexes, trigger updated_at)
- Grants (`anon_grants=0` mantido · authenticated/service_role inalterados)
- Bucket `media` (privado · 35 storage policies em `storage.objects` intactas)
- UI Documentos (continua usando `therapist` como role de escrita)
- `MedicalRecordAttachmentRepository` (zero mudança em DTOs/métodos)
- `_documents-actions.ts` `WRITE_ROLES` (já era `'therapist'`)
- Hard gate clínico (`appointment_finalize`, `appointment_clinical_gate_status`, `appointment_anamnesis_*`, `complete_anamnesis_form`)
- `appointments.procedure_id`/FK (mig 182)
- `wa_outbox`, cron, job 71, env/secrets

---

## 9 · Storage intocado

- `media` continua privado (`public=false`)
- 35 storage policies em `storage.objects` permanecem
- Path canônico `{clinic_id}/medical-records/{patient_id}/{attachment_id}/{file}` continua cumprindo policies tenant-aware do bucket

---

## 10 · Código intocado

Apenas SQL/docs alterados. Zero TypeScript. Não houve `pnpm db:types`
necessário (types do schema não mudaram · só policies internas do banco).

---

## 11 · Plano de apply

1. **`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_POLICY_FIX_PUSH`** · publicar migration + docs.
2. **`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_POLICY_FIX_APPLY`** · rodar `apply-migration.mjs db/migrations/20260800000184_*.sql` + registrar tracker 184 + revalidar.
3. (Opcional) **`MEDIA_VAULT_SMOKE_BROWSER`** com fixture therapist · confirma que UI funciona end-to-end pós-correção.

---

## 12 · Validações executadas

| Validation | Resultado |
|---|---|
| `git diff --check` | sem warnings (apenas CRLF auto) |
| SQL validation `phase-patient-record-media-vault-policy-fix-validation.sql` | final_flags green |
| Typecheck | **não executado** · zero TS alterado (justificado) |

Flags chave pre-apply:

- `worker71_off`: true
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `cron_with_provider_call`: 0
- `hard_gate_untouched`: **true**
- `medical_record_attachments_policy_count`: 4
- `medical_record_attachments_anon_grants`: 0
- **`current_policies_use_professional`: true**
- **`current_policies_use_therapist`: false**
- `storage_media_private`: true
- `storage_policy_count`: 35
- `migration_184_created_not_applied`: **true**
- **`can_continue`: true**

Pós-apply esperado:
- `current_policies_use_professional`: **false**
- `current_policies_use_therapist`: **true**
- `policy_count` continua **4**

---

## 13 · Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Race condition entre DROP e CREATE deixar tabela temporariamente sem policy | baixíssimo | Management API roda como transação · Postgres garante atomicidade |
| Outras tabelas usarem literal `'professional'` por erro | trivial | Verificado: zero referência a `'professional'` no app TS exceto comentário no `_documents-actions.ts` linha 41 |
| Therapist começar a operar errado pós-apply | baixíssimo | UI já estava habilitada para therapist · mig 184 destrava o backend |

---

## 14 · Próximos passos

1. **`MEDIA_VAULT_POLICY_FIX_PUSH`** (publicar)
2. **`MEDIA_VAULT_POLICY_FIX_APPLY`** (apply + tracker 184 + validação pós-apply)
3. (Opcional) **`MEDIA_VAULT_SMOKE_BROWSER`** com fixture therapist
4. (Futuro) limpeza do comentário em `_documents-actions.ts` referindo o gap após validação pós-apply

---

## 15 · Veredito

**PASS_CRM_PATIENT_RECORD_MEDIA_VAULT_POLICY_FIX_READY_LOCAL_COMMIT**

- Migration 184 local · DROP+CREATE 4 policies (`professional` → `therapist`)
- Zero schema/grant/storage/UI/code change
- Rollback note + validation SQL + doc completos
- Pre-apply validation confirma gap (`current_policies_use_professional=true`)
- Hard gate intacto · 35 storage policies inalteradas · `anon_grants=0`
- Aguardando autorização para `git push origin main`
