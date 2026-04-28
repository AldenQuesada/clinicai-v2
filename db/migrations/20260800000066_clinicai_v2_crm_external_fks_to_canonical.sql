-- ============================================================================
-- Mig 66 · Reapontar FKs externas pro schema canonico v2 em public
-- ============================================================================
--
-- Apos Camada 1 (mover legado pra legacy_2026_04_28 + criar canonico em public),
-- 7 FKs externas continuaram apontando pra legacy. Isso faz INSERTs novos em
-- wa_consent/quiz_responses/anamnesis/budget_items/cashflow_entries falharem
-- quando referenciam leads/patients/appointments/orcamentos NOVOS em public.
--
-- Esta mig faz DROP+RECREATE com NOT VALID:
--  - rows existentes (apontando pra UUIDs em legacy) NAO sao re-validados
--  - rows novos validam contra public canonico
--  - VALIDATE CONSTRAINT pode rodar manualmente quando desejar (Camada 12 cleanup)
--
-- 7 FKs afetadas:
--  1. anamnesis_requests.patient_id  -> public.patients (CASCADE)
--  2. anamnesis_responses.patient_id -> public.patients (CASCADE)
--  3. budget_items.budget_id         -> public.orcamentos (CASCADE)
--  4. cashflow_entries.patient_id    -> public.patients (SET NULL)
--  5. cashflow_entries.appointment_id-> public.appointments (SET NULL)
--  6. quiz_responses.lead_id         -> public.leads (SET NULL)
--  7. wa_consent.lead_id             -> public.leads (NO ACTION)

BEGIN;

-- 1. anamnesis_requests
ALTER TABLE public.anamnesis_requests
  DROP CONSTRAINT IF EXISTS anamnesis_requests_patient_id_fkey;
ALTER TABLE public.anamnesis_requests
  ADD CONSTRAINT anamnesis_requests_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE NOT VALID;

-- 2. anamnesis_responses
ALTER TABLE public.anamnesis_responses
  DROP CONSTRAINT IF EXISTS anamnesis_responses_patient_id_fkey;
ALTER TABLE public.anamnesis_responses
  ADD CONSTRAINT anamnesis_responses_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE CASCADE NOT VALID;

-- 3. budget_items
ALTER TABLE public.budget_items
  DROP CONSTRAINT IF EXISTS budget_items_budget_id_fkey;
ALTER TABLE public.budget_items
  ADD CONSTRAINT budget_items_budget_id_fkey
  FOREIGN KEY (budget_id) REFERENCES public.orcamentos(id) ON DELETE CASCADE NOT VALID;

-- 4. cashflow_entries.patient_id
ALTER TABLE public.cashflow_entries
  DROP CONSTRAINT IF EXISTS cashflow_entries_patient_id_fkey;
ALTER TABLE public.cashflow_entries
  ADD CONSTRAINT cashflow_entries_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE SET NULL NOT VALID;

-- 5. cashflow_entries.appointment_id
ALTER TABLE public.cashflow_entries
  DROP CONSTRAINT IF EXISTS cashflow_entries_appointment_id_fkey;
ALTER TABLE public.cashflow_entries
  ADD CONSTRAINT cashflow_entries_appointment_id_fkey
  FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL NOT VALID;

-- 6. quiz_responses
ALTER TABLE public.quiz_responses
  DROP CONSTRAINT IF EXISTS quiz_responses_lead_id_fkey;
ALTER TABLE public.quiz_responses
  ADD CONSTRAINT quiz_responses_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL NOT VALID;

-- 7. wa_consent
ALTER TABLE public.wa_consent
  DROP CONSTRAINT IF EXISTS wa_consent_lead_id_fkey;
ALTER TABLE public.wa_consent
  ADD CONSTRAINT wa_consent_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE NO ACTION NOT VALID;

NOTIFY pgrst, 'reload schema';

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint con
  JOIN pg_class cl ON cl.oid=con.conrelid
  JOIN pg_class tab ON tab.oid=con.confrelid
  JOIN pg_namespace ns ON ns.oid=tab.relnamespace
  WHERE con.contype='f' AND ns.nspname='legacy_2026_04_28'
  AND cl.relnamespace::regnamespace::text != 'legacy_2026_04_28';

  IF v_count > 0 THEN
    RAISE EXCEPTION 'sanity: ainda tem % FKs externas apontando pra legacy_2026_04_28', v_count;
  END IF;

  RAISE NOTICE 'mig 66 OK: 7 FKs externas reapontadas pra public canonico';
END $$;

COMMIT;
