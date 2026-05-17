# Rollback Note · Mig 185 · ADOPT existing pg_cron sdr-advance-day-buckets

**Migration:** `20260800000185_clinicai_v2_schedule_sdr_advance_day_buckets.sql`
**Down:** `20260800000185_clinicai_v2_schedule_sdr_advance_day_buckets.down.sql`
**Tipo:** ADOPTION · governança · idempotente · **zero behavior change** sobre o cron existente
**Estratégia:** ADOPT EXISTING JOB · NOT CREATE NEW
**Data alvo de apply:** TBD (BLOCO 3.5M.3-R3 · controlado · após commit da R2)
**Project ref:** `oqboitkpcvuaudouwvkl`

---

## 1 · Objetivo

Versionar em código o cron job `sdr-advance-day-buckets` que **já está em produção** há pelo menos 5+ dias rodando com sucesso. Esta migration **NÃO** muda comportamento operacional · apenas adota o estado real em forma de migration auditável (encerra débito R-025 pra este job específico).

### Diagnóstico que motiva (descoberta BLOCO 3.5M.3 · 2026-05-17)

Probe Management API antes do apply original revelou:

| Campo | Estado real em prod |
|---|---|
| `cron.job` jobname | `sdr-advance-day-buckets` (jobid=1) |
| Schedule | `0 0 * * *` UTC (= **21:00 BRT**) |
| Command | `SELECT sdr_advance_day_buckets()` (sem prefix `public.`) |
| Active | `true` |
| Runs recentes | 5 sucessos consecutivos (2026-05-13 → 2026-05-17, todos 00:00 UTC) |
| Grants em `public.sdr_advance_day_buckets()` | EXECUTE para `authenticated` + `postgres` + `service_role` |
| `lead_pipeline_positions` total | **0 rows** (cron roda mas não tem o que avançar) |
| `leads.day_bucket` | 122 ativos · **todos NULL** |
| `leads` ativos (`lifecycle='ativo'`, `deleted_at NULL`) | **122** |

### Por que o cron já existe sem migration

R-025 confirmed: alguém agendou `SELECT cron.schedule('sdr-advance-day-buckets', '0 0 * * *', $$SELECT sdr_advance_day_buckets()$$);` via Studio SQL editor antes da mig 185 ser pensada (provável: durante onboarding inicial do CRM V2 ou debug operacional). Resultado funcional · governança ausente.

### Por que a versão original da mig 185 foi REJEITADA

A versão original (commit `8e98ea0`) faria 3 mudanças operacionais sem ganho imediato:
1. Mudaria schedule `0 0 * * *` → `0 3 * * *` (delay de 3h sem motivo)
2. `REVOKE EXECUTE FROM authenticated` (sem audit de callers · risco de quebrar TS)
3. Normalizaria command pra `SELECT public.sdr_advance_day_buckets();`

Apenas a mudança 3 é claramente segura. Os outros 2 viraram **decisões futuras** (mig separada) após audit dedicado.

### Princípio adotado

"**ADOPT before HARDEN**": versionar primeiro o estado real funcionando, harden em mig separada depois (após audit de callers + decisão operacional sobre horário).

---

## 2 · Mudanças (após patch BLOCO 3.5M.3-R1)

### 2.1 · `GRANT EXECUTE` preservativo

```sql
GRANT EXECUTE ON FUNCTION public.sdr_advance_day_buckets()
  TO authenticated, service_role, postgres;
```

- **Não** faz REVOKE de nenhum role.
- GRANT é idempotente · se role já tem EXECUTE, nada muda.
- Garante que se algum dos 3 grants foi removido por engano em algum momento, restaura.

### 2.2 · `cron.alter_job` ou `cron.schedule` · idempotente

| Condição | Ação |
|---|---|
| Job existe (estado atual em prod) | `cron.alter_job(jobid, schedule='0 0 * * *', command='SELECT public.sdr_advance_day_buckets();', active=true)` |
| Job não existe (cenário hipotético · ex: staging) | `cron.schedule('sdr-advance-day-buckets', '0 0 * * *', 'SELECT public.sdr_advance_day_buckets();')` |

Schedule **preservado** em `0 0 * * *` UTC. Command **normalizado** pra forma explícita com prefix `public.` (defensivo contra mudança de `search_path` · sem alterar comportamento porque `sdr_advance_day_buckets` já resolve pra `public.*` no search_path padrão).

### 2.3 · COMMENT ON FUNCTION

Documenta in-DB que a função é agendada por esta migration + V1 origin · útil pra DBA descobrir owner do schedule via `\df+`.

### 2.4 · Sanity DO block

