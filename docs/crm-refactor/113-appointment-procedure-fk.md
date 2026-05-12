# CRM_PHASE_APPOINTMENT_PROCEDURE_FK · Promoção da FK canônica (Trilha A)

> Trilha A · migration `db/migrations/20260800000182_clinicai_v2_appointment_procedure_fk.sql`
> criada localmente · **NÃO APLICADA**. Coluna nullable + FK +
> `ON DELETE SET NULL` + `ON UPDATE CASCADE` + índice parcial + COMMENT.
> Zero backfill. PROPOSED histórico removido (substituído).

---

## 1 · Objetivo

Fechar o contrato canônico entre `appointments` e `clinic_procedimentos`:

- Adicionar `appointments.procedure_id uuid NULL`.
- Adicionar FK `appointments_procedure_id_fkey` → `clinic_procedimentos(id)`.
- Adicionar índice parcial `idx_appointments_procedure_id`.
- Documentar via `COMMENT` que `procedure_name` permanece como snapshot
  até a transição completa.

Migration **não aplicada** nesta fase — preparação apenas.

---

## 2 · Estado atual (snapshot procedure_name)

| Item | Valor |
|---|---|
| Branch · HEAD inicial | `main` · `c5bea5d` |
| `appointments.procedure_id` | **não existe** no banco remoto |
| `appointments.procedure_name` | text · usado como snapshot por WIZARD_PROCEDURES Trilha B1 |
| FK `appointments → clinic_procedimentos` | **0** atual |
| Wizard de agendamento | usa Select de `clinic_procedimentos` · grava `procedure_name` |
| Prontuário detalhado | exibe match via `procedure_name` |

---

## 3 · Análise do PROPOSED

Arquivo histórico: `db/migrations/PROPOSED_appointments_procedure_fk.sql`
(versionado em `989c2141`, fase `LEGACY.PORT.WIZARD_PROCEDURES`).

**Conteúdo era seguro:**

- `ADD COLUMN IF NOT EXISTS procedure_id uuid` (nullable)
- `ADD CONSTRAINT appointments_procedure_id_fkey ... ON DELETE SET NULL`
- `CREATE INDEX IF NOT EXISTS idx_appointments_procedure_id ... WHERE procedure_id IS NOT NULL` (parcial)
- `COMMENT ON COLUMN`
- Bloco de backfill **comentado** (não executa)

**Ajustes feitos ao promover para 182:**

1. Versionamento canônico (`db/migrations/20260800000182_*` · timestamp na sequência de mig 181 que fechou Alexa).
2. Adicionado `ON UPDATE CASCADE` (alinhamento canônico · UUIDs raramente mudam, mas mantém contrato simétrico).
3. Envelopado o `ADD CONSTRAINT` em `DO $$ ... IF NOT EXISTS ...` (defense-in-depth para re-runs).
4. Comentário do COMMENT atualizado.
5. Header documenta substituição do PROPOSED.

**Decisão sobre o PROPOSED:** removido do repo (commit desta fase). Conteúdo
permanece em histórico Git. Doc 108 (WIZARD_PROCEDURES) já documentava a
existência da proposta. A migration 182 é a forma canônica final.

---

## 4 · Diagnóstico schema (read-only)

```json
{
  "appointments_schema": {
    "procedure_id_exists": false,
    "procedure_name_exists": true,
    "recurrence_procedure_exists": true,
    "fk_to_clinic_procedimentos_count": 0,
    "idx_procedure_id_exists": false
  },
  "clinic_procedimentos": {
    "total": 44,
    "active": 44,
    "rls_enabled": true,
    "duplicate_normalized_names": 0
  },
  "tracker_181_present": true,
  "tracker_182_present_already": false
}
```

---

## 5 · Match report (procedure_name × clinic_procedimentos.nome)

| Métrica | Valor |
|---|---|
| `appointments_total_active` | 3 |
| `appointments_with_procedure_name` | 2 |
| `exact_match_count` (case-insensitive trim) | **0** |
| `no_match_count` | 2 (`Avaliação Full Face`, `Consulta teste`) |
| `multi_match_count` | 0 (sem ambiguidade) |
| `duplicate_normalized_names` em `clinic_procedimentos` | **0** |

