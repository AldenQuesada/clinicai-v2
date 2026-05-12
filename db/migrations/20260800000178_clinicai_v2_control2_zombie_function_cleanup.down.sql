-- Rollback Mig 178 · CRM_PHASE_CONTROL.2 · recreate 3 orphan trigger stubs
-- ============================================================================
-- Stubs no-op · retornam NEW (TG_OP=INSERT/UPDATE) ou NULL (TG_OP=DELETE).
-- Não restauram comportamento original (perdido em mig anterior) · apenas
-- preservam assinatura caso algum caller histórico tente referenciar.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._b2b_trigger_voucher_attended()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  -- Stub no-op pós-CONTROL.2 rollback (mig 178 down).
  -- Trigger foi dropada como órfã em CONTROL.2.
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public._trg_agenda_alert_on_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public._vpi_appt_revert_on_cancel()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
