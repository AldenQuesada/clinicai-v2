-- Reverte mig 67: restaura app_clinic_id() pra versao pre-Camada 2

BEGIN;

CREATE OR REPLACE FUNCTION public.app_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
  SELECT COALESCE(
    NULLIF(current_setting('app.clinic_id', true), '')::uuid,
    NULLIF(auth.jwt() ->> 'clinic_id', '')::uuid,
    (SELECT id FROM public.clinics ORDER BY created_at ASC LIMIT 1)
  );
$function$;

COMMIT;