Aborta apply (`RAISE EXCEPTION`) se:
- Job `sdr-advance-day-buckets` não está em `cron.job` (count=0 ou >1)
- Schedule diferente de `'0 0 * * *'` (regressão)
- Command sem `sdr_advance_day_buckets` (ILIKE · aceita com/sem prefix `public.`)
- GRANT EXECUTE ausente pra `service_role` / `postgres` / `authenticated`

`RAISE WARNING` se `active != true` (caso edge · investigação manual).

### 2.5 · `NOTIFY pgrst, 'reload schema'`

Regra GOLD #10.

---

## 3 · O que NÃO mudou

- `public.sdr_advance_day_buckets()` body (mig V1 20260514 + 20260581 permanecem canônicas)
- Schedule operacional (`0 0 * * *` UTC preservado)
- GRANT EXECUTE pra `authenticated` (preservado · não revoga)
- `public.leads` schema/dados/triggers/policies
- `public.lead_pipeline_positions` schema/dados (continua com 0 rows · vai ser tratado em **3.5N**)
- `leads.day_bucket` (continua NULL pra 122 leads · vai ser tratado em **3.5N**)
- Outros 10+ cron jobs existentes (jobids não alterados)
- App code (zero alteração TS)
- WhatsApp / Evolution / wa_outbox

---

## 4 · Por que esta abordagem (decisão pós-descoberta)

| Alternativa descartada | Motivo |
|---|---|
| Aplicar mig 185 original (schedule `0 3 * * *` + REVOKE authenticated) | Muda comportamento de prod funcionando · sem audit de callers · risco de regressão TS · sem motivo operacional comprovado pra trocar horário |
| Cancelar mig 185 (não fazer nada) | Cron existe sem migration · débito de governança R-025 persiste · próxima mudança de schedule/grant fica órfã |
| Migration manual sem versionamento | Reinventa o problema original (R-025) · padrão V2 exige tudo versionado em `db/migrations/` |
| Migration que dropa o cron e recria | Janela de gap entre DROP e RECREATE · cron pode pular 1 noite · risco operacional desnecessário |

Estratégia escolhida: **`cron.alter_job` idempotente preservando schedule e grants atuais** + normalização de command (segura · cosmética) + COMMENT + sanity.

---

## 5 · Como aplicar pós-revisão (BLOCO 3.5M.3-R3)

```bash
# 1. Verificar estado atual (READ-ONLY)
node scripts/apply-migration.mjs --query \
  "SELECT jobid, jobname, schedule, command, active FROM cron.job WHERE jobname='sdr-advance-day-buckets';"
# Expected: 1 row · schedule='0 0 * * *' · command contém sdr_advance_day_buckets · active=true

# 2. Apply via Management API
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000185_clinicai_v2_schedule_sdr_advance_day_buckets.sql

# 3. Repair tracker
mkdir -p supabase/migrations
: > supabase/migrations/20260800000185_repair_marker.sql
SUPABASE_ACCESS_TOKEN=sbp_... supabase migration repair --status applied 20260800000185
rm -rf supabase/migrations

# 4. Validation pós-apply (READ-ONLY)
SELECT jobid, jobname, schedule, command, active FROM cron.job WHERE jobname = 'sdr-advance-day-buckets';
# Expected: 1 row · schedule='0 0 * * *' · active=true · command='SELECT public.sdr_advance_day_buckets();'

SELECT grantee, privilege_type FROM information_schema.routine_privileges
WHERE routine_schema='public' AND routine_name='sdr_advance_day_buckets'
ORDER BY grantee, privilege_type;
# Expected: authenticated, postgres, service_role com EXECUTE

SELECT pg_get_functiondef('public.sdr_advance_day_buckets()'::regprocedure);
# Expected: body da V1 mig 20260514+20260581 (sem mudança)
```

Pós-apply, o cron continua rodando todo dia às 00:00 UTC (21:00 BRT) como antes · validação D+1 pode confirmar via `cron.job_run_details`. Nada muda no frontend ou nas tabelas operacionais.

---

## 6 · Riscos do apply

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `cron.alter_job` falhar com command novo | **Muito baixa** | Command syntactically idêntico · só prefix `public.` adicional |
| Janela de "downtime" do cron entre alter | **Muito baixa** | `cron.alter_job` é atômico · sem unschedule+reschedule |
| Sanity falhar por grant divergente | **Baixa** | GRANT é idempotente e cobre os 3 roles esperados |
| Auditoria detectar que `authenticated` não devia ter EXECUTE | **Média** (legítima pra futuro) | Decisão consciente · não responsabilidade desta mig · fica pra mig separada |
| Migration aplicar mas cron não disparar 00:00 UTC | **Muito baixa** | `cron.alter_job` preserva `jobid=1` e `active=true` |
| Conflict com `supabase migration repair --status` | Baixa | Padrão V2 estabelecido · mig 159 + 134 tracker funcionou |

---

## 7 · Down · unschedule ordenado

`.down.sql` executa:

