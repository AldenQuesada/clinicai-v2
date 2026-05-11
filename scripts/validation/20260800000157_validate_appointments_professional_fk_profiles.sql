-- ============================================================================
-- FASE 2D.3F.2 · VALIDATION · appointments professional FK → profiles
-- ============================================================================
-- Rode após apply da mig 157 · cole outputs no chat.
-- Todas SELECT read-only (zero mutação).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-1 · FK appointments_professional_id_fkey referencia professional_profiles
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  c.conname,
  rt.relname AS target_table,
  pg_get_constraintdef(c.oid) AS constraint_def
FROM pg_constraint c
JOIN pg_class t  ON t.oid  = c.conrelid
JOIN pg_class rt ON rt.oid = c.confrelid
JOIN pg_namespace n  ON n.oid  = t.relnamespace
JOIN pg_namespace rn ON rn.oid = rt.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'appointments'
  AND c.conname = 'appointments_professional_id_fkey';
-- Esperado:
--   target_table = 'professional_profiles'
--   constraint_def contém 'REFERENCES professional_profiles(id) ON DELETE SET NULL'

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-2 · Não existe FK de appointments.professional_id para app_users(id)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS legacy_fks_to_app_users
FROM pg_constraint c
JOIN pg_class t  ON t.oid  = c.conrelid
JOIN pg_class rt ON rt.oid = c.confrelid
JOIN pg_namespace n  ON n.oid  = t.relnamespace
JOIN pg_namespace rn ON rn.oid = rt.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'appointments'
  AND c.contype = 'f'
  AND rn.nspname = 'public'
  AND rt.relname = 'app_users';
-- Esperado: 0

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-3 · appointments.professional_id continua uuid NULL
-- ─────────────────────────────────────────────────────────────────────────────
SELECT column_name, data_type, udt_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'appointments'
  AND column_name  = 'professional_id';
-- Esperado: data_type='uuid', is_nullable='YES'

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-4 · Zero appointments com professional_id órfão vs professional_profiles
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS orphan_professional_id_after_apply
FROM public.appointments a
WHERE a.professional_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.professional_profiles pp
    WHERE pp.id = a.professional_id
  );
-- Esperado: 0

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-5 · Zero appointments apontando apenas para app_users(id)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS appts_pointing_to_app_users_only
FROM public.appointments a
WHERE a.professional_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.app_users u WHERE u.id = a.professional_id)
  AND NOT EXISTS (SELECT 1 FROM public.professional_profiles pp WHERE pp.id = a.professional_id);
-- Esperado: 0

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-6 · Backfill summary pós-apply (deve refletir +1 NULL vs auditoria)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE deleted_at IS NULL) AS total_not_deleted,
  count(*) FILTER (WHERE deleted_at IS NULL AND professional_id IS NULL) AS professional_id_null,
  count(*) FILTER (WHERE deleted_at IS NULL AND professional_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.professional_profiles pp WHERE pp.id = a.professional_id
  )) AS matches_professional_profiles_id,
  count(*) FILTER (WHERE deleted_at IS NULL AND professional_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.app_users u WHERE u.id = a.professional_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.professional_profiles pp WHERE pp.id = a.professional_id
  )) AS matches_app_users_only
FROM public.appointments a;
-- Esperado:
--   total_not_deleted = 3 (preservado)
--   professional_id_null = 3 (era 2 · +1 do backfill)
--   matches_professional_profiles_id = 0
--   matches_app_users_only = 0 (era 1 · zerado pelo backfill)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-7 · _appt_professional_phone inalterado · ainda resolve via professional_profiles.id
-- ─────────────────────────────────────────────────────────────────────────────
WITH d AS (
  SELECT pg_get_functiondef('public._appt_professional_phone(record)'::regprocedure) AS def
)
SELECT
  position('professional_profiles' IN def) > 0 AS uses_professional_profiles,
  position('p_appt.professional_id' IN def) > 0 AS reads_p_appt_professional_id,
  position('user_id' IN def) > 0 AS mentions_user_id_fallback,
  position('p_appt.professional_id IS NULL' IN def) > 0 AS has_null_guard
FROM d;
-- Esperado:
--   uses_professional_profiles = true
--   reads_p_appt_professional_id = true
--   mentions_user_id_fallback = false (não tem fallback por user_id)
--   has_null_guard = true (early return NULL)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-8/9 · wa_outbox + agenda_alerts_log deltas zero
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.wa_outbox WHERE created_at >= now() - interval '5 minutes') AS wa_outbox_last_5min,
  (SELECT count(*) FROM public.agenda_alerts_log WHERE created_at >= now() - interval '5 minutes') AS agenda_alerts_log_last_5min;
-- Esperado: ambos = 0

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-10 · appointments count total preservado
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS appointments_total FROM public.appointments;
-- Esperado: 5 (idêntico ao snapshot pré-mig 157 · backfill só seta professional_id=NULL · não deleta)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-11 · Cron jobs inalterados
-- ─────────────────────────────────────────────────────────────────────────────
SELECT jobid, jobname, schedule, active
FROM cron.job
WHERE jobid IN (12, 71, 72)
ORDER BY jobid;
-- Esperado: 12 active=true · 71 active=false · 72 active=false

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-12 · Tracker registra mig 157
-- ─────────────────────────────────────────────────────────────────────────────
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20260800000157';
-- Esperado: { version: '20260800000157', name: 'repair_marker' }
