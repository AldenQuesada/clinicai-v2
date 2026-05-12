# CRM_PHASE_2I · Anamnesis + Informed Consent (intra-consulta)

> **Data:** 2026-05-12
> **Status:** APPLIED · smoke PASS · UI live · dry-mode (worker 71 OFF)
> **HEAD inicial:** `67cd50a` · HEAD final esperado: commit local 2I
> **Verdict alvo:** `PASS_CRM_PHASE_2I_APPLIED_SMOKE_OK_UI_READY_LOCAL_COMMIT`

---

## 1 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `67cd50a27a52327b11378594cef184085ca5233d` |
| Working tree | limpo |
| Migs 160–163 | registradas |
| Worker 71 | OFF ✅ (gate inegociável) |

---

## 2 · Gate WhatsApp banido (preservado)

Esta fase **não toca em envio** · nenhuma RPC nova interage com `wa_outbox`, Evolution ou Meta. As tabelas novas (`appointment_anamneses` + `appointment_informed_consents`) são INTERNAS · consumidas pela UI da agenda.

Doc canônico: [45-phase-2l-whatsapp-real-send-ban-gate.md](45-phase-2l-whatsapp-real-send-ban-gate.md).

---

## 3 · Auditoria de tabelas pré-existentes

Achado: o DB **já tem** dois sistemas de anamnese/consent, mas atendem **outro fluxo**:

| Sistema | Propósito | Vínculo com appointment? | Fluxo |
|---|---|---|---|
| `anamnesis_*` (13 tabelas + view) | Ficha de anamnese formal · sistema robusto com templates + fields + responses + tokens | `anamnesis_requests.appointment_id` nullable | **PRÉ-consulta · paciente preenche via link público** |
| `legal_doc_requests` / `legal_doc_signatures` / `legal_doc_templates` (31 templates ativos) | Documentos legais com assinatura formal · canvas/data URL | `legal_doc_requests.appointment_id` nullable | **PRÉ/PÓS-consulta · paciente assina via link público** |
| `appointments.consentimento_img` (text) | Flag legacy enum | Embutido no row do appointment | Marcador simples · não tem registro estruturado |

**Decisão 2I:** os sistemas existentes são para fluxo PRÉ-consulta (paciente preenche em casa). Para o fluxo INTRA-consulta (Dra. Mirian preenche durante o atendimento) **não existia** estrutura. Criada Mig 166 com tabelas dedicadas SEM tocar nada do legado.

---

## 4 · Contrato clínico 2I

### 4.1 · Anamnesis intra-consulta (`appointment_anamneses`)

**Status canônico:** `draft` → `complete` (+ `archived` como reservado).

Campos clínicos cobertos (mínimos para estética):
- `chief_complaint` · queixa principal
- `medical_history` · histórico médico
- `medications` · medicações em uso
- `allergies` · alergias
- `previous_procedures` · procedimentos prévios
- `contraindications` · contraindicações relevantes
- `pregnancy_lactation` · gestação/lactação
- `autoimmune_disease` · doenças autoimunes
- `anticoagulants` · uso de anticoagulantes
- `expectations` · expectativas do paciente
- `professional_notes` · notas do profissional
- `payload` jsonb (expansão futura)

**Idempotência:** UNIQUE parcial em `(appointment_id) WHERE deleted_at IS NULL AND status <> 'archived'` · garante 1 ativa por appointment.

### 4.2 · Consent intra-consulta (`appointment_informed_consents`)

**Campos:**
- `term_key`, `term_version`, `term_title`
- `signer_name`, `accepted`, `accepted_at`, `accepted_by`
- `revoked_at`, `revoke_reason`
- `payload` jsonb (IP, client, geolocation...)

**Idempotência:** UNIQUE parcial em `(appointment_id, term_key, term_version) WHERE deleted_at IS NULL AND revoked_at IS NULL`.

**Check constraint:** `accepted=true` requer `accepted_at IS NOT NULL`.

