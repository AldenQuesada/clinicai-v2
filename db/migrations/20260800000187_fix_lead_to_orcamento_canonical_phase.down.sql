-- ============================================================================
-- Migration 187 DOWN · revert lead_to_orcamento canonical phase fix
-- ============================================================================
--
-- Restaura a definição original de mig 65 (gate phase='compareceu', soft-delete
-- via deleted_at). NÃO recomendado em produção · 'compareceu' não é phase
-- válida pela CHECK pós-mig 150, então a RPC volta a ser código morto.
--
-- Documentado apenas pra paridade up/down. Em prod, prefira CRIAR uma nova
-- migration corretiva em vez de aplicar este down.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.lead_to_orcamento(
  p_lead_id     uuid,
  p_subtotal    numeric,
  p_items       jsonb,
  p_discount    numeric  DEFAULT 0,
  p_notes       text     DEFAULT NULL,
  p_title       text     DEFAULT NULL,
  p_valid_until date     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid;
  v_lead      public.leads%ROWTYPE;
  v_orc_id    uuid;
  v_total     numeric(12,2);
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  IF p_subtotal IS NULL OR p_subtotal < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_subtotal');
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_items', 'hint', 'Esperado jsonb array');
  END IF;

  SELECT * INTO v_lead
    FROM public.leads
   WHERE id = p_lead_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_not_found_or_deleted');
  END IF;

  IF v_lead.phase <> 'compareceu' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'illegal_transition',
      'from_phase', v_lead.phase,
      'hint', 'lead_to_orcamento exige phase=compareceu'
    );
  END IF;

  v_total := GREATEST(0, p_subtotal - COALESCE(p_discount, 0));

  INSERT INTO public.orcamentos (
    clinic_id, lead_id, patient_id,
    title, notes, items, subtotal, discount, total,
    status, valid_until, created_by
  ) VALUES (
    v_clinic_id, v_lead.id, NULL,
    p_title, p_notes, p_items,
    p_subtotal, COALESCE(p_discount, 0), v_total,
    'draft', p_valid_until, auth.uid()
  )
  RETURNING id INTO v_orc_id;

  UPDATE public.leads
     SET phase            = 'orcamento',
         phase_updated_at = now(),
         phase_updated_by = auth.uid(),
         phase_origin     = 'rpc',
         deleted_at       = COALESCE(deleted_at, now()),
         updated_at       = now()
   WHERE id = v_lead.id;

  INSERT INTO public.phase_history (
    clinic_id, lead_id, from_phase, to_phase, origin, triggered_by, actor_id, reason
  ) VALUES (
    v_clinic_id, v_lead.id, v_lead.phase, 'orcamento', 'rpc',
    'rpc:lead_to_orcamento', auth.uid(),
    'orcamento_id=' || v_orc_id::text
  );

  RETURN jsonb_build_object(
    'ok', true,
    'orcamento_id', v_orc_id,
    'lead_id', v_lead.id,
    'total', v_total
  );
END $$;

COMMENT ON FUNCTION public.lead_to_orcamento(uuid, numeric, jsonb, numeric, text, text, date) IS
  'Cria orcamento + soft-delete em leads + phase=orcamento. Exige phase=compareceu. Modelo excludente (orcamento.lead_id aponta pra lead soft-deleted).';

GRANT EXECUTE ON FUNCTION public.lead_to_orcamento(uuid, numeric, jsonb, numeric, text, text, date)
  TO authenticated, service_role;

COMMIT;
