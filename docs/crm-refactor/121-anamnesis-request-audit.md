# CRM_PHASE_ANAMNESIS.A1_REQUEST_AUDIT · Diagnóstico (audit-only)

> Sub-fase **A.1** do Bloco A (Anamnese Operacional) recomendado pelo doc 120.
> **Audit-only:** zero migration, zero código, zero deploy. Lê o estado do
> banco, do TS, do legacy port e do histórico de migrations do
> `clinic-dashboard` para fechar o contrato das próximas sub-fases (A.2/A.3/A.4).

---

## 1 · Ambiente

| Item | Valor |
|---|---|
| Branch · HEAD | `main` · `077caa7` |
| Modo | preflight + read-only audit |
| Working tree | clean |
| Grafo consultado | `clinic-dashboard/graphify-out/wiki/` (10191 nodes · 17826 edges) |
| Migrations históricas examinadas | 8 (mig `20260328000000_anamnesis_module.sql` + 5 sprints + 2 fixes) |
| Banco auditado | `oqboitkpcvuaudouwvkl` via Management API |
| Hard gate clínico | intocado |

Regras invioláveis honradas (todas):
- NÃO aplicar migration · NÃO criar tabela · NÃO alterar policy
- NÃO criar linha em `wa_outbox` · NÃO chamar provider · cron 71 = off
- NÃO mexer no hard gate clínico (`appointment_anamnesis_*`, `complete_anamnesis_form` lado paciente, `appointment_finalize` ficam intocados aqui)
- NÃO usar `phase='perdido'`
- Soft-delete obrigatório · hard delete proibido
- `storage_path` não vaza ao client (apenas o módulo Media Vault entregou; anamnese não tem upload)

---

## 2 · Mapa histórico (grafo do `clinic-dashboard`)

Comunidades relevantes (do `graphify-out/wiki/index.md`):

| Tamanho | Comunidade | Significado |
|---|---|---|
| 79 nodes | `20260328000000_anamnesis_module` | mig canônica (cria tabelas + 9 RPCs) |
| 48 nodes | `anamnese-builder.js` | admin do template (Builder) |
| 34 nodes | `anamnese.js` | runtime da página pública |
| 26 nodes | `20260403000000_anamnesis_hardening_p2` | atomicidade + token_failures + snapshot completo |

**Migrations cronológicas (8):**

1. `20260328000000_anamnesis_module.sql` · cria 10 tabelas + 11 funções
2. `20260330000000_anamnesis_sprint1_hardening.sql` · `validate_anamnesis_token`
3. `20260331000000_anamnesis_sprint2_quality.sql` · idx + active session
4. `20260332000000_anamnesis_sprint3_robustness.sql` · uidx field uniqueness
5. `20260402000000_anamnesis_hardening_p1.sql` · clinic_id idx + GIN
6. `20260403000000_anamnesis_hardening_p2.sql` · `complete_anamnesis_form` (atomic), `validate_anamnesis_token` (error_code), `create_anamnesis_request` (snapshot completo), `anamnesis_token_failures`, RLS direta em `answers`
7. `20260404000000_anamnesis_final_sprint.sql` · pulimento final
8. `20260675000000_fix_anamnesis_uuid_casts.sql` · UUID casts

---

## 3 · Estado vivo no banco (`oqboitkpcvuaudouwvkl`)

### 3.1 Tabelas (13 · RLS habilitada em todas)

| Tabela | cols | RLS | Observação |
|---|---|---|---|
| `anamnesis_templates` | 15 | ✅ | 1 row (seed Clinica Seed) |
| `anamnesis_template_sessions` | 9 | ✅ | 11 rows |
| `anamnesis_fields` | 20 | ✅ | 67 rows |
| `anamnesis_field_options` | 9 | ✅ | 81 rows |
| `anamnesis_requests` | 18 | ✅ | **0 rows** ← pipeline nunca usado em runtime real |
| `anamnesis_request_access_logs` | 6 | ✅ | 0 rows |
| `anamnesis_responses` | 13 | ✅ | 0 rows |
| `anamnesis_answers` | 11 | ✅ | 0 rows |
| `anamnesis_response_flags` | 8 | ✅ | 0 rows |
| `anamnesis_response_protocol_suggestions` | 8 | ✅ | 0 rows |
| `anamnesis_token_failures` | 4 | ✅ | 4 rows (token-failure tests antigos) |
| `anamnesis_links` | 7 | ✅ | extra · não está nas migs do clinic-dashboard auditadas · investigar antes de A.2 |
| `anamnesis_consolidated_view` | 7 | ⚠️ | RLS=false · provável view materializada · `clinical-records-actions.ts` já lê |