### 4.3 · Gate consolidado

`gate_status` ∈ {`ok`, `warning`} computado por:
- `ok` = anamnesis.status=`complete` AND consent.signed=true
- `warning` = caso contrário

**Decisão 2I:** warning-only · **não bloqueia** ações. Hard gate (bloquear `finalize` se warning) fica reservado para fase 2I.1.

---

## 5 · Banco / RPC · Mig 166 aplicada

| Objeto | Tipo | Comportamento |
|---|---|---|
| `appointment_anamneses` | TABLE | RLS clinic_id · GRANT SELECT/UPDATE auth · INSERT/DELETE service_role |
| `appointment_informed_consents` | TABLE | Mesmo padrão · GRANT idem |
| `appointment_anamnesis_upsert(uuid, jsonb)` | RPC SECURITY DEFINER | Cria draft ou atualiza row ativa · idempotente |
| `appointment_anamnesis_mark_complete(uuid)` | RPC SECURITY DEFINER | draft → complete · idempotent_skip quando já complete |
| `appointment_consent_accept(uuid, text, text, text, text, jsonb)` | RPC SECURITY DEFINER | Aceite com signer_name obrigatório · idempotent por (term_key, term_version) |
| `appointment_clinical_gate_status(uuid)` | RPC SECURITY DEFINER STABLE | Consolida estado · retorna gate_status + anamnesis + consent |

GRANT EXECUTE → `authenticated` + `service_role` em todas as 4 RPCs.

**Search path:** `'public', 'extensions', 'pg_temp'` em todas.

**Sanity DO block** valida criação · `NOTIFY pgrst, 'reload schema'` final.

---

## 6 · Backend / actions

### 6.1 · Repository

[packages/repositories/src/appointment.repository.ts](../../packages/repositories/src/appointment.repository.ts) ganhou 4 métodos:
- `upsertAnamnesis(appointmentId, payload)`
- `markAnamnesisComplete(appointmentId)`
- `acceptConsent({appointmentId, termKey, termVersion, termTitle, signerName, payload})`
- `getClinicalGateStatus(appointmentId)` · usado em SSR no detail page

### 6.2 · Schemas Zod

[apps/lara/src/app/crm/_schemas/appointment.schemas.ts](../../apps/lara/src/app/crm/_schemas/appointment.schemas.ts):
- `AppointmentAnamnesisUpsertSchema` · 11 campos clínicos opcionais
- `AppointmentAnamnesisCompleteSchema` · só appointmentId
- `AppointmentConsentAcceptSchema` · termKey/termVersion/termTitle/signerName obrigatórios
- `AppointmentClinicalGateStatusSchema` · só appointmentId

### 6.3 · Server actions

[apps/lara/src/app/crm/_actions/appointment-clinical.actions.ts](../../apps/lara/src/app/crm/_actions/appointment-clinical.actions.ts) (NOVO arquivo):
- `upsertAppointmentAnamnesisAction`
- `completeAppointmentAnamnesisAction`
- `acceptAppointmentConsentAction`
- `getAppointmentClinicalGateStatusAction` (RSC consome via repository direto · action exposta pra uso opcional)

Invalidam `CRM_TAGS.appointments` após mutação.

---

## 7 · UI entregue

### 7.1 · Clinical Panel ([_clinical-panel.tsx](../../apps/lara/src/app/crm/agenda/[id]/_clinical-panel.tsx))

Card "Clínico · Anamnese + Consentimento" renderizado entre Status e Subject no detail page. Mostra:
- Badge **Anamnese · Em rascunho/Completa/Não preenchida** (com ícone FileText)
- Badge **Consentimento · Assinado/Pendente** (com ícone ShieldCheck)
- Badge **Gate clínico · OK/Atenção** (com ícone CheckCircle2/AlertCircle)
- Mensagem informativa quando gate=atenção
- 2 botões: "Preencher anamnese" + "Registrar consentimento"

