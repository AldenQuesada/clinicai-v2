# CRM_PHASE_APPOINTMENT_PROCEDURE_FK_SMOKE_BROWSER · Smoke manual (PARTIAL)

> Ambiente: CLI sem browser/Playwright disponível. Esta fase confirma que o
> app + DB estão alinhados para o smoke manual e deixa um checklist + SQL
> de validação prontos para o operador rodar localmente. Zero write real
> · zero risco de criar dado em produção sem cleanup oficial.

---

## 1 · Objetivo

Validar pelo fluxo real do wizard `/crm/agenda/novo` que:

1. Select de procedimento carrega catálogo (44 ativos).
2. Selecionar procedimento oficial popula tela com nome, duração e valor.
3. Submit persiste `appointments.procedure_id` (FK canônica) + `procedure_name` (snapshot textual).
4. Modo "Outro / manual" persiste `procedure_id=NULL` + `procedure_name=<texto>`.
5. Zero `wa_outbox` row criada · zero provider call · zero job 71 ativação.

Como não há automação de UI disponível neste turno, a fase entrega:

- preflight DB ✓
- validation SQL pré + pós-submit ✓
- checklist UI passo-a-passo ✓
- query "inspect appointment_id" pronta pra colar ✓

---

## 2 · Ambiente

| Item | Valor |
|---|---|
| Branch · HEAD | `main` · `707cc8b` |
| Modo escolhido | **PARTIAL · preflight_only** (sem submit) |
| Razão | Sem browser/Playwright nesta sessão · contrato "NÃO criar appointment real se não houver fixture segura" respeitado |
| Cleanup oficial seguro? | depende de fixture + ambiente (não disponível agora) |
| Hard gate clínico | intocado |
| `medical_record_attachments` | placeholder · 0 policies (intocado) |
| Alexa drops (mig 181) | persistem |

---

## 3 · Preflight DB (executado)

Validation: `docs/crm-refactor/sql/phase-appointment-procedure-fk-smoke-browser-validation.sql`

Flags PRE-SUBMIT:

- `worker71_off`: **true**
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `cron_with_provider_call`: 0
- `hard_gate_untouched`: **true**
- `procedure_id_exists_remote`: true
- `fk_present`: true (`appointments_procedure_id_fkey`)
- `index_present`: true (`idx_appointments_procedure_id`)
- `procedure_name_present`: true
- `recurrence_procedure_present`: true
- `tracker_182`: `20260800000182`
- `appointments_total`: 3 · `with_procedure_id`: 0 · `with_procedure_name`: 2 · `invalid_fk`: 0
- `clinic_procedimentos_active`: 44 · `dup_names`: 0
- `baseline_outbox`: 123
- Alexa dropados continuam dropados (3/3)
- **`can_continue`: true**

---

## 4 · Checklist UI manual

Quando você puder rodar com browser real, siga este checklist. Não há fixture
oficial de teste cadastrada · use paciente/lead de teste claramente identificado
no nome (ex.: prefixo "TEST_" ou nome do operador).

### 4.1 Preparação
- [ ] `pnpm dev` (ou comando real do projeto)
- [ ] Login com usuário admin/owner/receptionist
- [ ] Confirmar que `/configuracoes/procedimentos` lista os 44 ativos

### 4.2 Caso A · Novo agendamento com procedimento canônico
- [ ] Abrir `/crm/agenda/novo`
- [ ] Step 1: selecionar paciente OU lead **de teste** (não usar paciente real sensível)
- [ ] Step 2: data futura · horário livre · profissional ativo
- [ ] Step 3: campo **Procedimento** deve ser `<Select>` agrupado por categoria
  - [ ] Confirma que aparecem opções com formato `Nome · Xmin · Preço`
  - [ ] Selecionar um procedimento real (ex.: "Aplicação de Tirzepatida")
  - [ ] Confirmar que `endTime` auto-ajusta (duração do catálogo)
  - [ ] Confirmar que `value` auto-preenche se `preco > 0`
- [ ] Step 4: revisão · campo "Procedimento" exibe `<nome> · catálogo oficial`
- [ ] Clicar **"Criar agendamento"**
- [ ] Toast: "Agendamento criado!"
- [ ] Redirect: `/crm/agenda/<id>`

### 4.3 Caso B · Novo agendamento manual ("Outro")
- [ ] Repetir até Step 3
- [ ] No Select, escolher **"Outro · procedimento manual (legado)"**
- [ ] Campo `<Input>` aparece · digitar texto livre
- [ ] Step 4 revisão: "Procedimento" exibe `<texto> · texto livre`
- [ ] Salvar

