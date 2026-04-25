# Auditoria D1 · RPCs `wa_pro_*` chamadas pelo monorepo

**Data:** 2026-04-25
**Escopo:** monorepo `clinicai-v2` (Next.js 16 + Turborepo + Supabase)
**Objetivo:** mapear toda chamada `.rpc('wa_pro_*')` no codigo, validar
existencia em `db/migrations/`, criar as faltantes seguindo contrato canonico
(SECURITY DEFINER + search_path explicito + GRANT seguro + sanity check + .down).

---

## Sumario executivo

- **RPCs chamadas no codigo:** 10 unicas
- **RPCs definidas em `db/migrations/` antes desta auditoria:** 0
- **RPCs definidas em prod (legado clinic-dashboard, fora do monorepo):** 7
  com assinatura `(p_phone text)` — incompativel com chamadas do clinicai-v2
  que passam `(p_clinic_id uuid)`
- **RPCs criadas pela mig 800-13:** 9 (assinatura `p_clinic_id uuid`)
- **RPCs nao tocadas:** 1 (`wa_pro_handle_message` ja em prod com assinatura
  `(p_phone text, p_text text)` · usado pelo handler `b2b-admin-query` que
  passa exatamente esses 2 params)

---

## Etapa 1 · Chamadas no codigo

| RPC | Arquivo:linha | Args |
|---|---|---|
| `wa_pro_handle_message` | `apps/mira/src/lib/webhook/handlers/b2b-admin-query.ts:50` | `{ p_phone, p_text }` |
| `wa_pro_anomaly_check` | `apps/mira/src/app/api/cron/mira-anomaly-check/route.ts:22` | `{ p_clinic_id }` |
| `wa_pro_inactivity_radar` | `apps/mira/src/app/api/cron/mira-inactivity-radar/route.ts:20` | `{ p_clinic_id }` |
| `wa_pro_daily_digest` | `apps/mira/src/app/api/cron/mira-daily-digest/route.ts:21` | `{ p_clinic_id }` |
| `wa_pro_birthday_alerts` | `apps/mira/src/app/api/cron/mira-birthday-alerts/route.ts:20` | `{ p_clinic_id }` |
| `wa_pro_evening_digest` | `apps/mira/src/app/api/cron/mira-evening-digest/route.ts:20` | `{ p_clinic_id }` |
| `wa_pro_followup_suggestions` | `apps/mira/src/app/api/cron/mira-followup-suggestions/route.ts:21` | `{ p_clinic_id }` |
| `wa_pro_pre_consult_alerts` | `apps/mira/src/app/api/cron/mira-preconsult-alerts/route.ts:22` | `{ p_clinic_id }` |
| `wa_pro_weekly_roundup` | `apps/mira/src/app/api/cron/mira-weekly-roundup/route.ts:20` | `{ p_clinic_id }` |
| `wa_pro_task_reminders` | `apps/mira/src/app/api/cron/mira-task-reminders/route.ts:21` | `{ p_clinic_id }` |

**Contratos de retorno:**
- `wa_pro_handle_message` → `jsonb { ok, intent, reply_text, intent_metadata }`
- demais (cron) → invocadas por `tryRpcText` em
  `apps/mira/src/lib/admin-dispatch.ts:81` que aceita `string`, `{text}` ou
  `{message}`. Logo, o contrato e: retornar `jsonb { ok, message }` ou texto puro.

---

## Etapa 2 · Definicoes em `db/migrations/` (clinicai-v2)

```
$ grep -ri "CREATE OR REPLACE FUNCTION public.wa_pro_" db/migrations/
(zero matches)
```

Nenhuma RPC `wa_pro_*` esta definida no monorepo `clinicai-v2`. Todas as
chamadas dependem de codigo que ja roda em prod (legado clinic-dashboard) ou
de RPCs que NAO EXISTEM EM LUGAR ALGUM.

---

## Etapa 3 · Diff (estado **antes** da mig 800-13)

| RPC | Chamada em (clinicai-v2) | Definida em (clinicai-v2) | Definida em prod legado | Status |
|---|---|---|---|---|
| `wa_pro_handle_message` | b2b-admin-query.ts | nao | sim (`p_phone, p_text`) | OK · prod |
| `wa_pro_anomaly_check` | cron route | nao | sim (`p_phone`) — nao serve | FALTA · assinatura incompativel |
| `wa_pro_inactivity_radar` | cron route | nao | sim (`p_phone`) — nao serve | FALTA · assinatura incompativel |
| `wa_pro_daily_digest` | cron route | nao | sim (`p_phone`) — nao serve | FALTA · assinatura incompativel |
| `wa_pro_birthday_alerts` | cron route | nao | sim (`p_phone`) — nao serve | FALTA · assinatura incompativel |
| `wa_pro_evening_digest` | cron route | nao | sim (`p_phone`) — nao serve | FALTA · assinatura incompativel |
| `wa_pro_followup_suggestions` | cron route | nao | sim (`p_phone`) — nao serve | FALTA · assinatura incompativel |
| `wa_pro_pre_consult_alerts` | cron route | nao | sim (`p_phone`) — nao serve | FALTA · assinatura incompativel |
| `wa_pro_weekly_roundup` | cron route | nao | sim (`p_phone`) — nao serve | FALTA · assinatura incompativel |
| `wa_pro_task_reminders` | cron route | nao | NAO existe nem em prod | FALTA · totalmente nova |

