-- Down 800-27 · reverte wa_pro_list_numbers + wa_pro_register_number pra
-- versao da mig 654 do clinic-dashboard (sem permissions no list, sem b2b
-- no default). Backfill nao eh revertido (b2b=true em rows fica).

CREATE OR REPLACE FUNCTION public.wa_pro_list_numbers()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_result    jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', n.id, 'phone', n.phone, 'label', n.label,
    'number_type', n.number_type, 'access_scope', n.access_scope,
    'professional_id', n.professional_id, 'professional_name', p.display_name,
    'is_active', n.is_active, 'created_at', n.created_at
  ) ORDER BY n.number_type, p.display_name), '[]'::jsonb)
  INTO v_result
  FROM public.wa_numbers n
  LEFT JOIN public.professional_profiles p ON p.id = n.professional_id
  WHERE n.clinic_id = v_clinic_id;
  RETURN COALESCE(v_result, '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.wa_pro_register_number(
  p_phone text, p_professional_id uuid,
  p_label text DEFAULT NULL, p_access_scope text DEFAULT 'own',
  p_permissions jsonb DEFAULT '{"agenda": true, "pacientes": true, "financeiro": true}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$ BEGIN RETURN jsonb_build_object('ok', false, 'error', 'down_migration'); END $$;
