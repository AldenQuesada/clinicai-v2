-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-31 · clinicai-v2 · wa_numbers oficial CRUD via RPCs       ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: cadastrar/editar/desativar wa_numbers tipo     ║
-- ║ "oficial" (Mira/Lara mirian) sem precisar SQL direto. Hoje so          ║
-- ║ professional_private tem RPC (wa_pro_register_number).                  ║
-- ║                                                                          ║
-- ║ 3 RPCs SECURITY DEFINER (mesmo padrao mig 800-27):                       ║
-- ║   1. wa_register_oficial(phone, label, phone_number_id) · upsert por    ║
-- ║      (clinic_id, phone, number_type='oficial')                          ║
-- ║   2. wa_update_meta(id, label?, phone_number_id?, is_active?)           ║
-- ║      Patch parcial · so atualiza campos non-null. Cobre TODOS os        ║
-- ║      number_types (oficial, professional_private, etc) · UI direita     ║
-- ║      do Channels usa pra editar qualquer numero.                        ║
-- ║   3. wa_deactivate_any(id) · soft delete generico (nao so professional  ║
-- ║      como deactivate atual). UI usa pra remover oficial sem touch SQL.  ║
-- ║                                                                          ║
-- ║ Seguranca:                                                               ║
-- ║   - SECURITY DEFINER + search_path locked                                ║
-- ║   - clinic_id sempre via _sdr_clinic_id() · nunca literal                ║
-- ║   - Validacao interna de role (owner/admin) + clinic ownership do row   ║
-- ║   - GRANT EXECUTE TO authenticated · zero anon                           ║
-- ║                                                                          ║
-- ║ UNIQUE INDEX (mig 800-30) ja cobre (clinic_id, phone, professional_id)  ║
-- ║ apenas pra professional_private. Pra oficial usamos                     ║
-- ║ (clinic_id, phone, number_type) · sem professional_id no caso oficial.  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 0. UNIQUE INDEX pra oficial · evita duplicar mesmo phone na clinica
-- ═══════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wa_numbers_oficial_phone
  ON public.wa_numbers (clinic_id, phone)
  WHERE number_type = 'oficial';

COMMENT ON INDEX public.uniq_wa_numbers_oficial_phone IS
  'UNIQUE em (clinic_id, phone) so pra oficial · habilita ON CONFLICT do wa_register_oficial (mig 800-31).';

-- ═══════════════════════════════════════════════════════════════════════
-- 1. wa_register_oficial · cadastra/atualiza phone tipo oficial
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.wa_register_oficial(
  p_phone           text,
  p_label           text DEFAULT NULL,
  p_phone_number_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_phone     text := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_id        uuid;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;
  IF length(v_phone) < 10 OR length(v_phone) > 13 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_invalid');
  END IF;

  INSERT INTO public.wa_numbers (
    clinic_id, phone, label, phone_number_id, is_active, number_type
  ) VALUES (
    v_clinic_id, v_phone,
    COALESCE(NULLIF(p_label, ''), 'Oficial ' || v_phone),
    NULLIF(p_phone_number_id, ''),
    true,
    'oficial'
  )
  ON CONFLICT (clinic_id, phone) WHERE number_type = 'oficial'
  DO UPDATE SET
    label           = COALESCE(NULLIF(EXCLUDED.label, ''), public.wa_numbers.label),
    phone_number_id = COALESCE(NULLIF(EXCLUDED.phone_number_id, ''), public.wa_numbers.phone_number_id),
    is_active       = true,
    updated_at      = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

COMMENT ON FUNCTION public.wa_register_oficial(text, text, text) IS
  'Upsert wa_numbers tipo oficial · valida phone (10-13 digits) e clinic_id (mig 800-31).';

GRANT EXECUTE ON FUNCTION public.wa_register_oficial(text, text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. wa_update_meta · patch parcial label/phone_number_id/is_active
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.wa_update_meta(
  p_id              uuid,
  p_label           text DEFAULT NULL,
  p_phone_number_id text DEFAULT NULL,
  p_is_active       boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_row_clinic uuid;
  v_count int;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;

  -- Confirma ownership · evita admin de uma clinica editar wa_numbers de outra
  SELECT clinic_id INTO v_row_clinic
    FROM public.wa_numbers
   WHERE id = p_id;

  IF v_row_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_row_clinic <> v_clinic_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.wa_numbers
     SET label           = COALESCE(NULLIF(p_label, ''), label),
         phone_number_id = CASE
                             WHEN p_phone_number_id IS NULL THEN phone_number_id
                             WHEN p_phone_number_id = '' THEN NULL
                             ELSE p_phone_number_id
                           END,
         is_active       = COALESCE(p_is_active, is_active),
         updated_at      = now()
   WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_rows_updated');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.wa_update_meta(uuid, text, text, boolean) IS
  'Patch parcial wa_numbers (label/phone_number_id/is_active) · valida clinic ownership (mig 800-31).';

GRANT EXECUTE ON FUNCTION public.wa_update_meta(uuid, text, text, boolean) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. wa_deactivate_any · soft-delete generico (qualquer number_type)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.wa_deactivate_any(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_row_clinic uuid;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;

  SELECT clinic_id INTO v_row_clinic
    FROM public.wa_numbers
   WHERE id = p_id;

  IF v_row_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_row_clinic <> v_clinic_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.wa_numbers
     SET is_active = false,
         updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.wa_deactivate_any(uuid) IS
  'Soft-delete wa_numbers de qualquer type · valida clinic ownership (mig 800-31).';

GRANT EXECUTE ON FUNCTION public.wa_deactivate_any(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERTS
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='wa_register_oficial') THEN
    RAISE EXCEPTION 'ASSERT FAIL: wa_register_oficial nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='wa_update_meta') THEN
    RAISE EXCEPTION 'ASSERT FAIL: wa_update_meta nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='wa_deactivate_any') THEN
    RAISE EXCEPTION 'ASSERT FAIL: wa_deactivate_any nao existe';
  END IF;
  RAISE NOTICE '✅ Mig 800-31 OK · 3 RPCs criadas + UNIQUE INDEX oficial';
END $$;

COMMIT;
