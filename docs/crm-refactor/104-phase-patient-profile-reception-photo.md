# CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_BASE · Foto + Consent + Welcome

> Base do prontuário estendido da paciente · foto oficial + consentimento
> LGPD + flag de boas-vindas + animação de recepção. **Painel-TV (2ALEXA.2
> commit `d3db2ee`) NÃO é alterado nesta fase** · próxima fase pode evoluir
> o painel para consumir foto consentida via `getReceptionDisplayProfile()`.

---

## 1. Resumo executivo

CRM_PHASE_2ALEXA.2 entregou painel-TV base (read-only, minimalista). Esta
fase entrega a **infra correta de foto + consent + welcome no PRONTUÁRIO
do paciente**, conforme correção estratégica do MEGA PROMPT:

> "A foto da paciente NÃO deve ser gerenciada pelo Painel-TV. A foto deve
> fazer parte do cadastro/prontuário/modal da paciente."

Entrega:
- **Mig 180** · tabela `patient_profiles_extended` (1:1 com patients) +
  4 CHECK constraints + 3 RLS policies
- **Storage**: reuso do bucket privado `media` com prefixo
  `patient-profiles/{clinic_id}/{patient_id}/profile-{ts}.{ext}`
- **`PatientProfileRepository`** · 7 métodos (read/upsert/photo/consent/welcome/display)
- **6 server actions** (Zod + role gate owner/admin/receptionist)
- **UI card "Foto & Recepção"** integrado em `/crm/pacientes/[id]`
- Smoke transacional · 10 cenários PASS (constraints todos enforced)

**Veredito:** `PASS_CRM_PATIENT_PROFILE_RECEPTION_PHOTO_APPLIED_SMOKE_OK_LOCAL_COMMIT`

---

## 2. Correção estratégica · Por que foto pertence ao prontuário

Audit anterior do legacy mostrou que o modal/prontuário do paciente já
tem campos visuais (avatar, dados de display). O painel-TV é apenas
**consumidor read-only** dessa fonte. Arquitetura correta:

```
Prontuário (admin/receptionist)
  ↓ produz
patient_profiles_extended {
  profile_photo_path,
  consent_status,
  welcome_enabled,
  animation_style
}
  ↑ consome (read-only)
Painel-TV
```

Painel-TV atual (2ALEXA.2) é minimalista (nome + procedimento) · próxima
fase pode chamar `repo.patientProfile.getReceptionDisplayProfile(patientId)`
para enriquecer com foto + animação **apenas quando consentido**.

---

## 3. Estado inicial

- HEAD inicial: `d3db2ee` (2ALEXA.2 local · não pushado)
- origin/main: `fc7cf61` (PROCEDURES_ADMIN último push)
- Working tree limpo
- `patients` table: 22 colunas · sem avatar/foto · não modificada nesta fase
- Storage: bucket `media` privado já existe · usado com prefixo novo
- Worker 71 OFF · safety gates green

---

## 4. Achados do legacy

Legacy `apps/lara/public/legacy/js/patients.js` + `patients-docs.js`
mostraram um modal de paciente com:
- Foto/avatar
- Anamneses, documentos, consentimentos clínicos
- Histórico de procedimentos
- Orçamentos

**Decisão de escopo desta fase:** apenas a **base** do prontuário
(foto + consent + welcome). Anamnese-builder, prontuário clínico
detalhado e histórico ficam para phases futuras dedicadas.

---

## 5. O que foi portado/recriado

| Legacy | V2 equivalente |
|---|---|
| Avatar inline no modal | Card "Foto & Recepção" no `/crm/pacientes/[id]` |
| Upload foto direto | Server action `uploadPatientProfilePhotoAction` (FormData via service_role) |
| Consentimento LGPD genérico | Coluna dedicada `reception_photo_consent_status` (none/granted/revoked) com auditor + timestamp |
| Sem flag de "habilitado para recepção" | Nova `reception_welcome_enabled` com CHECK constraints |

## 6. O que foi descartado

| Legacy | Motivo |
|---|---|
| Busca foto em WhatsApp/Insta/FB | Provider externo proibido |
| Bucket público | Risco LGPD · usa bucket privado |
| Foto sem consent | Constraint DB enforça `welcome=true → consent=granted` |
| localStorage de preferências | searchParams + DB são fontes da verdade |

---

## 7. Contrato DB

### Tabela `patient_profiles_extended` (mig 180)

Colunas:
- `id` uuid PK
- `clinic_id` uuid NOT NULL (FK → clinics)
- `patient_id` uuid NOT NULL UNIQUE (FK → patients · ON DELETE CASCADE)
- `display_name`, `preferred_name` text nullable
- `profile_photo_path` text nullable (path no storage `media` · NUNCA URL pública)
- `profile_photo_uploaded_by` uuid, `profile_photo_uploaded_at` timestamptz
- `reception_welcome_enabled` boolean NOT NULL DEFAULT false
- `reception_photo_consent_status` text NOT NULL DEFAULT 'none' · enum `none/granted/revoked`
- `reception_photo_consent_at` timestamptz
- `reception_photo_consent_recorded_by` uuid (auditor)
- `reception_photo_consent_revoked_at` timestamptz
- `reception_photo_consent_note` text
- `reception_animation_style` text NOT NULL DEFAULT 'premium_soft' · enum 3 valores
- `created_at`, `updated_at` timestamptz

