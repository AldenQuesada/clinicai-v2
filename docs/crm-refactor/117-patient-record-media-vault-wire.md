# CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_WIRE · Wiring funcional da aba Documentos

> Mig 183 já aplicada. Esta fase **liga** o app ao vault clínico:
> typegen regenerado · `MedicalRecordAttachmentRepository` criado · server
> actions com role gate · UI Documentos funcional com signed URL server-side
> TTL 5min · soft-delete · zero `storage_path` no client. **Upload smoke
> não executado** (sem fixture/browser disponível neste turno).

---

## 1 · Objetivo

Tornar a aba **Documentos** do prontuário funcional preservando todo o
contrato de privacidade da mig 183:

1. `storage_path` bruto NUNCA viaja para o client.
2. Signed URLs geradas exclusivamente server-side com TTL 300s.
3. Upload via service_role (bucket privado · sem URL pública).
4. Soft-delete via `UPDATE deleted_at` (sem DELETE hard).
5. Role gate (defense-in-depth · DB tem RLS).

---

## 2 · Contrato de segurança (cumprido)

| Item | Implementação |
|---|---|
| `storage_path` no client | **nunca** · `MedicalRecordAttachmentDTO` não tem o campo |
| `bucket` no client | **nunca** · idem |
| Signed URL TTL | 300s (`createSignedUrl(path, 60 * 5)`) |
| Onde gera signed URL | `apps/lara/src/app/crm/pacientes/[id]/page.tsx` (server component) |
| URL pública | **nunca** · bucket `media` é privado |
| Hard delete | **bloqueado** · sem policy DELETE · ação só faz `UPDATE deleted_at` |
| Receptionist upload/delete | **bloqueado** · `WRITE_ROLES = ['owner','admin','therapist']` |
| Painel-TV | intocado · zero documento clínico exibido |
| Hard gate clínico | intocado (5/5 funcs) |
| Log payload | só `attachment_id`/`clinic_id`/`patient_id`/`mime`/`bytes` · zero path · zero signed URL |

---

## 3 · Typegen

- Comando: `pnpm db:types`
- Arquivo regenerado: `packages/supabase/src/types.ts` (`+87/−5` linhas)
- `medical_record_attachments` Row inclui as 17 colunas (clinic_id, patient_id, appointment_id, uploaded_by, bucket, storage_path, file_name, mime_type, size_bytes, category, description, visibility, file_path legacy, created_at, updated_at, deleted_at, id)
- FK `appointments_procedure_id_fkey` continua intacta

---

## 4 · Repository

Arquivo: `packages/repositories/src/medical-record-attachment.repository.ts`

DTOs:

- **`MedicalRecordAttachmentDTO`** · público · sem `storagePath`/`bucket`. Seguro para serializar para client.
- **`MedicalRecordAttachmentInternalDTO`** · server-only · estende com `storagePath`/`bucket`. Usado apenas para gerar signed URL / cleanup de objeto físico.

Métodos:

| Método | Uso |
|---|---|
| `listByPatient(patientId, opts)` | retorna DTOs públicos · filtra `deleted_at IS NULL` por padrão |
| `getInternalById(id)` | **server-only** · retorna `MedicalRecordAttachmentInternalDTO` com `storagePath` para signed URL/cleanup |
| `createMetadata(input)` | INSERT idempotente · RLS no DB enforça clinic_id + role |
| `softDelete(id)` | UPDATE `deleted_at = now()` · preserva audit + objeto físico |
| `countByPatient(patientId)` | KPI · `active` + `deleted` separados |

Wired em `apps/lara/src/lib/repos.ts` como `repos.medicalRecordAttachments`.

---

## 5 · Server Actions

Arquivo: `apps/lara/src/app/crm/pacientes/[id]/_documents-actions.ts`

### 5.1 `uploadMedicalRecordAttachmentAction(formData)`

