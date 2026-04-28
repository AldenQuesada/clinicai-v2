# CRM Core · Mapa de Fluxo End-to-End (Onda 4)

> Status: **DRAFT canonical** · 2026-04-28
> Migrations: `20260800000060` → `20260800000065` em `db/migrations/`
> Schema: `leads` + `patients` + `appointments` + `orcamentos` + `phase_history`
> RPCs: 8 canonicas + 1 utility (`_lead_phase_transition_allowed`)
> Doutrina: ADR-001 modelo excludente · ADR-029 RLS strategy · GOLD-STANDARD §SQL

Este documento e o contrato vivo do CRM core. Toda mudanca no schema OU nas
RPCs precisa atualizar este doc PRIMEIRO (test-doc-first).

---

## 1 · Princípios não-negociáveis

1. **Modelo excludente forte (ADR-001).** `leads` e `patients` compartilham
   UUID. Quando lead vira paciente, `leads.deleted_at = now()` e a linha
   "migra" pra `patients` com o mesmo `id`. Nunca overlap. Nunca cascata
   reversa (paciente → lead).
2. **CRM puro independente.** Não tem trigger reverso de B2B/Magazine/VPI
   alterando leads/appointments. Esses módulos integram via RPC pública
   (`lead_create`).
3. **Entrada via RPC, não trigger.** A única forma de criar lead é via
   `lead_create()`. Nem `INSERT INTO leads` direto pelo client (RLS bloqueia
   sem WITH CHECK válido), nem trigger reverso.
4. **State machine endurecida.** A matriz de transição vive em
   `_lead_phase_transition_allowed(from, to) IMMUTABLE`. Toda RPC que muda
   `leads.phase` chama essa função antes do UPDATE. CHECK constraints só
   validam invariantes simples (lista de fases válidas, lost_reason quando
   phase=perdido).
5. **Multi-tenant via JWT.** UMA função canônica `app_clinic_id()` (helper
   `_sdr_clinic_id` do legado é eliminado). RLS INSERT sempre tem
   `WITH CHECK (clinic_id = app_clinic_id())` (corrige bug do legado).
6. **RLS forte.** 4 policies separadas por tabela (SELECT, INSERT, UPDATE,
   DELETE). `phase_history` é audit imutável: só SELECT + INSERT, sem
   UPDATE/DELETE pra `authenticated`.

---

## 2 · Os 5 estados do lead (state machine)

```
                       ┌──────────────────────────────┐
                       │     ENTRADA: lead_create()   │
                       │     (B2B, VPI, Lara, UI,     │
                       │      quiz, import, manual)   │
                       └──────────────┬───────────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
              ┌─────────────│       lead       │────────────┐
              │             └────────┬─────────┘            │
              │                      │                      │
              │   lead_to_           │  lead_lost()         │
              │   appointment()      │  (reason obrig)      │
              ▼                      ▼                      │
      ┌───────────────┐     ┌────────────────┐              │
      │   agendado    │     │    perdido     │◀─┐           │
      └───────┬───────┘     └────────┬───────┘  │           │
              │                      │          │           │
              │ data muda            │ recovery │           │
              ▼                      │ manual   │           │
      ┌───────────────┐              │(sdr_change_phase)    │
      │  reagendado   │              │          │           │
      └───────┬───────┘              ▼          │           │
              │              ┌──────────────┐   │           │
              │              │  lead/agend/ │───┘           │
              │              │  reagendado  │               │
              │              └──────────────┘               │
              │                                             │
              │ appointment_attend()                        │
              ▼                                             │
      ┌───────────────────────────┐                         │
      │       compareceu          │─── lead_lost() ─────────┤
      └────────┬──────────────────┘                         │
               │                                            │
               │ appointment_finalize(outcome=...)          │
               │                                            │
       ┌───────┴──────────────────┐                         │
       ▼                          ▼                         │
┌─────────────┐           ┌──────────────┐                  │
│  paciente   │           │   orcamento  │                  │
│ (lead.del)  │           │ (lead.del)   │                  │
└─────────────┘           └──────┬───────┘                  │
                                 │                          │
                                 │ aceitou                  │
                                 ▼                          │
                         ┌─────────────┐                    │
                         │  paciente   │                    │
                         │ (mesmo UUID)│────────────────────┘
                         └─────────────┘  (paciente → perdido)
```