Os 3 appointments existentes são seed/teste pré-WIZARD_PROCEDURES e todos
`finalizado`. Backfill por nome não tem valor real — confirmado nas fases
CONTROL.3/3B.

---

## 6 · Decisão de modelagem

**Trilha A · FK nullable sem backfill.**

| Aspecto | Decisão |
|---|---|
| Tipo da coluna | `uuid NULL` |
| Default | nenhum (NULL) |
| FK | `appointments_procedure_id_fkey` → `clinic_procedimentos(id)` |
| `ON UPDATE` | `CASCADE` |
| `ON DELETE` | `SET NULL` (preserva appointment se procedimento for deletado) |
| Índice | parcial `WHERE procedure_id IS NOT NULL` |
| NOT NULL | **não** · transição gradual respeita appointments legados |
| Backfill nesta fase | **não** · match rate = 0% nesta clínica |
| Trigger | **não** · sem complicação · gravação canônica fica em código |
| RLS / policies | inalteradas |

---

## 7 · Por que FK nullable

1. **Legacy seguro**: 3 appointments antigos seguem sem vínculo · NULL é
   contrato honesto · NOT NULL agora quebraria pacientes históricos.
2. **Transição gradual**: UI nova grava `procedure_id` quando wiring liberar
   · UI antiga continua salvando só `procedure_name` · ambas convivem.
3. **`ON DELETE SET NULL`**: permite remover procedimento do catálogo sem
   destruir histórico de agenda · UI cai em `procedure_name` snapshot.
4. **Índice parcial**: economiza espaço · só indexa os linked.

---

## 8 · Por que sem backfill agora

- **Match rate = 0%** na clínica atual.
- Backfill exigiria heurística aproximada (Levenshtein, sinônimos) que
  produz falsos positivos.
- Wizard novo grava o vínculo canônico automaticamente · histórico futuro
  fica naturalmente correto.
- Eventual backfill manual pode ser feito por agente humano clicando em
  "vincular procedimento" no prontuário · zero risco.

---

## 9 · Migration 182 (criada local)

`db/migrations/20260800000182_clinicai_v2_appointment_procedure_fk.sql`

Resumo dos 4 statements (sem CASCADE destrutivo · idempotentes):

1. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS procedure_id uuid;`
2. `ADD CONSTRAINT appointments_procedure_id_fkey ... ON UPDATE CASCADE ON DELETE SET NULL` (em DO block defensivo).
3. `CREATE INDEX IF NOT EXISTS idx_appointments_procedure_id ... WHERE procedure_id IS NOT NULL;`
4. `COMMENT ON COLUMN appointments.procedure_id IS ...`

Rollback documentado em
[`rollback-notes/20260800000182_clinicai_v2_appointment_procedure_fk.md`](../database/rollback-notes/20260800000182_clinicai_v2_appointment_procedure_fk.md).

---

## 10 · Código TypeScript

**Não alterado nesta fase.** Razões:

- A coluna `procedure_id` ainda **não existe** no banco remoto.
- TypeScript hoje não tenta `SELECT procedure_id` (typegen atualizaria após apply · `pnpm db:types`).
- O wizard continua salvando `procedure_name` snapshot canonicamente.
- Alterar repositórios agora para "preparar" o campo cria risco de quebrar
  runtime se algum cast ou query implícita falhar.

Code wiring fica para fase pós-apply: **`CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE`**.

---

## 11 · Plano de apply (futuro)

1. **`CRM_PHASE_APPOINTMENT_PROCEDURE_FK_PUSH`** · publica migration + docs no origin/main.
2. **`CRM_PHASE_APPOINTMENT_PROCEDURE_FK_APPLY`** · roda `apply-migration.mjs` no arquivo único + registra tracker 182 + revalida.
3. **`CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE`** · regenera typegen, ajusta `AppointmentRepository` para aceitar/persistir `procedureId`, wiza no wizard novo. Snapshot `procedure_name` continua sendo gravado para compat.
4. (Opcional, fase dedicada) **Backfill manual** com curadoria, se a clínica ganhar volume.

---

## 12 · Plano de backfill futuro

Se necessário no futuro:

```sql
-- ATENÇÃO: rodar apenas com curadoria humana ou em snapshot/staging.
-- Match exato case-insensitive trim · zero falso positivo conhecido.
UPDATE public.appointments a
SET procedure_id = p.id
FROM public.clinic_procedimentos p
WHERE a.procedure_id IS NULL
  AND a.deleted_at IS NULL
  AND a.procedure_name IS NOT NULL
  AND a.procedure_name != ''
  AND p.clinic_id = a.clinic_id
  AND p.ativo = true
  AND lower(trim(p.nome)) = lower(trim(a.procedure_name));