### 7.2 · Anamnesis Modal

Modal max-w-2xl com 11 campos:
- Queixa principal (textarea)
- Histórico médico + Medicações (grid 2 cols)
- Alergias + Procedimentos prévios (grid 2 cols)
- Contraindicações (textarea)
- Gestação/lactação + Anticoagulantes + Expectativas (grid 3 cols)
- Notas do profissional (textarea)

Botões: **Cancelar · Salvar rascunho · Salvar e marcar completa** (último faz upsert + mark_complete sequencial).

### 7.3 · Consent Modal

Modal com termo TCLE simplificado embutido + checkbox de ciência + campo signer_name (pre-preenchido com `appt.subjectName`).

Default term:
```
term_key: 'tcle_estetica'
term_version: 'v1.0'
term_title: 'TCLE - Termo de Consentimento Livre e Esclarecido (Procedimentos Estéticos)'
```

Se já assinado, modal mostra estado "✓ Já registrado · termo v1.0" sem possibilidade de re-aceite (idempotência respeitada).

### 7.4 · Warning no FinalizeWizard

[_actions-bar.tsx](../../apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx) · `FinalizeWizard` recebe novas props:
- `clinicalGateStatus: 'ok' | 'warning'`
- `anamnesisStatus`
- `consentSigned`

Quando `gate=warning`, renderiza alert amarelo no topo do modal:
> ⚠️ **Gate clínico · atenção:** anamnese {status} · consentimento informado não registrado. A finalização ainda é permitida (warning · 2I), mas recomenda-se preencher antes de fechar.

**NÃO bloqueia o submit** · warning visual apenas (decisão documentada 2I).

---

## 8 · Gate · warning vs hard gate

| Estágio | Comportamento | Fase |
|---|---|---|
| Marcar chegada (`attend`) | Sem gate (sempre permitido) | 2H |
| Iniciar atendimento (`change_status em_atendimento`) | Sem gate (sempre permitido) | 2H |
| Finalizar consulta | **Warning não-bloqueante** se gate=warning | 2I (esta fase) |
| Finalizar consulta | **Bloqueio real** se gate=warning | 2I.1 (futura) |

Razão da decisão: não quebrar fluxo operacional atual + dar tempo de a equipe acostumar com o painel clínico antes de bloquear. Hard gate vem em rolling release após validação de campo.

---

## 9 · Smoke transacional · resultado

```
SMOKE_RESULT_2I:
  TESTE A · gate inicial:
    gate_status: 'warning' ✅
    anamnesis.status: 'none', consent.signed: false ✅
  TESTE B · anamnesis upsert:
    upsert_1: action='created', status='draft' ✅
    upsert_2: action='updated', same anamnesis_id ✅ (idempotent)
    gate_draft: 'warning' (sem consent ainda) ✅
  TESTE C · mark complete:
    complete_1: idempotent_skip=false ✅
    complete_2: idempotent_skip=true ✅
    gate_complete_only: 'warning' (anamnese complete · sem consent) ✅
  TESTE D · consent accept:
    consent_1: accepted=true, accepted_at populado ✅
    consent_2: idempotent_skip=true ✅
    gate_final: 'ok' ✅ (anamnese complete + consent signed)
  TESTE E · bloqueios:
    consent_no_name: error='signer_name_required' ✅
    consent_invalid_appt: error='appointment_not_found' ✅
  worker71_off_still: true ✅
  wa_outbox_delta: 0 ✅
```

ROLLBACK forçado via `RAISE EXCEPTION` · zero dado persistente.

[Arquivo smoke](sql/phase-2i-anamnesis-consent-smoke.sql) | [Arquivo validation](sql/phase-2i-anamnesis-consent-validation.sql)

---

## 10 · Validation flags esperadas

