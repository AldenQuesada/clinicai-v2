# Camada 12 · Cutover playbook

> Última atualização: 2026-04-30 · status: 12a entregue (divergence + playbook), 12b/c/d pendentes

## Contexto

A migração de schema **já aconteceu em 2026-04-28**. Tabelas `leads/patients/appointments/orcamentos/phase_history` saíram de `clinic-dashboard` (vanilla JS legacy) pro `clinicai-v2` (Next.js 16 monorepo) com schema canônico em `public.X`. Schema antigo preservado em `legacy_2026_04_28.X` por **30 dias** como rede de segurança.

**Janela de soak:** 2026-04-28 → 2026-05-28 (drop legacy seguro a partir desta data).

**O que falta:** validar que dados batem, decidir destino do módulo de anamnese (único ainda vivo no legacy), monitorar 30 dias, decommissionar.

## Sub-camadas

| | Tarefa | Status |
|---|---|---|
| **12a** | Divergence check + cutover playbook (este doc) | ✅ entregue |
| **12b** | Decisão sobre módulo de anamnese (port pra v2 ou manter sub-app) | ⏳ pendente decisão |
| **12c** | Cron daily de divergence + alerta se divergir > 5% | ⏳ pendente (durante soak) |
| **12d** | Decommission `legacy_2026_04_28` schema + arquivar `clinic-dashboard` repo | ⏳ a partir 2026-05-28 |

## 12a · Divergence check (manual ou cron)

```bash
SUPABASE_ACCESS_TOKEN=sbp_... pnpm db:divergence

# JSON pra cron logging:
SUPABASE_ACCESS_TOKEN=sbp_... pnpm db:divergence --json

# Sem fail mesmo com divergencia (warn-only):
SUPABASE_ACCESS_TOKEN=sbp_... pnpm db:divergence --warn-only
```

Output esperado:

```
Tabela       | legacy total | legacy active | v2 total | v2 active | status
-------------|--------------|---------------|----------|-----------|--------
leads        |          234 |           187 |      189 |       187 | ✅ ok
patients     |          156 |           149 |      149 |       149 | ✅ ok
appointments |         1247 |          1189 |     1190 |      1189 | ✅ ok
orcamentos   |          312 |           267 |      270 |       267 | ✅ ok

Resumo: 4 ok · 0 divergent · 0 missing
```

Heurística: v2 active ≥ legacy active = OK (novos dados em v2 são esperados). v2 active < legacy active = **alerta** (perda potencial de dados).

**Rode HOJE primeiro check baseline.** Se houver divergência, investigar antes de seguir.

## Soak window · 28 dias restantes (até 2026-05-28)

Daily checklist · ~5 min/dia:

1. Abrir `/admin/health` em `lara.miriandpaula.com.br`:
   - Counts gerais batem com a expectativa?
   - Cron orçamento followup rodou (last run < 26h)?
   - Stuck locks = 0?
   - Nenhum status anormal na distribuição de appointments (no_show > 30% por exemplo)?
2. Rodar `pnpm db:divergence`:
   - 0 divergências críticas?
   - Tendência: v2 active crescendo ou estável vs legacy estável?
3. Sentry dashboard (após `SENTRY_DSN` setado):
   - Erros novos nas últimas 24h?
   - Volume normal?

Anote em `docs/audits/soak-log-2026-04.md` (criar quando começar) qualquer anomalia.

## Cutover operacional · você (Mirian) muda de tela

Quando confiante (~7-14 dias de soak verde):

1. **Para de usar `clinic-dashboard` pra**:
   - Ver pacientes → `lara.miriandpaula.com.br/crm/pacientes`
   - Ver agenda → `/crm/agenda`
   - Criar orçamentos → `/crm/orcamentos/novo?leadId=...`
   - Ver leads → `/crm/leads` (nova tela em `(authed)/leads/`)
2. **Continua usando `clinic-dashboard` pra**:
   - Anamneses (módulo único ainda vivo no legacy · até 12b decidir destino)
3. **Avise** se algo não funcionar — eu corrijo antes de dropar legacy

## 12b · Decisão tomada · dados legacy descartados (2026-04-30)

`divergence_report()` (mig 85) revelou 323 leads + 1 paciente real em `legacy_2026_04_28.X` que clean-slate migration não copiou pra `public.X`.

**Decisão Alden 2026-04-30:** dados legacy não serão migrados. Alden tem planilha atualizada e vai subir via CSV import quando quiser começar a usar o CRM v2 com dados reais. PR #30 (mig 90 que migrava 323 leads + Adilso) fechada sem aplicar.

