# CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT_SMOKE_BROWSER · Smoke manual (PARTIAL)

> Ambiente CLI sem browser/Playwright nesta sessão. Mig 183 + 184 já
> aplicadas e validadas. Esta fase confirma que o sistema está clean para
> o smoke manual, deixa checklist UI passo-a-passo e SQL pré + pós-submit
> prontos para o operador rodar localmente. **Zero upload real** · zero
> fixture criada.

---

## 1 · Objetivo

Validar pelo fluxo real do prontuário (`/crm/pacientes/[id]?tab=documentos`):

1. Upload de arquivo fake (PDF/PNG/JPG) via UI · metadata criada · objeto físico no bucket privado.
2. Listagem mostra item sem `storage_path` no DOM.
3. Botão "Abrir" usa signed URL TTL 5min.
4. Soft-delete marca `deleted_at` · objeto físico preservado para audit.
5. `wa_outbox_delta=0` · `worker71_off=true` · hard gate intacto · zero policy alterada.
6. (Opcional) Role gate via `therapist` agora destravado (mig 184).

Como não há automação de UI disponível neste turno, a fase entrega:

- preflight DB completo ✓
- validation SQL pré + pós-submit reusável ✓
- checklist UI passo-a-passo ✓
- queries SQL "inspect attachment" prontas para colar `<ATTACHMENT_ID>` ✓

---

## 2 · Ambiente

| Item | Valor |
|---|---|
| Branch · HEAD | `main` · `2280330` |
| Modo escolhido | **PARTIAL · preflight_only** (sem submit) |
| Razão | Sem browser/Playwright nesta sessão · contrato "NÃO subir sem fixture segura" respeitado |
| `medical_record_attachments` rows | **0** (estado clean para o smoke) |
| Objetos em `media/<clinic>/medical-records/` | **0** (estado clean) |
| Hard gate clínico | intocado |
| Bucket `media` | privado · 35 policies tenant-aware |
| Alexa drops (mig 181) | persistem |

---

## 3 · Preflight DB · executado e green

Validation SQL:
`docs/crm-refactor/sql/phase-patient-record-media-vault-smoke-browser-validation.sql`

Flags chave (pré-smoke):

- `worker71_off`: **true**
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `cron_with_provider_call`: 0
- `hard_gate_untouched`: **true**
- `tracker_183_registered`: **true**
- `tracker_184_registered`: **true**
- `mra_policy_count`: 4
- `mra_anon_grants`: 0
- `mra_uses_therapist`: **true** (mig 184 ativa)
- `mra_uses_professional`: false
- `mra_delete_policy_count`: 0 (DELETE bloqueado)
- `storage_media_private`: true
- `storage_policy_count`: 35
- `baseline_outbox`: 123
- `mra_total/active/deleted`: 0/0/0
- `storage_media_medical_records_objects`: 0
- **`can_continue`: true**

---

## 4 · Checklist UI manual

Use **paciente de teste** ou paciente claramente identificado para smoke
(ex.: prefixo `TEST_` no nome). Nunca use paciente real sensível.

### 4.1 Preparação
- [ ] `pnpm dev` (ou comando do projeto)
- [ ] Login com usuário **owner**, **admin** ou **therapist** (mig 184 já libera therapist)
- [ ] Identificar `patient_id` de teste (anotar para queries SQL pós-smoke)

### 4.2 Caso A · Upload canônico (owner/admin/therapist)
- [ ] Abrir `/crm/pacientes/<patient_id>?tab=documentos`
- [ ] Confirmar aba mostra "Bucket privado · signed URLs server-side (TTL 5 min) · soft-delete preserva audit trail"
- [ ] Confirmar botão **"Anexar documento"** visível
- [ ] Clicar **"Anexar documento"** → modal abre
- [ ] Selecionar arquivo fake pequeno (PDF/PNG/JPG/WEBP · até 20MB)
- [ ] Categoria: **Documento** (ou outra apropriada)
- [ ] Descrição: `Smoke test Media Vault`
- [ ] Clicar **"Anexar"** → loading "Enviando…"
- [ ] Modal fecha · lista atualiza · item aparece com fileName + tamanho + criado em
- [ ] **Anotar** o `id` (mais fácil: olhar URL ou recarregar página · listagem ordena por created_at desc; ou usar query SQL 4.4)

### 4.3 Caso B · Abrir signed URL
- [ ] Clicar **"Abrir"** na linha do item
- [ ] Nova aba abre · URL começa com `https://oqboitkpcvuaudouwvkl.supabase.co/storage/v1/object/sign/media/...`
- [ ] **Inspecionar DOM** (devtools → Elements): confirmar que `storage_path` bruto **NÃO** aparece em nenhum atributo · só a signed URL completa no `href`
- [ ] **Inspecionar Network**: payload da página `/crm/pacientes/<id>` server-rendered · sem campo `storage_path` no JSON
- [ ] Aguardar 5 min e clicar "Abrir" de novo: link velho expira (`401/403`) · novo refresh da página gera URL nova

### 4.4 Inspecionar DB pós-upload

Cole o `attachment_id` em `<ATTACHMENT_ID>` (descobrir via UI: inspecionar HTML da linha · ou via SQL: pegar o último criado):