**Decisao Alden inferida** (cron em `apps/mira` recebe `clinicId` direto da
agenda multi-tenant via `mira_state`/`clinics` · nao tem phone na mao): as
RPCs canonicas na clinicai-v2 devem aceitar `p_clinic_id uuid`. A versao
legacy `(p_phone text)` em prod ainda e usada pelo dashboard, **nao vamos
mexer nela** — apenas criar uma 2a sobrecarga `(p_clinic_id uuid)`.

**Sobre `wa_pro_handle_message`:**
- Atualmente em prod com assinatura `(p_phone text, p_text text)`.
- Chamada do clinicai-v2 passa `{ p_phone, p_text }` — **bate**.
- Auditoria: a versao em prod tem `SECURITY DEFINER` mas nem todas as
  iteracoes setam `search_path = public, extensions, pg_temp` explicito (varias
  setam apenas `search_path = public`). Esse e um debito conhecido do
  clinic-dashboard, nao do monorepo. Esta auditoria NAO recria essa funcao
  pra evitar regredir comportamento em prod (esta fora do escopo D1 do
  clinicai-v2). Tracker em `project_clinic_dashboard.md`.

**Sobre debitos de GRANT em prod legado:**
- `wa_pro_daily_digest(p_phone text)` em
  `clinic-dashboard/supabase/migrations/20260666000000_mira_proactive.sql:121`
  faz `GRANT EXECUTE ... TO authenticated, anon` — `anon` em RPC mutavel e
  uma violacao. Mas estamos auditando o monorepo clinicai-v2 e essa funcao
  vive no projeto antigo (debito documentado, fora de escopo D1).

---

## Etapa 4 · Acao corretiva

Migration `20260800000013_clinicai_v2_wa_pro_rpcs_audit.sql` (+ `.down.sql`)
cria 9 sobrecargas com assinatura `(p_clinic_id uuid)`, todas seguindo
o contrato canonico:

```sql
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
```

Permissoes uniformes:

```sql
REVOKE EXECUTE ON FUNCTION public.wa_pro_xxx(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wa_pro_xxx(uuid) TO service_role, authenticated;
```

(`authenticated` mantido pra futura UI admin que use a sessao do dashboard
chamar as RPCs via PostgREST · nao e mutavel critica por ser leitura
agregada · mas o `anon` fica revogado.)

Todas retornam `jsonb { ok, message, ... }` — compativel com `tryRpcText`
no monorepo.

Sanity check no fim da migration confirma criacao das 9 funcoes via
`pg_proc` + `information_schema.role_routine_grants`.

`NOTIFY pgrst, 'reload schema';` no fim.

`.down.sql` faz `DROP FUNCTION IF EXISTS` das 9 sobrecargas (sem afetar
versoes `(p_phone text)` em prod legado).

**Implementacao das RPCs:** skeletons defensivos · usam apenas tabelas
canonicas (`appointments`, `leads`, `clinics`) com `COALESCE` e guards de
schema · degradam para mensagem amigavel se nao houver dado. Nao e logica
duplicada do clinic-dashboard · e a versao multi-tenant minima viavel (MVP)
que substitui o fallback legado em cada cron route.

---

## Etapa 5 · Numeros finais

- **RPCs mapeadas:** 10
- **RPCs criadas (mig 800-13):** 9
- **RPCs corrigidas (debito GRANT/search_path no monorepo):** 0 (nao havia
  RPC `wa_pro_*` no monorepo · todos os debitos de prod legado ficam
  rastreados em `clinic-dashboard` separado)
- **RPC nao tocada:** 1 (`wa_pro_handle_message` · ja em prod, contrato bate)

---

## Apendice A · Notas pra D2

- Migrar `wa_pro_handle_message` pra `clinicai-v2/db/migrations/` com
  `search_path = public, extensions, pg_temp` explicito vai exigir uma janela
  de mudanca em prod (recriar a funcao zera EXECUTE em sessoes ativas).
  Nao agendar em D1.
- Os fallbacks em `apps/mira/src/app/api/cron/mira-*/route.ts` (linhas pos
  `tryRpcText`) podem ser removidos depois que mig 800-13 estiver aplicada
  e estavel em prod por uma semana.
- `wa_pro_task_reminders` e a unica RPC totalmente nova · ela depende de
  uma tabela `tasks` que ainda nao foi modelada. A versao desta migration
  retorna mensagem placeholder "sem tarefas pendentes" ate que a feature
  exista (defensivo).