**Implicações:**
- 12d (drop schema legacy) pode prosseguir em 28/05 sem perda real
- v2 continua começando "vazio" até Alden subir planilha
- Cron orcamento followup atual passa a ser no-op até ter dados (zero candidatos)
- `/admin/health` continua mostrando warnings de divergência durante soak window (esperado · ignorar)

## 12b' · Decisão sobre módulo anamnese (ainda pendente)

Único módulo ainda vivo no legacy. 3 opções:

**A. Migrar pra v2** · ~2-3 dias · port das tabelas (`anamnesis_templates`, `anamnesis_template_sessions`, `anamnesis_responses`) + UI nova em `apps/lara/src/app/crm/anamnese/`. Decom legacy completo no fim da soak.

**B. Manter como sub-app permanente** · ~1 dia · iframe ou link pra `clinic-dashboard.miriandpaula.com.br/anamnese/`. Apenas anamnese fica vivo no legacy. Decom parcial: drop tabelas CRM legacy mas mantém anamnese tables.

**C. Substituir por SaaS externo** · indeterminado · se houver opção comercial melhor que vale o custo.

Eu **recomendo B** se você usa anamnese < 3x/semana (não justifica migração). **A** se for diário e você quer tudo integrado.

## CSV Import (futuro · após decisão de subir planilha)

Quando você quiser subir a planilha de pacientes/leads, opções:

**Opção 1 · Supabase Dashboard nativo (mais simples)**
1. Dashboard → Table Editor → Selecionar tabela (`leads` ou `patients`)
2. Botão "Insert" → "Import data from CSV"
3. Mapear colunas
4. Importar
- ✅ Zero código
- ❌ Manual · não dá pra automatizar fluxo recorrente

**Opção 2 · Endpoint /admin/import (futuro)**
- UI em Lara · upload CSV → preview → confirm → INSERT em batches
- Validação Zod por linha · linhas inválidas viram CSV de erros pra você corrigir
- Tag `metadata.imported_from_csv = '<timestamp>'` pra rollback
- Estimativa: ~3-4h
- Faz sentido se você for importar várias planilhas (ex: histórico mensal de novo)

Quando quiser construir Opção 2, me avise.

## 12c · Cron daily de divergence

Quando 12b for decidido, criar:
- `.github/workflows/lara-crons.yml` ganha schedule `'30 9 * * *'` (06h30 SP daily)
- Endpoint `/api/cron/divergence-check` que roda script + envia summary
- Slack webhook (ou email) se divergência crítica detectada

Estimativa: ~1h.

## 12d · Decommission · após 2026-05-28

**Pré-requisitos** (todos obrigatórios):
- [ ] 30 dias soak completos sem divergência crítica
- [ ] 12b resolvido (anamnese port, link, ou SaaS)
- [ ] Backup snapshot do schema legacy via Supabase dashboard (ponto de retorno)
- [ ] Confirmação explícita sua via PR (não automatizar)

**Migration final:**
```sql
-- mig 90 (próxima livre)
DROP SCHEMA IF EXISTS legacy_2026_04_28 CASCADE;

-- Sanity: 0 FK externas apontando pra legacy
SELECT COUNT(*) FROM pg_constraint con
  JOIN pg_namespace ns ON ns.oid = con.connamespace
WHERE con.contype='f' AND ns.nspname='legacy_2026_04_28';
-- Deve ser 0
```

**Rollback:** restaurar do snapshot Supabase. Janela de rollback: ~7 dias após drop (Supabase backup retention).

**Pós-decom:**
- Arquivar repo `clinic-dashboard` no GitHub (Settings → Archive)
- Atualizar README do `clinicai-v2` removendo refs ao legacy
- Fechar Camada 12 no roadmap

## Rollback playbook geral

Se algo der ruim em qualquer momento da soak:

1. **Bug em CRM v2 sem perda de dados**: corrigir + deploy rápido (PR + merge)
2. **Perda de dados em v2**: rodar `pnpm db:divergence` pra quantificar · restore via Supabase dashboard backup (rolling 7 dias) ou via legacy schema diretamente
3. **v2 totalmente quebrado**: redirecionar `lara.miriandpaula.com.br` pro deploy anterior via Easypanel · Mirian volta pro `clinic-dashboard` enquanto eu corrijo

Janela máxima aceitável de degradação: **4h em horário comercial**. Maior que isso, restaurar legacy completo.

## Pendências críticas suas (não-bloqueantes mas importantes)

- [ ] Setar `SENTRY_DSN` em Easypanel (sem isso, errors são invisíveis durante soak)
- [ ] Rotacionar token `sbp_f15ac0cb...` (vazou várias vezes hoje)
- [ ] Rodar `pnpm e2e:setup` + adicionar 4 secrets do TEST_SUPABASE_* no GitHub Actions (ativa happy path E2E)
- [ ] Decisão 12b (anamnese)
