-- Reverte mig 66: re-aponta as 7 FKs externas pra schema legacy_2026_04_28
-- Util se precisar rollback. Requer schema legacy_2026_04_28 + tabelas la.

BEGIN;

ALTER TABLE public.anamnesis_requests DROP CONSTRAINT IF EXISTS anamnesis_requests_patient_id_fkey;
ALTER TABLE public.anamnesis_requests ADD CONSTRAINT anamnesis_requests_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES legacy_2026_04_28.patients(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.anamnesis_responses DROP CONSTRAINT IF EXISTS anamnesis_responses_patient_id_fkey;
ALTER TABLE public.anamnesis_responses ADD CONSTRAINT anamnesis_responses_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES legacy_2026_04_28.patients(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.budget_items DROP CONSTRAINT IF EXISTS budget_items_budget_id_fkey;
ALTER TABLE public.budget_items ADD CONSTRAINT budget_items_budget_id_fkey
  FOREIGN KEY (budget_id) REFERENCES legacy_2026_04_28.orcamentos(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.cashflow_entries DROP CONSTRAINT IF EXISTS cashflow_entries_patient_id_fkey;
ALTER TABLE public.cashflow_entries ADD CONSTRAINT cashflow_entries_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES legacy_2026_04_28.patients(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.cashflow_entries DROP CONSTRAINT IF EXISTS cashflow_entries_appointment_id_fkey;
ALTER TABLE public.cashflow_entries ADD CONSTRAINT cashflow_entries_appointment_id_fkey
  FOREIGN KEY (appointment_id) REFERENCES legacy_2026_04_28.appointments(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.quiz_responses DROP CONSTRAINT IF EXISTS quiz_responses_lead_id_fkey;
ALTER TABLE public.quiz_responses ADD CONSTRAINT quiz_responses_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES legacy_2026_04_28.leads(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.wa_consent DROP CONSTRAINT IF EXISTS wa_consent_lead_id_fkey;
ALTER TABLE public.wa_consent ADD CONSTRAINT wa_consent_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES legacy_2026_04_28.leads(id) ON DELETE NO ACTION NOT VALID;

COMMIT;