**Matriz de transição completa** (em `public._lead_phase_transition_allowed`):

| from \ to    | lead | agendado | reagendado | compareceu | paciente | orcamento | perdido |
|--------------|------|----------|------------|------------|----------|-----------|---------|
| `lead`       | ✓ (no-op) | ✓ | — | — | — | — | ✓ |
| `agendado`   | — | ✓ (no-op) | ✓ | ✓ | — | — | ✓ |
| `reagendado` | — | ✓ | ✓ (no-op) | ✓ | — | — | ✓ |
| `compareceu` | — | — | — | ✓ (no-op) | ✓ | ✓ | ✓ |
| `orcamento`  | — | ✓ | — | — | ✓ | ✓ (no-op) | ✓ |
| `paciente`   | — | — | — | — | ✓ (no-op) | — | ✓ |
| `perdido`    | ✓ | ✓ | ✓ | — | — | — | ✓ (no-op) |

Linhas vazias = transição **proibida** pela matriz. Tentativa retorna
`{ok: false, error: 'illegal_phase_transition'}`.

---

## 3 · 8 RPCs canônicas

### 3.1 `lead_create()` — entrada principal

**Quem chama:**
- UI manual (Server Action `/leads/new`)
- Webhook Lara (apos primeira mensagem WA)
- B2B voucher emitido (vincula `voucher_id` em metadata)
- VPI referral (vincula `partner_session_id` em metadata)
- Quiz / Landing page submit
- Bulk import (CSV)

**Assinatura:**
```sql
lead_create(
  p_phone        text,
  p_name         text         DEFAULT NULL,
  p_source       text         DEFAULT 'manual',
  p_source_type  text         DEFAULT 'manual',
  p_funnel       text         DEFAULT 'procedimentos',
  p_email        text         DEFAULT NULL,
  p_metadata     jsonb        DEFAULT '{}'::jsonb,
  p_assigned_to  uuid         DEFAULT NULL,
  p_temperature  text         DEFAULT 'warm'
) RETURNS jsonb
```

**Side-effects:**
- `INSERT public.leads` (phase='lead', phase_origin='rpc')
- `INSERT public.phase_history` (origin='rpc', triggered_by='rpc:lead_create')
- Trigger `leads_normalize_phone` normaliza phone antes do INSERT.

**Idempotência:** dedup por `(clinic_id, phone)`. Lead existente ativo:
retorna id existente + atualiza `metadata` (merge JSONB) e `name/email` se
vieram. Lead existente soft-deleted (já paciente/orcamento):
**falha explícita** (`error: 'lead_softdeleted_exists'`) — caller decide se
quer criar appointment direto pro paciente OU se é caso ambíguo.

**Erros possíveis:**
- `no_clinic_in_jwt` — chamou sem JWT válido
- `phone_required` — phone vazio ou < 8 chars
- `lead_softdeleted_exists` — phone já promovido (ver hint pra resolver)

---

### 3.2 `lead_to_appointment()` — cria agendamento

**Quem chama:**
- UI Agenda (modal de novo agendamento)
- Lara (quando paciente confirma horário no WA)
- Mira (cron `pre_consulta` automation pode agendar reagendamento)

**Assinatura:**
```sql
lead_to_appointment(
  p_lead_id          uuid,
  p_scheduled_date   date,
  p_start_time       time,
  p_end_time         time,
  p_professional_id  uuid         DEFAULT NULL,
  p_professional_name text        DEFAULT '',
  p_procedure_name   text         DEFAULT '',
  p_consult_type     text         DEFAULT NULL,
  p_eval_type        text         DEFAULT NULL,
  p_value            numeric      DEFAULT 0,
  p_origem           text         DEFAULT 'manual',
  p_obs              text         DEFAULT NULL
) RETURNS jsonb
```

**Side-effects:**
- `SELECT FOR UPDATE` no lead (anti-race)
- Validação matriz (lead/agendado/reagendado/orcamento/perdido → agendado)
- `INSERT public.appointments` (lead_id setado, patient_id NULL,
  status='agendado')
- `UPDATE public.leads SET phase='agendado', phase_origin='auto_transition',
   is_in_recovery=true (se vinha de perdido)`