**Achado P1 (warning):** `anamnesis_links` existe mas não está em nenhuma das 8 migrations canônicas auditadas. Hipótese: mig posterior do próprio `clinicai-v2/db/migrations` ou patch ad-hoc. **Bloqueia A.2** até esclarecermos o uso (pode ser tabela duplicada/zumbi).

### 3.2 Enums (7)

| Enum | Valores | Status |
|---|---|---|
| `anamnesis_request_status_enum` | draft / sent / opened / in_progress / completed / expired / revoked / cancelled | ✅ |
| `anamnesis_response_status_enum` | not_started / in_progress / completed / abandoned / cancelled | ✅ |
| `anamnesis_field_type_enum` | text / textarea / rich_text / number / date / boolean / single_select / multi_select / single_select_dynamic / **`scale\r\n  _select`** / image_select / file_upload / image_upload / section_title / label / description_text | ⚠️ valor corrompido `scale\r\n  _select` (CRLF dentro do enum) |
| `anamnesis_field_type` | text / textarea / number / select / multiselect / boolean / date | ⚠️ enum legacy órfão (vs `_enum` canônico) |
| `anamnesis_template_category_enum` | general / facial / body / capillary / epilation / custom | ✅ |
| `anamnesis_flag_severity_enum` | info / warning / high / critical | ✅ |
| `anamnesis_flag_type_enum` | clinical / eligibility / commercial / document / data_quality | ✅ |

**Achado P1.b (débito catalogável):** valor corrompido `"scale\r\n  _select"` no enum `anamnesis_field_type_enum`. **Não bloqueia A.2/A.3** (basta evitar criar fields com esse type), mas merece uma migration corretiva tipo `ALTER TYPE ... RENAME VALUE` numa sub-fase A.X dedicada para evitar trap futuro. Catalogado.

**Achado P1.c:** enum órfão `anamnesis_field_type` (sem `_enum` no nome) é provável resquício pré-mig 0328. **Não bloqueia A.2/A.3** se nenhuma tabela tipa com ele · verificar antes de drop.

### 3.3 Funções (19 relevantes · contratos vivos vs canônicos)

Apenas as RPCs principais para A.2/A.3 estão listadas aqui:

#### `create_anamnesis_request` (chamada de A.2 · server action)
```
(p_clinic_id uuid, p_patient_id text, p_template_id uuid,
 p_created_by uuid DEFAULT NULL, p_appointment_id uuid DEFAULT NULL,
 p_expires_at timestamptz DEFAULT NULL) RETURNS jsonb
SECURITY DEFINER · grants: authenticated only (NO anon)
```
**Difere de TODAS as 2 versões canônicas:**
- mig 0328: `p_patient_id uuid`, 6 args, RETURNS TABLE(request_id, public_slug, raw_token, public_url)
- mig 0403: `p_patient_id uuid`, 4 args, RETURNS TABLE(id, public_slug, raw_token)
- **Atual no banco:** `p_patient_id text`, 6 args, RETURNS jsonb

A versão viva é uma 3ª iteração híbrida (provável correção pós REFACTOR_LEAD_MODEL, que passou `patients.id` para `text`/canônico). Pertinente confirmar shape do JSON antes de A.2.

