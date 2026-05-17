# Rollback Note · Mig 185 · schedule sdr_advance_day_buckets

**Migration:** `20260800000185_clinicai_v2_schedule_sdr_advance_day_buckets.sql`
**Down:** `20260800000185_clinicai_v2_schedule_sdr_advance_day_buckets.down.sql`
**Tipo:** ADITIVA · forward-only seguro · agenda pg_cron + GRANT EXECUTE · zero alteração de dados/triggers/tabelas existentes
**Data alvo de apply:** TBD (BLOCO 3.5M.3 · controlado · review prévio do SQL · após confirmação de timezone)
**Project ref:** `oqboitkpcvuaudouwvkl`

---

## 1 · Objetivo

Fechar a última peça operacional pendente do Kanban 7 Dias V2 (BLOCO 3.5C commit `0de2f06`): agendar o avanço diário automático do pipeline `seven_days` via `pg_cron`, chamando a função `public.sdr_advance_day_buckets()` (mig V1 `20260514` + recreated em V1 `20260581`).

### Diagnóstico que motiva (BLOCO 3.5A1 audit)

- Função `sdr_advance_day_buckets()` **existe** em prod ([types.ts:19672](packages/supabase/src/types.ts#L19672), confirmação V1 mig 20260514).
- pg_cron está **habilitado** no projeto (10+ migrations V1 + 2 V2 já usam `cron.schedule(...)` ativamente).
- O agendamento `'sdr-advance-day-buckets'` **nunca foi commitado** — instrução ficou como **comentário operacional manual** na mig V1 `20260514:9-14` e nunca foi cumprida.
- `lead_pipeline_positions=0` global (doc 13 §6 BLOCO 3.1A audit) confirma que o cron nunca avançou nada.
- Zero scheduler alternativo (GitHub Actions, Vercel Cron, Edge Function, API endpoint) cobre o gap.
- `/crm/kanban/seven-days` (BLOCO 3.5B/3.5C) roda 100% no fallback calculado por `created_at` · UI funciona, mas a fonte real de verdade temporal está dormente.

### Princípio

Versionar o agendamento via migration idempotente (pattern V2 mig 134 `wa_chat_mirror_sync_mih`). Migration **não executa** a função durante o apply · apenas cria o job no `cron.job`. Primeira execução real acontece no próximo `0 3 * * *` UTC após apply.

---

## 2 · Mudanças

### 2.1 · GRANT EXECUTE na função existente

```sql
REVOKE EXECUTE ON FUNCTION public.sdr_advance_day_buckets()
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sdr_advance_day_buckets()
  TO service_role, postgres;
```

- `REVOKE` defensivo (a função é `SECURITY DEFINER` na mig V1 20260514, mas blindar é boa prática).
- `service_role` é o role que o pg_cron usa em projetos Supabase. `postgres` é redundante por default mas explicitamente granted pra paridade com mig 800-134.
- Não dropa permissões pré-existentes além do REVOKE explícito acima.

### 2.2 · cron.job `sdr-advance-day-buckets`

| Campo | Valor |
|---|---|
| `jobname` | `sdr-advance-day-buckets` |
| `schedule` | `0 3 * * *` (UTC) = **00:00 BRT** (UTC-3, sem horário de verão desde 2019) |
| `command` | `SELECT public.sdr_advance_day_buckets();` |
| `active` | `true` (default pg_cron) |

### 2.3 · Idempotência

Pattern extraído de mig 800-134:
- Se `jobname` já existir em `cron.job` → `PERFORM cron.alter_job(job_id, schedule, command)` (preserva `jobid`).
- Se não existir → `PERFORM cron.schedule(job_name, schedule, command)`.

Permite re-run da migration sem efeitos colaterais.

### 2.4 · Sanity DO block

Aborta apply (`RAISE EXCEPTION`) se:
- `cron.job` não tem entry com `jobname = 'sdr-advance-day-buckets'` após o block de schedule.
- `schedule` diferente de `'0 3 * * *'`.
- `command` não contém `sdr_advance_day_buckets`.
- `service_role` não tem `EXECUTE` na função.

Apenas `RAISE WARNING` se `active != true` (caso edge · investigação manual recomendada).

### 2.5 · COMMENT ON FUNCTION

Documenta in-DB que a função é agendada por esta migration · útil pra DBA descobrir owner do schedule via `\df+`.

### 2.6 · `NOTIFY pgrst, 'reload schema'`

Regra GOLD #10 · garante que mudanças de metadata/grants sejam vistas pelo PostgREST imediatamente.

---

## 3 · O que NÃO mudou

- `public.sdr_advance_day_buckets()` body (mig V1 20260514 + 20260581 permanecem canônicas)
- `public.leads` schema/dados/triggers/policies
- `public.lead_pipeline_positions` schema/dados (positions só vão aparecer **após primeiro run do cron**)
- `public.pipelines` / `public.pipeline_stages` (seed mig V1 20260513)
- Outros 10+ cron jobs existentes (jobids não alterados)
- App code (zero alteração TS · `/crm/kanban/seven-days` segue lendo via `sdr_get_kanban_7dias` + fallback)
- WhatsApp / Evolution / wa_outbox (zero envio)
- Edge functions / GitHub Actions / vercel.json

---

## 4 · Por que esta abordagem (decisão Alden)

| Alternativa descartada | Motivo |
|---|---|
| Adicionar `SELECT cron.schedule(...)` na própria mig V1 20260514 | Mig V1 já aplicada · alterar histórico vira repair complicado · separado é mais auditável |
| GitHub Action `sdr-advance-day-buckets.yml` chamando endpoint Lara | Adiciona hop HTTP · padrão V2 pra DB-only logic é pg_cron direto (ex: mig 134) · menos failure surface |
| Vercel Cron via `vercel.json` | Monorepo não usa Vercel · zero `vercel.json` no V2 |
| Supabase Edge Function `seven-days-advance/index.ts` | Mesma justificativa do GitHub Action · `sdr_advance_day_buckets()` é puramente plpgsql · não precisa hop externo |
| Aguardar UAT antes de agendar | Cron só ativa positions reais · sem ele, fallback calculado segue funcionando · risco baixo de aplicar antes do UAT |
| Schedule em UTC sem timezone documentado | Pode confundir DBA futuro · documentar in-comments na migration mata risco |

Estratégia escolhida: **migration pg_cron idempotente seguindo pattern V2 mig 800-134** · zero novo endpoint · zero novo Edge Function · paridade com outros jobs do projeto.

---

## 5 · Como aplicar pós-revisão (BLOCO 3.5M.3)

```bash
# 1. Comparar def atual da função (READ-ONLY)
SELECT pg_get_functiondef('public.sdr_advance_day_buckets()'::regprocedure);

# 2. Verificar que job NÃO existe ainda
SELECT jobid, jobname, schedule, active
  FROM cron.job
 WHERE jobname = 'sdr-advance-day-buckets';
# Expected: 0 rows.

# 3. Apply via Management API (padrão reference_supabase_migrations_management_api.md)
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000185_clinicai_v2_schedule_sdr_advance_day_buckets.sql

# 4. Repair tracker (registrar como aplicada no histórico Supabase CLI)
mkdir -p supabase/migrations
: > supabase/migrations/20260800000185_repair_marker.sql
SUPABASE_ACCESS_TOKEN=sbp_... supabase migration repair --status applied 20260800000185
rm -rf supabase/migrations

# 5. Validation pós-apply
SELECT jobid, jobname, schedule, command, active
  FROM cron.job
 WHERE jobname = 'sdr-advance-day-buckets';
# Expected: 1 row · schedule='0 3 * * *' · active=true · command='SELECT public.sdr_advance_day_buckets();'

# 6. Validação operacional (esperar próxima janela 03:00 UTC = 00:00 BRT)
SELECT jobid, status, return_message, start_time, end_time
  FROM cron.job_run_details
 WHERE command ILIKE '%sdr_advance_day_buckets%'
 ORDER BY start_time DESC
 LIMIT 5;

# 7. Confirmar positions populadas (após D+1 do apply · 1+ execução)
SELECT pipeline_slug, stage_slug, COUNT(*) AS total
  FROM public.lead_pipeline_positions
 WHERE pipeline_slug = 'seven_days'
 GROUP BY pipeline_slug, stage_slug
 ORDER BY stage_slug;
```

Pós-apply, o frontend não precisa mudar · `/crm/kanban/seven-days` (BLOCO 3.5B) já tem fallback que continuará servindo leads que não têm position ainda. À medida que o cron roda e positions aparecem, o fallback fica residual.

---

## 6 · Riscos do apply

| Risco | Probabilidade | Mitigação |
|---|---|---|
| pg_cron não habilitado no projeto | **Muito baixa** | 10+ migrations V1 + 2 V2 já usam ativamente · evidência forte |
| `sdr_advance_day_buckets()` ausente | **Muito baixa** | DO block #1 da migration aborta com `RAISE EXCEPTION` antes do schedule |
| jobid colide com job existente diferente | Muito baixa | `jobname` é a chave única em `cron.job` · alter_job protege contra duplicação |
| `service_role` não é o role usado pelo pg_cron neste projeto | Baixa | Mig 134 também usa `service_role, postgres` · padrão V2 estabelecido |
| Schedule `0 3 * * *` UTC não corresponde a 00:00 BRT em dia D (horário de verão) | **Baixa** | Brasil não tem horário de verão desde 2019 · revisar se restaurar |
| Primeira execução pega leads pré-criados sem position e tenta avançar | Baixa | Função opera por UPDATE em positions existentes · leads sem position ficam fora (precisariam `sdr_init_lead_pipelines` antes · vide §8 pendência) |
| Migration aplica mas cron não dispara | Baixa | Sanity DO block valida `active=true` · se aparecer WARNING, investigar grants/extension |
| DDL em `cron.job` bloqueia em waitlock | Muito baixa | `cron.alter_job/schedule` são funções · não DDL bloqueante |

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

**Atenção:** se rollback acontecer **depois** de 1+ execuções do cron:
- `lead_pipeline_positions` continua com positions já gravadas (não reverte)
- `leads.day_bucket` continua com último valor sincronizado
- `/crm/kanban/seven-days` volta a depender 100% do fallback calculado

Rollback aditivo é seguro porque a mig não toca dados · só remove o agendamento.

Não dropa GRANT EXECUTE (função pode continuar sendo chamada manualmente por service_role em UAT). Não dropa a função (é da V1).

---

## 8 · Pendências operacionais (pré-3.5M.3)

1. **Decisão de timezone:** confirmar com Alden se `0 3 * * *` UTC (= 00:00 BRT atual) é o horário desejado. Se quisermos rodar fora de pico, `0 6 * * *` UTC (= 03:00 BRT madrugada) também funciona.
2. **Decisão de role:** confirmar via `SELECT current_setting('cron.database_name')` ou tentativa em staging que `service_role` é efetivamente o role do pg_cron neste projeto. Se for `postgres` apenas, basta · GRANT pra ambos já cobre.
3. **Backfill de positions:** **decisão importante** — `lead_pipeline_positions=0` hoje. A função `sdr_advance_day_buckets()` opera por UPDATE em positions **existentes**. Sem positions iniciais, primeira execução do cron não tem nada pra avançar:
   - **Opção A:** Aceitar · positions aparecem conforme novos leads são criados via `submit_quiz_response` (mig V1 20260581 popula position 'sem_data' em INSERT) · cron começa a operar gradualmente.
   - **Opção B:** Backfill em migration separada (3.5M.3+): rodar `SELECT sdr_init_lead_pipelines(id) FROM leads WHERE deleted_at IS NULL AND lifecycle_status='ativo'` antes do primeiro cron.
   - **Recomendação:** **Opção A** · paridade V1, evita risco em DDL de write em massa.
4. **Primeiro run em produção:** considerar executar `SELECT sdr_advance_day_buckets()` manualmente em janela controlada (não na migration · pós-apply) pra observar comportamento real antes de esperar até 00:00 BRT.
5. **Monitoring pós-apply:** plano de UAT (BLOCO 3.6A) deve incluir SELECT em `cron.job_run_details` em D+1, D+2 pra confirmar runs sucessivos sem erro.

---

## 9 · Confirmações negativas (estado da prep)

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API mutativa (mig prep)
- ❌ Zero deploy
- ❌ Zero execução de `sdr_advance_day_buckets()`
- ❌ Zero `cron.schedule` chamado remoto
- ❌ Zero `cron.unschedule` chamado remoto
- ❌ Zero alteração em `lead_pipeline_positions`
- ❌ Zero alteração em `leads.day_bucket`
- ❌ Zero alteração TS/app code
- ❌ Zero alteração em V1 (`clinic-dashboard`)
- ❌ Zero `wa_outbox` insert
- ❌ Zero WhatsApp/Evolution send
- ❌ Zero criação de RPC nova
- ❌ Zero ativação de Job 71
- ❌ Zero commit em git no momento da escrita (commit apenas após review)
- ❌ Zero secret persistido (mig não usa vault · função opera in-DB)

---

## 10 · Histórico

- **2026-05-17:** Mig 185 PREPARADA via BLOCO 3.5M.1 · sem apply.
- **Baseado em:**
  - BLOCO 3.5A1 audit (CRON_JOB_MISSING_NEEDS_3_5M)
  - Pattern V2 mig 800-134 (wa_chat_mirror_sync_mih)
  - Mig V1 20260514 (sdr_advance_day_buckets criada · agendamento deixado como comentário manual)
  - Mig V1 20260581 (fix day_bucket consistency · recreated function)
- **Próximo:**
  - BLOCO 3.5M.2 — Commit + Push controlado da migration + rollback notes (3 arquivos novos)
  - BLOCO 3.5M.3 — Apply controlado em produção + validação cron.job
  - BLOCO 3.6A — UAT CRM completo (após cron rodar 1+ ciclo)
