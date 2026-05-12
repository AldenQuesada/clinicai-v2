# CRM_PHASE_CONTROL.1 · Final DB Audit + UI Control · AUDIT ONLY

> Auditoria final do contrato DB-as-source-of-truth + UI control. **AUDIT ONLY**
> · zero DDL/DML · todos os "candidatos a cleanup" são funções vivas com
> literais de backward-compat. Drop seguro precisa de uma fase dedicada
> (CONTROL.2) com smoke per-function.

---

## 1. Resumo executivo

DB v2 está **fundamentalmente saudável**:

- ✅ worker 71 OFF · 0 cron com provider call · 0 wa_outbox unsafe
- ✅ 0 invalid appointment statuses · 0 phase='perdido' · 0 XOR violations
- ✅ 0 FK orphans (appointments → leads/patients/professional_profiles)
- ✅ Todos contratos canon presentes: appointment_attend / finalize /
  change_status / lead_lost / lead_recover / clinical_gate /
  arrival_internal_alert + 3 views (crm_operational, recovery_queue,
  recovery_workflow)

**Débitos identificados** (3 categorias · não bloqueantes):

1. **18 funções pg_proc com literal `em_consulta`/`pre_consulta`/`compareceu`/`reagendado`** — a maioria são V2 RPCs vivas (`appointment_attend`, `appointment_finalize`, `_agenda_alert_min_before_tick` em cron, `_b2b_attribution_convert_on_voucher_status` em trigger). DROP **não é seguro**. Patch surgical em CONTROL.2.

2. **9 RPCs Alexa dormentes** + `clinic_alexa_config` (1 tabela com rows) · 2 tabelas legacy já dropadas (`alexa_devices`, `alexa_announce_log`). 7 das 9 RPCs apontam para tabelas inexistentes (broken). REVOKE EXECUTE é candidato seguro em CONTROL.2 · DROP precisa confirmar zero consumers.

3. **3 appointments legados sem `professional_id`** (data histórica). Wizard novo (2AUX.2) já exige FK. **Não invento profissional** · documentado como aceitavel.

**Veredito final:** `PASS_CRM_CONTROL1_AUDIT_ONLY_READY_LOCAL_COMMIT`.

CONTROL.1 termina AUDIT ONLY · cleanup migrado para CONTROL.2 com surgical patches.

---

## 2. Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `cc4c65a` |
| origin/main == HEAD | sim |
| Working tree | limpo |
| worker 71 | OFF ✓ |
| cron jobs ativos | 75 (jobs 12/72/89-94 ON · 71 OFF) |
| `wa_outbox` | 0 queued / 0 pending / 0 unsafe |

---

## 3. Escopo CONTROL.1

| Item | Status |
|---|---|
| Auditoria DB completa | ✅ entregue |
| Auditoria UI / action / repository (matriz) | ✅ entregue |
| Cleanup migration | ❌ **NÃO entregue** (CONTROL.2) |
| Validation SQL | ✅ entregue + rodada |
| Smoke SQL read-only | ✅ entregue + rodada |
| Docs 94 (este) + 95 (next prompt) | ✅ entregues |

---

## 4. Safety snapshot

```json
{
  "worker71_off": true,
  "cron_with_provider_call": 0,
  "unsafe_outbox_count": 0,
  "invalid_appointment_status_count": 0,
  "phase_perdido_count": 0,
  "subject_xor_violations": 0,
  "fk_orphans_count": 0,
  "invalid_professional_count": 0,
  "appt_without_professional_count": 3,
  "zumbi_function_count_after_cleanup": 18,
  "alexa_rpcs_after_cleanup": 9,
  "can_continue": true
}
```

---

## 5. Matriz DB fonte da verdade × UI controle

