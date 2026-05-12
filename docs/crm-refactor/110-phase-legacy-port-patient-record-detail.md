# CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_DETAIL · Prontuário detalhado (Trilha A)

> Trilha A · `/crm/pacientes/[id]` reorganizado em 9 abas usando read models
> server-side. Zero migration · zero alteração de hard gate clínico · zero
> provider · documentos como placeholder explícito.

---

## 1 · Objetivo

Transformar o detalhe de paciente em prontuário enterprise com seções
focadas, mantendo:

- privacidade (telefone só admin/owner/receptionist · foto via signed URL TTL 5min);
- hard gate clínico intocado (`appointment_finalize`,
  `appointment_clinical_gate_status`, `appointment_anamnesis_*`,
  `complete_anamnesis_form`);
- contratos canônicos (sem inferência operacional · sem localStorage);
- ausência de provider externo, WhatsApp, Alexa, Meta, wa_outbox, cron.

---

## 2 · Contexto

| Item | Estado |
|---|---|
| Branch · HEAD inicial | `main` · `448566a` |
| Schema base | patient/appointments/orcamentos/phase_history/anamnesis_*/clinic_procedimentos · todos prontos |
| Foto + consentimento | entregue (PRONTUARIO_BASE) |
| Builder anamnese | entregue (ANAMNESIS_BUILDER) |
| Procedimento canônico no wizard | Trilha B1 entregue (snapshot via `procedure_name`) |

---

## 3 · Fontes de dados

| Aba | Read model | Repository · Tabela |
|---|---|---|
| Visão geral | agregados | `repos.patients.getById`, `appointments.listBySubject`, `orcamentos.listBySubject`, `anamnesisTemplates.listClinicalRecordsForPatient` |
| Dados | patient | `repos.patients.getById` |
| Agenda | appointments | `repos.appointments.listBySubject(clinic_id, {patientId})` |
| Procedimentos | snapshot agrupado | `appointments.procedure_name` + match `clinic_procedimentos.nome` |
| Anamnese | clinical records | `repos.anamnesisTemplates.listClinicalRecordsForPatient` (lê `appointment_anamneses`) |
| Orçamentos | orcamentos | `repos.orcamentos.listBySubject` |
| Timeline | merge | criação do paciente + appointments + anamneses + orcamentos |
| Documentos | **placeholder** | `medical_record_attachments` existe mas 0 policies → módulo bloqueado |
| Notas | patient.notes + reception | `patients.notes` text + `PatientReceptionPanel` |

---

## 4 · Diagnóstico schema (preflight)

```json
{
  "patient_tables": ["patient_profiles_extended", "patients", "phase_history"],
  "budget_tables": ["_ai_budget", "budget_items", "budgets", "orcamentos", "v_ai_budget_today"],
  "response_tables": ["anamnesis_consolidated_view", "anamnesis_requests", "anamnesis_responses", "appointment_anamneses"],
  "doc_tables": ["medical_record_attachments"],
  "hard_gate": {
    "appointment_finalize": true,
    "appointment_clinical_gate_status": true,
    "appointment_anamnesis_upsert": true,
    "appointment_anamnesis_mark_complete": true,
    "complete_anamnesis_form": true
  }
}
```

**`medical_record_attachments`**: RLS enabled mas **0 policies** = ninguém
acessa por client autenticado. Bloqueado por contrato · UI mostra
placeholder.

---

## 5 · Decisão da trilha

**Trilha A · estrutura suficiente para entrega read-heavy completa.**

- Dados de pacientes/appointments/orcamentos/anamneses já têm RLS.
- Não há schema novo necessário para o core do prontuário.
- O único gap (documentos) está **declarado** como placeholder visível
  para evitar mentira de contrato.

Zero migration aplicada · zero migration proposta nesta fase.

---

## 6 · UI entregue

### 6.1 Header
- nome · status · ações (Editar · SoftDelete admin)
- breadcrumb CRM > Pacientes > nome

### 6.2 Abas client-side (URL `?tab=...` persistida via `history.replaceState`)
1. **Visão geral** · 5 cards (Identidade, Contato, Financeiro, Endereço, Resumo clínico, Origem)
2. **Dados** · status/assigned/timestamps cadastrais
3. **Agenda** · tabela completa (data · horário · procedimento · profissional · status · valor)
4. **Procedimentos** · grupos por `procedure_name` snapshot + match catálogo · badge "catálogo" vs "snapshot legado"
5. **Anamnese** · lista de `appointment_anamneses` · status · flag `hasContent` · concluída em
6. **Orçamentos** · número · título · status · total · sent_at · validade
7. **Timeline** · merge cronológico desc (criação, appointments, anamneses, orçamentos · sent/approved)
8. **Documentos** · placeholder explícito · justifica por que está inativo
9. **Notas** · `patient.notes` + `PatientReceptionPanel` (foto/consent reusados da PRONTUARIO_BASE)