#### `validate_anamnesis_token` (chamada da página pública A.3)
```
(p_public_slug text, p_raw_token text) RETURNS TABLE(
  request_id uuid, clinic_id uuid, patient_id text, template_id uuid,
  status anamnesis_request_status_enum, expires_at timestamptz,
  template_snapshot_json jsonb, error_code text,
  patient_name text, patient_phone text, patient_data jsonb
)
SECURITY DEFINER · grants: authenticated only (NO anon)
```
**Difere da mig 0403 P2** em 3 pontos:
- adicionou `patient_name`, `patient_phone`, `patient_data` (snapshot do paciente para pré-preencher)
- adicionou `patient_id text` (não uuid)
- ⚠️ **removeu GRANT TO anon** que existia na mig 0403 (a RPC era `GRANT EXECUTE ... TO anon, authenticated`)

**Achado P0 (bloqueia A.3 público sem login):** RPC `validate_anamnesis_token` perdeu GRANT anon. Sem isso, página pública `/anamnese/[slug]` só funciona via JWT autenticado (custom claim `clinic_id`). Cenário "paciente clica no link no WhatsApp sem login" NÃO funciona hoje. Confirmar se foi:
- (a) remoção intencional por hardening (e A.3 deve usar Edge Function + service_role); ou
- (b) regressão da mig 858 (a mig que perdeu grants anon em LPs · ver memory `feedback_rpc_grant_versioned`); precisa restaurar via mig corretiva A.3.0.

#### `complete_anamnesis_form` (lado paciente · submissão da ficha)
```
(p_response_id text, p_request_id text, p_patient_id text, p_clinic_id text,
 p_patient_first_name text DEFAULT NULL, p_patient_last_name text DEFAULT NULL,
 p_patient_phone text DEFAULT NULL, p_patient_cpf text DEFAULT NULL,
 p_patient_sex text DEFAULT NULL, p_patient_rg text DEFAULT NULL,
 p_patient_birth_date date DEFAULT NULL, p_patient_address jsonb DEFAULT NULL,
 p_final_answers jsonb DEFAULT '[]') RETURNS void
SECURITY DEFINER · grants: authenticated only (NO anon)
```
**Difere da mig 0403** em:
- IDs viraram `text` (não uuid)
- adicionou sexo, rg, birth_date, address
- retorno `void` (mig 0403 retornava `jsonb {ok, completed_at}`)
- ⚠️ **removeu GRANT TO anon** (mig 0403 fazia GRANT TO anon)

**Mesmo achado P0** que `validate_anamnesis_token`.

#### `mark_anamnesis_request_opened` (registra "link aberto" no log)
```
(p_request_id uuid, p_ip_address inet DEFAULT NULL, p_user_agent text DEFAULT NULL) RETURNS void
SECURITY DEFINER · grants: authenticated only (NO anon)
```
Confere com mig 0328 · mesmo P0 do anon grant ausente.

#### `mr_get_anamnesis_link` (prontuário pega link do response)
```
(p_response_id uuid) RETURNS jsonb
SECURITY DEFINER · grants: authenticated only
```
Aceitável · só chamada autenticada do prontuário.

#### `validate_anamnesis_public_link` (variante mais antiga · mig 0328)
```
(p_public_slug text, p_raw_token text) RETURNS TABLE(
  request_id, clinic_id, patient_id text, template_id, response_id,
  request_status, response_status, expires_at)
SECURITY DEFINER · grants: authenticated only
```
Variante mais antiga · `validate_anamnesis_token` (mig 0403) é o canônico atual. Manter como fallback ou DROP em A.X depois.

#### Helpers internos
- `generate_anamnesis_request_token()` · sem grants públicos
- `generate_public_slug()` · idem
- `create_response_for_request()` · trigger
- `set_anamnesis_request_defaults()` · trigger
- `set_normalized_text_on_answers()` · trigger
- `normalize_text_from_json(jsonb)` · helper interno
- `reorder_anamnesis_*` (3 funções) · admin do Builder (já consumidas pela fase ANAMNESIS_BUILDER · OK)
- `anamnesis_purge_all()` · ferramenta admin (não tocar)
- `_create_prontuario_from_anamnesis()` · trigger pós-complete

### 3.4 Policies (37 · todas RLS-aware)

