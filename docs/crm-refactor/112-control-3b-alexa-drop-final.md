# CRM_PHASE_CONTROL.3B · Alexa drop final controlado (Trilha A · migration local)

> Trilha A. Migration `db/migrations/20260800000181_clinicai_v2_control3b_alexa_drop_final.sql`
> criada localmente · **NÃO APLICADA**. Drop minimalista: `clinic_alexa_log`
> (vazia, 0 deps) + `get_alexa_config()` + `upsert_alexa_config(...)` (sem
> callers via `pg_depend` · grants `authenticated`/`anon` já zerados em mig 179).

---

## 1 · Objetivo

Preparar a migração final controlada para remover apenas os 3 objetos Alexa
remanescentes que são comprovadamente seguros para drop. Demais objetos
Alexa com dados (config · devices · colunas em tabelas vivas) permanecem
preservados. Nenhum apply nesta fase.

---

## 2 · Contexto

- CONTROL.2 (mig 179) revogou `authenticated` EXECUTE das RPCs Alexa e
  dropou 3 orphan trigger functions.
- CONTROL.3 (doc 111) confirmou: sistema sano · zero zombie runtime · grants
  zerados · 5 objetos Alexa remanescentes documentados, classificação por
  objeto registrada.
- Esta fase fecha o "tail" seguro do trabalho de cleanup Alexa.

---

## 3 · Objetos candidatos · safe-drop confirmado

### 3.1 `public.clinic_alexa_log`

| Métrica | Valor |
|---|---|
| Existe | sim |
| Rows | **0** |
| RLS | enabled |
| Policies | 0 |
| Triggers | 0 |
| FKs in (apontando para a tabela) | 0 |
| FKs out (saindo da tabela) | 1 (referencia outra · não afetada por DROP) |
| Dependentes em `pg_depend` (excluindo i/a/n) | 0 |

→ **DROP_SAFE**.

### 3.2 `public.get_alexa_config()`

| Métrica | Valor |
|---|---|
| Assinatura | `get_alexa_config()` (zero args) |
| Retorno | `jsonb` |
| Callers via `pg_depend` | 0 |
| Grants `authenticated` / `anon` | 0 (mig 179 revogou) |
| Grants ativos | `postgres`, `service_role` |
| Cron refs | 0 |

→ **DROP_SAFE**.

### 3.3 `public.upsert_alexa_config(...)`

| Métrica | Valor |
|---|---|
| Assinatura identity (para DROP) | `p_webhook_url text, p_reception_device_name text, p_welcome_template text, p_room_template text, p_is_active boolean, p_auth_token text` |
| Retorno | `jsonb` |
| Callers via `pg_depend` | 0 |
| Grants `authenticated` / `anon` | 0 |
| Cron refs | 0 |

→ **DROP_SAFE**.

---

## 4 · Objetos preservados (NÃO TOCAR)

| Objeto | Por quê preservado |
|---|---|
| `public.clinic_alexa_config` | 1 row · configuração da clínica · KEEP_FOR_ROLLBACK |
| `public.clinic_alexa_devices` | 5 rows · devices registrados · KEEP_FOR_ROLLBACK |
| `public.clinic_rooms.alexa_device_name` | coluna em tabela viva · DROP exige fase dedicada |
| `public.wa_agenda_automations.alexa_message` | tabela com 93 rows · risco em UI/automações |
| `public.wa_agenda_automations.alexa_target` | idem |

---

## 5 · Dependências / runtime refs (preflight)

**Banco** (via `pg_depend`):
- `clinic_alexa_log`: 0 dependentes externos.
- `get_alexa_config` / `upsert_alexa_config`: 0 callers (procura `pg_depend` com classid=`pg_proc`).
- 0 cron jobs com referência a `clinic_alexa_log` / `get_alexa_config` / `upsert_alexa_config`.

**Código TypeScript**:
- 0 refs ativos em `apps/lara/src` (Next.js).
- 0 refs em `packages/*` exceto `packages/supabase/src/types.ts` (auto-gerado pelo `pnpm db:types` · sem efeito runtime se objetos sumirem).

**Código legacy estático** (`apps/lara/public/legacy/`):
- `js/services/alexa-notification.service.js` referencia `get_alexa_config` e `upsert_alexa_config` via RPC.
- **Mas:** zero HTML servido (`anamnese.html`, `form-render.html`) carrega esse script · não há `<script src=...>` apontando para ele.
- Mesmo se carregasse, falha silenciosa (RPC 404) · não derruba app Next.js.

---

## 6 · Decisão

**Trilha A** · migration local pronta · não aplicada.

