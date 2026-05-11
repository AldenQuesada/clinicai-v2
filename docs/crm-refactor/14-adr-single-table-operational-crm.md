# ADR · Single-table operacional para CRM

**Status:** Accepted
**Data:** 2026-05-10
**Decisor:** Alden Quesada
**Contexto:** Fase 0.6 do refactor CRM CLINIIC AI v2 · resposta à Q1 do doc 11
**Substitui:** ADR-001 (modelo excludente, 2026-04-22)

---

## Decisão

`public.leads` é o eixo operacional permanente da jornada CRM.

A linha em `leads` é a **identidade única** do sujeito ao longo de todo o funil. Nasce como `phase='lead'` e evolui para `'agendado'`, `'paciente'` ou `'orcamento'` **sem nunca sair da tabela**. Outras tabelas (`patients`, `orcamentos`) passam a ser **extensões/dimensões** vinculadas ao mesmo `id`, não substitutos.

`deleted_at` em `leads` deixa de ser instrumento de movimentação de funil e passa a ser **exclusão real** (admin · LGPD · erro de cadastro).

---

## Regras

1. **Lead não é soft-deletado quando vira paciente.**
   - `lead_to_paciente(p_lead_id)` deve apenas: setar `phase='paciente'`, fazer INSERT em `patients` (se ainda não existir com `id=lead.id`), registrar `phase_history`. **Nunca** `UPDATE leads SET deleted_at = now()`.

2. **Lead não é soft-deletado quando vira orçamento.**
   - `lead_to_orcamento(...)` apenas: `phase='orcamento'`, INSERT em `orcamentos` com `lead_id`, audit. Sem soft-delete.

3. **`deleted_at` é exclusão real.**
   - Set quando admin escolhe excluir lead (LGPD, cadastro duplicado, erro). Nunca durante transição de phase ou lifecycle.

4. **`patients` é extensão clínica/dados do paciente.**
   - Continua existindo como tabela própria para dados clínicos (procedimentos realizados, revenue, prontuário). Vincula via `patients.id = leads.id`.

5. **`orcamentos` é extensão comercial/financeira.**
   - Continua como tabela própria. Pode vincular via `lead_id` ou `patient_id` (XOR). Modelo de dados não muda.

6. **`lifecycle_status` governa perdido/recuperação/arquivado.**
   - Ortogonal a phase. Toda alteração de lifecycle preserva a phase atual e registra `lost_from_phase`.

7. **`phase` governa apenas a macrofase comercial:** `lead | agendado | paciente | orcamento`.
   - Não recebe `compareceu`, `reagendado`, `perdido`. Esses não são valores de phase no contrato v2.

8. **`crm_operational_view` é a fonte canônica do frontend.**
   - Toda tela de mesa/contadores/kanban consome a view. UI não infere `mesa_operacional` no client.

---

## Por que (justificativa)

### a) Continuidade de identidade no WhatsApp
A conversa WhatsApp do paciente é a mesma do lead inicial. `wa_conversations.lead_id` aponta para uma `id` que precisa permanecer viva. Soft-deletar o lead na conversão exigia gambiarra (FK ON DELETE SET NULL ou queries que ignoram `deleted_at`), gerando inconsistências sutis.

### b) Trilha contínua em `phase_history`
Auditoria de transições (`lead → agendado → paciente`) precisa de `lead_id` estável. Com soft-delete, a row pai some e a referência fica órfã.

### c) Recuperação preserva origem
Quando paciente arquivado volta a ser ativo, precisamos `lost_from_phase`. Esse campo só faz sentido se a linha em `leads` é a mesma desde a origem.

### d) Paciente pode voltar à agenda
Paciente fideliza, marca nova consulta. Hoje exige `INSERT` em `appointments` apontando para `patient_id`. Se `lead_id` ainda for parte da identidade comercial (campanhas, source attribution, VPI, B2B), perdemos o vínculo se a row do lead foi soft-deletada.

### e) Paciente com orçamento adicional
Paciente em fidelização ganha proposta de novo procedimento. A mesa `paciente_orcamento` (derivada na view) precisa do `leads.phase='paciente'` + EXISTS(orcamento aberto). Modelo excludente fragmenta isso entre tabelas.

### f) Copilot precisa de contexto unificado
Smart Reply lê `lead.phase`, `lead.lifecycle_status`, `lead.lost_from_phase`, orcamento aberto. Uma fonte única simplifica o prompt e reduz risco de inconsistência.

### g) Analytics e KPIs ficam consistentes
Métricas de funil (`COUNT(*) GROUP BY phase`) e SLA (`AVG(time_to_conversion)`) ficam triviais quando há uma única timeline por sujeito.

---

## Impacto

### Mudanças funcionais necessárias (Fase 1D)

