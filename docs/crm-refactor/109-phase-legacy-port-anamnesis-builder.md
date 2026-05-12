# CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER · Builder admin de anamneses (Trilha A)

> Trilha A: estrutura de banco completa (templates · sessions · fields ·
> options · RLS · policies · 16 RPCs auxiliares) já existia. Fase entrega
> apenas a UI admin top-level (lista · modal CRUD · preview) sem tocar em
> hard gate clínico, respostas ou RPCs avançadas.

---

## 1 · Objetivo

Expor para owner/admin uma área `/configuracoes/anamneses` que permita:

- ver os modelos de anamnese cadastrados na clínica;
- criar novos modelos (vazios, prontos para receber seções/perguntas);
- editar metadados (nome, descrição, categoria, flags `is_default`,
  `is_pre_appointment_form`, `has_general_session`);
- ativar/desativar modelos;
- visualizar preview read-only do formulário renderizado para o paciente.

Sessions/fields/options de modelos existentes são listados em preview, mas
a edição estrutural (adicionar/ordenar/remover perguntas) **fica para fase
seguinte** — usará as RPCs canônicas já existentes
(`reorder_anamnesis_fields`, `reorder_anamnesis_sessions`,
`reorder_anamnesis_field_options`).

---

## 2 · Contexto

| Item | Estado |
|---|---|
| Branch · HEAD inicial | `main` · `989c214` |
| Schema anamnese | **completo, multi-tenant, RLS on** (descoberto no preflight) |
| Templates existentes | 1 (`ANAMNESE ESTÉTICA` · general · pré-consulta) |
| Sessions existentes | 11 |
| Fields existentes | 66 |
| RPCs clínicas | `appointment_clinical_gate_status`, `appointment_finalize`, `appointment_anamnesis_*` — **intocados** |

---

## 3 · Legado auditado

Foram identificadas via preflight 20+ RPCs/views relacionadas (não tocadas):

`_anamnese_link`, `_create_prontuario_from_anamnesis`, `anamnesis_purge_all`,
`appointment_anamnesis_mark_complete`, `appointment_anamnesis_upsert`,
`appointment_clinical_gate_status`, `appointment_consent_accept`,
`appointment_finalize`, `complete_anamnesis_form`, `create_anamnesis_request`,
`generate_anamnesis_request_token`, `mark_anamnesis_request_opened`,
`mr_get_anamnesis_link`, `reorder_anamnesis_field_options`,
`reorder_anamnesis_fields`, `reorder_anamnesis_sessions`,
`set_anamnesis_request_defaults`, `validate_anamnesis_pub*`.

**O que foi portado:** nada de código legado · apenas observado.
**O que foi descartado:** edição estrutural (sessions/fields/options) ·
sai em fase futura usando as RPCs `reorder_*` listadas acima.

---

## 4 · Diagnóstico do schema

```json
{
  "anamnesis_tables": [
    "anamnesis_templates",
    "anamnesis_template_sessions",
    "anamnesis_fields",
    "anamnesis_field_options",
    "anamnesis_responses",
    "anamnesis_answers",
    "anamnesis_links",
    "anamnesis_requests",
    "anamnesis_response_flags",
    "anamnesis_response_protocol_suggestions",
    "anamnesis_request_access_logs",
    "anamnesis_token_failures",
    "appointment_anamneses",
    "anamnesis_consolidated_view"
  ],
  "rls_all_enabled": true,
  "policy_count_per_table": 5,
  "field_type_enum": ["text","textarea","number","select","multiselect","boolean","date"],
  "category_enum": ["general","facial","body","capillary","epilation","custom"]
}
```

Estrutura suficiente para a fase · zero migration necessária.

---

## 5 · Decisão da trilha

**Trilha A · estrutura DB já existia.**

Justificativa:
1. Templates/sessions/fields/options já têm RLS + policies (5 cada) ·
   multi-tenant garantido.
2. RPCs canônicas já cobrem reorder e respostas · não há razão para
   inventar contrato paralelo.
3. Hard gate clínico (`appointment_finalize`, `appointment_anamnesis_*`)
   está intacto e fora do escopo.

Zero migration aplicada · zero migration proposta.

---

## 6 · Modelagem usada

Reaproveita schema existente. Mapeamento DTO:

| Tabela | DTO TS |
|---|---|
| `anamnesis_templates` | `AnamnesisTemplateDTO` |
| `anamnesis_template_sessions` | `AnamnesisTemplateSessionDTO` |
| `anamnesis_fields` | `AnamnesisFieldDTO` |
| `anamnesis_field_options` | `AnamnesisFieldOptionDTO` |
| (view aninhada) | `AnamnesisTemplateWithStructureDTO` |

Enum `AnamnesisTemplateCategory = 'general'|'facial'|'body'|'capillary'|'epilation'|'custom'`
mapeado 1:1 do enum DB `anamnesis_template_category_enum`.

Enum `AnamnesisFieldType` usa os 7 valores em uso pela coluna
(`text|textarea|number|select|multiselect|boolean|date`). O enum mais rico
`anamnesis_field_type_enum` (16 valores incl. `rich_text`, `image_select`,
`scale_select`, `file_upload`...) existe mas **não é o adotado pela coluna
atual**; ficará para fase de admin avançado quando/se for migrado.

---

## 7 · UI entregue

### 7.1 Lista · `/configuracoes/anamneses`

- KPI cards: **Modelos · Ativos · Inativos · Perguntas configuradas**
- Filtros via URL (`?q=...&status=...&category=...`)
- Tabela: nome · categoria · sinalizadores (Padrão/Pré-consulta/Geral) ·
  versão · atualizado · status · ações