Razões:
- 3 objetos têm zero dependência real;
- safety green (worker71_off, wa_outbox=0, hard gate intacto);
- migration é pequena (3 statements), idempotente (`IF EXISTS`) e **sem CASCADE**.

---

## 7 · Migration (criada local)

`db/migrations/20260800000181_clinicai_v2_control3b_alexa_drop_final.sql`

```sql
DROP TABLE IF EXISTS public.clinic_alexa_log;

DROP FUNCTION IF EXISTS public.get_alexa_config();

DROP FUNCTION IF EXISTS public.upsert_alexa_config(
  p_webhook_url text,
  p_reception_device_name text,
  p_welcome_template text,
  p_room_template text,
  p_is_active boolean,
  p_auth_token text
);
```

Notas:
- Sem `CASCADE`. Se alguma dependência inesperada surgir (ex.: alguém criar
  um trigger usando essas funções entre agora e o apply), a migration **deve
  falhar** com erro claro, não silenciar.
- Sem `.down.sql` automático · rollback é receita documentada em
  [rollback-notes/20260800000181_clinicai_v2_control3b_alexa_drop_final.md](../database/rollback-notes/20260800000181_clinicai_v2_control3b_alexa_drop_final.md).

---

## 8 · Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Algum cliente externo (não-Next.js) chama `get_alexa_config` via RPC | baixíssimo | grants `authenticated`/`anon` já zerados em mig 179 · só `service_role` poderia chamar |
| Auto-gen typegen quebrar no `pnpm db:types` pós-apply | baixíssimo | tipos somem do `packages/supabase/src/types.ts` na próxima regeneração · zero código TS importa |
| Surge dependência nova entre agora e apply | improvável | `IF EXISTS` + sem CASCADE = falha clara · não corrompe |

---

## 9 · Instruções de apply futuro

Quando autorizado por `CRM_PHASE_CONTROL.3B_APPLY`:

```powershell
$env:SUPABASE_ACCESS_TOKEN="sbp_..."
node scripts/apply-migration.mjs `
  db/migrations/20260800000181_clinicai_v2_control3b_alexa_drop_final.sql
```

Depois:
1. Registrar tracker em `supabase_migrations.schema_migrations` (padrão repo · mesmo registry usado em mig 178/179/180).
2. Re-rodar `phase-control-3b-alexa-drop-final-validation.sql` · flags esperados:
   - `clinic_alexa_log_exists_remote`: false
   - `get_alexa_config_exists_remote`: false
   - `upsert_alexa_config_exists_remote`: false
   - `kept_alexa_tables_with_data_count`: 6 (preservado)
3. (Opcional) `pnpm db:types` para refletir mudança em typegen.

---

## 10 · Validações executadas nesta fase

| Validation | Resultado |
|---|---|
| `git diff --check` | sem warnings (apenas CRLF auto) |
| SQL pre-apply validation `phase-control-3b-alexa-drop-final-validation.sql` | final_flags green |

Validation flags pre-apply chave:

- `worker71_off`: true
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `cron_with_provider_call`: 0
- `hard_gate_untouched`: true
- `clinic_alexa_log_exists_remote`: true (esperado · não aplicado)
- `clinic_alexa_log_rows`: 0
- `get_alexa_config_exists_remote`: true (esperado)
- `upsert_alexa_config_exists_remote`: true (esperado)
- `alexa_authenticated_execute_grants`: 0
- `alexa_runtime_refs_expected_zero`: 0
- `kept_alexa_tables_with_data_count`: 6 (1 config + 5 devices)
- `migration_created_not_applied`: true
- **`can_continue`: true**

**Typecheck não executado:** zero código TypeScript foi alterado nesta fase
· apenas SQL + docs criados.

---

## 11 · Próximos passos

- **`CRM_PHASE_CONTROL.3B_APPLY`** quando autorizado · aplicar a migration 181 e re-validar.
- Depois disso, options:
  - `CRM_PHASE_APPOINTMENT_PROCEDURE_FK`: aplicar `PROPOSED_appointments_procedure_fk.sql`
  - `CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT`: destravar `medical_record_attachments`
  - `2L.2.1 / 2L.3 · Meta/WhatsApp real` quando dependências externas liberarem

---

## 12 · Veredito

**PASS_CRM_CONTROL3B_ALEXA_DROP_READY_LOCAL_COMMIT**

- Migration local pronta · 3 objetos Alexa órfãos (`clinic_alexa_log`, `get_alexa_config`, `upsert_alexa_config`)
- Rollback note documentada
- Validation green · zero risco residual identificado
- Tabelas com dados preservadas (config + devices)
- Hard gate clínico intacto · job 71 OFF · zero wa_outbox · zero provider
- Sem aplicar · sem db push · sem deploy
- Aguardando autorização para `git push origin main`
