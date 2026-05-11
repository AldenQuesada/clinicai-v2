# 11 · Open Questions

> Perguntas humanas que precisam de resposta do Alden antes de Fase 1 começar.
>
> Cada pergunta tem contexto, opções e recomendação (quando aplicável).

---

## Q1 · Modelo excludente: manter ou virar single-table?

**Contexto:** ADR-001 (Abril 2026) estabeleceu modelo excludente · lead vira paciente via `UPDATE leads SET deleted_at=now()` + INSERT em `patients`. Contrato alvo (prompt) proíbe `deleted_at` como mecanismo de movimentação. Conflito direto.

**Opções:**

- **A) Single-table.** Paciente fica em `leads` com `phase='paciente'`. `public.patients` continua existindo apenas para dados clínicos específicos (procedimentos realizados, revenue) e referência via `leads.id`. UI sempre lê de `crm_operational_view` que junta tudo.
- **B) Manter modelo excludente.** Ajustar o contrato para aceitar `deleted_at` apenas no caso específico de transição lead→paciente/orcamento. Documentar exceção.
- **C) Híbrido.** Manter modelo excludente para dados clínicos (patients/orcamentos têm dados próprios) mas duplicar status operacional em `leads` (phase + lifecycle ficam sempre em `leads`, mesmo que paciente seja a tabela operacional).

**Recomendação:** **A** parece mais alinhado com "operação simples · uma tabela canônica · view derivada · backend único". Custos:
- Backfill: para cada `patient` atual (sem lead correspondente), criar row em `leads` com `phase='paciente'` + `id` = `patient.id`.
- UPDATE `lead_to_paciente` RPC para NÃO soft-deletar leads · apenas setar `phase='paciente'`.
- Manter `public.patients` para dados clínicos (não dropar) · linha equivalente em leads (XOR vira link 1:1).
- UI deixa de "trocar de tabela" · operação fica em uma só.

**Aguardando decisão.**

---

## Q2 · Backfill de leads com `phase` em {`compareceu`, `reagendado`, `perdido`}

**Contexto:** Contrato alvo elimina `compareceu` e `reagendado` como phase de lead. `perdido` vira lifecycle. Hoje existem leads nesses estados · backfill obrigatório.

**Heurística proposta:**
- `phase='compareceu'`: olhar último `appointment` deste lead.
  - `appointment.status` ∈ {`finalizado`} + houve `lead_to_paciente`? → `phase='paciente'`, `lifecycle='ativo'`.
  - `appointment.status='finalizado'` + houve `lead_to_orcamento`? → `phase='orcamento'`.
  - `appointment.status` ∈ {`em_atendimento`, `na_clinica`, `aguardando`} → `phase='agendado'`, `lifecycle='ativo'`. (Volta para agendado · finalização será humana.)
  - sem appt vivo → `phase='lead'` + `lifecycle='ativo'`.
- `phase='reagendado'`: backfill para `phase='agendado'`. `appointment.status` permanece como está.
- `phase='perdido'`: `phase` ← `lost_from_phase` (se existir), senão `'lead'`. `lifecycle_status='perdido'`. `lost_reason`/`lost_at` preservados.

**Risco:** se a heurística estiver errada para algum caso, leads ficam mesa errada.

**Pergunta:** aceita esta heurística ou prefere caso-a-caso (revisão humana das exceções)?

**Aguardando decisão.**

---

## Q3 · `paciente_orcamento`: tag em `leads.tags` ou só derivado em view?

**Contexto:** Quando paciente cria orçamento adicional, hoje há 2 abordagens possíveis:
- (a) Setar tag `orcamento_aberto` em `leads.tags`.
- (b) Derivar dinamicamente em `crm_operational_view` baseado em EXISTS(orçamento aberto para este patient).

**Recomendação:** **(b) Derivado.** Tags são propensas a divergir do estado real. View garante consistência.

**Aguardando confirmação.**

---

## Q4 · `public.perdidos` tabela: dropar ou manter como audit?

**Contexto:** Tabela `perdidos` criada em mig 754 (Abril) era fonte principal de perdidos. Após criação de `lost_*` colunas em `leads`, ela ficou redundante.

**Opções:**
- **A) Manter como espelho.** Trigger duplica writes para audit · útil em queries históricas isoladas.
- **B) Drop completo.** `phase_history` já cobre audit; `crm_events_log` cobrirá eventos de perda; `leads.lost_*` cobre estado atual.

**Recomendação:** **B**. Redundância desnecessária. `phase_history` é audit canônica.

**Aguardando confirmação.**

---

## Q5 · `appointment.status='remarcado'`: novo appointment ou status?

**Contexto:** Quando paciente remarca, hoje o comportamento exato é ambíguo. Pode ser:
- (a) Mesmo appointment muda data + status temporário `remarcado`.
- (b) Cria novo appointment (data nova) + cancela velho (status `cancelado` com motivo `remarcado`).
- (c) Cria novo + status velho fica `remarcado`.

**Recomendação:** **(c)** mais audit-friendly. Histórico fica visível em `appointments` listado por subject.

**Aguardando definição.**

---

## Q6 · `crm_operational_view`: regular ou materialized?

**Contexto:** View canônica vai agregar leads + appointments + orcamentos + conversation + audit. Pode ser cara em SELECT live.

**Opções:**
- **A) VIEW regular.** Sempre fresca. Latência por consulta proporcional a complexidade. Provavelmente OK até 100k leads.
- **B) MATERIALIZED VIEW.** Refresh manual ou via cron (a cada 30s? 1min?). Latência de SELECT zero. Stale ate refresh.
- **C) Híbrido.** View regular + caching no Next.js (revalidate=30s).

