# CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT · Contrato seguro do vault clínico (Trilha B)

> Trilha B · schema mínimo de `medical_record_attachments` ampliado para
> tenant-aware com RLS clínica, FKs, indexes e contrato de path canônico
> reusando o bucket privado `media` (que já tem policies tenant-aware).
> Migration 183 **criada local, NÃO aplicada**. UI continua placeholder
> até apply + wire.

---

## 1 · Objetivo

Destravar a aba **Documentos** do prontuário do paciente com:

1. Schema completo para metadados clínicos (clinic_id, patient_id,
   appointment_id, uploaded_by, bucket, storage_path, file_name, mime_type,
   size_bytes, category, description, visibility, updated_at, deleted_at).
2. RLS multi-tenant com `app_clinic_id()` + role gate clínico.
3. Contrato de path canônico no bucket privado `media`:
   `medical-records/{clinic_id}/{patient_id}/{attachment_id}/{file}`.
4. Política "signed URL apenas server-side" · path bruto nunca viaja ao client.
5. Reusar policies tenant-aware já existentes em `storage.objects` para o
   bucket `media` (zero alteração em storage layer).

Migration **não aplicada** nesta fase. UI **não destravada** nesta fase.

---

## 2 · Por que Documentos estava placeholder

Auditoria CONTROL.3 (doc 111) já havia documentado:

- `medical_record_attachments.exists = true` mas com 0 policies.
- RLS habilitada + 0 policies = ninguém acessa pelo client.
- Schema minimalista: apenas `id`, `patient_id`, `file_path`, `created_at`.
- Sem `clinic_id`, sem FK, sem visibility, sem soft-delete.
- Sem tenant guard, sem role gate.

Liberar UI antes de fechar contrato de segurança seria violação LGPD.

---

## 3 · Diagnóstico `medical_record_attachments` (preflight)

| Item | Valor |
|---|---|
| `exists` | true |
| `rows` | **0** (safe para ALTER TABLE com NOT NULL) |
| `rls_enabled` | true |
| `policy_count` | **0** |
| Colunas atuais | `id uuid NO`, `patient_id uuid YES`, `file_path text YES`, `created_at timestamptz YES` |
| FKs out | **0** |
| Indexes | apenas `pkey` |
| Constraints | apenas pkey |
| Grants | `postgres`, **`anon`**, `authenticated`, `service_role` (todos com SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER) |

**Risco crítico identificado:** `anon` tem TODOS os privilégios na tabela.
Hoje a RLS bloqueia (0 policies = nada passa), mas se alguém criar 1 policy
permissiva sem cuidado, `anon` ganharia acesso. A mig 183 inclui
`REVOKE ALL ON medical_record_attachments FROM anon` como defense-in-depth.

---

## 4 · Diagnóstico storage

| Bucket | Public? | Tenant-aware policies |
|---|---|---|
| `media` | **NÃO (privado)** | sim · `Clinics can only read/update/delete/upload their own media` |
| Outros (magazine-assets, lp-assets, flipbook-*, attachments, case-gallery, voucher-audio, wa-automations) | mix | escopo separado |

Policies do `media`:

```
SELECT/UPDATE/DELETE/UPLOAD limitadas a
  bucket_id = 'media' AND (storage.foldername(name))[1] = app_clinic_id()::text
```

→ A primeira pasta do path é sempre `{clinic_id}`. Nosso path proposto
`medical-records/{clinic_id}/{patient_id}/...` **não cumpre** essa convenção
(primeira pasta seria `medical-records`).

**Decisão:** path canônico ajustado para
`{clinic_id}/medical-records/{patient_id}/{attachment_id}/{file}`.
Primeira pasta = `clinic_id` · cumpre as policies existentes · zero policy
de storage adicionada.

---

## 5 · Diagnóstico auth helpers

Ambos canônicos no projeto (reusados em todas as fases):

- `public.app_clinic_id() → uuid` (SECURITY DEFINER · STABLE · resolve por GUC → JWT `app_metadata.clinic_id` → JWT root → fallback single-tenant)
- `public.app_role() → text` (SECURITY DEFINER · STABLE · resolve por GUC → JWT `app_metadata.app_role` → JWT root → fallback `'anon'`)