- `INSERT public.phase_history` (origin='auto_transition',
  triggered_by='rpc:lead_to_appointment', reason='appointment_id=...')

**Idempotência:** chamadas concorrentes para o mesmo lead **não** quebram —
SELECT FOR UPDATE serializa. Cada chamada cria UM appointment novo (não há
dedup por scheduled_date por design — pode haver dois appts no mesmo dia).

**Erros possíveis:**
- `lead_not_found` — lead inexistente, deletado, ou de outra clínica
- `illegal_phase_transition` — lead já em fase terminal (paciente)

---

### 3.3 `appointment_attend()` — paciente chegou

**Quem chama:**
- UI Recepção (botão "Paciente chegou")
- Lara (quando paciente confirma chegada via WA)
- Trigger automatico (timer pos-pre_consulta?)  — **não** implementado
  hoje; deixar manual.

**Assinatura:**
```sql
appointment_attend(
  p_appointment_id uuid,
  p_chegada_em     timestamptz DEFAULT NULL  -- default now()
) RETURNS jsonb
```

**Side-effects:**
- `SELECT FOR UPDATE` no appointment + lead
- Bloqueia se status = cancelado/no_show/bloqueado
- `UPDATE appointments SET status='na_clinica', chegada_em=...`
- `UPDATE leads SET phase='compareceu', phase_origin='auto_transition'`
- `INSERT phase_history`

**Idempotência:** se status já é `na_clinica/em_consulta/em_atendimento/finalizado`,
não-op (retorna `idempotent_skip: true`). `chegada_em` nunca é resetado.

**Erros possíveis:**
- `appointment_not_found`
- `invalid_status_for_attend` — status incompatível (cancelado etc)

---

### 3.4 `appointment_finalize()` — outcome decide próximo estado

**Quem chama:**
- UI modal de finalização da consulta (botão "Finalizar")
- Lara (caso muito raro: paciente diz "não preciso voltar" pelo WA)

**Assinatura:**
```sql
appointment_finalize(
  p_appointment_id uuid,
  p_outcome        text,           -- 'paciente' | 'orcamento' | 'perdido'
  p_value          numeric      DEFAULT NULL,
  p_payment_status text         DEFAULT NULL,
  p_notes          text         DEFAULT NULL,
  p_lost_reason    text         DEFAULT NULL,
  p_orcamento_items jsonb       DEFAULT NULL,
  p_orcamento_subtotal numeric  DEFAULT NULL,
  p_orcamento_discount numeric  DEFAULT 0
) RETURNS jsonb
```

**Side-effects:**
- `UPDATE appointments SET status='finalizado'`
- Roteamento por outcome:
  - `paciente` → chama `lead_to_paciente()` (ver 3.5)
  - `orcamento` → chama `lead_to_orcamento()` (ver 3.6)
  - `perdido`  → chama `lead_lost()` (ver 3.7)

Se appointment não tem `lead_id` (é appt de paciente recorrente, vinculado
a `patient_id`), a finalização ocorre **sem promoção** — o paciente já é
paciente. Nesse caso `outcome` é apenas registrado nas notas.

**Atomicidade:** o appt é finalizado em primeiro, depois sub-RPC. Se a
sub-RPC falhar (ex: items inválidos pra orcamento), o appt continua
finalizado e a UI recebe `{ok: false, sub_call: {...}}` — UI deve mostrar
toast + permitir retentar a sub-ação.

---

### 3.5 `lead_to_paciente()` — promove pra patients (ADR-001)

**Pré-condição:** `leads.phase = 'compareceu'`

**Quem chama:**
- `appointment_finalize(outcome='paciente')` (caso normal)
- UI manual (admin convertendo lead já-paciente do legado)
- `sdr_change_phase(p_to_phase='paciente')` (wrapper)

**Side-effects:**
1. `INSERT public.patients` (mesmo `id` do lead — UUID compartilhado).
   Snapshot de lead.metadata/source/funnel/temperature em
   `patients.source_lead_meta` (audit imutável).
2. `UPDATE public.appointments SET lead_id=NULL, patient_id=lead_id WHERE
    lead_id=...` — re-mapeia FKs.
3. `UPDATE public.orcamentos SET lead_id=NULL, patient_id=lead_id WHERE
    lead_id=...` — re-mapeia.
