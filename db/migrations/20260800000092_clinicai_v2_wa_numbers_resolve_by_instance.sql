-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 92 · clinicai-v2 · wa_numbers_resolve_by_instance              ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Espelha mig 849 (resolve_by_phone_number_id) mas pra transport Evolution ║
-- ║ (que identifica o numero por instance_id, nao phone_number_id).          ║
-- ║                                                                          ║
-- ║ Usado pelo novo endpoint /api/webhook/whatsapp-evolution na Lara v2 ·   ║
-- ║ Evolution envia POST com `instance` no body, queremos resolver pra      ║
-- ║ wa_number_id + clinic_id + inbox_role pra rotear pra inbox secretaria.  ║
-- ║                                                                          ║
-- ║ Notas:                                                                   ║
-- ║  - instance_id NAO e unique em wa_numbers (mira-mirian apareceu em 2    ║
-- ║    rows). RPC retorna o ATIVO + mais recente (ORDER BY updated_at DESC) ║
-- ║  - service_role only · webhook nao tem auth user                         ║
-- ║                                                                          ║
-- ║ Idempotente · CREATE OR REPLACE.                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.wa_numbers_resolve_by_instance(
  p_instance text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_row record;
BEGIN
  IF p_instance IS NULL OR p_instance = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'instance_ausente');
  END IF;

  SELECT id, clinic_id, instance_id, phone, inbox_role, label
    INTO v_row
    FROM public.wa_numbers
   WHERE instance_id = p_instance
     AND is_active = true
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'instance_nao_encontrado_ou_inativo',
      'instance', p_instance
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'wa_number_id', v_row.id,
    'clinic_id',    v_row.clinic_id,
    'instance_id',  v_row.instance_id,
    'phone',        v_row.phone,
    'inbox_role',   v_row.inbox_role,
    'label',        v_row.label
  );
END
$$;

COMMENT ON FUNCTION public.wa_numbers_resolve_by_instance(text) IS
  'Mig 92 · resolve wa_number ativo por instance_id (Evolution). Espelha resolve_by_phone_number_id (Cloud API).';

GRANT EXECUTE ON FUNCTION public.wa_numbers_resolve_by_instance(text) TO service_role;
-- authenticated NAO recebe · webhook so chama com service_role (anon nao deve).

NOTIFY pgrst, 'reload schema';