Fluxo:
1. Recebe `FormData` com `patientId` + `file` + `category` + `description` opcional + `appointmentId` opcional + `visibility` opcional.
2. Valida: MIME (`jpeg/jpg/png/webp/pdf`), tamanho (`<=20MB`), não-vazio, categoria/visibilidade do enum.
3. `requireRole(['owner','admin','therapist'])` (defense-in-depth).
4. Tenant guard: `patient.clinicId === ctx.clinic_id`.
5. Gera `attachmentId = crypto.randomUUID()` + `safeFileName()` (sanitiza diacríticos + chars não-`[A-Za-z0-9._-]`).
6. Path: `{clinic_id}/medical-records/{patient_id}/{attachment_id}/{safe_filename}` (primeira pasta = clinic_id · cumpre policies do bucket `media`).
7. Upload físico via `createServiceRoleClient().storage.from('media').upload(...)` (bucket privado · `upsert: false`).
8. INSERT metadata via `repos.medicalRecordAttachments.createMetadata(...)`.
9. Se INSERT falhar pós-upload: cleanup `service.storage.from('media').remove([path])` (best-effort).
10. `updateTag(CRM_TAGS.patients)` para revalidar prontuário.

### 5.2 `softDeleteMedicalRecordAttachmentAction({ attachmentId, patientId })`

Fluxo:
1. Zod valida UUIDs.
2. `requireRole(['owner','admin','therapist'])`.
3. `getInternalById(attachmentId)` para checar `clinicId/patientId/deleted_at`.
4. Se já deletado: idempotente · retorna ok.
5. `softDelete(id)` → `UPDATE deleted_at = now()`.
6. **Objeto físico permanece no bucket** (audit trail). Cleanup físico fica para fase futura.

---

## 6 · Role gates

| Operação | Roles permitidos | Onde |
|---|---|---|
| SELECT (list) | owner, admin, **therapist**, receptionist | RLS policy `mra_select_clinical_staff` (DB) |
| INSERT (upload) | owner, admin, **therapist** | TS `WRITE_ROLES` + RLS `mra_insert_clinical_staff` |
| UPDATE (soft-delete + metadata) | owner, admin, **therapist** | TS + RLS `mra_update_clinical_staff` |
| DELETE (hard) | **bloqueado** · sem policy | DB |
| Service role | bypass total | RLS `mra_service_role_full` |

### ⚠️ Gap de naming · mig 184 corretiva recomendada

A mig 183 escreveu as policies usando `app_role() IN ('owner','admin','professional','receptionist')`,
mas o role canônico do projeto para clinical staff é **`therapist`** (vide
`apps/lara/src/lib/permissions.ts` linha 17 · `StaffRole = 'owner'|'admin'|'therapist'|'receptionist'|'viewer'|'secretaria'`).

**Estado atual:**
- TS está alinhado ao role real (`therapist`) tanto em actions quanto em `canWriteDocuments`.
- Owner e Admin operam normalmente (vão pelos primeiros valores do `IN`).
- **Therapist será bloqueado pela RLS atual** (string `professional` nunca bate). Receptionist segue com SELECT.

**Correção proposta (fase futura · `CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_POLICY_FIX`):**

```sql
-- Mig 184 corretiva (NÃO aplicada nesta fase)
DROP POLICY mra_select_clinical_staff ON public.medical_record_attachments;
DROP POLICY mra_insert_clinical_staff ON public.medical_record_attachments;
DROP POLICY mra_update_clinical_staff ON public.medical_record_attachments;

CREATE POLICY mra_select_clinical_staff ON public.medical_record_attachments
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id()
    AND deleted_at IS NULL
    AND public.app_role() IN ('owner','admin','therapist','receptionist'));

CREATE POLICY mra_insert_clinical_staff ON public.medical_record_attachments
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','therapist'));

CREATE POLICY mra_update_clinical_staff ON public.medical_record_attachments
  FOR UPDATE TO authenticated
  USING (clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','therapist'))
  WITH CHECK (clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','therapist'));
```