4. `UPDATE public.leads SET phase='paciente', deleted_at=now()` (modelo
    excludente).
5. `INSERT phase_history`.

**Idempotência:** se já existe `patients` com mesmo UUID, atualiza apenas
agregados (total_revenue, last_procedure_at) e re-confirma soft-delete em
leads (defensivo).

**Erros possíveis:**
- `lead_not_found`
- `illegal_transition` (phase != compareceu)

---

### 3.6 `lead_to_orcamento()` — emite orçamento

**Pré-condição:** `leads.phase = 'compareceu'`

**Quem chama:**
- `appointment_finalize(outcome='orcamento')` (caso normal)
- UI Orçamentos (admin emitindo orçamento avulso pra lead pós-compareceu)

**Assinatura:**
```sql
lead_to_orcamento(
  p_lead_id   uuid,
  p_subtotal  numeric,
  p_items     jsonb,                -- array shape: [{name, qty, unit_price, subtotal}]
  p_discount  numeric  DEFAULT 0,
  p_notes     text     DEFAULT NULL,
  p_title     text     DEFAULT NULL,
  p_valid_until date   DEFAULT NULL
) RETURNS jsonb
```

**Side-effects:**
1. `INSERT public.orcamentos` (lead_id setado, patient_id NULL,
   status='draft', total = subtotal - discount).
2. `UPDATE public.leads SET phase='orcamento', deleted_at=now()`.
3. `INSERT phase_history`.

**Erros possíveis:**
- `invalid_subtotal` (NULL ou negativo)
- `invalid_items` (não é array JSONB)
- `lead_not_found_or_deleted`
- `illegal_transition` (phase != compareceu)

---

### 3.7 `lead_lost()` — marca perdido

**Pré-condição:** matriz permite `phase atual → perdido` (sempre permite,
exceto compareceu→perdido que precisa explicação humana).

**Quem chama:**
- `appointment_finalize(outcome='perdido')` (paciente cancelou na consulta)
- UI manual (botão "Marcar como perdido" no Kanban)
- `sdr_change_phase(p_to_phase='perdido')`
- Cron de retake no longo prazo (não implementado hoje)

**Assinatura:**
```sql
lead_lost(p_lead_id uuid, p_reason text) RETURNS jsonb
```

**Side-effects:**
- `UPDATE leads SET phase='perdido', lost_reason, lost_at=now(), lost_by=auth.uid()`
- `INSERT phase_history`
- **NÃO** soft-delete (modelo excludente diz: só promoção
  paciente/orcamento gera deleted_at).

**Idempotência:** se já é `phase=perdido` com mesmo `lost_reason`, no-op.

**CHECK constraint** `chk_leads_lost_consistency` impede UPDATE direto pelo
client se phase=perdido sem lost_reason.

---

### 3.8 `sdr_change_phase()` — wrapper genérico

Quando UI faz Kanban drag-drop ou admin muda phase manualmente. Roteia:

- `to_phase = perdido`   → `lead_lost(p_lead_id, COALESCE(p_reason, ''))`
- `to_phase = paciente`  → `lead_to_paciente(p_lead_id, NULL, ..., p_reason)`
- `to_phase = orcamento` → **falha** com hint `use_lead_to_orcamento_directly`
- demais (lead/agendado/reagendado/compareceu) → UPDATE direto + audit

phase_origin é setado como `manual_override` (vs `rpc`/`auto_transition`),
permitindo distinguir UI vs fluxo automatico em relatórios.

---

## 4 · Side-effects e invariantes garantidos

### Em CADA RPC mutadora:

| Garantia | Como |
|---|---|
| Tenant isolation | `clinic_id = app_clinic_id()` checado em SELECT + sub-WHERE clauses |
| Race protection | `SELECT ... FOR UPDATE` no lead/appt/orcamento |
| Audit trail | `INSERT phase_history` em toda transição de phase |
| Imutabilidade matriz | `_lead_phase_transition_allowed()` chamada antes de UPDATE phase |
| Modelo excludente | `lead_to_paciente`/`lead_to_orcamento` setam `leads.deleted_at = now()` |
| Re-mapeamento FK | `appointments.lead_id` → `patient_id` ao virar paciente |
| Search_path lock | `SET search_path = public, extensions, pg_temp` em TODAS RPCs |