Resumo do contrato de acesso por tabela:

| Tabela | Acesso `anon` (ALL clinic_id=app_clinic_id) | Acesso `authenticated` (staff) | Notas |
|---|---|---|---|
| `anamnesis_templates` | ALL | CRUD por role | hub admin |
| `anamnesis_template_sessions` | (público via request ativo) | CRUD por role | sessões |
| `anamnesis_fields` | (público via request ativo) | CRUD por role | fields |
| `anamnesis_field_options` | (público via request ativo) | CRUD por role | options |
| `anamnesis_requests` | ALL clinic_id | INSERT/UPDATE/DELETE roles | criar request |
| `anamnesis_responses` | ALL clinic_id | SELECT condicional | submeter resposta |
| `anamnesis_answers` | ALL clinic_id | SELECT (`anamnesis_answers_select`) | submeter answer |
| `anamnesis_request_access_logs` | INSERT (request válido) | SELECT | abrir log |
| `anamnesis_response_flags` | — | staff_all + select | flag clínica |
| `anamnesis_response_protocol_suggestions` | — | staff_all + select | sugestões |
| `anamnesis_token_failures` | INSERT (anon guarded) | — | rate limit |

**Achado P2 (clarificação):** as policies já permitem fluxo público `anon` (JWT custom claim `clinic_id`) via `clinic_id = app_clinic_id()`. O bloqueio P0 (grants ausentes nas RPCs) é nas funções, não nas tabelas. **Estratégia A.3 mais segura:** restaurar `GRANT EXECUTE ... TO anon` nas 3 RPCs (`validate_anamnesis_token`, `mark_anamnesis_request_opened`, `complete_anamnesis_form`) numa mig corretiva A.3.0 antes da página pública entrar.

### 3.5 FKs entrantes/saintes em `anamnesis_requests`

```
anamnesis_requests
  ├─ clinic_id      → clinics            ON DELETE CASCADE
  ├─ patient_id     → patients           ON DELETE CASCADE
  ├─ template_id    → anamnesis_templates ON DELETE CASCADE
  ├─ appointment_id → appointments       ON DELETE SET NULL ✅
  └─ created_by     → app_users          ON DELETE NO ACTION
```

`appointment_id` ON DELETE SET NULL bate com o padrão estabelecido na mig 182 (procedure_id também SET NULL) e doc 120 (parente arquitetural). **Bom sinal:** já segue o padrão enterprise.

### 3.6 Safety flags (pré-fase A.1)

```json
{"worker71_off": true, "wa_outbox_baseline": 123, "cron_with_provider_call": 0}
```
Verde · módulo intocado pela auditoria.

---

## 4 · Estado vivo no app TS (`apps/lara/src/`)

```
$ grep -RIn "create_anamnesis_request\|validate_anamnesis_token\|complete_anamnesis_form\
            \|mark_anamnesis_request_opened\|validate_anamnesis_public_link\
            \|mr_get_anamnesis_link\|generate_anamnesis_request_token" \
       apps/lara/src
→ 0 matches
```

**Asimetria absoluta:** banco tem 14 tabelas + 19 funções + 81 policies + 37 RPCs auto-typed em `packages/supabase/src/types.ts`. Runtime TS chama **zero** dessas RPCs. Pipeline está vivo apenas no legacy.

Refs encontradas em `apps/lara/src/` mencionando "anamnese/anamnesis" (18 arquivos) — todas são:
- Configurações/admin do Builder (`(authed)/configuracoes/anamneses/...`) · CRUD de templates · OK
- Refs de schema/types (não chamadas RPC) · OK
- Hard gate (`appointment-clinical.actions.ts`) · `appointment_anamnesis_*` e `complete_anamnesis_form` lado appointment · canônico do hard gate
- `crm/pacientes/[id]/_record-tabs.tsx` · DocumentsTab placeholder (entregue na fase MEDIA_VAULT_WIRE) · OK
- `(authed)/recepcao/painel/page.tsx` · grid TV · não chama anamnese RPC, apenas referencia coluna

