# CRM_PHASE_PATIENT_RECORD.NEXT_ENTERPRISE_BLOCK_AUDIT · Auditoria de decisão

> Auditoria read-only do estado pós Media Vault (mig 184 aplicada) para
> escolher o próximo bloco enterprise do CRM com **maior impacto e menor
> risco**. Zero alteração de banco/app/UI/cron.

---

## 1 · Contexto

| Item | Valor |
|---|---|
| Branch · HEAD | `main` · `c7f7ab1` |
| Migrações canônicas recentes | 178 → 184 (todas com tracker registrado) |
| Hard gate clínico | 7 funcs presentes (`appointment_finalize`, `_clinical_gate_status`, `_anamnesis_upsert`, `_anamnesis_mark_complete`, `complete_anamnesis_form`, `_consent_accept`, `_attend`) |
| `job 71` (wa_outbox_worker) | OFF |
| Provider externo (Alexa/Evolution/Meta cron) | 0 |
| Crons ativos (12, 72, 89–94) | rodando (alerts internos + agenda summary · sem provider externo) |

Safety pré-audit: `worker71_off=true`, `unsafe_outbox_count=0`, `phase_perdido_count=0`, `invalid_appointment_status_count=0`, `cron_with_provider_call=0`, `hard_gate_untouched=true`, `media_vault_ready=true`, `appointment_procedure_fk_ready=true`, `alexa_legacy_dropped=true`, `can_continue=true`.

---

## 2 · Snapshot operacional (volumes reais)

| Domínio | Contagem |
|---|---|
| `patients` ativos | 2 |
| `appointments` ativos | 3 (todos `finalizado` · seed/teste) |
| `leads` | 122 (120 phase=`lead`, 1 `paciente`, 1 `orcamento`) |
| `orcamentos` | 3 (todos `draft`) |
| `wa_outbox` total | 123 (queued=0 · histórico) |
| `wa_numbers` ativos | 5 |
| `medical_record_attachments` | 0 (vault destravado · zero uso real) |
| `clinic_procedimentos` ativos | 44 |
| Templates Meta | 0 (`templates` table não existe; `b2b_comm_templates` table existe) |

---

## 3 · Diagnóstico por domínio

### 3.1 Prontuário do paciente (`/crm/pacientes/[id]`)

Estado pós-fases CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_DETAIL +
PRONTUARIO_BASE + MEDIA_VAULT:

| Aba | Estado | Gap operacional |
|---|---|---|
| Visão geral | funcional | — |
| Dados | funcional | — |
| Agenda | funcional · stats reais | só 3 appts no banco · pouca densidade de uso |
| Procedimentos | funcional · FK canônica (mig 182) | **0 appts com `procedure_id` populated** · wire OK mas runtime zero |
| Anamnese | **read-only · lista vazia** (`appointment_anamneses=0` rows) | **Pipeline de coleta inexistente** |
| Orçamentos | funcional · 3 draft | sem fluxo de envio/aprovação |
| Timeline | funcional | depende dos dados acima |
| Documentos | **funcional via UI** (vault destravado · therapist OK) | smoke browser pendente · zero uploads reais |
| Notas | funcional · `patients.notes` text | — |

### 3.2 Anamnese (lacuna mais crítica do prontuário)

Infra técnica **enterprise** já existente:
- 14 tabelas (`anamnesis_templates`, `_template_sessions`, `_fields`, `_field_options`, `_requests`, `_responses`, `_answers`, `_links`, `_request_access_logs`, `_response_flags`, `_response_protocol_suggestions`, `_token_failures`, `_consolidated_view`, `appointment_anamneses`)
- 1 template ativo (`ANAMNESE ESTÉTICA · is_pre_appointment_form=true`)
- 11 sessions · 66 fields · 81 options
- RPCs no banco: `create_anamnesis_request`, `complete_anamnesis_form`, `generate_anamnesis_request_token`, `mark_anamnesis_request_opened`, `appointment_anamnesis_upsert`, `appointment_anamnesis_mark_complete`, `set_anamnesis_request_defaults`, `_anamnese_link`, `mr_get_anamnesis_link`, `validate_anamnesis_pub*`, etc.