---

## 5 · Erros possíveis e tratamento na UI

Padrão de retorno: `{ok: boolean, error?: string, hint?: string, ...data}`.

| Erro | Significado | Tratamento UI sugerido |
|---|---|---|
| `no_clinic_in_jwt` | JWT sem clinic_id | Redirecionar pra `/login` |
| `phone_required` | Phone < 8 chars | Validação client-side antes de chamar |
| `lead_not_found` | Lead inexistente / outra clínica / deletado | Toast erro + refresh lista |
| `lead_softdeleted_exists` | Phone já é paciente | Modal: "abrir prontuário" ou "criar novo lead com identificador diferente" |
| `illegal_phase_transition` | Tentou transição proibida | Mostrar matriz no UI (debug only) ou hide opção |
| `invalid_status_for_attend` | Tentou attend em cancelado/no_show | Hide botão "Chegou" se status terminal |
| `lost_reason_required` | Marcou perdido sem motivo | Modal força preenchimento |
| `invalid_outcome` | finalize com outcome != lista | Validação client (select com 3 opções) |
| `invalid_subtotal/items` | Orçamento mal formado | Form validation no client |
| `sub_rpc_failed` | finalize ok mas paciente/orcamento/lost falhou | Toast + permitir retentar a sub-ação |

---

## 6 · Fluxos completos (cenários reais)

### Cenário A — Lara onboarder funil completo

```
[Lara · WA inbound]
   ↓
RPC lead_create(phone, name, source='lara_recipient', source_type='whatsapp', funnel='procedimentos')
   ↓ leads(id=L, phase=lead)
   ↓ phase_history(NULL → lead)
[Lara · qualifica · descobre interesse "fullface"]
   ↓
UPDATE leads SET funnel='fullface' (via Server Action que chama leads_update_meta — não está nas 8 RPCs core, mas usa RLS direto)
[Recepção · agenda consulta]
   ↓
RPC lead_to_appointment(L, '2026-05-10', '14:00', '15:00', professional_id=P)
   ↓ appointments(id=A, lead_id=L, patient_id=NULL, status=agendado)
   ↓ leads(id=L, phase=agendado)
   ↓ phase_history(lead → agendado)
[Recepção · D-1 confirma WA]
   ↓
UPDATE appointments SET status='confirmado' (via UI direta, RLS valida)
[Recepção · paciente chegou]
   ↓
RPC appointment_attend(A)
   ↓ appointments(id=A, status=na_clinica, chegada_em=now())
   ↓ leads(id=L, phase=compareceu)
   ↓ phase_history(agendado → compareceu)
[Profissional · finaliza · paciente comprou pacote]
   ↓
RPC appointment_finalize(A, outcome='paciente', value=2500, payment_status='pago', notes='pacote 5 sessões')
   ↓ appointments(id=A, status=finalizado, value=2500)
   ↓ → lead_to_paciente(L, total_revenue=2500, ...)
        ↓ patients(id=L, total_revenue=2500, status=active, source_lead_meta={...})
        ↓ appointments(id=A, lead_id=NULL, patient_id=L)  -- re-mapeado
        ↓ leads(id=L, deleted_at=now(), phase=paciente)
        ↓ phase_history(compareceu → paciente)
```

### Cenário B — Orçamento + recovery (paciente não fechou na hora)

```
[Lead L em phase=compareceu]
[Profissional · finaliza com orçamento aberto]
RPC appointment_finalize(A, outcome='orcamento', orcamento_subtotal=4500, orcamento_items=[...])
   ↓ appointments(status=finalizado)
   ↓ → lead_to_orcamento(L, subtotal=4500, items=[...])
        ↓ orcamentos(id=O, lead_id=L, total=4500, status=draft)
        ↓ leads(id=L, deleted_at=now(), phase=orcamento)
        ↓ phase_history(compareceu → orcamento)
[Comercial · envia WA com link]
   ↓ UPDATE orcamentos SET status='sent', sent_at=now() (via UI)
[Cliente · abre link]
   ↓ UPDATE orcamentos SET status='viewed', viewed_at=now() (via budget_get_by_token RPC)
[Negociação ...]
[Cliente aceita]
   ↓ UPDATE orcamentos SET status='approved', approved_at=now()
   ↓ App calls RPC sdr_change_phase(L, 'paciente') → roteia pra lead_to_paciente
      ↓ patients(id=L, ...)
      ↓ orcamentos(id=O, lead_id=NULL, patient_id=L)  -- re-mapeado
      ↓ leads(id=L, phase=paciente, deleted_at já estava setado)
      ↓ phase_history(orcamento → paciente)
```

