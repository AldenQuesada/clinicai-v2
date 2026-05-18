# Round 1 · Phase E2 · Staging Target Resolution

> CRM_PARITY_R1_PHASE_E2_RESOLVE_STAGING_TARGET · 2026-05-18 · zero SQL · zero migration aplicada · zero commit

## Verdict

**`PARTIAL_CRM_PARITY_R1_PHASE_E2_STAGING_TARGET_STILL_BLOCKED`** — sem staging seguro identificável neste repo.

Recomendação: **CASE C — criar Supabase Branch** a partir de `oqboitkpcvuaudouwvkl` antes de aplicar migrations 188-191.

## Por que E2 parou

Phase E2 exige um target staging onde rodar 188-191 com probes e smoke antes de produção. Audit do repo mostra:

| Evidência | Local | Conteúdo |
|-----------|-------|----------|
| Único project ref hardcoded | `supabase/config.toml:1` | `project_id = "oqboitkpcvuaudouwvkl"` |
| Script doc marca explícito prod | `scripts/apply-migration.mjs:3` | "Aplica uma migration arbitraria **em prod** via Supabase Management API" |
| Default REF do script | `scripts/apply-migration.mjs:34` | `const REF = process.env.SUPABASE_PROJECT_REF || 'oqboitkpcvuaudouwvkl'` |
| Mesmo default em 4 scripts auxiliares | `scripts/{divergence-check,e2e-cleanup,e2e-setup,generate-types}.mjs` | mesmo ref `oqboitkpcvuaudouwvkl` |
| README scripts | `scripts/README.md:7` | "Aplica uma migration arbitrária em prod via Management API" |
| README functions | `supabase/functions/README.md:27` | `supabase link --project-ref oqboitkpcvuaudouwvkl` |
| Audit docs históricos | `docs/crm-refactor/17-22*-migration-tracker-*.md` | sempre referenciam o mesmo ref como ambiente produtivo |
| Grep `STAGING\|staging_ref\|preview-ref` | repo-wide | zero matches em config funcional |
| Env `SUPABASE_*` na sessão | shell | (nenhuma visível) |

**Conclusão:** o repo está single-target apontando para um project ref tratado como produção em toda documentação.

## SUPABASE_TARGET_AUDIT

| File | Valor encontrado | Ambiente inferido | Risco se aplicarmos R1 lá |
|------|------------------|-------------------|--------------------------|
| `supabase/config.toml` | `project_id="oqboitkpcvuaudouwvkl"` | **prod** | CRÍTICO · seria deploy direto em produção sem janela controlada |
| `scripts/apply-migration.mjs` | doc literal "em prod" + default REF prod | **prod** | mesmo · script foi escrito para prod |
| `scripts/divergence-check.mjs` | default REF prod | prod | read-only, mas pré-aponta para prod |
| `scripts/e2e-setup.mjs` / `e2e-cleanup.mjs` | default REF prod | prod | usado para preparar fixtures E2E · ainda em prod |
| `scripts/generate-types.mjs` | default REF prod | prod | read-only (gera types do schema prod) |

Nenhum arquivo aponta para um `STAGING_PROJECT_REF` alternativo.

## CLI / branch discovery (read-only · S2)

| Comando | Resultado |
|---------|-----------|
| `supabase --version` | `2.90.0` instalado · upgrade disponível |
| `supabase status` | ❌ Docker daemon não está rodando (local dev DB não iniciado) |
| `supabase branches list --project-ref oqboitkpcvuaudouwvkl` | ❌ `Access token not provided` · precisa `SUPABASE_ACCESS_TOKEN` |

Não foi possível confirmar nem refutar a existência de Supabase DB branches sem o token. Você pode:
1. Setar `SUPABASE_ACCESS_TOKEN` no shell + re-rodar `supabase branches list`, OU
2. Verificar via dashboard: `https://supabase.com/dashboard/project/oqboitkpcvuaudouwvkl/branches`

## Decisão de target · 3 opções

### CASE A — Existe staging Supabase real (não documentado)

Probabilidade: **baixa** · zero pista em config/scripts/docs.

Se existir e você confirmar:
- Me passe `STAGING_PROJECT_REF`
- Confirme via dashboard URL ou naming convention
- Confirme que `SUPABASE_ACCESS_TOKEN` distinto existe para staging

Próximo GO seria:
```
GO CRM_PARITY_R1_PHASE_E2_RESUME_WITH_STAGING_REF=<ref>
```

### CASE C — Criar Supabase Branch · RECOMENDADO

Supabase Cloud suporta DB Branches (preview branches). Cada branch é uma cópia isolada do schema + dados, segura para testes destrutivos.

**Instruções manuais para Alden criar a branch:**

1. Abrir dashboard Supabase: `https://supabase.com/dashboard/project/oqboitkpcvuaudouwvkl`
2. No menu lateral: **Database → Branches** (ou **Branches** dependendo da UI atual)
3. Clicar **Create branch**
4. Nome: `crm-r1-agenda-foundation`
5. Source: `main` (production schema)
6. Aguardar provisionamento (~1-2 min)
7. Copiar o `branch_ref` exibido (algo como `<short_ref>` distinto do prod)
8. **NÃO** colar tokens/passwords no chat · apenas o ref público

Custos: Supabase Branches estão em **plano Pro+**. Se o projeto está em free tier, esta opção não é viável sem upgrade.