### 6.3 Estados
- Empty per aba (mensagem clara · sem dados quebrados)
- Foto: render Avatar via signed URL TTL 5min · iniciais como fallback
- Procedimentos: badge `catálogo` (emerald) vs `snapshot legado` (zinc)
- Anamnese: badge `preenchida` vs `vazia`

---

## 7 · Seções placeholder

| Seção | Motivo | Próxima fase |
|---|---|---|
| **Documentos** | `medical_record_attachments.policy_count = 0` · sem RLS efetiva, expor seria risco LGPD | `CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT` (bucket privado · signed URL · role gate) |
| **Anamnese · respostas detalhadas** | Mostrar campos clínicos (medical_history, medications, etc) precisa decisão de role-gate · esta fase só mostra status + flag hasContent | `CRM_PHASE_PATIENT_RECORD.ANAMNESIS_READ` |
| **Phase history timeline** | `phase_history` é por `lead_id` · paciente promovido perde lead_id na maioria · entregar isso pede resolução do lead originário | `CRM_PHASE_PATIENT_RECORD.PHASE_TIMELINE` |

---

## 8 · Privacidade

- **Telefone**: aparece no prontuário autenticado · NÃO no Painel-TV (contrato anterior preservado).
- **Foto**: signed URL TTL 5min via `createServiceRoleClient` · `profile_photo_path` nunca viaja.
- **Painel-TV intocado**: zero dado clínico no `/recepcao/painel`.
- **Path bruto de storage**: nunca exposto · documentos placeholder bloqueia qualquer exposição acidental.
- **Anamnese clínica detalhada**: campos `medical_history`/`medications`/`allergies` **não retornam** no DTO `PatientAnamnesisRecordDTO`; apenas booleano `hasContent`.
- **Logs**: server actions limitam a IDs · sem payload sensível.

---

## 9 · Relação com hard gate clínico

**NÃO TOCADO**.

- `appointment_finalize` · não chamado nem alterado.
- `appointment_clinical_gate_status` · não chamado nem alterado.
- `appointment_anamnesis_upsert` · não chamado nem alterado.
- `appointment_anamnesis_mark_complete` · não chamado nem alterado.
- `complete_anamnesis_form` · não chamado nem alterado.

Validation SQL confirma `hard_gate_untouched=true`. A aba "Anamnese"
é **read-only** · não dispara mark_complete, não atualiza status, não
inicia request nova.

---

## 10 · Relação com appointments.procedure_id

- FK **não assumida** · usa `procedure_name` snapshot.
- Match com `clinic_procedimentos.nome` (case-insensitive trim) feito
  server-side via `procedureCatalog` passado pro client.
- Match positivo → enriquece UI com categoria/preço de referência.
- Match negativo → label "snapshot legado" (sem mentira).
- `PROPOSED_appointments_procedure_fk.sql` **não aplicada**.

---

## 11 · Validações executadas

| Validation | Resultado |
|---|---|
| `pnpm --filter @clinicai/repositories typecheck` | OK |
| `pnpm --filter @clinicai/lara typecheck` | OK |
| SQL validation `phase-legacy-port-patient-record-detail-validation.sql` | final_flags green |

Validation flags chave:

- `worker71_off`: true
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `cron_with_provider_call`: 0
- `patient_profile_base_ready`: true
- `anamnesis_builder_ready`: true
- `hard_gate_untouched`: true
- `storage_path_not_exposed_contract`: true
- `partial_sections_documented`: true
- `migration_required_not_applied`: false (zero migration)
- `remote_schema_unchanged`: true
- **`can_continue`: true**

---

## 12 · Limitações

| Limitação | Mitigação |
|---|---|
| Sem upload de documentos | placeholder visível · módulo dedicado planejado |
| Sem respostas clínicas detalhadas | flag `hasContent` · respostas vivem no fluxo clínico canônico |
| Sem phase_history para pacientes | timeline cobre criação + appointments + anamneses + orçamentos |
| Sem dropdown drag-drop em anamnese | builder admin avançado vive em fase futura |

---

## 13 · Próximos passos

- **CONTROL.3 · Residual cleanup** (próxima recomendada): clinic_alexa_config, restos de Alexa, appointments antigos sem professional_id, etc.
- **`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT`**: ativar `medical_record_attachments` com RLS + bucket + role gate.
- **`CRM_PHASE_PATIENT_RECORD.ANAMNESIS_READ`**: expor respostas clínicas detalhadas com role gate.

---

## 14 · Veredito

**PASS_CRM_LEGACY_PORT_PATIENT_RECORD_DETAIL_READY_LOCAL_COMMIT**

- Trilha A · 9 abas entregues · documentos como placeholder explícito
- Zero migration · zero alteração de hard gate · zero provider
- Typecheck OK · validation green · `can_continue=true`
- Aguardando autorização para `git push origin main`