**Conclusão A.1 sobre runtime TS:** funil "enviar/receber anamnese ao paciente" é 100% gap. Confirma diagnóstico do doc 120.

---

## 5 · Estado vivo no legacy (`apps/lara/public/legacy/`)

Pipeline operacional preservado em vanilla JS (porte do `clinic-dashboard`):

```
apps/lara/public/legacy/
  anamnese.html                                   ← página pública (form-render entry)
  form-render.html                                ← form runtime (do mesmo pacote)
  js/anamnese.js                                  ← runtime do form
  js/form-render.js                               ← renderer dinâmico do form
  js/api.js                                       ← cria request (linha 1604)
  js/repositories/anamnesis.repository.js         ← createRequest(clinicId, patientId, templateId, expiresAt)
  js/repositories/anamnesis-prontuario.repository.js  ← mr_get_anamnesis_link
  js/services/anamnesis-prontuario.service.js     ← cache invalidation
  js/components/lead-modal.js                     ← UX legacy: linhas 990-1066 + 2110-2183
```

### UX legacy (validado em produção):

1. **Trigger:** `lead-modal.js` (modal do lead) · aba "Anamnese"
2. **Form:** Select template ativo + datetime opcional (default `now() + 30d`)
3. **Botão:** "Gerar e Copiar Link" (`_lmAnamGenBtn`)
4. **Side effects:**
   - `_lmUpsertPatient(lead)` → garante patient existe
   - `_sbShared.rpc('create_anamnesis_request', { p_clinic_id, p_patient_id, p_template_id, p_expires_at })`
   - Build URL: `location.origin + '/form-render.html?slug=' + r.public_slug + '#token=' + r.raw_token` (token via hash · não vai pro server)
   - Persiste em `sessionStorage['anm_link_'+slug]` (token NÃO é recuperável do banco)
   - `navigator.clipboard.writeText(fullLink)` automático
   - Painel verde "Link gerado e copiado!" inline · CTA "Gerar outro link"
5. **Variante "Enviar via WhatsApp"** (`_lmSendAnamnese`):
   - Mesmo fluxo + cria short link em `short_links` (`an-XXXXX`) + envia via `InboxService.sendText` para o `lead.phone`
   - ⚠️ Bug catalogado: hardcoda `p_clinic_id = '00000000-0000-0000-0000-000000000001'` (clinic seed) em vez de pegar do JWT. Corrige em A.2.

### Página pública (`form-render.html`):
1. lê `slug` da query string e `token` do hash
2. `_rpc('validate_anamnesis_token', { p_public_slug, p_raw_token })`
3. Se válida: `_rpc('mark_anamnesis_request_opened', { p_request_id })`
4. Carrega `template_snapshot_json` e renderiza form
5. Pré-preenche dados do paciente via `patient_name/phone/data`
6. Submit: `_rpc('complete_anamnesis_form', {...12 args...})` com retry exponential

---

## 6 · Contrato decidido para A.2 (server action + modal Next.js)

Decisões UX (replica legacy LITERAL · feedback `feedback_legacy_literal.md`):

| Item | Decisão |
|---|---|
| Entry points | **(a)** botão "Enviar anamnese" no prontuário do paciente `crm/pacientes/[id]` (aba "Anamnese" hoje placeholder) **(b)** botão idêntico em `crm/agenda/[id]` (detalhe do agendamento) |
| UI Modal | Next.js Server Component + Client Component (form) · padrão `_actions.ts` + `_client.tsx` (mesmo padrão fase WIZARD_PROCEDURES) |
| Campos | Select template (ativos da clinic) + datetime opcional (default `now()+30d`) |
| Ações | 2 botões: **"Copiar link"** (canônico · clipboard) **+ "Enviar via WhatsApp"** (chama envio via `wa-outbox` ou Lara dispatch) |
| Server action | `sendAnamnesisRequestAction({ patientId, templateId, expiresAt, sendVia: 'copy' \| 'whatsapp' })` |
| RPC | `create_anamnesis_request(p_clinic_id, p_patient_id, p_template_id, p_appointment_id?, p_expires_at?)` (passa `created_by = ctx.user_id`) |
| Retorno UI | `{ requestId, publicSlug, rawToken, publicUrl }` (URL aponta para `/anamnese/[slug]?token=...`) |
| Persistência token | `sessionStorage` no client · server NUNCA armazena raw_token (só hash) |
| Encurtador | reusar tabela `short_links` (legacy) com prefixo `an-` |
| Lista fichas | Aba "Anamnese" no prontuário lista requests da clínica · status colorido (sent/opened/in_progress/completed/expired/revoked) |
| Revogação | Botão "Revogar" chama RPC `revoke_anamnesis_request` (ver se já existe · senão criar na A.2) |