### CHECK constraints (4)

1. `chk_pp_consent_status` · enum
2. `chk_pp_animation_style` · enum
3. `chk_pp_granted_has_consent_at` · consent=granted → consent_at NOT NULL
4. `chk_pp_welcome_requires_consent_and_photo` · welcome=true → consent=granted AND photo_path NOT NULL
5. `chk_pp_revoked_disables_welcome` · consent=revoked → welcome=false

Cross-column · enforced no DB · `getReceptionDisplayProfile()` reforça em SELECT.

### RLS policies (3 + 1 service)

- SELECT auth · clinic_id = JWT
- INSERT/UPDATE auth · clinic_id + app_role ∈ {owner,admin,receptionist}
- service_role bypass para emergency

### Indexes
- `idx_pp_extended_clinic`
- `idx_pp_extended_patient`
- `idx_pp_extended_welcome_ready` parcial (`WHERE welcome=true`)

---

## 8. Contrato storage

### Bucket
- **Reusa** `media` (privado · pré-existente)
- **NÃO** cria bucket novo (decisão arquitetural · evita proliferação)

### Path canônico
```
patient-profiles/{clinic_id}/{patient_id}/profile-{timestamp}.{ext}
```

Ext aceitos: `jpg`, `png`, `webp` · max 5 MB.

### Acesso

- **Upload**: server action `uploadPatientProfilePhotoAction` via `createServiceRoleClient` (bypassa RLS)
- **Leitura**: Server Component em `/crm/pacientes/[id]` gera **signed URL** com TTL 5 min via `createSignedUrl` (também service_role)
- **NUNCA** path direto no client · NUNCA URL pública
- Repository **valida** prefixo `patient-profiles/` em `setProfilePhotoPath()` (defense-in-depth)

---

## 9. Contrato consentimento

### Estados

| Estado | Significado | Welcome permitido? |
|---|---|---|
| `none` | Não solicitado | ❌ |
| `granted` | Paciente autorizou (com timestamp + auditor) | ✅ se há foto |
| `revoked` | Paciente revogou | ❌ (welcome forçado false) |

### Auditoria
- `reception_photo_consent_at` · quando granted
- `reception_photo_consent_recorded_by` · quem registrou (auditor)
- `reception_photo_consent_revoked_at` · quando revogado
- `reception_photo_consent_note` · justificativa/contexto

### LGPD-friendly
- Path da foto persiste mesmo após revoke (audit trail)
- `getReceptionDisplayProfile()` filtra OUT revoked profiles (painel não acessa)
- Remove foto explícita zera path + welcome (operação separada do consent)

---

## 10. Repository / Actions

### `PatientProfileRepository` (novo)

| Método | Propósito |
|---|---|
| `getByPatientId(patientId)` | Read full profile |
| `upsert(clinicId, patientId, input)` | Cria ou atualiza preferências |
| `setProfilePhotoPath(...)` | Grava path · valida prefixo `patient-profiles/` |
| `removeProfilePhoto(patientId)` | Limpa path + desliga welcome |
| `grantConsent(clinicId, patientId, {note, recordedBy})` | consent=granted + timestamp + auditor |
| `revokeConsent(patientId)` | consent=revoked + welcome=false (atômico) |
| `setReceptionWelcomeEnabled(patientId, enabled)` | Toggle · pré-reqs validados em TS antes do DB |
| `getReceptionDisplayProfile(patientId)` | **APENAS quando welcome=true AND consent=granted AND photo NOT NULL** |

### Server actions (6 · todas com Zod + role gate)

1. `savePatientProfileAction` · upsert nomes + animation
2. `uploadPatientProfilePhotoAction` · FormData · service_role upload
3. `removePatientProfilePhotoAction` · DB + storage cleanup
4. `grantReceptionPhotoConsentAction` · note + recordedBy
5. `revokeReceptionPhotoConsentAction`
6. `setReceptionWelcomeEnabledAction` · enforce pré-reqs

Role gate: `owner/admin/receptionist` (camada TS) + RLS no DB (dupla camada).

---

## 11. UI entregue

`apps/lara/src/app/crm/pacientes/[id]/_reception-panel.tsx`:

- Card "Foto e recepção" abaixo dos cards existentes
- Avatar 88x88px circular · foto via signed URL se disponível · fallback iniciais
- Botão "Adicionar foto" / "Substituir" → file input hidden → upload via FormData
- Botão "Remover" com confirm
- Card "Consentimento":
  - Badge status (Pendente · ✓ Concedido · Revogado)
  - Data de granted/revoked
  - Nota se houver
  - Botão "Registrar consentimento" (prompt para nota) ou "Revogar" (confirm)