Bloqueio temporário de `therapist` é **MAIS RESTRITIVO** que o pretendido,
não menos · zero risco de privacidade. Owner/admin cobrem o fluxo enquanto
a 184 não é autorizada.

---

## 7 · Signed URL contract (implementação)

`apps/lara/src/app/crm/pacientes/[id]/page.tsx` server component:

```ts
const ttlSec = 60 * 5
const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString()
const service = createServiceRoleClient()

// Para cada attachment, busca path interno server-side
const paths = await Promise.all(
  attachments.map(async (a) => {
    const internal = await repos.medicalRecordAttachments.getInternalById(a.id)
    if (!internal) return null
    const { data } = await service.storage
      .from(internal.bucket)
      .createSignedUrl(internal.storagePath, ttlSec)
    return { id: a.id, signedUrl: data?.signedUrl ?? null }
  }),
)
// Map id → signed URL · DTO público + signedUrl é o que vai para client
```

DTO enviado ao client (`AttachmentForClient`) tem apenas:
- `id`, `patientId`, `appointmentId`, `uploadedBy`
- `fileName`, `mimeType`, `sizeBytes`, `category`, `description`, `visibility`
- `createdAt`, `updatedAt`, `deletedAt`
- **`signedUrl`** (string ou null)
- **`signedUrlExpiresAt`** (ISO ou null)

`storagePath` e `bucket` **NÃO entram** nesta serialização (nem estão no DTO público do repo).

---

## 8 · UI

Aba Documentos em `apps/lara/src/app/crm/pacientes/[id]/_record-tabs.tsx`:

### 8.1 Lista
- Tabela: arquivo · categoria · MIME · tamanho · criado em · ações
- Categorias com label PT-BR (Foto clínica, Exame, Documento, Consentimento, Orçamento, Outro)
- **Coluna ações**:
  - **Abrir**: `<a href={signedUrl} target="_blank" rel="noopener noreferrer">` se signed URL presente
  - **Remover**: botão soft-delete (apenas roles de escrita) com `confirm()`
- Empty state: "Nenhum documento clínico anexado ainda."
- Hint topo: "Bucket privado · signed URLs server-side (TTL 5 min) · soft-delete preserva audit trail."
- Botão "Anexar documento" só aparece para `canWriteDocuments=true`

### 8.2 Upload dialog
- Modal centrado · `<form>` com `FormData`
- File input (`accept="image/jpeg,...,application/pdf"`)
- Category select (6 opções)
- Description textarea (até 2000 chars)
- Aviso de privacidade no header do modal
- Estados: idle / busy ("Enviando…") / err ("Erro: ...")
- Cancelar fecha · sucesso fecha + `router.refresh()`

### 8.3 Soft-delete
- `confirm("Remover ...? O arquivo é mantido para auditoria (soft-delete) e não aparece mais na lista.")`
- Action server-side
- Em sucesso · `router.refresh()` recarrega lista (sem o deletado)

### 8.4 Placeholder removido
- O bloco placeholder anterior foi substituído pela `DocumentsTab` funcional.

---

## 9 · Smoke

**Não executado nesta fase** · ambiente CLI sem browser/Playwright.

Smoke server-side via SQL (sem upload real):
- Validation SQL `phase-patient-record-media-vault-wire-validation.sql` confirma estrutura/grants/policies intactos pós-wire.
- `documents_rows_total = 0` confirma zero upload involuntário durante o wire.

Smoke browser (próxima fase, opcional):

`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_SMOKE_BROWSER` · usuário owner/admin abre `/crm/pacientes/<id>?tab=documentos`, anexa arquivo pequeno (PNG/PDF), confirma listagem, abre via signed URL, faz soft-delete. Validation SQL pós-smoke confirma:
- 1 row criada · `storage_path` populated · `clinic_id`+`patient_id` corretos
- 1 row em `medical_record_attachments` com `deleted_at` NOT NULL após soft-delete
- Zero `wa_outbox` row · zero policy adicionada