**Role gate (defense in depth):** `owner, admin, therapist, receptionist` podem enviar anamnese. Configurações sem assistir do Builder ficam em `(authed)/configuracoes/anamneses/` (já entregue na fase ANAMNESIS_BUILDER).

**Bloqueio P0 antes da A.3:** restaurar GRANTS `anon` nas 3 RPCs (`validate_anamnesis_token`, `mark_anamnesis_request_opened`, `complete_anamnesis_form`) numa migration A.3.0 corretiva. Aplicar OID-based sanity check pós-DDL (memory `feedback_rpc_grant_versioned.md`).

---

## 7 · Plano executivo (4 sub-fases)

### A.2 · GENERATE_LINK · `sendAnamnesisRequestAction`

Escopo:
- Migration A.2.0 (se necessária): catálogo de `revoke_anamnesis_request` + `cancel_anamnesis_request` + ENUM fix de `scale\r\n  _select` se nada usa esse valor (audit antes)
- `packages/repositories/src/anamnesis-request.repository.ts` (DI factory `makeRepos`)
- Server action `apps/lara/src/app/crm/_actions/anamnesis-request.actions.ts` com `requireRole(['owner','admin','therapist','receptionist'])` + Zod
- Botão "Enviar anamnese" em `crm/pacientes/[id]/_record-tabs.tsx` (aba Anamnese) + `crm/agenda/[id]/_actions-bar.tsx`
- Modal client `_send-anamnesis-modal.tsx` (template select + expiry + 2 botões)
- Painel verde inline "Link gerado e copiado!" + CTA "Gerar outro" (mirror legacy)
- Smoke: 0 requests → click → 1 request com status='sent' + access_log inserido apenas após primeiro open
- Sem deploy real do WhatsApp (botão "Enviar WhatsApp" só insere em `wa_outbox` · worker 71 segue OFF)

Saída esperada: `PASS_CRM_ANAMNESIS_GENERATE_LINK_PARTIAL`

### A.3 · PUBLIC_PAGE · `/anamnese/[slug]?token=...`

Escopo:
- Mig A.3.0 corretiva: `GRANT EXECUTE ... TO anon` para 3 RPCs · INSERT/SELECT validation policy reforçada
- Página pública Next.js (server component) `apps/lara/src/app/anamnese/[slug]/page.tsx`
- Validação serverside via `validate_anamnesis_token(slug, token)` · token vem em query string (não cabe em hash sem JS)
- Renderer dinâmico (port simplificado de `form-render.js`): renderiza `template_snapshot_json` com Tailwind
- Submit via server action `submitAnamnesisAction` → `complete_anamnesis_form(...12 args...)`
- Rate limiting: `anamnesis_token_failures` automático via INSERT após validação que retorna 0 rows
- Confirmação: "Anamnese enviada · obrigado!" + auto-redirect para landing pública da clínica
- Acessibilidade WCAG AA

Saída esperada: `PASS_CRM_ANAMNESIS_PUBLIC_PAGE_PARTIAL`

### A.4 · PRONTUARIO_PREVIEW · prontuário lê + renderiza anamnese completa