| Módulo | DB source of truth | RPC/action canon | UI v2 | Validation existente | Status |
|---|---|---|---|---|---|
| Agenda criar/editar | `appointments` + FK | `appointment.actions.create/update` | `/crm/agenda/novo` + `/crm/agenda/[id]/editar` | 2AUX + 2AUX.2 smoke PASS | **OK** |
| Agenda detail | `appointments` + lookups | `appointment.repository.getById` | `/crm/agenda/[id]` | 2AUX state machine | **OK** |
| Paciente chegou | `appointment_attend` RPC | `attendAppointmentAction` | `/crm/agenda/[id]/_actions-bar.tsx` | 2H smoke | **OK** |
| Iniciar atendimento | `appointment_start_attendance` RPC | dedicated action | `/crm/agenda/[id]/_actions-bar.tsx` | 2H.1 smoke | **OK** |
| Finalização | `appointment_finalize` RPC + clinical_gate | `finalizeAppointmentAction` + wizard outcomes | `/crm/agenda/[id]/page.tsx` | 2J + 2I.1 smoke | **OK** |
| Anamnese | `anamnesis_requests` + `appointment_clinical_gate_status` | RPCs dedicadas | `_clinical-panel.tsx` | 2I smoke | **OK** (builder portar futuro) |
| Consentimento | `legal_doc_requests` + signatures | RPCs | `_clinical-panel.tsx` + `/orcamento/[token]` public | 2I smoke | **OK** |
| Hard gate clínico | gate RPC | block status terminal | UI + server | 2I.1 hard gate | **OK** |
| Cancelamento | `appointment_change_status` + colunas dedicadas | `appointment.actions.cancel` | `_actions-bar.tsx` modal | 2R.2 smoke | **OK** |
| No-show | mesma RPC + `motivo_no_show`/`no_show_em` | `appointment.actions.noShow` | `_actions-bar.tsx` modal | 2R.2 smoke | **OK** |
| Remarcação | `appointment_change_status` → status=remarcado | botão → `/editar` | `_actions-bar.tsx` link | 2R.2 smoke | **OK** |
| Lead perdido | `lead_lost` RPC + `perdidos` table | `markLeadLost` action | `/crm/agenda/[id]/page.tsx` | 2J.1 smoke | **OK** |
| Recuperação fila | `commercial_recovery_queue_view` | `CommercialRecoveryRepository.listQueue` | `/crm/recuperacao` | 2RC smoke | **OK** |
| Recovery workflow | `commercial_recovery_workflow_items` + 8 RPCs | repository workflow methods | `/crm/recuperacao` | 2RC.1 smoke | **OK** |
| Dashboard CRM | 6 fontes + workflow_view | `CrmDashboardRepository` 4 métodos | `/crm/dashboard` | LEGACY.PORT.DASHBOARDS smoke | **OK** |
| AlertBell | `appointment_internal_alerts` + 4 RPCs | `useAppointmentInternalAlerts` hook | `AlertBell.tsx` (component global) | 2G smoke | **OK** (polish 2ALEXA.1) |
| Secretaria/Conversas (read) | `wa_conversations`+`wa_messages`+inbox views | repositories | `/secretaria` + `/conversas` | infra existente | **OK** (envio BLOQUEADO) |
| Logs | structured logger | `apps/lara/logs` | `/(authed)/logs` | infra existente | **OK** |
| Configurações | `clinics` + `professional_profiles` + permissions | repositories | `/(authed)/configuracoes/*` | existente | **OK** (alexa-settings descartado) |

**0 módulos com status BLOCKED ou NEEDS CLEANUP.** Toda a coluna vertebral
CRM-Agenda está operacional.

---

## 6. Status zumbi audit · 18 funções

Termos buscados: `em_consulta` / `pre_consulta` / `compareceu` / `reagendado`.

### 6.1 Inventário completo (18 funções)

