# Rollback notes · mig 186 · leads_insert_pipeline_positions_trigger

> Migration: `db/migrations/20260800000186_clinicai_v2_leads_insert_pipeline_positions_trigger.sql`
> Down: `db/migrations/20260800000186_clinicai_v2_leads_insert_pipeline_positions_trigger.down.sql`
> Status: **LOCAL · NOT APPLIED** até autorização explícita
> `CRM_PHASE_3_5N3C_TRIGGER_LEADS_APPLY`.

## Contexto

Bloco anterior (3.5N.2) seedou 240 `lead_pipeline_positions` para os 120
leads ativos (`phase='lead'`, `lifecycle_status='ativo'`, `deleted_at IS NULL`).

Esse seed cobriu o **legado**. A **reincidência** continua aberta: qualquer
lead novo criado a partir de agora (webhook / import / manual) entra em
`public.leads` **sem position** em `lead_pipeline_positions`. O cron
`sdr_advance_day_buckets()` segue rodando, mas só avança leads que **já têm
position** — leads novos ficam invisíveis no Kanban 7 Dias (cai pro fallback
`created_at` do BLOCO 3.5B) e o `day_bucket` nunca sincroniza pra eles.

Causa estrutural já catalogada em 3.5N.1:

- `public.sdr_init_lead_pipelines(uuid)` existe e é idempotente, mas depende
  de `_sdr_clinic_id()` (JWT) → inviável de invocar via PAT/service.
- Zero trigger AFTER INSERT em `public.leads`.
- Nenhum fluxo aplicacional centraliza a criação de positions.

## O que a migration adiciona (quando aplicada)

| Objeto | Tipo | Detalhe |
|---|---|---|
| `public.leads_init_pipeline_positions_after_insert()` | função trigger | `LANGUAGE plpgsql · SECURITY DEFINER · SET search_path = public, extensions, pg_temp` |
| `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` | grant | função não exposta a clientes diretos |
| `GRANT EXECUTE TO postgres, service_role` | grant | roles operacionais |
| `trg_leads_init_pipeline_positions_after_insert` | trigger | `AFTER INSERT ON public.leads FOR EACH ROW` |
| `COMMENT ON FUNCTION` + `COMMENT ON TRIGGER` | docs | contrato in-DB |
| `NOTIFY pgrst, 'reload schema'` | hint | regra GOLD #10 |

### Comportamento do trigger

Para cada `INSERT` em `public.leads`, o trigger:

1. **Skip** se `NEW.deleted_at IS NOT NULL`.
2. **Skip** se `NEW.phase IS DISTINCT FROM 'lead'` (lead que nasce em outra
   phase — ex.: import direto pra `paciente` — não entra em pipeline de
   leads · intencional).
3. **Skip** se `COALESCE(NEW.lifecycle_status, 'ativo') IS DISTINCT FROM 'ativo'`
   (terminais `perdido` / `recuperacao` / `arquivado` não geram position auto).
4. **Skip** se `NEW.clinic_id IS NULL` (tenant key obrigatório).
5. Caso contrário: `INSERT INTO public.lead_pipeline_positions (lead_id, pipeline_id, stage_id, origin)`
   - Um row por pipeline ativo (`pipelines.is_active = true`) da mesma clinic.
   - `stage_id` = stage ativo de menor `sort_order` no pipeline.
   - `origin = 'auto'`.
   - `ON CONFLICT (lead_id, pipeline_id) DO NOTHING`.

### Stages iniciais previstos no estado canônico atual

| Pipeline | Stage inicial | sort_order |
|---|---|---|
| `evolution` | `novo` | 10 |
| `seven_days` | `sem_data` | 0 (label "Dia 0") |

## O que a migration NÃO faz

- Não executa `sdr_advance_day_buckets()`.
- Não executa `sdr_init_lead_pipelines()`.
- Não faz backfill (leads existentes intocados · 3.5N.2 já cobriu 120).
- Não toca `leads.day_bucket` (sync acontece via cron diário).
- Não cobre `UPDATE` de `phase` (lead que vira `paciente` e volta pra `lead`
  via UPDATE não dispara o trigger · fora de escopo).
- Não altera cron · grants de outras functions · RLS · políticas.
- Não dispara WhatsApp / provider / `wa_outbox` / Job 71.
- Não modifica app/UI · env/secrets · `package.json` · `pnpm-lock.yaml`.

## Como reverter (rollback)

A migration tem `.down.sql` simétrico. Executar:

```sql
-- db/migrations/20260800000186_clinicai_v2_leads_insert_pipeline_positions_trigger.down.sql
BEGIN;
DROP TRIGGER IF EXISTS trg_leads_init_pipeline_positions_after_insert ON public.leads;
DROP FUNCTION IF EXISTS public.leads_init_pipeline_positions_after_insert();
NOTIFY pgrst, 'reload schema';
-- + sanity DO block confirma remoção
COMMIT;
```

**Importante:** o rollback **não** deleta `lead_pipeline_positions` já
criadas. Positions seedadas em 3.5N.2 + qualquer position criada pelo
trigger durante o período ativo **permanecem**. Rollback só desliga
prevenção futura.

Após o rollback:

- Novos leads `phase='lead'` voltam a entrar **sem** position.
- Cron continua rodando mas leads novos ficam invisíveis no Kanban 7 Dias.
- Reincidência do gap 3.5N volta — aceitar apenas em troubleshoot temporário
  ou rollback de emergência.

## Risco / decisões de design

- **Escopo limitado a `phase='lead'`**: intencional. Pipeline `seven_days`
  é só pra leads em funil ativo. Leads que nascem em `paciente` ou
  `agendado` (raro · normalmente é UPDATE depois) ficariam órfãos no
  pipeline mas não fazem sentido lá.
- **Não cobre UPDATE de phase**: se um lead `paciente` voltar pra `lead`
  via UPDATE de `phase`, não recebe position auto (a migration só trata
  INSERT). Tratamento de UPDATE pode virar mig futura (`186b`) se a
  operação reportar incidência real.
- **`SECURITY DEFINER`**: necessário porque o caller pode ser anon
  (webhook), authenticated (formulário interno), ou postgres (import).
  DEFINER + `SET search_path` evita search_path injection · ADR-029.
- **Sem `EXCEPTION WHEN OTHERS`**: diferente do trigger sync de wa_messages
  (mig 116), aqui o INSERT em `lead_pipeline_positions` é **estrutural** —
  se falhar, é bug real e o INSERT em `leads` deve falhar junto (transação
  atômica). Esconder erro silenciaria reincidência.
- **`ON CONFLICT DO NOTHING`**: defesa em profundidade contra race condition
  se algum fluxo aplicacional (futuro) também tentar criar position.

## Apply procedure (FUTURO · bloco 3.5N.3C)

1. Verificar HEAD inclui o commit que adiciona estes 3 arquivos.
2. Aplicar via Management API com `BEGIN/COMMIT` da própria migration:
   ```
   POST /v1/projects/oqboitkpcvuaudouwvkl/database/query
   { "query": "<conteúdo do .sql>" }
   ```
3. Validar post-apply (queries comentadas no fim do `.sql`):
   - `pg_trigger` mostra `trg_leads_init_pipeline_positions_after_insert · tgenabled=O`
   - `pg_proc` mostra `prosecdef=true` pra function
   - `information_schema.routine_privileges` mostra `postgres + service_role` com EXECUTE · `anon + authenticated` sem
4. Smoke transacional (BLOCO 3.5N.3D · separado):
   ```
   BEGIN;
   INSERT INTO public.leads (clinic_id, phase, ... ) VALUES (...);
   -- conferir que 2 rows novas em lead_pipeline_positions
   ROLLBACK;
   ```
5. Registrar no tracker:
   `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20260800000186')` ou via `supabase migration list`.

## Validação pós-apply esperada

- `pg_trigger.trg_leads_init_pipeline_positions_after_insert.tgenabled` = `'O'`
- `pg_proc.leads_init_pipeline_positions_after_insert.prosecdef` = `true`
- `routine_privileges[postgres,service_role].privilege_type` = `EXECUTE`
- `routine_privileges[anon,authenticated]` = ausente
- `wa_outbox` inalterado · `cron.job` inalterado · `leads.day_bucket` inalterado
- `lead_pipeline_positions` total = 240 (sem mudança imediata · só novos INSERTs em `leads` afetam)
- Tracker `20260800000186` registrado em `supabase_migrations.schema_migrations`

## Pendências relacionadas

- **3.5N.3C**: apply controlado desta migration.
- **3.5N.3D** (opcional): smoke transacional com `INSERT` + `ROLLBACK`.
- **3.5M.4**: próxima observação do cron natural (próximo `0 0 UTC` ≈ 21:00 BRT) — bloco independente desta mig.
- **3.6A**: UAT CRM completo.