- **`lead_to_paciente` RPC:** parar de fazer `UPDATE leads SET deleted_at = now()`. Apenas setar `phase='paciente'`, INSERT em `patients` se necessário, registrar audit.
- **`lead_to_orcamento` RPC:** idem · sem soft-delete.
- **`appointment_finalize`:** quando outcome `paciente`/`orcamento`, manter `leads` ativo.
- **Repositories Lara v2:** `LeadRepository.list()` e correlatos devem deixar de filtrar `is('deleted_at', null)` para movimentação operacional. Filtrar `deleted_at` apenas em queries explicitamente para "ativos não-excluídos" (raras).
- **Views/queries que assumem soft-delete = paciente:** revisar caso a caso. A `crm_operational_view` hoje filtra `WHERE l.deleted_at IS NULL`, o que continua correto sob a nova doutrina (já que `deleted_at` agora só marca exclusão real).

### Mudanças NÃO necessárias

- **Schema `leads`:** colunas atuais cobrem o novo modelo.
- **`patients` table:** continua com `id = leads.id`. Apenas para de receber INSERT cego no `lead_to_paciente` (verifica existência primeiro).
- **`orcamentos` table:** continua igual. `lead_id` permanece válido para todas as conversões.
- **`crm_operational_view`:** já trata `l.deleted_at IS NULL` corretamente sob nova semântica · não precisa rewrite.
- **`appointment.repository`:** sem impacto · agenda é desacoplada.

---

## Compatibilidade com estado atual

### Rows existentes

Audit das duas rows soft-deletadas hoje (probe P6 doc 13):

| phase | lifecycle | total | deleted | comentário |
|---|---|---|---|---|
| `lead` | `arquivado` | 1 | 1 | provavelmente exclusão real ou conversão antiga |
| `paciente` | `arquivado` | 1 | 1 | row de paciente que foi marcado arquivado E teve deleted_at setado (legado · sob nova doutrina, arquivado NÃO seta deleted_at) |

**Decisão:** essas 2 rows NÃO precisam migração imediata. Manter como histórico. Se virarem problema operacional (paciente reaparece), reativar manualmente (`UPDATE leads SET deleted_at=NULL, lifecycle_status='ativo' WHERE id=...`).

### Coexistência com legado clinic-dashboard v1

O painel legado escreve no mesmo banco. `lead-modal.js` legacy pode fazer `.update({ deleted_at })` direto em transições. Sob a nova doutrina, isso vira **exclusão real visível** — não mais cosmético.

**Mitigação:** Fase 7 (cutover legacy). Enquanto isso, monitorar `deleted_at` em `leads` para detectar uses inadequados.

### `public.perdidos`

Permanece como tabela legada. NÃO é dropada agora. RPC `lead_to_perdidos` continua existindo no banco, mas Lara v2 deve preferir `lead_lost` (que apenas seta lifecycle).

### `is_in_recovery boolean`

Redundante com `lifecycle_status='recuperacao'`. NÃO removido nesta fase. Drop em Fase 7 quando todos os callers migrarem para `lifecycle_status`.

---

## Migração

- ❌ **Não fazer backfill de phase** — o banco já está limpo (probe P6 doc 13 confirma zero rows em `compareceu/reagendado/perdido`).
- ✅ **Validar rows com `deleted_at` que representam paciente/orcamento** — 2 rows hoje · revisão manual recomendada antes da Fase 1D.
- ✅ **Refactor de `lead_to_paciente`/`lead_to_orcamento` RPCs** vira primeira mudança funcional (Fase 1D).
- ❌ **Não dropar `public.perdidos`** — reservar para Fase 7.

---

## Riscos

| Risco | Mitigação |
|---|---|
| Caller legado em `clinic-dashboard` v1 escreve `deleted_at` durante transição | Cutover em Fase 7 · monitorar até lá |
| Query existente assume `WHERE deleted_at IS NULL` significa "paciente já migrou" | Revisar todas as queries em `apps/lara/src` antes de aplicar refactor (Fase 1D) |
| Refactor de `lead_to_paciente` quebra fluxo `appointment_finalize → outcome='paciente'` | Test E2E manual antes de deploy |
| 2 rows arquivadas+deleted hoje confundem nova doutrina | Aceitar como histórico · documentar |

---

## Decisões relacionadas

- **Q4 (perdidos table):** PENDENTE · mas tabela permanece por enquanto
- **Q7 (arquivado em paciente?):** RESOLVIDA · DB já permite, mantém
- **Q9 (`is_in_recovery` vs `lifecycle_status='recuperacao'`):** consolidar em Fase 7
- **Q10 (cutover legacy):** estratégica · Fase 7

---

## Próximos passos

1. **Fase 1A** · Migration retroapply versionada (este pacote)
2. **Fase 1C** · Sincronizar TS↔DB (drop 7-phase enum, manter 4) — vide doc 15
3. **Fase 1D** · Refactor RPCs `lead_to_paciente`/`lead_to_orcamento` para não soft-deletar + repos para não fazer `.update({phase})` direto — vide doc 16
4. **Fase 2** · Criar RPCs `lead_archive`/`lead_unarchive` (únicas faltantes do contrato-alvo)