Roles previstos no projeto: `owner`, `admin`, `professional`, `receptionist`, `anon`.

---

## 6 · Decisão de modelagem

| Aspecto | Decisão |
|---|---|
| Trilha | **B · schema incompleto · migration significativa** |
| Tipo de coluna | tudo nullable que pode ser, NOT NULL onde contrato exige (clinic_id, patient_id, bucket, storage_path, file_name, mime_type, visibility, updated_at) |
| FKs | clinics (RESTRICT) · patients (RESTRICT) · appointments (SET NULL) · auth.users (SET NULL) |
| Soft-delete | sim · coluna `deleted_at` + policy SELECT filtra |
| Hard-delete | sem policy · service_role/postgres apenas em manutenção |
| Trigger updated_at | sim · `set_updated_at()` (idempotente · cria função se não existir) |
| Grants | REVOKE `anon` · GRANT SELECT/INSERT/UPDATE para `authenticated` · service_role intacto |

---

## 7 · Contrato de path canônico

```
{clinic_id}/medical-records/{patient_id}/{attachment_id}/{safe_filename}
```

- **Primeira pasta = `clinic_id`** · alinha com as policies existentes do bucket `media` (`storage.foldername(name)[1] = app_clinic_id()`).
- `medical-records` agrupa visualmente · facilita gestão.
- `{patient_id}` segmenta por paciente · cleanup futuro mais fácil.
- `{attachment_id}` evita colisão de nomes · cada upload é único.
- `safe_filename`: caracteres alfanuméricos + `-`, `_`, `.` apenas. Server-side
  sanitiza antes do upload.

`storage_path` na tabela armazena este path **completo** · nunca viaja pro
client. Client recebe apenas signed URL gerada via `createSignedUrl(path, 300)`
com `service_role` server-side.

---

## 8 · Contrato signed URL

| Item | Valor |
|---|---|
| Geração | server-side via `createServiceRoleClient().storage.from('media').createSignedUrl(path, 300)` |
| TTL | **5 minutos** (300s) |
| Cache do path no client | **proibido** |
| Renovação | gerar nova URL a cada page load · sem store |
| Logs | sem path completo · só `attachment_id` e `clinic_id` |

---

## 9 · RLS policies propostas (mig 183)

| Policy | Comando | Roles | USING + WITH CHECK |
|---|---|---|---|
| `mra_select_clinical_staff` | SELECT | `authenticated` | `clinic_id = app_clinic_id() AND deleted_at IS NULL AND app_role() IN ('owner','admin','professional','receptionist')` |
| `mra_insert_clinical_staff` | INSERT | `authenticated` | `clinic_id = app_clinic_id() AND app_role() IN ('owner','admin','professional')` |
| `mra_update_clinical_staff` | UPDATE | `authenticated` | `clinic_id = app_clinic_id() AND app_role() IN ('owner','admin','professional')` (both USING and CHECK) |
| `mra_service_role_full` | ALL | `service_role` | `true` (bypass · operações server-side) |

**DELETE intencionalmente sem policy** · use soft-delete (UPDATE `deleted_at`).

**Roles permitidas:**
- SELECT: `owner`, `admin`, `professional`, `receptionist` (recepção pode visualizar para preparar paciente)
- INSERT/UPDATE: `owner`, `admin`, `professional` (apenas clinical staff escreve)
- Anon: **zero acesso** (REVOKE + sem policy)

---

## 10 · UI

**Continuará placeholder até `MEDIA_VAULT_WIRE`.**

A aba Documentos do prontuário (`_record-tabs.tsx`) já mostra um placeholder
claro:

> "A tabela `medical_record_attachments` existe mas ainda não tem políticas
> RLS configuradas. Para preservar privacidade, a UI de upload/listagem só
> será habilitada em fase dedicada (`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT`)
> com bucket privado, signed URLs server-side e role gate explícito."

Após o apply + wire futuro, o placeholder será substituído por:

- Listagem com `category`/`description`/`uploaded_by`/`created_at`
- Botão upload (clinical staff)
- Preview via signed URL inline (TTL 5min)
- Sem path bruto no DOM
- Soft-delete via UPDATE `deleted_at`

