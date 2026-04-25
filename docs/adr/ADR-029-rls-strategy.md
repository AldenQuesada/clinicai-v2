# ADR-029 · Estratégia padronizada de RLS multi-tenant

- Status: ACCEPTED · 2026-04-25
- Contexto: ADR-028 (multi-tenant inegociável) · auditoria pós-incidente clinic-dashboard onde `clinic_data` tinha policies abertas (`USING (true)`) e o "secret" era teatro de segurança.
- Consequência: TODA migration nova precisa seguir esse ADR. PRs que violem são bloqueadas.

---

## 1 · Princípio canônico

Toda tabela com coluna `clinic_id` é considerada **multi-tenant**. Isolamento entre clínicas é responsabilidade exclusiva do banco — **NUNCA** confiar no client (frontend pode mentir; só JWT assinado é fonte de verdade).

A fonte autoritativa do tenant atual é a claim `app_metadata.clinic_id` do JWT, populada pelo Supabase Auth Custom Access Token Hook (mig 800-05). Em código SQL acessamos via:

```sql
(auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid
```

Helper recomendado (vem de clinic-dashboard, compartilhamos o mesmo Supabase project):

```sql
public.app_clinic_id()  -- retorna o uuid da claim, NULL se ausente
```

### 1.1 Pré-requisito: `clinic_members` e fallback

O hook `custom_access_token_hook` (mig 800-05) tenta `clinic_members(user_id, clinic_id, role)` primeiro · se não existir, cai pro `_default_clinic_id()` (single-tenant atual: clínica Mirian).

`clinic_members` ainda **não foi criada no clinicai-v2** — débito explícito P2. Quando multi-tenant for ativado de fato, criar a tabela com PK composta `(user_id, clinic_id)` + flag `active boolean` + flag `is_primary boolean` + RLS ENABLED com policy `auth.uid() = user_id`.

---

## 2 · Contrato obrigatório · checklist antes de merge

| # | Regra | Como validar |
|---|---|---|
| 1 | Coluna `clinic_id uuid NOT NULL DEFAULT public._default_clinic_id()` em toda tabela tenant-scoped | grep no diff |
| 2 | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` na mesma migration | sanity DO $$ checa `pg_class.relrowsecurity` |
| 3 | 4 policies separadas (SELECT/INSERT/UPDATE/DELETE) **OU** documentação explícita de quais operações são service_role-only | code review |
| 4 | Toda policy filtra por `clinic_id = public.app_clinic_id()` (helper) ou `(auth.jwt() -> 'app_metadata' ->> 'clinic_id')::uuid` (cru) | grep `USING (true)` deve dar 0 |
| 5 | `REVOKE SELECT ON … FROM anon` no fim da migration | code review |
| 6 | `.down.sql` pareado · NOTIFY pgrst · sanity DO $$ | regra GOLD #5/#7/#10 |
| 7 | Sem `GRANT ... TO anon` exceto se tabela for **legitimamente pública** (e nesse caso precisa justificativa em comentário SQL) | code review |

---

## 3 · Template canônico · COPIAR ISSO

```sql
-- ── Tabela ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.<TABLE> (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid        NOT NULL DEFAULT public._default_clinic_id(),
  -- … colunas …
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ENABLED ─────────────────────────────────────────────────────────
ALTER TABLE public.<TABLE> ENABLE ROW LEVEL SECURITY;

-- ── Policies tenant-scoped ──────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_select_<TABLE> ON public.<TABLE>;
CREATE POLICY tenant_isolation_select_<TABLE> ON public.<TABLE>
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS tenant_isolation_insert_<TABLE> ON public.<TABLE>;
CREATE POLICY tenant_isolation_insert_<TABLE> ON public.<TABLE>
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS tenant_isolation_update_<TABLE> ON public.<TABLE>;
CREATE POLICY tenant_isolation_update_<TABLE> ON public.<TABLE>
  FOR UPDATE TO authenticated
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS tenant_isolation_delete_<TABLE> ON public.<TABLE>;
CREATE POLICY tenant_isolation_delete_<TABLE> ON public.<TABLE>
  FOR DELETE TO authenticated
  USING (clinic_id = public.app_clinic_id());

-- ── Grants mínimos ──────────────────────────────────────────────────────
REVOKE ALL ON public.<TABLE> FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<TABLE> TO authenticated;
GRANT ALL ON public.<TABLE> TO service_role;
```

---

## 4 · Quando service_role bypass é OK · quando NÃO é

`service_role` automaticamente faz BYPASS RLS no Supabase (postgres role com `BYPASSRLS`). Isso é normal e desejado em:

| Caller | Bypass OK? | Por quê |
|---|---|---|
| Cron workers (apps/mira/api/cron/*) | SIM | rodam sem JWT de user · precisam ler/escrever cross-clinic eventualmente |
| Webhooks externos (Evolution, Meta, Stripe) | SIM | source-of-truth não é user · payload externo |
| RPCs `SECURITY DEFINER` que validam clinic_id internamente | SIM | a RPC vira o boundary de segurança |
| Migrations / scripts admin | SIM | privileged ops |
| **Frontend Next.js Server Actions** | **NÃO** | NUNCA usar service_role no path de request de user · sempre cliente Supabase com JWT + RLS |
| **Lara/Mira inbound handlers** após auth | DEPENDE | se já temos `clinic_id` validado, ok service_role com WHERE clinic_id explícito; senão use cliente impersonado |

**Regra de ouro:** se o caller tem JWT de user → use cliente Supabase do user e deixe RLS filtrar. Se for backend sem JWT → service_role + WHERE clinic_id manual obrigatório (defense-in-depth).

---

## 5 · Como auditar (query pronta pra rodar em prod)

```sql
-- Lista tabelas com clinic_id mas sem RLS habilitada · DEVE retornar 0 linhas
SELECT
  t.schemaname,
  t.tablename,
  c.relrowsecurity AS rls_enabled
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.schemaname
WHERE t.schemaname = 'public'
  AND EXISTS (
    SELECT 1 FROM information_schema.columns col
     WHERE col.table_schema = t.schemaname
       AND col.table_name = t.tablename
       AND col.column_name = 'clinic_id'
  )
  AND c.relrowsecurity = false;

-- Lista policies suspeitas (USING TRUE / WITH CHECK TRUE) em tabelas com clinic_id
-- DEVE retornar 0 (exceto exceções service_role-only documentadas)
SELECT
  schemaname, tablename, policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    SELECT table_name FROM information_schema.columns
     WHERE column_name = 'clinic_id' AND table_schema = 'public'
  )
  AND (qual = 'true' OR with_check = 'true' OR qual IS NULL);

