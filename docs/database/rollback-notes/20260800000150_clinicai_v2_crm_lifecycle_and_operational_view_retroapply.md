# Rollback Note · Migration 20260800000150 · CRM lifecycle + crm_operational_view retroapply

> Data: 2026-05-10
> Tipo: **retroapply / idempotente**
> Risco de rollback automático: **ALTO**

---

## Natureza desta migration

Esta migration NÃO introduziu estruturas novas no banco de produção. Ela **versionou o estado que já existia em prod** desde algum momento anterior, aplicado fora do path versionado (provavelmente via Supabase Studio).

Estruturas envolvidas:

- Colunas em `public.leads`:
  - `lifecycle_status text NOT NULL DEFAULT 'ativo'`
  - `lost_from_phase text NULL`
  - `archived_at timestamptz NULL`
  - `archived_reason text NULL`
- CHECK constraints:
  - `chk_leads_phase` (4 valores)
  - `chk_leads_lifecycle_status` (4 valores)
  - `chk_leads_lost_from_phase` (4 valores + NULL)
  - `chk_leads_lost_consistency` (validação de coerência via `lifecycle_status`)
- View:
  - `public.crm_operational_view` (REGULAR view · 17 colunas · derivação de `mesa_operacional`/`has_active_budget`/`is_no_show`)

**Em prod no momento da aplicação:** estruturas já presentes · migration foi efetivamente no-op (ALTER ADD COLUMN IF NOT EXISTS · DROP+CREATE de CONSTRAINTS idênticas · CREATE OR REPLACE VIEW com a mesma definition).

**Em dev/preview/novos ambientes:** migration cria do zero. Comportamento esperado: schema fica alinhado com prod.

---

## Por que o `.down.sql` é defensivo (NO-OP)

Reverter esta migration automaticamente em prod **quebraria o runtime** porque:

1. **Frontend Lara v2 depende da view.** `crm_operational_view` é consumida por hooks e Server Actions (`/api/secretaria/kpis`, `apps/lara/src/app/(authed)/secretaria/`, futuras mesas em `apps/lara/src/app/crm/`). Drop = telas quebram.

2. **CHECK constraints v2 são o contrato vivo.** Reverter para o `chk_leads_phase` antigo (7 valores incluindo `compareceu/reagendado/perdido`) é regredir o contrato. Callers que assumem 4 phases (RPCs `lead_recovery_activate`, `lead_archive` quando criada, etc) ficam inconsistentes.

3. **Colunas têm dados.** `lifecycle_status` tem NOT NULL · qualquer DROP exige reescrever queries e desfazer NOT NULL. Risk de NULL injection.

4. **`is_in_recovery` boolean ainda existe como legado.** Drop de `lifecycle_status` ressuscita a dualidade que estávamos consolidando.

Por isso, o `.down.sql` apenas emite `RAISE NOTICE` informando que rollback automático não é seguro · não toca em nada.

---

## Rollback manual (se realmente necessário)

### Cenário A · Reverter constraints (mais simples · raro)

Útil se um ambiente antigo ainda precisa aceitar 7 phases temporariamente (ex: migração de dados legado vinda de clinic-dashboard v1).

```sql
-- ATENÇÃO: só fazer com revisão explícita do Alden + backup recente

BEGIN;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS chk_leads_phase;
ALTER TABLE public.leads
  ADD CONSTRAINT chk_leads_phase
  CHECK (phase = ANY (ARRAY[
    'lead', 'agendado', 'reagendado', 'compareceu',
    'paciente', 'orcamento', 'perdido'
  ]));

-- (não dropar lifecycle_status · cf. cenário B)

COMMIT;
```

### Cenário B · Reverter colunas (perigoso · não recomendado)

