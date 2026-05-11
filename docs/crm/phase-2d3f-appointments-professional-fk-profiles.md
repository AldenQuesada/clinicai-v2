# Fase 2D.3F · appointments professional FK → profiles · PREP

> Preparação da mig 157 cirúrgica. **NÃO APLICADA.** Apply controlado fica
> para Fase 2D.3F.2 após review do SQL no chat.

---

## 1 · Resumo executivo

A FK `appointments.professional_id_fkey → app_users(id)` está em drift com o uso real (helper, legacy writer, TS novo e RPC gravam/leem `professional_profiles(id)`). Smoke transacional 2D.3D.1 ficou bloqueado por isso. Auditoria 2D.3E confirmou:

- 1 appointment com `professional_id` matcheando só `app_users(id)` (não `professional_profiles`)
- 2 appointments com `professional_id IS NULL`
- 0 órfãos
- 0 match por `professional_name` (fallback textual inviável)

Esta fase entrega 5 artefatos prontos para review:

1. Mig 157 forward (backfill defensivo + DROP/ADD FK + sanity DO)
2. Mig 157 down NO-OP defensivo
3. Rollback note completo
4. Validation SQL pós-apply (12 VALs read-only)
5. Este doc

**Sem apply. Sem SQL mutativo no banco. Sem deploy. Sem alteração TS Lara v2. Sem mexer em cron/funções/wa_outbox.**

---

## 2 · Mudanças na mig 157

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

**Esperado:** 1 row afetada (auditoria 2D.3E `matches_app_users_only=1`). Backfill **só toca rows que ficariam órfãs** sob a nova FK.

### 2.2 · Troca de FK

```diff
- FOREIGN KEY (professional_id) REFERENCES app_users(id)              ON DELETE SET NULL
+ FOREIGN KEY (professional_id) REFERENCES professional_profiles(id)  ON DELETE SET NULL
```

### 2.3 · Sanity DO block

Aborta apply se:
- Sobrar appointment com `professional_id` órfão vs `professional_profiles`
- FK nova não existe
- FK nova não referencia `professional_profiles`
- `professional_id` ficar NOT NULL (regressão indesejada)

### 2.4 · `NOTIFY pgrst, 'reload schema'`

---

## 3 · Resumo técnico (decisão Alden)

- **Backfill defensivo dos professional_id sem profile** (1 row esperada)
- **FK de appointments agora preparada para professional_profiles** (ON DELETE SET NULL)
- **Helper `_appt_professional_phone` NÃO alterado** (já alinhado com `professional_profiles.id`)
- **Nenhuma função tocada** (`_enqueue_agenda_alert`, `_agenda_alert_min_before_tick`, `wa_daily_summary`, `appt_*`, etc todas preservadas)
- **Nenhum schema de outra tabela alterado** (`professional_profiles.user_id` continua nullable · `app_users` intacto)

---

## 4 · Arquivos criados (working tree · sem commit)

| Arquivo | Tipo |
|---|---|
| [db/migrations/20260800000157_clinicai_v2_appointments_professional_fk_profiles.sql](../../db/migrations/20260800000157_clinicai_v2_appointments_professional_fk_profiles.sql) | Forward (backfill + DROP/ADD FK + sanity DO + NOTIFY) |
| [db/migrations/20260800000157_clinicai_v2_appointments_professional_fk_profiles.down.sql](../../db/migrations/20260800000157_clinicai_v2_appointments_professional_fk_profiles.down.sql) | Down NO-OP defensivo |
| [docs/database/rollback-notes/20260800000157_clinicai_v2_appointments_professional_fk_profiles.md](../database/rollback-notes/20260800000157_clinicai_v2_appointments_professional_fk_profiles.md) | Rollback note |
| [scripts/validation/20260800000157_validate_appointments_professional_fk_profiles.sql](../../scripts/validation/20260800000157_validate_appointments_professional_fk_profiles.sql) | 12 VALs read-only |
| Este doc | Prep |

---

## 5 · Static safety scan

| Padrão | Hits |
|---|---|
| `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `DELETE FROM` | 0 |
| `UPDATE cron.job` / `cron.schedule` / `cron.unschedule` | 0 |
| `UPDATE public.appointments` (esperado: backfill defensivo) | 1 (apenas SET `professional_id=NULL, updated_at=now()` com guard `NOT EXISTS professional_profiles`) |
| `ALTER TABLE ... DROP CONSTRAINT IF EXISTS` (esperado: drop FK velha) | 1 |
| `ALTER TABLE ... ADD CONSTRAINT ... REFERENCES public.professional_profiles` (esperado: FK nova) | 1 |
| Sanity DO block | 1 |

---

## 6 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Backfill mexe em rows válidas | Aceito · auditoria confirma 1 row · era órfã na FK certa | `professional_name` continua preservado · UI continua mostrando o nome |
| DDL bloqueia em waitlock | Muito baixa | Tabela tem 3 rows · DDL atômico em ~ms |
| FK nova bloqueia writes legítimos | Nenhuma | UI/legacy/TS já gravam `professional_profiles.id` |
| GRANT EXECUTE perdido | N/A (não toca funções) | — |
| Sanity DO block falha | Muito baixa | Defesa em profundidade · aborta apply |

---

## 7 · Como aplicar pós-revisão (Fase 2D.3F.2)

```bash
# 1. Comparar FK atual (READ-ONLY)
SELECT pg_get_constraintdef(c.oid), rt.relname
FROM pg_constraint c
JOIN pg_class rt ON rt.oid = c.confrelid
WHERE c.conrelid = 'public.appointments'::regclass
  AND c.conname  = 'appointments_professional_id_fkey';

# 2. Apply
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

Pós-apply, o smoke 2D.3D.1 pode ser refeito (criando appointment fixture com `professional_id = professional_profiles.id`) e dessa vez deve passar end-to-end.

---

## 8 · Confirmações negativas

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API mutativa (mig prep · zero acesso ao banco nesta fase)
- ❌ Zero deploy
- ❌ Zero cron change (jobs 12/71/72 inalterados)
- ❌ Zero job activation (71/72 continuam desligados)
- ❌ Zero execução de funções (`_agenda_alert_min_before_tick`, `_enqueue_agenda_alert`, `wa_daily_summary`, `_appt_professional_phone` não chamadas)
- ❌ Zero `wa_outbox` insert
- ❌ Zero `agenda_alerts_log` insert
- ❌ Zero WhatsApp/Evolution send
- ❌ Zero alteração TS/app code (`apps/lara/src/`)
- ❌ Zero alteração em `_appt_professional_phone`/`_enqueue_agenda_alert`/`_agenda_alert_min_before_tick`/`wa_daily_summary`/`_render_appt_template`/`appt_*`
- ❌ Zero criação de app_user fake / professional_profile fake / lead institucional
- ❌ Zero backfill amplo (apenas SET professional_id=NULL para 1 row órfã)
- ❌ Zero ação sobre monitoramento `2986→7773` nesta fase
- ❌ Zero commit em git (commit feito apenas após review)
- ❌ Zero secret persistido (mig prep não exigiu Management API)

---

## 9 · Histórico

- **2026-05-11:** Fase 2D.3F entrega 5 artefatos prontos para review · sem apply
- **Baseado em:** auditoria read-only 2D.3E
- **Próximo:** review SQL no chat → Fase 2D.3F.2 apply controlado → validation → re-smoke 2D.3D.1