Runtime no app TypeScript:
- **ZERO refs a `create_anamnesis_request`, `complete_anamnesis_form`, `generate_anamnesis_request_token`** em `apps/lara/src` (confirmado por grep)
- Existe `/configuracoes/anamneses` (admin do builder · entregue em ANAMNESIS_BUILDER fase)
- **NÃO existe rota patient-facing `/anamnese/[token]`**
- **NÃO existe action server-side para gerar request/copiar link**
- Aba Anamnese do prontuário só **lista** `appointment_anamneses` (0 rows)

**Resultado:** clínica não consegue enviar anamnese pré-consulta nem registrar respostas. A infra mais sofisticada do projeto **não tem nenhuma UI/action conectada**. Maior gap entre "pronto no banco" e "operacional no fluxo".

### 3.3 Consentimento informado

Tabelas existentes:
- `appointment_informed_consents` (canônica)
- `b2b_consent_log` · `lp_consents` · `wa_consent` (escopos paralelos)
- `appointments.consentimento_img` (text legacy · `pendente/assinado/recusado/nao_aplica`)
- `patient_profiles_extended.reception_photo_consent_*` (foto recepção)

RPC: `appointment_consent_accept` existe (hard gate)

UI: não há aba de consentimento no prontuário hoje. Existe vínculo no FinalizeWizard (não auditado em detalhe nesta fase).

**Gap:** Patient-facing pode existir parcial em LPs · não existe fluxo dedicado de consentimento intra-consulta no prontuário.

### 3.4 Modal de finalização (`appointment_finalize`)

Estrutura DB:
- RPC `appointment_finalize` presente (hard gate enforça anamnese + consent)
- `appointments.outcome` **NÃO** é coluna (outcome vive dentro da RPC)
- `budget_items` table existe · `orcamentos.items` jsonb existe
- 4 outcomes Zod: `paciente`, `orcamento`, `paciente_orcamento`, `perdido`

Estado UI: FinalizeWizard existe e funciona (CRM_PHASE_2J pré-existente · não auditada em detalhe aqui).

**Gap:** sem necessidade óbvia · pode receber polish mas hard gate é estável e arriscado tocar.

### 3.5 Jornada pré-consulta

Infra:
- `agenda_alerts_log` · `appointment_internal_alerts` · `wa_agenda_automations` (3 tabelas)
- Crons ativos: 12 (daily-summary), 72 (alert-min-before), 89 (d-zero), 90 (d-before), 91 (not-confirmed), 92 (d-after), 93 (next-patient-internal), 94 (attention-required-internal)
- Job 71 (wa_outbox_worker) **OFF** · sem WhatsApp real saindo

**Estado:** crons rodam e gravam em `agenda_alerts_log`. Cobertura interna parece existir. O que falta é envio externo (depende de Meta unban) e/ou UI de visualização para secretaria.

### 3.6 Jornada pós-consulta

Tabelas/conceitos:
- `orcamentos` com follow-up via `valid_until` (cron 92 d-after pode pegar)
- `commercial_recovery` (CRM_PHASE_2RC) existe
- `phase_history` registra transições

**Estado:** infra OK · UI de "kanban pós-consulta" parcial · depende fortemente de WhatsApp real para fechar o loop.

### 3.7 Meta/WhatsApp real (2L.2.1 / 2L.3)

Estado:
- `wa_numbers`: 5 ativos com `phone`, `access_token`, `phone_number_id`, `business_account_id`, `api_url` populated
- `wa_outbox` populated (123 rows · queued=0 · todas históricas)
- Job 71 OFF · zero envio real
- Templates table `templates` **não existe** (`b2b_comm_templates` table existe mas só 1 row · usado para B2B)

**Bloqueio:** depende de "Meta unban" (recurring constraint mencionada em fases anteriores). Não destravável agora.

### 3.8 Media Vault

