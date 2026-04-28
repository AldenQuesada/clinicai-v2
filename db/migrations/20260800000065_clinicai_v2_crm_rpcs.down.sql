-- Rollback de 20260800000065_clinicai_v2_crm_rpcs.sql

BEGIN;

DROP FUNCTION IF EXISTS public.sdr_change_phase(uuid, text, text);
DROP FUNCTION IF EXISTS public.lead_lost(uuid, text);
DROP FUNCTION IF EXISTS public.lead_to_orcamento(uuid, numeric, jsonb, numeric, text, text, date);
DROP FUNCTION IF EXISTS public.lead_to_paciente(uuid, numeric, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.appointment_finalize(uuid, text, numeric, text, text, text, jsonb, numeric, numeric);
DROP FUNCTION IF EXISTS public.appointment_attend(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.lead_to_appointment(uuid, date, time, time, uuid, text, text, text, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.lead_create(text, text, text, text, text, text, jsonb, uuid, text);

DROP FUNCTION IF EXISTS public._lead_phase_transition_allowed(text, text);

NOTIFY pgrst, 'reload schema';

COMMIT;