**Recomendação:** começar com **A**. Se latência subir, ir para **B** com refresh por triggers `AFTER INSERT/UPDATE/DELETE` em leads/appointments/orcamentos.

**Aguardando decisão.**

---

## Q7 · `arquivado` é compatível com `phase='paciente'`?

**Contexto:** Paciente ativo pode ser arquivado? Cenários:
- Paciente teve 1 consulta há 3 anos · nunca mais voltou · arquivar?
- Paciente faleceu · arquivar ou status separado `deceased`?

**Opções:**
- **A) Arquivar é genérico.** Qualquer phase pode virar `lifecycle='arquivado'` por decisão humana (sem motivo de perda).
- **B) Apenas leads/agendados podem ser arquivados.** Paciente tem status próprio (`status='inactive'` em `patients`).
- **C) Lifecycle `arquivado` excluí paciente ativo.** Paciente vira `inactive` em patients.

**Recomendação:** **A** + permitir status próprio em `patients` quando aplicável (deceased). Lifecycle arquivado em leads é simétrico para qualquer phase.

**Aguardando decisão.**

---

## Q8 · RBAC: quem pode `lead_archive`, `lead_lost`, `lead_recovery_activate`?

**Contexto:** Hoje qualquer atendente com role apropriado pode `lead_lost`. Para lifecycle novo, definir permissões.

**Sugestão (alvo · ajustar se necessário):**

| RPC | Roles permitidos |
|---|---|
| `lead_lost` | `secretaria`, `sdr`, `owner`, `admin` |
| `lead_recovery_activate` | `sdr`, `owner`, `admin` (não secretaria comum) |
| `lead_archive` | `owner`, `admin` apenas (decisão grave) |
| `lead_unarchive` | `owner`, `admin` |
| `sdr_change_phase` | `sdr`, `owner`, `admin` |
| `leads_bulk_change_phase` | `owner`, `admin` |
| `appointment_change_status` | qualquer com role assinatura |
| `appointment_cancel` | qualquer com role · audit por actor |
| `appointment_finalize` | `secretaria`, `professional`, `owner`, `admin` |

**Aguardando aprovação.**

---

## Q9 · Bonus · `temperature` e `priority`: refactor de tags vs coluna?

**Contexto:** Hoje há mix. Colunas `leads.temperature` e `leads.priority` existem (v2). Mas legacy JS (sdr.service.js) ainda usa `tags` array para temperatura/prioridade.

**Recomendação:** Unificar em colunas. Drop suporte a tags. Migration backfill: para cada lead com tag `hot/warm/cold/urgent/high`, setar coluna respectiva, remover tag.

**Aguardando decisão.**

---

## Q10 · Bonus · Painel legacy: cutover hard ou redirect gradual?

**Contexto:** `painel.miriandpaula.com.br` continua ativo. Lara v2 está em `app.miriandpaula.com.br` (?). Decommission do legado é Fase 7.

**Opções:**
- **A) Hard cutover.** Em data Y, painel legado retorna 410 Gone. Time tem que estar 100% no v2.
- **B) Redirect gradual.** Painel legado serve "MOVED" para cada rota progressivamente.
- **C) Read-only do legado.** Painel legado vira read-only · não escreve no DB · serve só para consulta histórica.

**Recomendação:** **C** primeiro (mata risco de double-write), depois **A** quando time confortável.

**Aguardando decisão.**

---

## Q11 · Bonus · Mig 103 bug `lifecycle_status`

**Pergunta urgente:** o CHECK `chk_leads_lost_consistency` da mig 103 referencia `lifecycle_status` (que não existe). Como isso passou para produção sem quebrar?

**Hipótese:** mig 103 foi aplicada mas o CHECK só é validado quando se INSERT/UPDATE colunas do CHECK · ou quando se faz `ALTER TABLE ... VALIDATE CONSTRAINT`. Pode ser que UPDATEs comuns em `name`/`phone`/`temperature` não toquem esse CHECK em runtime.

**Ação:** rodar probe SQL urgente:
```sql
UPDATE public.leads SET updated_at = now() WHERE id = (SELECT id FROM leads LIMIT 1);
```
Se erro 42703 (`column lifecycle_status does not exist`), bug é ativo. Senão, é dormente.

**Plano:** ou (a) criar a coluna `lifecycle_status` em Fase 1 (resolve naturalmente), ou (b) substituir nome de coluna no CHECK por `phase` em mig de hotfix antes de Fase 1.

**Aguardando ação.**

---

## Resumo das decisões pendentes (com gravidade)

| # | Pergunta | Bloqueia | Recomendação |
|---|---|---|---|
| Q1 | Modelo excludente | Fase 1 | A · single-table |
| Q2 | Backfill heurística | Fase 1 | Aceitar heurística proposta |
| Q3 | `paciente_orcamento` | Fase 3 | b · derivado em view |
| Q4 | `perdidos` tabela | Fase 7 | B · drop |
| Q5 | `remarcado` semântica | Fase 1-2 | c · novo appt + status legado fica |
| Q6 | View regular/materialized | Fase 3 | A · regular primeiro |
| Q7 | Arquivado em paciente? | Fase 2 | A · genérico |
| Q8 | RBAC | Fase 2 | Sugestão tabela acima |
| Q9 | Tags vs colunas | Fase 7 | Migrar para colunas |
| Q10 | Cutover legacy | Fase 7 | C primeiro, A depois |
| Q11 | Mig 103 bug | URGENTE · pré-fase 1 | Probe SQL → mig de fix |

**Total: 11 decisões. 1 é urgente (Q11). 6 bloqueiam Fase 1-2. 4 podem esperar Fases 3-7.**