| Flag | Esperado |
|---|---|
| worker71_off | true |
| anamnesis_schema_ready | true |
| consent_schema_ready | true |
| fn_anamnesis_upsert_ready | true |
| fn_anamnesis_complete_ready | true |
| fn_consent_accept_ready | true |
| fn_clinical_gate_ready | true |
| duplicate_anamnesis_count | 0 |
| duplicate_consent_count | 0 |
| orphan_anamnesis_count | 0 |
| orphan_consent_count | 0 |
| consent_accepted_without_ts | 0 |
| unsafe_outbox_count | 0 |
| tracker_mig_166 | "20260800000166" |
| **can_continue** | **true** |

---

## 11 · Segurança / LGPD

- **RLS multi-tenant ADR-028:** todas as queries autenticadas filtradas por `clinic_id = app_clinic_id()` JWT.
- **GRANT mínimo:** authenticated tem SELECT/UPDATE apenas · INSERT/DELETE só via RPC SECURITY DEFINER.
- **`SET search_path TO 'public', 'extensions', 'pg_temp'`** em todas as RPCs (defesa contra schema hijacking).
- **`accepted=true` requer `accepted_at` not null** (CHECK constraint).
- **Soft delete preservado** (`deleted_at` nullable).
- **Audit trail leve:** `created_by` / `updated_by` populados via `auth.uid()` quando JWT presente.
- **Sem upload de assinatura digitalizada** (canvas) nesta fase · termo é simplificado e operacional. Fluxo formal com `signature_data_url` permanece em `legal_doc_signatures` (separado).
- **Zero conexão com `wa_outbox`** ou provider externo.
- **Confirmações negativas:** zero job 71 activation · zero WhatsApp · zero env/secrets.

---

## 12 · Limitações conhecidas

- **Soft gate apenas** · finalize não é bloqueado mesmo com gate=warning. Hard gate fica para 2I.1.
- **Termo único hardcoded** no modal · `term_key='tcle_estetica' v1.0`. Versionamento de múltiplos termos por procedimento fica para fase futura (pode reusar `legal_doc_templates` com mapping).
- **Sem assinatura visual** (canvas/data URL) · só `signer_name` text. Para assinatura formal, usar fluxo `legal_doc_signatures` paralelo.
- **Sem revogação via UI** · campo `revoked_at` existe no schema mas não há botão "Revogar consentimento" nesta fase. Requer fase dedicada se necessário.
- **`anamnesis_*` legacy intocado** · não há sincronização entre o sistema pré-consulta (paciente preenche em casa) e a anamnese intra-consulta. Pode ser conectado em fase futura via referência cruzada.
- **`payload jsonb`** está reservado para expansão (campos específicos por procedimento) mas não tem schema validation além de ser jsonb.

---

## 13 · Rollback

`db/migrations/20260800000166_clinicai_v2_anamnesis_consent.down.sql` (DROP em ordem · funções → tabelas).

```bash
# Pre: confirmar que não há dados em produção
SUPABASE_ACCESS_TOKEN=... node scripts/apply-migration.mjs db/migrations/20260800000166_clinicai_v2_anamnesis_consent.sql --down
DELETE FROM supabase_migrations.schema_migrations WHERE version='20260800000166';
```

Reversão zera UI clínica e remove 2 tabelas + 4 RPCs · zero impacto em sistemas pré-existentes (anamnesis_*, legal_doc_*).

`git revert` do commit local cobre o cleanup TS.

---

## 14 · Próxima fase recomendada

Consultar [60-next-prompt-after-2i.md](60-next-prompt-after-2i.md):

1. **2I.1 · Hard gate clinical finalization** (bloquear finalize se warning)
2. **2J.1 · `lead_lost` dedicado** (botão no card do lead)
3. **2L.1 · Ban resolution audit** (paralelizável · READ-ONLY)
4. **2H.1 · Cleanup zumbi `em_consulta`/`pre_consulta`**
5. **2I.2 · Termos por procedimento** (mapeamento múltiplos consents)