```sql
SELECT
  a.id,
  a.clinic_id,
  a.patient_id,
  a.appointment_id,
  a.uploaded_by,
  a.bucket,
  a.storage_path,
  a.file_name,
  a.mime_type,
  a.size_bytes,
  a.category,
  a.visibility,
  a.created_at,
  a.deleted_at,
  (a.storage_path LIKE a.clinic_id::text || '/medical-records/' || a.patient_id::text || '/%')   AS path_pattern_valid,
  (a.bucket = 'media')                                                                          AS bucket_media,
  (EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = a.bucket AND name = a.storage_path)) AS storage_object_exists
FROM public.medical_record_attachments a
WHERE a.id = '<ATTACHMENT_ID>'::uuid;
```

**Esperado pós-upload (Caso A):**

| Coluna | Valor esperado |
|---|---|
| `path_pattern_valid` | `true` |
| `bucket_media` | `true` |
| `storage_object_exists` | `true` |
| `storage_path` | `<clinic_id>/medical-records/<patient_id>/<attachment_id>/<file>` |
| `deleted_at` | `NULL` |
| `bucket` | `media` |
| `mime_type` | `application/pdf` / `image/png` / etc. |
| `uploaded_by` | uuid do user que fez upload |
| `visibility` | `clinical` (padrão) |

### 4.5 Caso C · Soft-delete
- [ ] Clicar **"Remover"** na linha
- [ ] Confirmação: `Remover "<filename>"? O arquivo é mantido para auditoria (soft-delete) e não aparece mais na lista.`
- [ ] Confirmar → item some da listagem ativa
- [ ] Re-rodar query 4.4 com o mesmo `<ATTACHMENT_ID>`:
  - [ ] `deleted_at` agora é **timestamp NOT NULL**
  - [ ] `storage_object_exists` ainda **true** (objeto físico preservado · audit trail)

### 4.6 Caso D · Receptionist (role gate · opcional)
- [ ] Logout · login com usuário `receptionist` da mesma clínica
- [ ] Abrir `/crm/pacientes/<patient_id>?tab=documentos`
- [ ] Confirmar que **a lista aparece** (item soft-deleted continua filtrado)
- [ ] Confirmar que **botão "Anexar documento" NÃO aparece** (`canWriteDocuments=false`)
- [ ] Confirmar que **botão "Remover" NÃO aparece** nas linhas

### 4.7 Safety pós-smoke

Rodar query equivalente à seção 03 da validation SQL:

```sql
SELECT
  count(*) - 123 AS wa_outbox_delta,           -- baseline_outbox=123 do preflight
  (SELECT NOT active FROM cron.job WHERE jobid=71) AS worker71_off,
  (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') AS cron_provider
FROM public.wa_outbox;
```

**Esperado**: `wa_outbox_delta=0` · `worker71_off=true` · `cron_provider=0`.

---

## 5 · Cleanup

UI canônica:
- Item já está em soft-delete · permanece no banco para audit. **Não usar SQL DELETE** · contrato proíbe hard delete via app.
- Objeto físico no bucket: cleanup pode ser feito por rotina futura (fora desta fase).
- Se quiser remover o fixture inteiro: criar novo paciente de teste apenas para o smoke e mantê-lo flagado.

---

## 6 · Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Operador subir documento real por engano | médio | usar paciente com prefixo `TEST_` · arquivo fake pequeno |
| `storage_path` vazar via console.log esquecido | trivial | server actions e `getInternalById` só rodam server-side · `_documents-actions.ts` loga apenas `attachment_id/clinic_id` |
| Signed URL cacheada após expirar | baixo | TTL 5min · refresh server-side regenera · sem store no client |
| Therapist ainda bloqueado | resolvido | mig 184 já aplicada · `mra_uses_therapist=true` confirmado |

---

## 7 · Próximos passos

Se o operador rodar smoke manual e os flags pós-submit baterem:

- **PASS_CRM_PATIENT_RECORD_MEDIA_VAULT_SMOKE_BROWSER_READY**: Media Vault validado em runtime real.

Caso contrário (gap descoberto):

- Abrir issue documentando observado vs esperado
- Não fazer hard delete · não rodar DELETE FROM
- Eventual rollback via doc `rollback-notes/20260800000184_*.md` ou `20260800000183_*.md`

Próximo bloco recomendado (independente):

- **Cleanup docs-only** · atualizar comentário em `_documents-actions.ts:41` (gap resolvido pela mig 184)
- **Próximo módulo CRM/Meta** quando dependências externas liberarem

---

## 8 · Veredito

**PARTIAL_CRM_PATIENT_RECORD_MEDIA_VAULT_SMOKE_PREFLIGHT_ONLY**

- Sistema confirmado alinhado para smoke manual
- Validation SQL preparada (pre + post-submit · query inspect attachment pronta)
- Checklist UI passo-a-passo entregue (Caso A canônico · Caso B abrir · Caso C soft-delete · Caso D role gate receptionist)
- Zero upload real · zero fixture criada · zero risco
- Aguardando operador rodar smoke em ambiente com browser