### Cenário C — Lead perdido + recovery via Lara

```
[Lead L phase=agendado · cliente cancela WA · Lara detecta]
RPC lead_lost(L, 'cancelou via WA · pediu pra remarcar daqui 1 mês')
   ↓ leads(id=L, phase=perdido, lost_reason=..., lost_at=now())
   ↓ phase_history(agendado → perdido)
   -- NÃO há soft-delete aqui (modelo excludente só pra patients/orcamentos)
[1 mês depois · Lara detecta evento de retake]
RPC sdr_change_phase(L, 'lead', 'cron_retake_30d')
   -- matriz: perdido → lead OK
   ↓ leads(id=L, phase=lead, is_in_recovery=true, phase_origin=manual_override)
   ↓ phase_history(perdido → lead)
[Cliente engaja · agenda]
RPC lead_to_appointment(L, ...)
   ↓ leads(id=L, phase=agendado, is_in_recovery=true preservado)
```

### Cenário D — Cancelamento de appointment volta lead pra "lead"

```
[Lead L phase=agendado · appt A status=agendado]
[Recepção · UPDATE appointments SET status='cancelado', motivo_cancelamento='cliente desistiu']
   -- DENTRO de Server Action, depois desse UPDATE:
RPC sdr_change_phase(L, 'lead', 'appt cancelado')
   -- matriz: agendado → lead NÃO é permitida diretamente.
   -- Caller deve usar perdido OU criar novo appt.
   -- Alternativa correta: deixar lead em phase=agendado se ainda tem outros
   -- appts ativos · soft-cancelar appt sem mexer no lead.
```

> Observação: o trigger `_appt_revert_lead_phase_on_remove` do legado fazia
> isso automaticamente. **Decisão v2:** NÃO reintroduzir esse trigger — UI
> decide explicitamente. Se o último appt foi cancelado e a UI quer voltar
> lead pra `lead`, deve usar `lead_lost(reason='ultimo_appt_cancelado')`
> seguido de `sdr_change_phase(lead)` em recovery.

---

## 7 · Integração com módulos externos

### B2B (voucher emitido → lead)

```
[B2B admin emite voucher]
   ↓ INSERT b2b_vouchers (do módulo B2B)
   ↓ Server Action chama:
RPC lead_create(
  p_phone='5511999...',
  p_name='Maria',
  p_source='b2b_partnership_referral',
  p_source_type='b2b_voucher',
  p_funnel='procedimentos',
  p_metadata={'voucher_id': '<uuid>', 'partnership_id': '<uuid>'}
)
   ↓ {ok, lead_id, existed?}
[B2B armazena lead_id no voucher]
   ↓ UPDATE b2b_vouchers SET lead_id = ... WHERE id = ...
```

**Sem trigger reverso.** O legado tinha `trg_b2b_lead_auto_attribution` que
disparava DEPOIS do INSERT em leads e consultava B2B pra atribuir. Removido
— B2B é quem chama lead_create com metadata correto.

### VPI (referral → lead)

Mesmo padrão. `vpi_lead_upsert_for_referral` (existente no legado) deve ser
reescrita pra chamar `lead_create()` ao invés de fazer INSERT direto:

```sql
-- ANTES (legado, mig 700-VPI):
INSERT INTO public.leads (phone, name, source, ...) VALUES (...);
INSERT INTO public.vpi_attribution (lead_id, partner_session_id, ...) VALUES (...);

-- DEPOIS (v2):
SELECT lead_create(
  p_phone, p_name, 'lara_vpi_partner', 'vpi_referral',
  'procedimentos', NULL,
  jsonb_build_object('partner_session_id', p_session_id, 'partner_name', p_partner_name)
) INTO v_result;
INSERT INTO public.vpi_attribution (lead_id, ...) VALUES ((v_result->>'lead_id')::uuid, ...);
```

