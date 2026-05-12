-- ============================================================================
-- Migration 166 · DOWN · DROP anamnesis_consent intra-consulta
-- ============================================================================
-- Reverte mig 166. Não toca sistemas pré-existentes (anamnesis_*, legal_doc_*,
-- appointments.consentimento_img).
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.appointment_clinical_gate_status(uuid);
DROP FUNCTION IF EXISTS public.appointment_consent_accept(uuid, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.appointment_anamnesis_mark_complete(uuid);
DROP FUNCTION IF EXISTS public.appointment_anamnesis_upsert(uuid, jsonb);

DROP TABLE IF EXISTS public.appointment_informed_consents;
DROP TABLE IF EXISTS public.appointment_anamneses;

NOTIFY pgrst, 'reload schema';

COMMIT;