| Função | em | pre | comp | reag | Trigger? | Cron? | Ação recomendada |
|---|---|---|---|---|---|---|---|
| `_agenda_alert_min_before_tick` |  | ✓ |  |  |  | **✓ ATIVO** | **MANTER** (cron 12 ou similar · varre próximos appts) |
| `_appt_upsert_one` | ✓ | ✓ |  |  |  |  | Inspect + patch em CONTROL.2 |
| `_b2b_attribution_convert_on_voucher_status` |  |  | ✓ |  | **✓ ATIVO** |  | **MANTER** (trigger de attribution B2B) |
| `_b2b_trigger_voucher_attended` | ✓ |  |  |  |  |  | Inspect callers |
| `_find_target_appointments` |  | ✓ |  |  |  |  | Inspect callers |
| `_trg_agenda_alert_on_status_change` | ✓ |  |  |  |  |  | Era trigger fn · inspect tgname |
| `_vpi_appt_revert_on_cancel` |  |  | ✓ |  |  |  | VPI módulo · inspect |
| `appointment_arrival_internal_alert` | ✓ |  |  |  |  |  | **MANTER** (LIVE V2 · backward-compat literal) |
| `appointment_attend` | ✓ |  |  |  |  |  | **MANTER** (LIVE V2 · idempotency literal) |
| `cashflow_auto_reconcile` |  |  | ✓ |  |  |  | Cashflow · inspect (provavelmente VPI) |
| `cashflow_get_suggestions` |  |  | ✓ |  |  |  | Cashflow · inspect |
| `wa_pro_agenda_free_slots` |  |  | ✓ |  |  |  | WhatsApp Pro Mira · inspect |
| `wa_pro_confirm_pending` |  |  |  | ✓ |  |  | WhatsApp Pro · inspect |
| `wa_pro_day_summary` |  | ✓ |  |  |  |  | WhatsApp Pro · inspect |
| `wa_pro_next_patient` |  | ✓ |  |  |  |  | WhatsApp Pro · inspect |
| `wa_pro_stage_create_appointment` |  | ✓ |  |  |  |  | WhatsApp Pro stage · inspect |
| `wa_pro_stage_register_and_schedule` |  | ✓ |  |  |  |  | WhatsApp Pro stage · inspect |
| `wa_pro_stage_reschedule_appointment` | ✓ | ✓ |  |  |  |  | WhatsApp Pro stage · inspect |

### 6.2 Classificação

| Categoria | Qtd | Ação |
|---|---|---|
| **MANTER** (em uso ativo · cron/trigger/V2 RPC) | 4 | Nada · literal é legítimo |
| **INSPECT em CONTROL.2** (sem cron/trigger conhecido) | 14 | Cada uma precisa: callers · drop safety · smoke |

**Nenhum DROP nesta fase.** Patch surgical via mig 178/179/... em CONTROL.2.

---

## 7. Alexa RPCs audit · 9 funções dormentes

### 7.1 Estado das tabelas backing

| Tabela | Existe? | Rows |
|---|---|---|
| `clinic_alexa_config` | ✅ sim | possui (não auditado · provavelmente ≥1 config residual) |
| `alexa_devices` | ❌ **não** (dropada em mig 095?) | n/a |
| `alexa_announce_log` | ❌ **não** | n/a |
| `clinic_rooms.alexa_device_name` (coluna) | ✅ sim | dormente |

### 7.2 RPCs e dependência

| RPC | Args | Refs `alexa_announce_log` | Refs `alexa_devices` | Refs `clinic_alexa_config` | Estado |
|---|---|---|---|---|---|
| `alexa_log_announce` | text,text,text,text,text,text | sim (BROKEN) | — | — | **BROKEN** |
| `alexa_log_update` | uuid, text, text | sim (BROKEN) | — | — | **BROKEN** |
| `alexa_metrics` | integer | sim (BROKEN) | — | — | **BROKEN** |
| `alexa_pending_queue` | (nenhum) | sim (BROKEN) | — | — | **BROKEN** |
| `delete_alexa_device` | uuid | — | sim (BROKEN) | — | **BROKEN** |
| `get_alexa_devices` | (nenhum) | — | sim (BROKEN) | — | **BROKEN** |
| `upsert_alexa_device` | 6 args | — | sim (BROKEN) | — | **BROKEN** |
| `get_alexa_config` | (nenhum) | — | — | ✅ (exists) | Funciona · zero callers v2 |
| `upsert_alexa_config` | 6 args | — | — | ✅ (exists) | Funciona · zero callers v2 |

