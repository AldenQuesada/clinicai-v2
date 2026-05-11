-- ============================================================================
-- Migration 157 · clinicai-v2 · appointments.professional_id FK → professional_profiles
-- ============================================================================
--
-- Propósito:
--   Corrigir drift histórico onde `appointments.professional_id_fkey` aponta
--   para `app_users(id)` mas o código real (helper `_appt_professional_phone`,
--   legacy writer `appt_upsert` via `_professionalId` da UI, TS novo
--   `AppointmentRepository.create`, RPC `lead_to_appointment`) grava/lê
--   `professional_profiles(id)`. Consequência: tentativa de INSERT/UPDATE
--   com `professional_id = professional_profiles.id` viola FK quando esse id
--   não existe em `app_users` (caso atual em prod).
--
-- Auditoria 2D.3E confirmou:
--   - appointments total não deletado: 3
--   - professional_id NULL: 2
--   - já matcheando professional_profiles(id): 0
--   - matcheando só app_users(id): 1  ← row legacy alvo do backfill
--   - matcheando profile_user_id only: 0
--   - órfão (nenhum): 0
--   - matching por professional_name: 0
--
-- Estratégia cirúrgica:
--   1. Backfill defensivo: setar professional_id=NULL para rows cujo
--      professional_id atual NÃO existe em professional_profiles(id).
--      Esperado: 1 row afetada.
--   2. Drop FK velha (aponta para app_users).
--   3. Add FK nova (aponta para professional_profiles · ON DELETE SET NULL).
--   4. Sanity DO block dentro da transação · aborta apply se sobrarem órfãos.
--
-- Fora de escopo (não tocadas):
--   - _appt_professional_phone (já alinhada com professional_profiles.id)
--   - _agenda_alert_min_before_tick (mig 156)
--   - _enqueue_agenda_alert (mig 156)
--   - wa_daily_summary (mig 155)
--   - _render_appt_template (mig 154)
--   - appt_* (mig 153)
--   - cron.job (12/71/72 inalterados · 71/72 continuam desligados)
--   - schema de wa_outbox / leads / patients / clinics / professional_profiles
--   - dados de appointments além do backfill defensivo
--   - TS Lara v2 (apps/lara/src/)
--   - WhatsApp / Evolution / Secretaria
--
-- Rollback: down NO-OP defensivo (não restaura FK errada).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Backfill defensivo · setar professional_id=NULL para órfãos vs profiles
--    Esperado em prod: 1 row afetada (matches_app_users_only=1 na auditoria).
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.appointments a
   SET professional_id = NULL,
       updated_at      = now()
 WHERE a.professional_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1
     FROM public.professional_profiles pp
     WHERE pp.id = a.professional_id
   );

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Drop FK velha (apontava para app_users · drift)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_professional_id_fkey;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Add FK nova (aponta para professional_profiles · ON DELETE SET NULL)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_professional_id_fkey
  FOREIGN KEY (professional_id)
  REFERENCES public.professional_profiles(id)
  ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY CHECK (dentro da transação · aborta apply em violação)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_orphans       int;
  v_fk_exists     boolean;
  v_fk_targets_pp boolean;
  v_col_nullable  text;
BEGIN
  -- 1. Zero órfãos contra professional_profiles
  SELECT count(*) INTO v_orphans
  FROM public.appointments a
  WHERE a.professional_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.professional_profiles pp
      WHERE pp.id = a.professional_id
    );

  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'sanity: % appointments com professional_id orfao apos backfill', v_orphans;
  END IF;

  -- 2. FK nova existe e referencia professional_profiles
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND t.relname = 'appointments'
        AND c.conname = 'appointments_professional_id_fkey'
        AND c.contype = 'f'
    ),
    EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t  ON t.oid = c.conrelid
      JOIN pg_class rt ON rt.oid = c.confrelid
      JOIN pg_namespace n  ON n.oid = t.relnamespace
      JOIN pg_namespace rn ON rn.oid = rt.relnamespace
      WHERE n.nspname  = 'public'
        AND t.relname  = 'appointments'
        AND c.conname  = 'appointments_professional_id_fkey'
        AND c.contype  = 'f'
        AND rn.nspname = 'public'
        AND rt.relname = 'professional_profiles'
    )
  INTO v_fk_exists, v_fk_targets_pp;

  IF NOT v_fk_exists THEN
    RAISE EXCEPTION 'sanity: FK appointments_professional_id_fkey nao existe pos-mig';
  END IF;
  IF NOT v_fk_targets_pp THEN
    RAISE EXCEPTION 'sanity: FK appointments_professional_id_fkey nao referencia professional_profiles';
  END IF;

  -- 3. professional_id continua nullable
  SELECT is_nullable INTO v_col_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'appointments'
    AND column_name  = 'professional_id';

  IF v_col_nullable IS DISTINCT FROM 'YES' THEN
    RAISE EXCEPTION 'sanity: professional_id deveria continuar nullable · estado atual=%', v_col_nullable;
  END IF;

  RAISE NOTICE 'mig 157 · FK realinhada para professional_profiles · 0 orfaos · nullable preservado';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
