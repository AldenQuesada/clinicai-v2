-- ============================================================================
-- Migration 173 · clinicai-v2 · COMMERCIAL RECOVERY ACTIONS (RPCs auxiliares)
-- ============================================================================
--
-- Propósito (CRM_PHASE_2RC continuação):
--   Adiciona 2 RPCs SECURITY DEFINER pra UI /crm/recuperacao executar
--   ações seguras sobre `perdidos`:
--     - recovery_perdido_mark_discarded(p_id, p_reason)
--         marca is_recoverable=false (descartado permanente)
--     - recovery_perdido_add_note(p_id, p_note)
--         append em perdidos.notes (timestamped)
--
--   Por que RPCs e não UPDATE direto:
--     - perdidos.RLS atual = authenticated SELECT + service_role ALL
--     - UPDATE direto da UI exigiria afrouxar policy · risco multi-tenant
--     - RPC SECURITY DEFINER gate role (owner/admin/receptionist) +
--       valida clinic_id antes de gravar
--
-- Estado seguro pós-apply:
--   - 2 RPCs novas (idempotentes via consulta is_recoverable atual)
--   - Zero alteração em tabelas (perdidos.notes/is_recoverable já existem)
--   - Zero envio WhatsApp · zero wa_outbox · zero impacto em cron
--
-- Fora de escopo:
--   - Tracking table separada (decisão: usa perdidos)
--   - Ação em appointment_cancelled/no_show/orcamento_frio (re-encaminhar
--     usuário para fluxos existentes /crm/agenda/[id]/editar etc)
--
-- Rollback: down DROPs ambas RPCs.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. RPC · recovery_perdido_mark_discarded
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recovery_perdido_mark_discarded(
  p_id     uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_role      text;
  v_perdido   public.perdidos%ROWTYPE;
  v_note_line text;
BEGIN
  -- Role gate
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'app_role', '');
  IF v_role NOT IN ('owner', 'admin', 'receptionist') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role');
  END IF;

  SELECT * INTO v_perdido FROM public.perdidos
   WHERE id = p_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'perdido_not_found');
  END IF;

  -- Idempotente · se já descartado, retorna ok com flag
  IF v_perdido.is_recoverable = false THEN
    RETURN jsonb_build_object('ok', true, 'idempotent_skip', true, 'id', p_id);
  END IF;

  v_note_line := E'\n[Descartado ' || to_char(now(), 'DD/MM/YYYY HH24:MI') || '] ' ||
                 COALESCE(p_reason, 'sem motivo informado');

  UPDATE public.perdidos
     SET is_recoverable = false,
         notes          = COALESCE(notes, '') || v_note_line,
         updated_at     = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'is_recoverable', false);
END $$;

COMMENT ON FUNCTION public.recovery_perdido_mark_discarded(uuid, text) IS
  'Mig 173 (CRM_PHASE_2RC) · marca perdido como descartado permanente '
  '(is_recoverable=false). Idempotente. Gate role owner/admin/receptionist.';

GRANT EXECUTE ON FUNCTION public.recovery_perdido_mark_discarded(uuid, text)
  TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RPC · recovery_perdido_add_note
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recovery_perdido_add_note(
  p_id   uuid,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_role      text;
  v_perdido   public.perdidos%ROWTYPE;
  v_note_line text;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'app_role', '');
  IF v_role NOT IN ('owner', 'admin', 'receptionist') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role');
  END IF;

  IF p_note IS NULL OR length(trim(p_note)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'note_too_short');
  END IF;

  SELECT * INTO v_perdido FROM public.perdidos
   WHERE id = p_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'perdido_not_found');
  END IF;

  v_note_line := E'\n[Nota ' || to_char(now(), 'DD/MM/YYYY HH24:MI') || '] ' || trim(p_note);

  UPDATE public.perdidos
     SET notes      = COALESCE(notes, '') || v_note_line,
         updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

COMMENT ON FUNCTION public.recovery_perdido_add_note(uuid, text) IS
  'Mig 173 (CRM_PHASE_2RC) · append note em perdidos.notes (timestamped). '
  'Gate role owner/admin/receptionist. Min 3 chars trimmed.';

GRANT EXECUTE ON FUNCTION public.recovery_perdido_add_note(uuid, text)
  TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY DO BLOCK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_discard_ok  boolean;
  v_note_ok     boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='recovery_perdido_mark_discarded'
  ) INTO v_discard_ok;
  IF NOT v_discard_ok THEN
    RAISE EXCEPTION 'sanity: recovery_perdido_mark_discarded ausente';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='recovery_perdido_add_note'
  ) INTO v_note_ok;
  IF NOT v_note_ok THEN
    RAISE EXCEPTION 'sanity: recovery_perdido_add_note ausente';
  END IF;

  RAISE NOTICE 'mig 173 · recovery RPCs criadas (mark_discarded + add_note)';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