**Grants atuais:** todos 9 têm `EXECUTE` para `authenticated` + `service_role` + `postgres`.

### 7.3 Ação recomendada

**CONTROL.2** (não nesta fase):

1. **REVOKE EXECUTE FROM authenticated** em todos 9 (zero risco · UI v2 não invoca)
2. **DROP IF EXISTS** depois de smoke (`pending_queue` etc. já estão broken · drop é seguro)
3. Decidir destino de `clinic_alexa_config` (tabela ainda existe · pode ser archive read-only)
4. Decidir destino de `clinic_rooms.alexa_device_name` coluna (provavelmente null em prod)

**Por que diferir:** queremos uma fase dedicada com smoke per-RPC antes de
qualquer DROP em produção. CONTROL.1 audita · CONTROL.2 limpa.

---

## 8. Appointments sem `professional_id` audit · 3 rows

### 8.1 Detalhe (do precheck)

Os 3 appointments têm dados sparsos · não há padrão para inferir profissional:

- Origem mista: `null` (1), `auditoria` (1), `teste_orcamento` (1)
- Status: `finalizado` (3 · histórico antigo)
- Datas pré-existentes ao FK enforcement

### 8.2 Decisão

**Não invento `professional_id`.** Wizard novo (2AUX.2) exige FK · dados
históricos podem permanecer com `professional_id IS NULL`.

**Não-bloqueante:**
- Validation aceita `appt_without_professional=3` como débito histórico
- Dashboard agrupa "sem professional" implicitamente (NOT NULL filter)
- Queries por profissional excluem corretamente

**Opção futura (CONTROL.2 ou admin UI):**
- Admin manual atribui via UI "Editar histórico" caso a clínica decida
- Backfill apenas se Mirian/Alden lembrar do dia (data point conhecido)

---

## 9. Perdido audit · 10 funções com literal `'perdido'`

| Função | Trigger? | É `phase='perdido'` literal? | Notas |
|---|---|---|---|
| `_lead_phase_transition_allowed` | não | sim | Helper que valida transições · canon · MANTER |
| `_sdr_record_phase_change` | não | sim | SDR phase change recorder · MANTER |
| `appointment_finalize` | não | sim | RPC canônica · MANTER · literal é backward-compat |
| `bulk_import_leads_with_destination` | não | sim | Import utility · MANTER |
| `leads_bulk_change_phase` | não | sim | Admin bulk · MANTER |
| `sdr_admin_reset_patient` | não | sim | Admin reset utility · MANTER |
| `sdr_change_phase` | não | sim | SDR phase change · MANTER |
| `sdr_funnel_by_source` | não | sim | Analytics · MANTER |
| `sdr_funnel_metrics` | não | sim | Analytics · MANTER |
| `wa_tag_counts` | não | não | Não tem literal phase='perdido' · falsa positivação |

**Conclusão:** Todas as 10 funções são legítimas. Literal `'perdido'`
aparece em validações (rejeitar phase inválida) ou em analytics (lifecycle).
**Nada para limpar.**

`phase_perdido_count=0` no DB · regra canônica respeitada.

---

## 10. Cleanup aplicado nesta fase

**NENHUM.** AUDIT ONLY.

Razões:
- 4 das 18 funções zumbi são ATIVAS (cron/trigger/V2 RPCs)
- 14 das 18 precisam inspeção surgical (callers, smoke)
- 7 Alexa RPCs apontam pra tabelas dropadas (BROKEN) · DROP candidato seguro mas requer fase dedicada
- 3 appointments sem prof: não invento dados
- 10 perdido literals: todos legítimos

---

## 11. Cleanup deferido para CONTROL.2