Escopo:
- Repo `anamnesis-response.repository.ts` (read-only) com DTO sem PII bruta
- Aba "Anamnese" do prontuário (`crm/pacientes/[id]/_record-tabs.tsx`) lista todos requests + responses
- Render readonly do form preenchido com filtragem por session (segue Builder ANAMNESIS_BUILDER)
- Flags clínicas (`anamnesis_response_flags`) destacadas: critical (vermelho) → high (laranja) → warning (amarelo) → info (cinza)
- Botão "Gerar prontuário" oculto se já existe (`anamnesis_consolidated_view`)
- Smoke: criar request mockado → preencher response mockada → ver na aba

Saída esperada: `PASS_CRM_ANAMNESIS_PRONTUARIO_PREVIEW_PARTIAL`

### A.X · ENUM_CLEANUP (oportunístico)

Escopo:
- Mig A.X.0: `ALTER TYPE anamnesis_field_type_enum RENAME VALUE 'scale\r\n  _select' TO 'scale_select'` (verificar antes que ninguém usa esse valor literal)
- Drop `anamnesis_field_type` (enum órfão) se sem refs
- Investigar tabela `anamnesis_links` (mig de origem + uso atual) · decidir manter/drop
- Drop `validate_anamnesis_public_link` se `validate_anamnesis_token` já cobre

---

## 8 · Riscos e mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| RPC `create_anamnesis_request` retornando jsonb (não TABLE) | médio | Confirmar shape em smoke serverside ANTES de UI · log do retorno antes de parsear |
| `anamnesis_links` zumbi cria confusão | médio | Investigar uso + decidir antes de A.2 (audit de 1h) |
| Enum corrompido `scale\r\n  _select` quebra select | baixo | Filtrar no client + corrigir em A.X |
| GRANT anon perdido (P0) | **alto** · bloqueia A.3 | mig A.3.0 corretiva ANTES de página pública · OID-based sanity (memory `feedback_rpc_grant_versioned`) |
| Token em query string vs hash | baixo | Query string é canônico Next.js · log de access cumpre audit · token só armazenado hash no banco |
| Paciente legitimo cliica em link após expiry | baixo | RPC retorna `error_code='expired'` · UI mostra mensagem amigável |
| Brute force de slug | baixo | `anamnesis_token_failures` registra · alerta via dashboard futuro |
| Conflito com hard gate clínico | nulo | Hard gate é `appointment_anamnesis_*` (lado clinical staff submetendo dentro da consulta) · `complete_anamnesis_form` é o lado **paciente** (form externo) · paths separados |

---

## 9 · Veredito A.1

**PASS_CRM_ANAMNESIS_REQUEST_AUDIT_DIAGNOSED**

- Mapeamento histórico via grafo `clinic-dashboard`: ✅
- Schema atual em produção: 13 tabelas + 7 enums + 19 functions catalogados ✅
- Refs runtime TS: confirmado **zero** uso das RPCs do funil paciente ✅
- Legacy UX preservada em `apps/lara/public/legacy/`: contrato extraído ✅
- 1 P0 catalogado (GRANT anon ausente nas 3 RPCs do fluxo público)
- 3 P1 catalogados (`anamnesis_links` zumbi · `anamnesis_field_type` órfão · valor enum corrompido)
- Plano A.2/A.3/A.4 + A.X esculpido
- Hard gate clínico intocado · 0 mudanças aplicadas · 0 deploy

---

## 10 · Próximo prompt sugerido

```
CRM_PHASE_ANAMNESIS.A2_GENERATE_LINK · Server action + modal Next.js

Escopo:
- Migration A.2.0 (audit `anamnesis_links` + criar revoke RPC se faltar)
- packages/repositories/src/anamnesis-request.repository.ts (DI makeRepos)
- apps/lara/src/app/crm/_actions/anamnesis-request.actions.ts
- apps/lara/src/app/crm/pacientes/[id]/_send-anamnesis-modal.tsx (client)
- apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx (botão "Enviar anamnese")
- Sem deploy WhatsApp · sem migrations além da A.2.0 audit-driven
- Smoke: 0 requests → click → 1 request status='sent' + 0 outbox novos

Bloqueia A.3 até mig corretiva A.3.0 (restaurar GRANTS anon).
```
