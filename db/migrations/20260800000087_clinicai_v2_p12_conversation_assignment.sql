-- Migration 87 · P-12 multi-atendente · assignment de conversa
--
-- Doc canonico: docs/audits/2026-04-29-p12-multi-atendente-projeto.html
-- Fase 1 · server-side: colunas + RPCs + grants. UI vem na Fase 2.
--
-- Decisoes:
--  - assigned_to FK pra public.profiles(id) (nao auth.users) · profile e o
--    "membro da clinic" (1:1 com auth.users via id) e tem clinic_id pra RLS
--  - ON DELETE SET NULL · se o membro for desativado, conversa fica orfa
--    (em vez de quebrar o registro · soft-handoff)
--  - 2 RPCs separadas (assign · unassign) · semantica clara > 1 RPC com null
--  - SECURITY DEFINER + search_path = 'public, pg_temp' · checklist seguranca
--  - GRANT EXECUTE TO authenticated · nunca anon (mutavel)
--  - Idempotente: IF NOT EXISTS em coluna/index · CREATE OR REPLACE em RPC

-- ─────────────────────────────────────────────────────────────────────
-- 1. Schema · 2 colunas novas + index parcial
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS assigned_to uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS wa_conversations_assigned_to_idx
  ON public.wa_conversations(assigned_to)
  WHERE assigned_to IS NOT NULL;

COMMENT ON COLUMN public.wa_conversations.assigned_to IS
  'P-12 · profile id atribuido a esta conversa. Soft-lock visual, nao bloqueia envio.';
COMMENT ON COLUMN public.wa_conversations.assigned_at IS
  'P-12 · timestamp do ultimo assign · NULL quando unassigned.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. RPC · wa_conversation_assign(conv_id, user_id)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_conversation_assign(
  p_conversation_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinic   uuid := public.app_clinic_id();
  v_now      timestamptz := now();
BEGIN
  -- Gate 1 · target user existe, esta ativo e e da mesma clinic_id
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND clinic_id = v_clinic
      AND is_active = true
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'user_not_in_clinic'
    );
  END IF;

  -- Gate 2 · conversa existe na clinic do caller
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_conversations
    WHERE id = p_conversation_id
      AND clinic_id = v_clinic
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conversation_not_found'
    );
  END IF;

  -- UPDATE atomico · cobre race entre 2 atendentes simultaneos
  -- (last write wins · resposta retorna estado final)
  UPDATE public.wa_conversations
    SET assigned_to = p_user_id,
        assigned_at = v_now
    WHERE id = p_conversation_id
      AND clinic_id = v_clinic;

  RETURN jsonb_build_object(
    'ok', true,
    'assigned_to', p_user_id,
    'assigned_at', v_now
  );
END $$;

GRANT EXECUTE ON FUNCTION public.wa_conversation_assign(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.wa_conversation_assign(uuid, uuid) IS
  'P-12 · atribui conversa a um membro da clinic. Soft-lock · UPDATE atomico. Erros: user_not_in_clinic | conversation_not_found.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. RPC · wa_conversation_unassign(conv_id)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_conversation_unassign(
  p_conversation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_clinic uuid := public.app_clinic_id();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.wa_conversations
    WHERE id = p_conversation_id
      AND clinic_id = v_clinic
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conversation_not_found'
    );
  END IF;

  UPDATE public.wa_conversations
    SET assigned_to = NULL,
        assigned_at = NULL
    WHERE id = p_conversation_id
      AND clinic_id = v_clinic;

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.wa_conversation_unassign(uuid) TO authenticated;

COMMENT ON FUNCTION public.wa_conversation_unassign(uuid) IS
  'P-12 · libera conversa (assigned_to = NULL).';

-- ─────────────────────────────────────────────────────────────────────
-- 4. Reload do schema · PostgREST pega novas colunas/RPCs sem restart
-- ─────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