```

Validação prévia: rodar uma query `SELECT count(*) FROM ...` equivalente e
conferir o número. Hoje seria **0** linhas afetadas (match rate=0%).

---

## 13 · Impacto

| Área | Impacto |
|---|---|
| **Wizard de agendamento** | Pós-apply: form passa a gravar `procedure_id` quando user selecionar do catálogo. Snapshot `procedure_name` continua sendo populated. UI inalterada visualmente. |
| **Prontuário detalhado** | Aba "Procedimentos" hoje agrupa por `procedure_name` · pós-apply pode passar a fazer JOIN canônico se `procedure_id` existir, com fallback para nome. |
| **Dashboards CRM** | Hoje agregam por nome · pós-apply podem agrupar por `procedure_id` (mais robusto a renames). Sem mudança forçada. |
| **Orçamentos** | Não impactado nesta fase · `orcamentos.items` é jsonb separado. |
| **Copilot/IA** | `ProcedureRepository` é price-blind · sem impacto. |

---

## 14 · Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Renomear procedimento (`clinic_procedimentos.nome`) + appointment legado | baixíssimo | `ON UPDATE CASCADE` mantém FK válida se id mudar (raro); rename de nome não afeta FK (que vincula por id) |
| Deletar procedimento que tem appointments | baixo | `ON DELETE SET NULL` preserva appointment |
| Schema drift se outro processo adicionar `procedure_id` antes do apply | improvável | `ADD COLUMN IF NOT EXISTS` + DO block na FK absorvem |
| Tipos TS desatualizados pós-apply até `pnpm db:types` rodar | trivial | apenas autocompletar IDE · runtime não quebra (campo ainda não é lido por código TS antes do WIRE) |

---

## 15 · Validações executadas

| Validation | Resultado |
|---|---|
| `git diff --check` | sem warnings (apenas CRLF auto) |
| SQL validation pre-apply `phase-appointment-procedure-fk-validation.sql` | final_flags green |

Validation flags chave (pre-apply):

- `worker71_off`: true
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `cron_with_provider_call`: 0
- `hard_gate_untouched`: true
- `appointments_procedure_id_exists_remote`: **false** (esperado · não aplicado)
- `clinic_procedimentos_active_count`: 44
- `clinic_procedimentos_duplicate_normalized_names`: 0
- `appointments_total`: 3
- `appointments_with_procedure_name`: 2
- `appointment_procedure_exact_match_count`: 0
- `appointment_procedure_no_match_count`: 2
- `appointment_procedure_multi_match_count`: 0
- `appointments_without_professional_count`: 3 (continuam LEGACY_ACCEPTED)
- `migration_182_created_not_applied`: **true**
- `proposed_file_still_not_applied`: **true**
- **`can_continue`: true**

**Typecheck não executado:** zero código TypeScript foi alterado nesta fase
(apenas migration + rollback + validation + docs · remoção de PROPOSED).

---

## 16 · Próximos passos

1. **`CRM_PHASE_APPOINTMENT_PROCEDURE_FK_PUSH`** · publicar mig 182 + docs em origin/main.
2. **`CRM_PHASE_APPOINTMENT_PROCEDURE_FK_APPLY`** · aplicar a migration remotamente + registrar tracker.
3. **`CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE`** · code wiring (repositories + wizard).
4. (Opcional) **`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT`** se for prioridade antes do wiring.

---

## 17 · Veredito

**PASS_CRM_APPOINTMENT_PROCEDURE_FK_READY_LOCAL_COMMIT**

- Trilha A · migration nullable sem backfill
- PROPOSED histórico substituído pela 182 canônica
- Rollback note + validation SQL + doc completos
- Zero apply · zero db push · zero schema remoto tocado
- Hard gate intacto · job 71 OFF · zero wa_outbox · zero provider
- Aguardando autorização para `git push origin main`