Estado pós mig 184:
- `medical_record_attachments`: 4 policies (uses_therapist=true · uses_professional=false)
- 0 rows · 0 storage objects em `media/<clinic>/medical-records/`
- Bucket `media` privado · 35 storage policies tenant-aware
- UI funcional (upload + listagem + signed URL TTL 5min + soft-delete)
- **Smoke browser real pendente** (depende de browser/fixture · doc 119 + validation SQL prontos)

---

## 4 · Matriz de decisão

| Bloco | Impacto operacional | Risco técnico | Dep externa | Browser? | WA/Meta real? | Migration? | Prontidão | Esforço | Recomendação |
|---|---|---|---|---|---|---|---|---|---|
| **A · Anamnese operacional** (request + patient-facing + ingestão prontuário) | **ALTO** · destrava infra dormente | **médio** (RPCs DB prontas · TS zerado) | nenhuma | parcial (smoke) | **NÃO** (link por copy-paste / token público controlado) | provável menor (talvez índice ou rota pública) | 80% | 2–3 fases | ★ **PRINCIPAL** |
| B · Consentimento informado | médio | médio (toca hard gate finalize) | nenhuma | parcial | NÃO | maybe | 60% | 2 fases | secundário |
| C · Modal finalização premium | alto | **alto** (toca hard gate `appointment_finalize`) | nenhuma | sim | NÃO | maybe | 70% | 3 fases | adiar · risco alto |
| D · Jornada pré-consulta · secretaria | médio | baixo (crons já rodam · só UI) | nenhuma | sim | NÃO | NÃO | 90% | 1–2 fases | atalho rápido se quiser entrega curta |
| E · Jornada pós-consulta · recovery | alto | médio | parcial Meta para envio | sim | parcial | NÃO | 70% | 2–3 fases | depende WA real |
| F · Smoke browser MV | baixo (validação) | nulo | sim (browser+fixture) | sim | NÃO | NÃO | n/a · operador | 1 fase | tarefa de QA externo |
| G · Meta/WA 2L.2.1 / 2L.3 | alto | alto (provider externo) | **SIM (Meta unban)** | parcial | SIM | maybe | bloqueado | n/a | **BLOQUEADO** externo |
| H · CONTROL.4 (limpeza residual extra) | baixo | baixo | nenhuma | NÃO | NÃO | maybe | 95% | 1 fase | sem urgência |

---

## 5 · Recomendação principal

### ★ Bloco A · CRM_PHASE_ANAMNESIS_OPERATIONAL

**Por que é a próxima:**

1. **Maior assimetria DB-vs-runtime do projeto:** 14 tabelas, 1 template completo (11 sessions · 66 fields · 81 options), 10+ RPCs canônicas no banco. No app TypeScript: **zero refs** às RPCs operacionais. O builder admin foi entregue mas a coleta nunca acontece.
2. **Independente de bloqueadores externos:** zero dependência de Meta unban, browser ou provider. Link de anamnese pode ser **copy-paste** por enquanto · envio automático via WhatsApp fica para fase Meta liberada.
3. **Hard gate clínico já tem todos os RPC necessários:** `create_anamnesis_request`, `complete_anamnesis_form`, `appointment_anamnesis_upsert`, `appointment_anamnesis_mark_complete`. Estrutura honesta · sem migration grande necessária.
4. **Destrava jornada paciente real:** paciente recebe link, preenche antes da consulta → therapist vê respostas no prontuário antes de atender. Loop fundamental do CRM clínico.
5. **Risco baixo-médio:** quase tudo já tem CHECK constraints e RLS no DB. UI patient-facing usa token público (mesmo padrão de `/orcamento/[token]` que já existe no projeto).

### Sub-fases sugeridas para o bloco A