```sql
-- ⚠️ PERIGOSO · só em ambiente shadow/desenvolvimento
-- Antes: snapshot Supabase Point-in-time Recovery (Dashboard > Database > Backups)

BEGIN;

ALTER TABLE public.leads DROP COLUMN IF EXISTS archived_reason;
ALTER TABLE public.leads DROP COLUMN IF EXISTS archived_at;
ALTER TABLE public.leads DROP COLUMN IF EXISTS lost_from_phase;
ALTER TABLE public.leads DROP COLUMN IF EXISTS lifecycle_status;

-- Restaurar chk_leads_lost_consistency baseado em phase (legado)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS chk_leads_lost_consistency;
ALTER TABLE public.leads
  ADD CONSTRAINT chk_leads_lost_consistency
  CHECK ((phase <> 'perdido') OR (phase = 'perdido' AND lost_reason IS NOT NULL));

-- ⚠️ ATENÇÃO: crm_operational_view referencia lifecycle_status e lost_from_phase
-- → DROP automático da view ANTES dos colunas (pode quebrar telas)
DROP VIEW IF EXISTS public.crm_operational_view;

COMMIT;
```

**Riscos do cenário B:**
- Telas Lara v2 que consomem `crm_operational_view` retornam 500
- Smart Replies / Copilot perdem contexto de `lifecycle_status`
- RPCs `lead_lost`/`lead_recovery_activate` quebram (referenciam coluna inexistente)
- Audit em `phase_history` perde rastro de mudanças de lifecycle

**Não aplicar B sem:**
1. Snapshot point-in-time recente (Supabase Dashboard)
2. Aprovação explícita do Alden
3. Cutover prévio das telas que dependem da view

### Cenário C · Restore via point-in-time (último recurso)

Se algo crítico quebrar:

1. **Supabase Dashboard → Database → Backups → Restore Point**
2. Selecionar instante anterior à aplicação (retention: 7 dias free / 30 dias Pro)
3. Confirmar restore
4. Reaplicar migrations posteriores manualmente se necessário

---

## Critério de aceitação pós-aplicação

A migration é considerada aplicada com sucesso se:

```sql
-- 1. Colunas existem
SELECT count(*) FROM information_schema.columns
WHERE table_name = 'leads'
  AND column_name IN ('lifecycle_status', 'lost_from_phase', 'archived_at', 'archived_reason');
-- Esperado: 4

-- 2. Constraints existem e batem com o contrato
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.leads'::regclass
  AND conname IN ('chk_leads_phase', 'chk_leads_lifecycle_status', 'chk_leads_lost_from_phase', 'chk_leads_lost_consistency');
-- Esperado: 4 rows

-- 3. View existe e é REGULAR (não materialized)
SELECT relkind FROM pg_class
WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND relname = 'crm_operational_view';
-- Esperado: 'v'

-- 4. View retorna rows (paridade com pré-aplicação · prod tinha 118)
SELECT count(*) FROM public.crm_operational_view;
-- Esperado: igual ao count pré-aplicação (em prod hoje: 118)
```

---

## Riscos identificados na aplicação

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Constraint vira mais estrita e rejeita row pré-existente | Baixa (probe P6 confirma zero rows com phase legado) | Pre-check `SELECT phase, count(*) FROM leads GROUP BY phase` antes de aplicar |
| DROP+CREATE da view causa lock breve em queries simultâneas | Baixa | `CREATE OR REPLACE VIEW` é atomic · sem janela de view inexistente |
| Caller usa `lifecycle_status` com NULL implicitamente | Baixa | Default `'ativo'` cobre · NOT NULL não afeta SELECT |

---

## Histórico

- **2026-05-10:** Auditoria CRM Fase 0.5 (doc 13) confirma estruturas existentes
- **2026-05-10:** Migration retroapply criada como Fase 1A (esta migration)
- **PENDENTE:** apply explícito via `supabase db push` ou Studio quando Alden autorizar (não foi aplicada nesta sessão)

---

## Contatos

- ADR canônica: [`docs/crm-refactor/14-adr-single-table-operational-crm.md`](../../crm-refactor/14-adr-single-table-operational-crm.md)
- Audit DB: [`docs/crm-refactor/13-db-probes-current-v2-state.md`](../../crm-refactor/13-db-probes-current-v2-state.md)
- Risk register: [`docs/crm-refactor/09-risk-register.md`](../../crm-refactor/09-risk-register.md) (R-025)