```sql
BEGIN;
DO $cron$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'sdr-advance-day-buckets';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $cron$;
COMMIT;
```

**Atenção crítica:** rodando este DOWN, você **REMOVE o cron que estava operacional antes da mig 185** (porque a mig adotou o existente). Se o intent é "voltar ao estado pré-mig 185" SEM desligar o cron, **NÃO rodar `.down.sql`** · apenas marcar `supabase migration repair --status reverted 20260800000185` sem tocar em `cron.job`.

Não dropa GRANT EXECUTE (função pode continuar sendo chamada manualmente). Não dropa a função (é da V1).

---

## 8 · Pendências pós-3.5M.3-R3

### 8.1 · Decisões futuras · migrations separadas

1. **Mudar schedule pra `0 3 * * *` UTC (= 00:00 BRT)** se a operação preferir cron rodar mais tarde da noite. Mig futura: 800-186+ com `cron.alter_job(job_id, schedule := '0 3 * * *')` apenas.
2. **REVOKE EXECUTE FROM authenticated** se audit cross-repo provar que nenhum cliente authenticated invoca a função. Esperado: SECURITY DEFINER + intent operacional → cron-only. Mig futura separada após grep TS + análise RLS.

### 8.2 · BLOCO 3.5N · positions vazias (PRINCIPAL)

- `lead_pipeline_positions` = 0 rows global
- 122 leads ativos sem position seven_days
- Cron roda mas `leads_advanced=0` em todos os runs (nada pra avançar)
- `/crm/kanban/seven-days` segue 100% no fallback calculado
- **Backfill controlado** via `sdr_init_lead_pipelines(lead_id)` em loop pra leads ativos
- OU **alternativa via trigger** novo em `INSERT INTO leads` (cuidado · `submit_quiz_response` já popula, problema é histórico)
- Bloco dedicado · não responsabilidade da mig 185

---

## 9 · Confirmações negativas (estado da prep R1)

- ❌ Zero apply no banco (R1 é só patch local)
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API mutativa (probes pré-R1 foram só read-only)
- ❌ Zero deploy
- ❌ Zero execução de `sdr_advance_day_buckets()`
- ❌ Zero `cron.schedule` / `cron.unschedule` / `cron.alter_job` chamado remoto
- ❌ Zero alteração em `lead_pipeline_positions`
- ❌ Zero alteração em `leads.day_bucket`
- ❌ Zero alteração TS/app code
- ❌ Zero alteração em V1 (`clinic-dashboard`)
- ❌ Zero `wa_outbox` insert
- ❌ Zero WhatsApp/Evolution send
- ❌ Zero criação de RPC nova
- ❌ Zero ativação de Job 71
- ❌ Zero commit em git no momento da R1 (commit em R2)
- ❌ Zero secret persistido (mig não usa vault · função opera in-DB)

---

## 10 · Histórico

- **2026-05-17 (R0 · BLOCO 3.5M.1):** Mig 185 PREPARADA com estratégia "create new cron"
- **2026-05-17 (BLOCO 3.5M.2):** Commit `8e98ea0` versionou a mig 185 (versão R0)
- **2026-05-17 (BLOCO 3.5M.3 probe):** Descoberto que cron já existe em prod desde pelo menos 2026-05-13
- **2026-05-17 (R1 · BLOCO 3.5M.3-R1 · ESTE PATCH):** Mig 185 reescrita com estratégia "adopt existing" · preserva schedule + grants atuais · ainda local
- **Baseado em:**
  - BLOCO 3.5A1 audit (parcialmente errado · concluiu CRON_JOB_MISSING)
  - Probe Management API em BLOCO 3.5M.3 (descobriu estado real)
  - Pattern V2 mig 800-134 (wa_chat_mirror_sync_mih)
  - Mig V1 20260514 + 20260581 (função canônica)
- **Próximo:**
  - **BLOCO 3.5M.3-R2** — Commit + Push do patch R1 (3 arquivos modificados)
  - **BLOCO 3.5M.3-R3** — Apply via Management API + validação
  - **BLOCO 3.5N** — Estratégia pra `lead_pipeline_positions` vazias (backfill controlado)
  - **BLOCO 3.6A** — UAT CRM completo

### Auto-correção · honestidade

O audit BLOCO 3.5A1 concluiu `CRON_JOB_MISSING_NEEDS_3_5M` baseado **apenas** em evidência de código (zero migration commitou `cron.schedule`). Eu não considerei que admin pode ter rodado o schedule manualmente em Studio · padrão R-025 amplamente documentado nos docs do projeto. A descoberta no probe Management API corrigiu o veredito.

Aprendizado: audits que envolvem cron/RPCs **devem incluir probe SQL `SELECT FROM cron.job`** quando token estiver disponível · evidência de migration é insuficiente (R-025 cria gap entre prod e código).
