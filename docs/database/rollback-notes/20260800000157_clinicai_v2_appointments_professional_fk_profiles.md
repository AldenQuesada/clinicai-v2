# Rollback Note · Mig 157 · appointments professional FK → profiles

**Migration:** `20260800000157_clinicai_v2_appointments_professional_fk_profiles.sql`
**Tipo:** CIRÚRGICA · forward-only · 1 backfill defensivo + DROP/ADD FK + sanity DO
**Data alvo de apply:** TBD (Fase 2D.3F.2 · controlado · review prévio do SQL)
**Project ref:** `oqboitkpcvuaudouwvkl`

---

## 1 · Objetivo

Corrigir drift histórico entre FK declarada e uso real:

- FK atual: `appointments.professional_id_fkey → app_users(id)` ON DELETE SET NULL
- Helper `_appt_professional_phone(record)` lê em `professional_profiles(id)`
- Writers reais (`appt_upsert` legacy, `AppointmentRepository.create` TS, RPC `lead_to_appointment`) gravam `professional_profiles.id`
- `app_users` tem 1 row (`33333333-...`) sem entry equivalente em `professional_profiles`
- `professional_profiles` tem 1 row (`06757b9f-...`) sem entry equivalente em `app_users`

Resultado: qualquer write futuro com `professional_id = professional_profiles.id` viola FK. Job 72 não pode ser religado.

---

## 2 · Mudanças

### 2.1 · Backfill defensivo

```sql
UPDATE public.appointments a
   SET professional_id = NULL,
       updated_at      = now()
 WHERE a.professional_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
     FROM public.professional_profiles pp
     WHERE pp.id = a.professional_id
   );
```

**Esperado em prod (auditoria 2D.3E):** 1 row afetada (`matches_app_users_only = 1`). Outras 2 rows com `professional_id IS NULL` permanecem inalteradas.

### 2.2 · Troca de FK

```sql
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_professional_id_fkey;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_professional_id_fkey
  FOREIGN KEY (professional_id)
  REFERENCES public.professional_profiles(id)
  ON DELETE SET NULL;
```

### 2.3 · Sanity DO block

Aborta apply (`RAISE EXCEPTION`) se:
- Sobrar appointment com `professional_id` órfão vs `professional_profiles`
- FK nova não existe
- FK nova não referencia `professional_profiles`
- `professional_id` ficar NOT NULL (regressão)

---

## 3 · O que NÃO mudou

- `_appt_professional_phone(record)` · já está alinhada com `professional_profiles.id` · zero alteração
- `_agenda_alert_min_before_tick()` / `_enqueue_agenda_alert()` (mig 156)
- `wa_daily_summary()` (mig 155)
- `_render_appt_template()` (mig 154)
- `appt_upsert` / `appt_sync_batch` / `_appt_upsert_one` (mig 153)
- `lead_to_appointment` / `appointment_attend` / `appointment_finalize` / `appointment_change_status`
- `cron.job` 12/71/72 (12 ativo · 71/72 desligados continuam desligados)
- Schema de `wa_outbox` / `leads` / `patients` / `clinics` / `professional_profiles`
- TS Lara v2 (`apps/lara/src/`)

---

## 4 · Por que esta abordagem (decisão Alden)

| Alternativa descartada | Motivo |
|---|---|
| Alterar `_appt_professional_phone` para fallback `app_users → professional_profiles via user_id` | Patch frágil · não corrige writers · esconde drift em vez de resolver |
| Criar row fake em `app_users` para "casar" o `06757b9f-...` | Persistência indevida sem semântica real |
| Criar row fake em `professional_profiles` para "casar" o `33333333-...` | Idem |
| Backfill por `professional_name` (matching textual) | Auditoria mostrou `can_match_profile_by_name = 0` · não há match |
| Tornar `professional_id NOT NULL` | Fora do escopo · introduz risco em writers existentes |

Estratégia escolhida: **trocar a FK** + **backfill defensivo mínimo** + **manter helper inalterado**.

---

## 5 · Como aplicar pós-revisão (Fase 2D.3F.2)

```bash
# 1. Comparar SQL atual (READ-ONLY)
SELECT
  c.conname,
  pg_get_constraintdef(c.oid),
  rt.relname AS target_table
FROM pg_constraint c
JOIN pg_class rt ON rt.oid = c.confrelid
WHERE c.conrelid = 'public.appointments'::regclass
  AND c.conname = 'appointments_professional_id_fkey';

# 2. Apply via Management API
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000157_clinicai_v2_appointments_professional_fk_profiles.sql

# 3. Repair tracker
mkdir -p supabase/migrations
: > supabase/migrations/20260800000157_repair_marker.sql
SUPABASE_ACCESS_TOKEN=sbp_... supabase migration repair --status applied 20260800000157
rm -rf supabase/migrations

# 4. Validation
#    scripts/validation/20260800000157_validate_appointments_professional_fk_profiles.sql
```

Pós-apply, o smoke 2D.3D.1 pode ser refeito (criando appointment fixture com `professional_id = professional_profiles.id`) e dessa vez deve passar.

---

## 6 · Riscos do apply

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Backfill marca appts válidos como NULL | Aceito · auditoria confirma 1 row afetada · ela já era "órfã" via FK certa | Validação confirma que professional_name preservado (snapshot) · UI continua mostrando o nome do profissional |
| Drop CONSTRAINT bloqueia em waitlock | Muito baixa | `CREATE OR REPLACE` atômico · DDL em tabela com 3 rows · ~ms |
| FK nova bloqueia writes futuros legitimos | Nenhuma | UI/legacy/TS já gravam `professional_profiles.id` |
| Cron 12 (daily-agenda-summary) roda durante apply | Muito baixa | Apply em segundos · scheduled 11:00 UTC |
| Sanity DO falha (defesa em profundidade) | Muito baixa | Aborta apply · rollback automático |

---

## 7 · Down NO-OP defensivo

`.down.sql` apenas `RAISE NOTICE`. Rollback exige forward migration nova porque:
- Restaurar FK para `app_users(id)` reintroduziria o drift
- Não há como restaurar `professional_id` antigos setados para NULL pelo backfill

---

## 8 · Confirmações negativas (estado da prep)

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API mutativa (mig prep · nem SELECT pg_get_functiondef foi necessário porque a auditoria 2D.3E já capturou tudo)
- ❌ Zero deploy
- ❌ Zero cron change · jobs 12/71/72 inalterados
- ❌ Zero job activation
- ❌ Zero execução de funções mutativas
- ❌ Zero `wa_outbox` insert
- ❌ Zero `agenda_alerts_log` insert
- ❌ Zero WhatsApp/Evolution send
- ❌ Zero alteração TS/app code
- ❌ Zero alteração em `_appt_professional_phone` / `_enqueue_agenda_alert` / `_agenda_alert_min_before_tick`
- ❌ Zero criação de app_user fake / professional_profile fake / lead institucional
- ❌ Zero backfill amplo (apenas o estritamente necessário)
- ❌ Zero ação sobre monitoramento `2986→7773` nesta fase
- ❌ Zero commit em git (commit feito apenas após review)

---

## 9 · Histórico

- **2026-05-11:** Mig 157 PREPARADA via Fase 2D.3F · sem apply
- **Baseado em:** auditoria read-only 2D.3E (5 perguntas respondidas · backfill summary final consolidado)
- **Próximo:** review SQL no chat → Fase 2D.3F.2 apply controlado → validation