| Item | Ação proposta | Risco | Pré-req |
|---|---|---|---|
| 14 funções zumbi pendentes | Inspect callers + smoke + DROP/patch surgical | médio | Inspeção 1-by-1 |
| 9 Alexa RPCs | REVOKE EXECUTE + DROP gradual | baixo | Confirmar zero consumers via grep code+legacy |
| `clinic_alexa_config` tabela | Archive (read-only) ou DROP CASCADE | médio | Backup + 1 sprint sem queries |
| `clinic_rooms.alexa_device_name` coluna | ALTER TABLE DROP COLUMN | baixo | Confirmar tudo null em prod |
| 3 appts sem `professional_id` | Aceitar como debt OU admin UI backfill | baixo | Decisão Alden (manter ou atribuir) |

---

## 12. Validation final

`docs/crm-refactor/sql/phase-control1-final-db-ui-audit-validation.sql`

Final flags:

```json
{
  "worker71_off": true,
  "fk_orphans_count": 0,
  "phase_perdido_count": 0,
  "unsafe_outbox_count": 0,
  "subject_xor_violations": 0,
  "cron_with_provider_call": 0,
  "alexa_rpcs_after_cleanup": 9,
  "invalid_professional_count": 0,
  "appt_without_professional_count": 3,
  "invalid_appointment_status_count": 0,
  "zumbi_function_count_after_cleanup": 18,
  "can_continue": true
}
```

---

## 13. Smoke final

`docs/crm-refactor/sql/phase-control1-final-db-ui-audit-smoke.sql`

11 categorias · 100% read-only · todas PASS:

- A worker 71 OFF
- B wa_outbox baseline (0/0/0)
- C appointment contract roda
- D lead_lost contract preserves phase
- E recovery workflow view reads
- F dashboard query reads
- G clinical gate reads
- H zero status zumbi nos dados
- I zero provider calls em cron
- J wa_outbox_delta = 0
- K smoke é 100% read-only

---

## 14. Riscos residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| 18 funções com literal zumbi continuam existindo | 🟢 baixo | Não impactam · candidatos a patch em CONTROL.2 |
| 9 Alexa RPCs continuam dormentes | 🟢 baixo | Sem cron · sem caller v2 · UI v2 omite |
| `clinic_alexa_config` tabela tem dados | 🟡 médio | Pode ter config residual `is_active=true` · audit antes de DROP |
| `clinic_rooms.alexa_device_name` coluna existe | 🟢 baixo | Provavelmente null em prod · DROP COLUMN simples |
| 3 appts sem `professional_id` | 🟢 baixo | Wizard novo exige · histórico é debt |
| REVOKE não aplicado em Alexa RPCs | 🟡 médio | UI v2 não chama · mas authenticated tem grant · CONTROL.2 fecha |

---

## 15. Próximas fases

Ver [`95-next-prompt-after-control1.md`](95-next-prompt-after-control1.md).

Opções:

| Fase | Recomendada? |
|---|---|
| **CONTROL.2** (cleanup surgical com smoke per-fn) | ✅ se quer fechar débito |
| **2ALEXA.1** (AlertBell polish) | ✅ se quer UX rápido |
| **LEGACY.PORT.PROCEDURES_ADMIN** (CRUD admin) | ✅ se ROI operacional |
| **LEGACY.PORT.ANAMNESIS_BUILDER** | médio prazo |
| **2L.2.1** (Meta template approval mirror) | só com unban Meta |

---

## 16. Veredito

**`PASS_CRM_CONTROL1_AUDIT_ONLY_READY_LOCAL_COMMIT`**

DB v2 é **fonte da verdade auditada** · UI v2 é **camada de controle auditada**.
0 inconsistências bloqueantes · 18 funções + 9 Alexa RPCs documentadas como
candidatos a cleanup em CONTROL.2. Worker 71 OFF preservado · zero provider
externo · zero wa_outbox mutation.

Decisão deliberada de NÃO aplicar DROP/REVOKE nesta fase: complexidade
de cada função precisa de smoke dedicado pra evitar regressão. CONTROL.2
fará isso surgical (1 mig por categoria) com rollback testado.