### Lara (webhook → lead)

```
[WA Cloud API webhook]
   ↓ webhook_processing_queue (service_role)
   ↓ Worker pega · normaliza phone · roteamento
   ↓ Se número novo:
RPC lead_create(
  p_phone, p_name='', p_source='lara_recipient',
  p_source_type='whatsapp', p_funnel='procedimentos',
  p_metadata={'wa_msg_id': '<id>', 'first_inbound_at': '<ts>'}
)
   ↓ Lara abre conversa em wa_conversations(lead_id=v_result.lead_id)
```

### Magazine (futura)

Magazine **não** acopla via trigger. Quando precisar criar lead a partir de
um clique em flipbook, chama `lead_create()` com `p_source='magazine'` +
`p_metadata={'edition_id': '...', 'click_token': '...'}`.

---

## 8 · Triggers preservados (mínimos)

| Tabela | Trigger | When | Função | Razão |
|---|---|---|---|---|
| `leads` | `leads_updated_at` | BEFORE UPDATE | `set_updated_at()` | timestamp |
| `leads` | `leads_normalize_phone` | BEFORE INSERT/UPDATE OF phone | `trg_normalize_phone()` | E.164 |
| `patients` | `patients_updated_at` | BEFORE UPDATE | `set_updated_at()` | timestamp |
| `patients` | `patients_normalize_phone` | BEFORE INSERT/UPDATE OF phone | `trg_normalize_patient_phone()` | E.164 |
| `appointments` | `appointments_updated_at` | BEFORE UPDATE | `set_updated_at()` | timestamp |
| `appointments` | `appointments_normalize_phone` | BEFORE INSERT/UPDATE OF subject_phone | `trg_normalize_patient_phone()` | E.164 |
| `orcamentos` | `orcamentos_updated_at` | BEFORE UPDATE | `set_updated_at()` | timestamp |

**Removidos do legado** (NÃO recriar):
- `_auto_move_lead_to_target_table` (vivia em leads · loop de re-write
  no UPDATE)
- `trg_b2b_lead_auto_attribution`, `trg_b2b_voucher_*`, `trg_appt_voucher_sync_*`
- `trg_magazine_validate_invite`
- `trg_vpi_*` (8 triggers)
- `trg_appt_revert_lead_phase_on_*` (delegado pra UI/RPC explícita)
- `trg_appointment_to_medical_record` (módulo medical_record é separado;
  reabilitar quando esse módulo for criado em v2)
- `trg_lead_phase_on_appointment_*` (4 triggers — phase é movida pelas
  RPCs explicitamente)
- `trg_audit_appt_financial` (cashflow é módulo separado)

**Resumo:** de 13 triggers em `appointments` no legado, **2** sobrevivem.
De 8 em `leads`, **2** sobrevivem.

---

## 9 · Roteiro de migração para prod

> **NÃO aplicar diretamente** as migrations 60-65 contra prod sem este
> roteiro. Tabelas legadas têm 474 leads / 30 patients / 24 orcamentos / 443
> phase_history rows que precisam ser preservados.

### Pré-requisitos

1. Criar dump full do banco: `pg_dump -h <host> -U postgres clinicai > dump_pre_crm_v2.sql`
2. Aplicar em **branch dev** primeiro (Supabase preview branch).
3. Subir CI/CD que roda smoke test contra schema novo.

### Ordem de aplicação

```
mig 20260800000060_clinicai_v2_crm_leads.sql
mig 20260800000061_clinicai_v2_crm_patients.sql
mig 20260800000062_clinicai_v2_crm_appointments.sql
mig 20260800000063_clinicai_v2_crm_orcamentos.sql
mig 20260800000064_clinicai_v2_crm_phase_history.sql
mig 20260800000065_clinicai_v2_crm_rpcs.sql
```

Em **branch limpa** (sem dados legado): aplicar tudo direto. Sanity DO $$
em cada migration deve passar.

Em **prod (com dados legado)**: cada migration de tabela faz
`CREATE TABLE IF NOT EXISTS`, que **não vai recriar** uma tabela existente.
Procedimento manual:

#### Para cada tabela (leads/patients/appointments/orcamentos/phase_history):

