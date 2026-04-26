-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-27 · clinicai-v2 · wa_pro permissions fix + B2B support    ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26:                                                  ║
-- ║   "deixo marcado so financeiro, salvo e nao atualiza, se eu abrir ai     ║
-- ║    esta tudo marcado de novo no check"                                    ║
-- ║                                                                          ║
-- ║ Bug cravado: RPC wa_pro_list_numbers monta jsonb_build_object SEM o      ║
-- ║ campo `permissions` · UI le como `{}` · undefined !== false = true em    ║
-- ║ todos os 3 checks · sempre mostra tudo marcado.                           ║
-- ║                                                                          ║
-- ║ Esta mig:                                                                 ║
-- ║   1. Recria wa_pro_list_numbers INCLUINDO permissions no return           ║
-- ║   2. Recria wa_pro_register_number aceitando key 'b2b' nas permissions   ║
-- ║   3. Backfill: rows existentes sem 'b2b' ganham b2b=true (default)       ║
-- ║                                                                          ║
-- ║ Modelo (decidido com Alden 2026-04-26):                                   ║
-- ║   permissions jsonb agora aceita 4 categorias:                            ║
-- ║     agenda    · acesso ao modulo Agenda + alertas de agenda               ║
-- ║     pacientes · acesso a pacientes + alertas NPS/follow-up                ║
-- ║     financeiro · acesso financeiro + alertas revenue/meta                 ║
-- ║     b2b      · acesso ao modulo B2B + alertas parcerias/vouchers/etc     ║
-- ║                                                                          ║
-- ║   Cada check controla AMBOS · acesso e mensagens automaticas (cron       ║
-- ║   handlers filtram recipients por permissions.<categoria>=true).         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Backfill · rows existentes sem b2b ganham b2b=true (default seguro)
-- ═══════════════════════════════════════════════════════════════════════
UPDATE public.wa_numbers
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object('b2b', true)
 WHERE number_type = 'professional_private'
   AND (permissions IS NULL OR NOT (permissions ? 'b2b'));

-- ═══════════════════════════════════════════════════════════════════════
-- 2. CREATE OR REPLACE wa_pro_list_numbers · inclui permissions no return
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.wa_pro_list_numbers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_result    jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',                n.id,
    'phone',             n.phone,
    'label',             n.label,
    'number_type',       n.number_type,
    'access_scope',      n.access_scope,
    'professional_id',   n.professional_id,
    'professional_name', p.display_name,
    'is_active',         n.is_active,
    'created_at',        n.created_at,
    -- FIX 800-27: incluir permissions no return · estava faltando
    'permissions',       COALESCE(n.permissions, '{}'::jsonb)
  ) ORDER BY n.number_type, p.display_name), '[]'::jsonb)
  INTO v_result
  FROM public.wa_numbers n
  LEFT JOIN public.professional_profiles p ON p.id = n.professional_id
  WHERE n.clinic_id = v_clinic_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.wa_pro_list_numbers() IS
  'Lista wa_numbers da clinica · inclui permissions jsonb (mig 800-27 fix).';

GRANT EXECUTE ON FUNCTION public.wa_pro_list_numbers() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. CREATE OR REPLACE wa_pro_register_number · default permissions com b2b
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.wa_pro_register_number(
  p_phone           text,
  p_professional_id uuid,
  p_label           text  DEFAULT NULL,
  p_access_scope    text  DEFAULT 'own',
  p_permissions     jsonb DEFAULT '{"agenda": true, "pacientes": true, "financeiro": true, "b2b": true}'::jsonb
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
  IF p_professional_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'professional_id_required');
  END IF;

  -- Tenta INSERT primeiro · se conflito (ja existe phone na clinica), pula
  INSERT INTO public.wa_numbers (
    clinic_id, phone, label, phone_number_id, is_active,
    number_type, professional_id, access_scope, permissions
  ) VALUES (
    v_clinic_id, v_phone, COALESCE(p_label, 'Mira ' || v_phone),
    'mira-' || v_phone, true,
    'professional_private', p_professional_id,
    COALESCE(p_access_scope, 'own'),
    COALESCE(p_permissions, '{"agenda": true, "pacientes": true, "financeiro": true, "b2b": true}'::jsonb)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  -- Se conflito, faz UPDATE com nova config
  IF v_id IS NULL THEN
    UPDATE public.wa_numbers
       SET professional_id = p_professional_id,
           access_scope    = COALESCE(p_access_scope, 'own'),
           -- COALESCE garante que NULL nao sobrescreve · mas frontend
           -- sempre manda objeto completo, entao em pratica usa p_permissions
           permissions     = COALESCE(p_permissions, permissions),
           label           = COALESCE(p_label, label),
           is_active       = true,
           updated_at      = now()
     WHERE clinic_id = v_clinic_id
       AND phone = v_phone
       AND number_type = 'professional_private'
   RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

COMMENT ON FUNCTION public.wa_pro_register_number(text, uuid, text, text, jsonb) IS
  'Cadastra/atualiza wa_number professional_private · permissions com 4 categorias incluindo b2b (mig 800-27).';

GRANT EXECUTE ON FUNCTION public.wa_pro_register_number(text, uuid, text, text, jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERTS
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_def text;
BEGIN
  -- Confirma que wa_pro_list_numbers agora inclui 'permissions' no body
  SELECT pg_get_functiondef('public.wa_pro_list_numbers'::regproc) INTO v_def;
  IF v_def NOT LIKE '%permissions%' THEN
    RAISE EXCEPTION 'ASSERT FAIL: wa_pro_list_numbers nao retorna permissions';
  END IF;

  -- Confirma que wa_pro_register_number existe
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='wa_pro_register_number') THEN
    RAISE EXCEPTION 'ASSERT FAIL: wa_pro_register_number nao existe';
  END IF;

  RAISE NOTICE '✅ Mig 800-27 OK · wa_pro_list_numbers retorna permissions + b2b suportado';
END $$;

COMMIT;