-- Lista tabelas com clinic_id que ainda concedem SELECT pro role anon
-- DEVE retornar 0 linhas
SELECT
  table_schema, table_name, privilege_type, grantee
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
  AND table_name IN (
    SELECT table_name FROM information_schema.columns
     WHERE column_name = 'clinic_id' AND table_schema = 'public'
  );
```

---

## 6 · Anti-padrões PROIBIDOS

1. ❌ `CREATE POLICY foo ON x FOR ALL USING (true) WITH CHECK (true);` — proibido em qualquer tabela com `clinic_id`. Se quer "service_role only", **não crie policy** (RLS sem policy bloqueia tudo · service_role bypassa via privilégio); ou crie `USING (false)` explícito.
2. ❌ `clinic_id = '00000000-…'::uuid` literal hardcoded em policy — proibido pelo checklist de segurança da memória do Alden. Use sempre `app_clinic_id()` ou claim do JWT.
3. ❌ `GRANT SELECT … TO anon` em tabelas com `clinic_id` — anon NUNCA tem leitura tenant-scoped (mesmo com RLS, defense-in-depth via REVOKE).
4. ❌ `SECURITY DEFINER` RPC sem `SET search_path = public, extensions, pg_temp` — vetor de privilege escalation.
5. ❌ Qualquer policy nova que não use `auth.jwt() -> 'app_metadata' ->> 'clinic_id'` ou `app_clinic_id()` — não tem outra forma legítima de saber o tenant atual.

---

## 7 · Exceções legítimas (documentadas)

Tabelas que **NÃO** precisam de `clinic_id` por design:

| Tabela | Justificativa |
|---|---|
| `clinics` | Master data · cada linha É uma clínica · policies filtram por `id = app_clinic_id()` em vez de `clinic_id` |
| `clinic_members` (futura) | Junction user×clinic · policy filtra por `auth.uid() = user_id` |
| `_default_clinic_id()` source | Função, não tabela |
| `mira_conversation_state` | State machine por `phone` (não por user/tenant) · service_role-only · em multi-tenant futuro adicionar `clinic_id` |
| `webhook_processing_queue` | Tem `clinic_id` (default `_default_clinic_id`) mas worker é service_role · authenticated NÃO acessa · pode ter policy `USING (false)` ou simplesmente sem policy |
| `b2b_voucher_dispatch_queue` | Mesmo padrão · service_role-only |

Nessas tabelas service_role-only o padrão correto é:

```sql
ALTER TABLE public.<TABLE> ENABLE ROW LEVEL SECURITY;
-- SEM policy pra authenticated · qualquer SELECT/INSERT/UPDATE/DELETE de authenticated retorna 0 linhas
-- service_role bypassa por privilégio do role
REVOKE ALL ON public.<TABLE> FROM anon, authenticated, public;
GRANT ALL ON public.<TABLE> TO service_role;
```

---

## 8 · Migration corretiva

Mig `20260800000014_clinicai_v2_rls_audit.sql` aplica retroativamente:

- `mira_conversation_state` · troca `USING (true)` por nada (revoga grants pra authenticated/anon)
- `b2b_voucher_dispatch_queue` · troca `USING (true)` por policies tenant-scoped + service_role-only revoke
- `webhook_processing_queue` · troca `USING (true)` por policies tenant-scoped + service_role-only revoke
- `inbox_notifications` · adiciona REVOKE explícito FROM anon
- `_ai_budget` · adiciona REVOKE explícito FROM anon

Detalhes: ver `db/migrations/20260800000014_clinicai_v2_rls_audit.sql`.

---

## 9 · Auditoria · resultados 2026-04-25

Ver `docs/audits/2026-04-25-rls-audit.md`.