```sql
BEGIN;
-- 1. Backup
CREATE TABLE public.leads_legacy_20260428 AS TABLE public.leads;
-- 2. Drop triggers/policies legadas que vão dar conflito
DROP TRIGGER IF EXISTS trg_b2b_lead_auto_attribution ON public.leads;
DROP TRIGGER IF EXISTS trg_vpi_lead_tag_on_referral ON public.leads;
DROP TRIGGER IF EXISTS trg_auto_move_lead_to_target ON public.leads;
DROP TRIGGER IF EXISTS trg_fm_cascade_delete_lead ON public.leads;
-- 3. Rename
ALTER TABLE public.leads RENAME TO leads_v1;
-- 4. Aplicar a migration (cria public.leads canonica vazia)
\i db/migrations/20260800000060_clinicai_v2_crm_leads.sql
-- 5. Backfill (mapping de colunas)
INSERT INTO public.leads (
  id, clinic_id, name, phone, email, cpf, rg, birth_date, idade,
  phase, phase_updated_at, phase_updated_by, phase_origin,
  source, source_type, source_quiz_id, funnel, ai_persona, temperature,
  priority, lead_score, day_bucket, channel_mode, assigned_to,
  is_in_recovery, lost_reason, lost_at, lost_by,
  queixas_faciais, metadata, wa_opt_in, last_contacted_at, last_response_at,
  created_at, updated_at, deleted_at
)
SELECT
  id, clinic_id, name, phone, NULLIF(email,''), cpf, rg,
  CASE WHEN birth_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN birth_date::date ELSE NULL END,
  idade,
  phase, phase_updated_at, phase_updated_by, phase_origin,
  source, source_type, source_quiz_id, funnel,
  COALESCE(ai_persona, 'onboarder'), COALESCE(temperature, 'warm'),
  priority, lead_score, day_bucket, channel_mode, assigned_to,
  is_in_recovery, lost_reason, lost_at, lost_by,
  COALESCE(queixas_faciais, '[]'::jsonb),
  COALESCE(data, '{}'::jsonb),  -- legacy `data` vira `metadata`
  COALESCE(wa_opt_in, true), last_contacted_at, last_response_at,
  COALESCE(created_at, now()), COALESCE(updated_at, now()), deleted_at
FROM public.leads_v1;
-- 6. Verificar
SELECT count(*) FROM public.leads;       -- esperar 474
SELECT count(*) FROM public.leads_v1;    -- esperar 474
-- 7. Se OK, dropar legacy
DROP TABLE public.leads_v1;
COMMIT;
```

Repetir o mesmo padrão pra patients (lidando com `tenantId` → drop), appointments
(lidando com 30 colunas drop + recriar FK pra patients), orcamentos (mapeamento
direto), phase_history (adicionar `clinic_id` denormalizado via JOIN com leads).

#### Sanity após backfill:

```sql
-- Modelo excludente
SELECT count(*) FROM public.leads l JOIN public.patients p ON p.id = l.id WHERE l.deleted_at IS NULL;
-- Esperado: 0

-- Phase válida
SELECT phase, count(*) FROM public.leads WHERE deleted_at IS NULL GROUP BY 1;
-- Esperado: lead/agendado/reagendado/compareceu/perdido (sem paciente/orcamento — esses tem deleted_at)

-- RPCs respondem
SELECT public.lead_create('5511999999999', 'Smoke Test', 'manual', 'manual');
-- Esperado: {"ok":true, "lead_id":"...", "existed":false, "phase":"lead"}

-- Cleanup
DELETE FROM public.leads WHERE name='Smoke Test';
```

---

## 10 · Próximas iterações (fora do escopo Onda 4)

- `appointment_items` (tabela separada · drop array `procedimentos jsonb`)
- `appointment_payments` (idem · drop array `pagamentos jsonb`)
- `clinic_members` (multi-tenant real · ADR-029 §1.1)
- `agenda_visibility` (preservar do legado · usado em RLS de appointments)
- `medical_records` (módulo separado · trigger reabilitada)
- Cron de reactivation (`perdido` → `lead` automático após N dias com regra)
- View `crm_funnel_metrics` (KPI: conversão lead→agendado→compareceu→paciente
  por funnel/source/professional)

---

**Fim do contrato CRM core v2.** Atualizar este documento PRIMEIRO antes de
mudar qualquer migration ou RPC.