### 4.4 Edição
- [ ] Abrir `/crm/agenda/<id>/editar` do Caso A
- [ ] Confirmar Select pré-selecionado pelo procedimento original
- [ ] Voltar (sem alterar) · não deve persistir nada

### 4.5 Prontuário
- [ ] Se o paciente do Caso A é existente, abrir `/crm/pacientes/<patient_id>?tab=procedimentos`
- [ ] Confirmar que appointment do Caso A aparece com badge **"FK canônica"** (emerald)
- [ ] Caso B (se mesmo paciente) aparece com badge **"snapshot legado"** (zinc)

---

## 5 · Validação pós-submit (SQL)

Cole o `appointment_id` retornado e rode:

```sql
SELECT
  a.id,
  a.procedure_id,
  a.procedure_name,
  a.status,
  a.scheduled_date,
  a.start_time,
  a.end_time,
  p.nome AS catalog_nome,
  p.categoria AS catalog_categoria,
  (a.procedure_id IS NOT NULL)                                  AS has_procedure_id,
  (a.procedure_id IS NOT NULL AND p.id IS NOT NULL)             AS fk_valid,
  (a.procedure_name IS NOT NULL AND a.procedure_name != '')     AS snapshot_present
FROM public.appointments a
LEFT JOIN public.clinic_procedimentos p ON p.id = a.procedure_id
WHERE a.id = '<APPOINTMENT_ID>'::uuid;
```

**Esperado para Caso A (canônico):**

| Coluna | Valor esperado |
|---|---|
| `has_procedure_id` | `true` |
| `fk_valid` | `true` |
| `snapshot_present` | `true` |
| `catalog_nome` | nome do procedimento do catálogo |
| `procedure_name` | snapshot textual do mesmo nome |

**Esperado para Caso B (manual):**

| Coluna | Valor esperado |
|---|---|
| `has_procedure_id` | `false` |
| `fk_valid` | `false` |
| `snapshot_present` | `true` |
| `catalog_nome` | NULL |
| `procedure_name` | texto manual digitado |

### Safety pós-submit

Re-rodar a section 00 da validation SQL e confirmar:

- `wa_outbox` count == 123 (baseline · `wa_outbox_delta=0`)
- `worker71_off=true`
- `cron_with_provider_call=0`
- `hard_gate_untouched=true`
- `appointments_with_procedure_id_invalid_fk_count=0`

---

## 6 · Cleanup (se quiser remover o fixture)

UI canônica:

1. Abrir `/crm/agenda/<id>` do appointment fixture
2. **Cancelar** com motivo "smoke test fk_wire" — chama `cancelAppointmentAction` (soft mark + motivo)
3. Ou em última instância, via SQL (apenas com autorização explícita):
   ```sql
   UPDATE public.appointments
   SET deleted_at = now()
   WHERE id = '<APPOINTMENT_ID>'::uuid
     AND procedure_name LIKE '%test%';  -- defensivo
   ```

**Não fazer `DELETE` físico** · soft-delete preserva audit trail.

---

## 7 · Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Operador criar appointment com paciente real e esquecer cleanup | médio | usar prefixo "TEST_" no nome · soft-delete oficial via UI |
| Algum trigger downstream disparar wa_outbox ao criar appointment | trivial | grep prévio mostra zero trigger envia provider · validation `wa_outbox_delta=0` falha se acontecer |
| Procedimento errado selecionado · não invalida o smoke | trivial | flag `fk_valid` da validation cobre |
| Smoke real cria 1 row em appointments com `procedure_id` populated | baixo | é o objetivo; cleanup via UI oficial |

---

## 8 · Próximos passos

Se o operador rodar o smoke manual e os flags pós-submit baterem:

- **PASS_CRM_APPOINTMENT_PROCEDURE_FK_SMOKE_BROWSER_READY**: contrato dual validado em runtime real.

Próxima fase principal recomendada:

- **`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT`** · destravar `medical_record_attachments` com bucket privado + RLS + signed URL + role gate.

Alternativas:

- Smoke browser repetido em outras clínicas (multi-tenant)
- `2L.2.1 / 2L.3` · Meta/WhatsApp quando dependências externas liberarem

---

## 9 · Veredito

**PARTIAL_CRM_APPOINTMENT_PROCEDURE_FK_BROWSER_PREFLIGHT_ONLY**

- Sistema confirmado alinhado para smoke manual
- Validation SQL preparada (pre + post-submit)
- Checklist UI passo-a-passo entregue
- Zero write real · zero risco · zero efeito colateral
- Aguardando operador rodar smoke em ambiente com browser