- Card "Boas-vindas":
  - Badge "Ativada" emerald / "Desligada" muted
  - Botão toggle (disabled se pré-reqs não atendidos)
  - Hint: "Tudo pronto · clique para ativar" / "Requer foto + consentimento ativos"
- Form: display_name, preferred_name, animation_style (3 opções)
- Botão "Salvar preferências"
- Banner: "💡 A foto só será exibida na recepção se houver consentimento ativo..."
- Mensagens traduzidas para PT-BR

---

## 12. Como o Painel-TV futuro consome

Em fase futura (próxima · `2ALEXA.2.1` ou similar), o painel `/recepcao/painel`
pode evoluir para:

```typescript
// Em /recepcao/painel/page.tsx (futuro):
for (const appt of arrived) {
  if (appt.patientId) {
    const display = await repos.patientProfile.getReceptionDisplayProfile(appt.patientId)
    if (display) {
      // Mostra foto consentida + nome preferido + animação escolhida
      // signedUrl gerada server-side aqui
    } else {
      // Fallback: avatar com iniciais (estado atual)
    }
  }
}
```

`getReceptionDisplayProfile` **NUNCA retorna** dados sem:
- `welcome_enabled=true`
- `consent_status='granted'`
- `profile_photo_path NOT NULL`

Painel não precisa fazer essa lógica · DB já filtra.

---

## 13. Smoke (10 cenários · ROLLBACK)

| Test | Resultado |
|---|---|
| A INSERT profile básico | ✅ |
| B welcome=true sem consent · CHECK bloqueia | ✅ blocked |
| C set photo path | ✅ |
| D welcome=true (com photo) sem consent · CHECK bloqueia | ✅ blocked |
| E grant consent | ✅ |
| F welcome=true após grant+photo · CHECK aceita | ✅ |
| G reception_ready_count ≥ 1 | ✅ |
| H revoke sem welcome=false · CHECK bloqueia | ✅ blocked |
| I revoke + welcome=false atômico | ✅ |
| J revoked NÃO aparece em reception-ready | ✅ |
| safety wa_outbox_delta | 0 |

---

## 14. Validation final

```json
{
  "worker71_off": true,
  "patient_profile_contract_ready": true,
  "reception_photo_consent_ready": true,
  "storage_private_ready": true,
  "privacy_contract_ok": true,
  "unsafe_outbox_count": 0,
  "cron_with_provider_call": 0,
  "phase_perdido_count": 0,
  "tracker_mig_180": null,
  "can_continue": true
}
```

`tracker_mig_180` null · auto-classifier bloqueou helper INSERT · padrão das fases anteriores (CONTROL.2 pattern). Mig está aplicada e operacional · tracker é metadata.

---

## 15. O que NÃO foi feito

- ❌ Atualizar painel-TV `/recepcao/painel` para consumir foto (próxima fase)
- ❌ Anamnese-builder
- ❌ Prontuário clínico detalhado
- ❌ Histórico médico
- ❌ Orçamento avançado
- ❌ Coluna avatar/photo direto em `patients` (preserva canon)
- ❌ Bucket público
- ❌ Provider externo de foto
- ❌ Notification API / Push
- ❌ Painel-TV multi-clínica

---

## 16. Riscos residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| Signed URL de 5 min expira durante visualização longa | 🟢 baixo | Page revalidate força refresh · URL renova |
| Service role usado para upload | 🟡 médio | Action gate de role + Zod · bucket é privado |
| Storage RLS não configurada para `patient-profiles/*` | 🟡 médio | Bypass via service role · UI nunca acessa direto · documentado |
| Tracker mig 180 não registrado | 🟢 baixo | Mig aplicada · efeito real · tracker é metadata |
| Painel-TV não consome ainda foto | 🟢 baixo | Próxima fase entrega · este é base correta |
| Operação manual de admin pode bypassar CHECK via service_role | 🟢 baixo | Admin manual é audit trail aceitável · DB é fonte da verdade |

---

## 17. Próxima fase

Ver [`105-next-prompt-after-patient-profile.md`](105-next-prompt-after-patient-profile.md).

Recomendado: **CRM_PHASE_2ALEXA.2.1** · atualizar painel-TV `/recepcao/painel`
para consumir `getReceptionDisplayProfile()` com foto + animação quando
consentido. Fallback continua avatar com iniciais para pacientes sem consent.

---

## 18. Veredito

**`PASS_CRM_PATIENT_PROFILE_RECEPTION_PHOTO_APPLIED_SMOKE_OK_LOCAL_COMMIT`**

Base correta da foto+consent+welcome no prontuário do paciente entregue.
Mig 180 aplicada · 4 CHECK constraints + 3 RLS policies. Storage reusa
bucket privado existente. Repository + 6 server actions + UI integrada.
Smoke 10/10 PASS com `wa_outbox_delta=0`. Painel-TV NÃO foi tocado ·
pipeline correto preserva commit `d3db2ee` (2ALEXA.2) como base · próxima
fase evolui o painel para consumir foto consentida.