| Sub-fase | Escopo | Risco | Fase única ou múltipla |
|---|---|---|---|
| A.1 · `ANAMNESIS_REQUEST_AUDIT` | Auditar exato shape de `anamnesis_requests`, `anamnesis_links`, `anamnesis_token_failures`. Mapear `generate_anamnesis_request_token`. Decidir se cria UI generate-link ou patient-facing primeiro. Sem código. | nulo | 1 |
| A.2 · `ANAMNESIS_REQUEST_GENERATE` | Server action + botão na aba Anamnese do prontuário para owner/admin/therapist criar request via RPC. Copy-paste do link. Sem patient-facing ainda. | baixo | 1 |
| A.3 · `ANAMNESIS_PATIENT_FORM` | Rota pública `/anamnese/[token]` que valida token via RPC, renderiza template render + ingere respostas via `complete_anamnesis_form`. Stateless · sem login · token controlado. | médio (rota pública) | 1 |
| A.4 · `ANAMNESIS_PRONTUARIO_PREVIEW` | Expandir aba Anamnese do prontuário com preview detalhado de respostas (RPC já entrega view consolidada). | baixo | 1 |

Apply gradual permite rollback fácil em cada etapa.

---

## 6 · Outras opções com nota

- **D · Jornada pré-consulta secretaria** seria boa entrega curta (1-2 fases) se você quiser ver valor operacional rápido **sem patient-facing**. Foco: dashboard que lê `agenda_alerts_log` + `appointment_internal_alerts` e mostra próximos eventos para a secretaria (job 71 segue OFF · zero envio real).
- **F · Smoke MV** vale agendar com o operador da clínica para validar o vault em ambiente real (não bloqueia próximas fases).
- **G · Meta/WA** entra no roadmap **assim que** dependência externa liberar · não vale começar agora.

---

## 7 · Validações read-only executadas

Todas as flags green no preflight:

| Flag | Valor |
|---|---|
| `worker71_off` | true |
| `unsafe_outbox_count` | 0 |
| `phase_perdido_count` | 0 |
| `invalid_appointment_status_count` | 0 |
| `cron_with_provider_call` | 0 |
| `hard_gate_untouched` | **true** (7/7 funcs) |
| `media_vault_ready` | true (mig 183+184 aplicadas · tracker_184 registrado) |
| `appointment_procedure_fk_ready` | true (mig 182) |
| `alexa_legacy_dropped` | true (mig 181 · 0/3 candidates remanescentes) |
| **`can_continue`** | **true** |

---

## 8 · Confirmações negativas

- zero migration aplicada · zero criada · zero db push · zero migration repair
- zero alteração em código funcional · zero alteração em UI · zero alteração em repository
- zero alteração em RLS/policies · zero alteração em storage
- zero upload real · zero signed URL real
- zero alteração em cron · zero ativação de job 71
- zero WhatsApp · zero Evolution · zero Meta · zero provider · zero Alexa API
- zero wa_outbox row criada
- zero env/secrets tocados
- zero deploy
- zero alteração em hard gate clínico (7/7 funcs intactas)
- zero alteração em `appointments.procedure_id`/FK procedure (mig 182 intacta)
- zero uso de `phase='perdido'`

---

## 9 · Próxima fase sugerida

**`CRM_PHASE_ANAMNESIS_REQUEST_AUDIT`** (sub-fase A.1)

Escopo:
- Auditar shape exato de `anamnesis_requests`, `anamnesis_links`, `anamnesis_token_failures`
- Mapear assinaturas de `create_anamnesis_request`, `generate_anamnesis_request_token`, `complete_anamnesis_form`, `mark_anamnesis_request_opened`, `set_anamnesis_request_defaults`
- Decidir contrato de UI (botão "Enviar anamnese" + modal copy-paste do link no prontuário)
- Sem código · sem migration · só auditoria + decisão

Quando autorizado, executar a sub-fase. Se preferir entrega curta sem patient-facing imediato, alternativa válida: **D · Jornada pré-consulta secretaria** (1-2 fases · zero provider · zero patient-facing).

---

## 10 · Veredito

**PASS_CRM_NEXT_ENTERPRISE_BLOCK_AUDIT_READY_LOCAL_COMMIT**

- Audit read-only completo · banco/app intactos
- Recomendação principal · **Bloco A · Anamnesis Operacional** (sub-fases A.1-A.4)
- Matriz de decisão com 8 blocos candidatos comparados
- Hard gate clínico · job 71 · provider externo · todos preservados
- Aguardando autorização para `git push origin main`