---

## 11 · Migration 183 (criada local · NÃO aplicada)

Arquivo: `db/migrations/20260800000183_clinicai_v2_patient_record_media_vault.sql`

Conteúdo resumido:

1. `ALTER TABLE` ampliando schema (13 colunas novas + promovendo `patient_id` para NOT NULL)
2. 5 CHECK constraints (storage_path/file_name/mime_type não vazios · size_bytes >= 0 · visibility enum)
3. 4 FKs (clinics RESTRICT, patients RESTRICT, appointments SET NULL, auth.users SET NULL)
4. 3 indexes (composite parcial + appointment parcial + clinic_id básico)
5. Comments documentando contrato
6. `set_updated_at()` function + trigger (idempotente)
7. REVOKE `anon` + GRANT mínimo `authenticated`
8. 4 RLS policies (select/insert/update + service_role)

**Idempotente** (usa `IF NOT EXISTS` e `DO $$ ... IF NOT EXISTS ...`). Sem CASCADE destrutivo.

---

## 12 · Plano de apply

1. **`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_PUSH`** · publicar mig 183 + docs em origin/main.
2. **`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_APPLY`** · aplicar a migration remotamente via `apply-migration.mjs` (arquivo único · não db push genérico) + registrar tracker 183 + revalidar.
3. **`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_WIRE`** · regenerar typegen, criar `MedicalRecordAttachmentRepository`, server actions com role gate, UI de upload/listagem em `/crm/pacientes/[id]?tab=documentos`.

---

## 13 · Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Schema drift se outro processo inserir 1 row antes do apply | baixíssimo | `ADD COLUMN ... NOT NULL` falharia · operador percebe na hora |
| Path bruto vazar pelo log | baixo | políticas de log filtram só `attachment_id` |
| Receptionist ver documento sensível | médio | papel já tem acesso a foto/recepção (PRONTUARIO_BASE) · contrato consistente; visibility=`clinical` cobre o caso de querer restringir mais |
| `auth.users` FK + `ON DELETE SET NULL` em uploaded_by | trivial | preserva attachment se user for removido |

---

## 14 · Validações executadas

| Validation | Resultado |
|---|---|
| `git diff --check` | sem warnings (apenas CRLF auto) |
| SQL validation `phase-patient-record-media-vault-validation.sql` | final_flags green |

Flags chave (pre-apply):

- `worker71_off`: true
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `cron_with_provider_call`: 0
- `hard_gate_untouched`: **true**
- `medical_record_attachments_exists`: true
- `medical_record_attachments_rows`: 0
- `medical_record_attachments_policy_count`: **0** (esperado · pré-apply)
- `medical_record_attachments_has_tenant_guard`: **false** (esperado · pré-apply)
- `medical_record_attachments_has_patient_id`: true
- `medical_record_attachments_has_storage_path`: false (esperado · pré-apply)
- `storage_private_bucket_ready`: true
- `auth_helpers_ready`: true
- `media_vault_migration_created_not_applied`: **true**
- **`can_continue`: true**

**Typecheck não executado:** zero código TypeScript alterado nesta fase
(apenas migration + rollback + validation + doc).

---

## 15 · Rollback

Receita completa em
[`rollback-notes/20260800000183_clinicai_v2_patient_record_media_vault.md`](../database/rollback-notes/20260800000183_clinicai_v2_patient_record_media_vault.md).

Resumo: drop de policies → drop de trigger → drop de indexes → drop de FKs
→ drop de constraints → ALTER COLUMN drop NOT NULL → DROP COLUMN (zero
dados perdidos se rollback for imediato pós-apply). **Não reverter os
grants de `anon`** (pré-apply era cenário inseguro).

---

## 16 · Veredito

**PASS_CRM_PATIENT_RECORD_MEDIA_VAULT_CONTRACT_READY_LOCAL_COMMIT**

- Trilha B · migration significativa criada local
- Rollback note + validation SQL + doc completos
- Zero apply · zero db push · zero schema remoto tocado
- Zero código app alterado · UI segue placeholder até wire
- Hard gate clínico intacto · bucket `media` intocado · `anon` continua sem acesso
- Aguardando autorização para `git push origin main`