Próximo GO seria:
```
GO CRM_PARITY_R1_PHASE_E2_RESUME_WITH_SUPABASE_BRANCH=<branch_ref>
```

A apply nesse branch usaria override do script:
```powershell
$env:SUPABASE_PROJECT_REF = "<branch_ref>"  # override do default prod
$env:SUPABASE_ACCESS_TOKEN = "<sbp_token>"
node scripts/apply-migration.mjs db/migrations/20260800000188_*.sql
# ... etc
```

### CASE B — Aplicar direto em prod (exceção alto risco)

Probabilidade aceitável: **baixa**. Só faz sentido se:
- Plano Supabase não permite branches
- Risco de mig 188/189/190 é objetivamente baixo (ADD COLUMN nullable, índices parciais, sem dado destrutivo)
- Mig 191 é CREATE OR REPLACE de funções (reversível)
- Janela curta + monitoramento + downs prontos

**Avaliação do risco objetivo de R1 em prod:**

| Mig | Operação | Risco runtime | Reversibilidade |
|-----|----------|---------------|------------------|
| 188 ferias jsonb | ADD COLUMN NOT NULL DEFAULT `'[]'` + GIN parcial | Baixo (default seguro, rows existentes ganham `[]`) | DROP COLUMN trivial |
| 189 sala_id FK | ADD COLUMN nullable + FK ON DELETE SET NULL + btree parcial | Baixo (nullable, sem backfill) | DROP COLUMN trivial |
| 190 room_id FK | ADD COLUMN nullable + FK ON DELETE SET NULL + 2 índices parciais | Baixo (nullable, room_idx preservado) | DROP COLUMN trivial |
| 191 canon hotfix | CREATE OR REPLACE 3 funções | Médio · muda comportamento de `appointment_attend` (não muda mais phase) + `lead_to_paciente` (aceita 2 phases agora) | CREATE OR REPLACE do legacy via down (com aviso) |

Atenuantes pré-existentes:
- Mig 187 já alterou `lead_to_orcamento` no mesmo padrão · não houve incidente
- CI Playwright SUCCESS com canon contract validado (`appointment-attend-finalize.spec.ts:163`)
- Worker 71 OFF (sem cron consumer da função)
- `wa_outbox` não tocado pela mig 191
- Hard gate mig 167 intocado

Mesmo com risco objetivo baixo, **eu não recomendo CASE B sem janela explícita**. Se você optar, seria um GO separado:

```
GO CRM_PARITY_R1_PHASE_E2_APPLY_TO_PROD_ONE_REF_ENVIRONMENT
```

Com pré-condições:
- Janela curta agendada (ex: 30 min)
- Sem operação ativa (sem secretária criando appointments)
- Worker 71 mantido OFF
- Probes pós-apply imediatos
- Rollback ready (downs aplicáveis em <2 min cada)

## Hardening recomendado do `apply-migration.mjs` (não implementado neste turno)

Sugiro evoluir o script para reduzir risco de aplicar acidentalmente em prod (não implementar agora · só prop):

```js
// Recomendação · não aplicar neste turno
const REF = process.env.SUPABASE_PROJECT_REF
if (!REF) {
  console.error('❌ SUPABASE_PROJECT_REF obrigatório · sem default · use --project-ref')
  process.exit(1)
}

// Confirmação explícita do ambiente alvo
const args = process.argv.slice(2)
const envName = args.find(a => a.startsWith('--env='))?.slice(6)
if (!envName) {
  console.error('❌ --env=staging|production obrigatório')
  process.exit(1)
}
if (envName === 'production' && !args.includes('--confirm-prod')) {
  console.error('❌ Para aplicar em prod use --confirm-prod')
  process.exit(1)
}

// Dry-run mode
if (args.includes('--dry-run')) {
  console.log(`[DRY-RUN] Would apply ${filename} to ${REF} (${envName})`)
  process.exit(0)
}
```

Esse hardening fica como TODO do Round 1 close ou Round 7 freeze. Não bloqueia R1 atual.

## Próximos GOs possíveis

| Cenário | Próximo GO |
|---------|-----------|
| Alden cria branch Supabase | `GO CRM_PARITY_R1_PHASE_E2_RESUME_WITH_SUPABASE_BRANCH=<branch_ref>` |
| Alden encontra staging project ref real | `GO CRM_PARITY_R1_PHASE_E2_RESUME_WITH_STAGING_REF=<ref>` |
| Alden decide apply prod com janela controlada | `GO CRM_PARITY_R1_PHASE_E2_APPLY_TO_PROD_ONE_REF_ENVIRONMENT` |
| Alden adia | branch fica viva · PR #39 OPEN · próximo round pode esperar |

## Confirmações negativas

- ✅ Zero migration aplicada
- ✅ Zero SQL (incluindo precheck `current_database()` · seria conectar em prod)
- ✅ Zero produção tocada
- ✅ Zero merge PR #39 (continua OPEN/MERGEABLE)
- ✅ Zero deploy
- ✅ Zero WhatsApp · zero provider · worker 71 OFF
- ✅ Zero cron · zero env/secrets novos
- ✅ Zero Round 2 work
- ✅ Zero alteração em `scripts/apply-migration.mjs` (hardening só proposto)
- ✅ Zero `supabase login` ou auth iniciada · CLI permanece sem token nesta sessão

Branch `crm/parity-r1-agenda-foundation` viva. PR #39 estável. Aguardando seu sinal.