- Ações por linha: **Preview** (link) · **Editar** (modal) · **Toggle ativo**
- Botão "Novo modelo" abre modal vazio
- Banner "modo leitura" quando role não é owner/admin (defense-in-depth ·
  RLS no DB também bloqueia)

### 7.2 Modal Create/Edit

Campos top-level (sem tocar em sessions/fields/options):

- `name` (obrigatório, 2-200 chars)
- `description` (opcional, até 2000 chars)
- `category` (select com 6 valores do enum)
- `isPreAppointmentForm` (checkbox)
- `hasGeneralSession` (checkbox)

### 7.3 Preview · `/configuracoes/anamneses/[id]`

- Metadados (categoria · status · versão · sinalizadores)
- Aviso "preview somente leitura · nenhuma resposta é gravada"
- Render seções → perguntas → opções de forma aproximada ao que o paciente
  veria, com inputs **disabled**.
- Texto, textarea, number, date, boolean, select e multiselect são
  suportados; tipos extras (caso apareçam no futuro) caem em "preview
  indisponível".

### 7.4 Entry point

Tab "Anamneses" adicionada em `/configuracoes` com ícone `ClipboardList`
+ painel-link no estilo do `/configuracoes/procedimentos`.

---

## 8 · Relação com procedimentos

`anamnesis_templates` **não tem FK direta para `clinic_procedimentos`**.
A associação canônica é via `category` (enum). Fase anterior
(`WIZARD_PROCEDURES`) também não persiste `procedure_id` em
`appointments`. Logo:

- O builder admin **não bloqueia** por falta de vínculo FK.
- A categoria documenta o domínio (facial/corporal/...) e serve como filtro
  para futura associação automática.
- Quando `appointments.procedure_id` e/ou `anamnesis_templates.procedure_id`
  forem promovidas a FK reais, a UI poderá oferecer Select de procedimentos
  no editor de templates. Por ora: **honest snapshot**, sem mentira de
  contrato.

---

## 9 · Relação com hard gate clínico

**Hard gate intocado.**

- `appointment_clinical_gate_status` · não chamado nem alterado.
- `appointment_finalize` · não chamado nem alterado.
- `appointment_anamnesis_upsert` / `appointment_anamnesis_mark_complete` ·
  não chamados nem alterados.
- `appointment_clinical_gate_overrides` (tabela, se existir) · não tocada.

Nenhuma exigência nova de anamnese para finalização foi adicionada.
A UI desta fase só lê/escreve em `anamnesis_templates`, `_sessions`,
`_fields`, `_field_options` (estes três apenas read no preview). Respostas
(`anamnesis_responses`, `anamnesis_answers`, `appointment_anamneses`)
**não** são tocadas.

Validation SQL inclui `clinical_gate_untouched=true` como sanity check.

---

## 10 · Segurança

- Multi-tenant via RLS no banco (5 policies por tabela já existentes).
- Server actions usam `requireRole(['owner','admin'])` (defense-in-depth).
- Zod 200 chars no name · 2000 no description · enum estrito para category.
- UI banner para roles sem permissão · botões disabled · DB bloqueia
  mutações se TS escapar.
- Sem provider externo · sem WhatsApp · sem Alexa · sem Evolution · sem
  wa_outbox · sem cron · sem env tocados.

---

## 11 · Validações executadas

| Validation | Resultado |
|---|---|
| `pnpm --filter @clinicai/repositories typecheck` | OK |
| `pnpm --filter @clinicai/lara typecheck` | OK |
| SQL validation `phase-legacy-port-anamnesis-builder-validation.sql` | final_flags green |

Validation flags chave:

- `worker71_off`: true
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `cron_with_provider_call`: 0
- `existing_anamnesis_schema_detected`: true
- `templates_table_ready`: true
- `questions_table_ready`: true
- `rls_ready`: true
- `migration_required_not_applied`: false (zero migration nesta fase)
- `remote_schema_unchanged`: true
- `clinical_gate_untouched`: true
- **`can_continue`: true**

---

## 12 · Limitações conhecidas

| Limitação | Mitigação |
|---|---|
| Sem edição estrutural (sections/fields/options) | Próxima fase reusará RPCs `reorder_anamnesis_*` |
| Sem FK direta com `clinic_procedimentos` | Categoria-enum já cobre filtros · FK opcional pode entrar com migration nova |
| Apenas 7 field types suportados no preview | Coluna usa enum de 7; enum estendido (16) existe mas não é o adotado |
| Sem reordenação drag-and-drop | Próxima fase, dependente de patch UI admin avançado |
| Sem duplicar template | Próxima fase · evita duplicação acidental |

---

## 13 · Próximos passos

1. **Admin avançado de sessions/fields/options**: usar as RPCs
   `reorder_anamnesis_*` e `set_anamnesis_request_defaults`.
2. **Vínculo com procedimentos**: avaliar `anamnesis_templates.procedure_id`
   como FK opcional · documentar migration controlada.
3. **`CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_DETAIL`**: prontuário
   completo com timeline · documentos · anamnese (consumindo este builder).

---

## 14 · Veredito

**PASS_CRM_LEGACY_PORT_ANAMNESIS_BUILDER_READY_LOCAL_COMMIT**

- Trilha A entregue · UI admin + repository + preview
- Zero migration aplicada · zero migration proposta
- Hard gate clínico intocado · respostas/RPCs clínicas intocadas
- Typecheck OK · validation green · `can_continue=true`
- Aguardando autorização para `git push origin main`