---

## 10 · Validações executadas

| Validation | Resultado |
|---|---|
| `pnpm db:types` | OK · arquivo regenerado |
| `pnpm --filter @clinicai/repositories typecheck` | OK |
| `pnpm --filter @clinicai/lara typecheck` | OK |
| `git diff --check` | sem warnings (apenas CRLF auto) |
| SQL validation `phase-patient-record-media-vault-wire-validation.sql` | final_flags green |

Flags chave:

- `worker71_off`: true
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `cron_with_provider_call`: 0
- `hard_gate_untouched`: **true**
- `medical_record_attachments_policy_count`: **4** (intacta)
- `medical_record_attachments_anon_grants`: **0** (intacta)
- `medical_record_attachments_has_tenant_guard`: true
- `medical_record_attachments_has_storage_path`: true
- `medical_record_attachments_deleted_at_soft_delete_ready`: true
- `storage_media_private`: **true**
- `storage_policy_count`: 35 (zero alteração em storage layer)
- `documents_rows_total`: **0** (zero upload durante wire)
- `documents_active_rows`: 0
- `documents_deleted_rows`: 0
- **`can_continue`: true**

---

## 11 · Confirmações negativas

- zero migration aplicada · zero db push · zero migration repair
- zero hard delete (DELETE bloqueado por contrato)
- **zero public URL** criada
- **zero `storage_path` no client** (DTO público não tem o campo)
- zero documento no Painel-TV
- zero alteração em `storage.buckets`/`storage.objects` (35 policies mantidas)
- zero alteração em hard gate clínico
- zero alteração em `appointments.procedure_id`/FK procedure
- zero alteração em `medical_record_attachments` policies/grants (intactas)
- zero alteração em `PatientReceptionPanel`
- zero alteração em cron · zero job 71 activation
- zero WhatsApp · zero Evolution · zero Meta · zero provider · zero Alexa
- zero wa_outbox row · zero env/secrets · zero deploy
- zero `phase='perdido'` · zero status zumbi
- zero reabertura de Alexa legacy

---

## 12 · Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Therapist bloqueado por bug de naming na mig 183 | médio | doc 117 documenta · mig 184 corretiva proposta · owner/admin operam normalmente |
| Browser cachear signed URL após expirar | baixo | TTL 5min · refresh server-side recarrega · usuário só precisa clicar "Abrir" denovo |
| `getInternalById` chamado em loop pelo page.tsx | baixo | listas tipicamente curtas (<100); se ficar grande, criar `listInternalByPatient` |
| Upload de PDF malicioso | médio | MIME whitelisted · tamanho 20MB · bucket privado · signed URL controlada; ideal adicionar antivirus scanning na fase MEDIA_SCAN futura |
| Operator esquece de remover documento errado | baixo | soft-delete preserva audit · UI mostra confirm explícito |

---

## 13 · Próximos passos

1. **`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_WIRE_PUSH`** · publicar wiring em origin/main.
2. **`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_POLICY_FIX`** (mig 184) · corrigir naming de role nas policies (`professional` → `therapist`).
3. (Opcional) **`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_SMOKE_BROWSER`** · smoke real com fixture controlada.
4. (Futuro) **`MEDIA_SCAN`** · antivirus + content-type sniffing antes do upload.

---

## 14 · Veredito

**PASS_CRM_PATIENT_RECORD_MEDIA_VAULT_WIRE_NO_UPLOAD_SMOKE_LOCAL_COMMIT**

- Repository + actions + UI funcional · typegen regenerado · typecheck OK
- Signed URL TTL 5min server-side · zero `storage_path` no client
- Role gate alinhado ao role canônico (`therapist`)
- Gap mig 183 documentado · mig 184 proposta
- Smoke browser **não executado** nesta fase
- Hard gate intacto · zero alteração em policies/grants já aplicadas
- Aguardando autorização para `git push origin main`
