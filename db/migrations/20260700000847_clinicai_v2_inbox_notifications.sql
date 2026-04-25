-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 847 · clinicai-v2 · inbox_notifications                       ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto: Lara nova (apps/lara) escreve esta tabela quando tag inline   ║
-- ║   [ACIONAR_HUMANO] dispara · dashboard antigo (e Mira futura) lê e      ║
-- ║   mostra notificação no sino "🔔 Lara pediu transbordo (3)".            ║
-- ║                                                                          ║
-- ║ Multi-tenant ADR-028: clinic_id obrigatório · RLS escopa por clinic.    ║
-- ║                                                                          ║
-- ║ Idempotência: CREATE TABLE IF NOT EXISTS, todas DDL safe pra re-run.    ║
-- ║ Rollback: 20260700000847_clinicai_v2_inbox_notifications.down.sql       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.inbox_notifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL DEFAULT public._default_clinic_id(),
  conversation_id uuid        NOT NULL,
  source          text        NOT NULL,        -- 'lara' | 'mira' | 'system'
  reason          text        NOT NULL,        -- 'transbordo_humano' | 'rate_limit' | 'budget_exceeded' | etc
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_read         boolean     NOT NULL DEFAULT false,
  read_by         uuid        NULL,            -- profiles.id (quem leu)
  read_at         timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Índices · queries quentes:
--   1. Listar notificações não-lidas da clínica (sino do dashboard)
--   2. Buscar por conversation_id (drill-down)
CREATE INDEX IF NOT EXISTS idx_inbox_notif_clinic_unread
  ON public.inbox_notifications (clinic_id, is_read, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_inbox_notif_conversation
  ON public.inbox_notifications (conversation_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.inbox_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbox_notifications_select_own_clinic ON public.inbox_notifications;
CREATE POLICY inbox_notifications_select_own_clinic
  ON public.inbox_notifications FOR SELECT
  TO authenticated
  USING (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS inbox_notifications_update_own_clinic ON public.inbox_notifications;
CREATE POLICY inbox_notifications_update_own_clinic
  ON public.inbox_notifications FOR UPDATE
  TO authenticated
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

-- INSERT só via service_role (Lara/Mira backend) · sem policy pra authenticated.

GRANT SELECT, UPDATE ON public.inbox_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.inbox_notifications TO service_role;

-- ── RPC pra Lara/Mira inserir (mantém logica + audit em 1 lugar) ────────
CREATE OR REPLACE FUNCTION public.inbox_notification_create(
  p_clinic_id       uuid,
  p_conversation_id uuid,
  p_source          text,
  p_reason          text,
  p_payload         jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'inbox_notification_create: clinic_id obrigatorio (ADR-028)';
  END IF;
  IF p_source NOT IN ('lara', 'mira', 'system') THEN
    RAISE EXCEPTION 'inbox_notification_create: source invalido %', p_source;
  END IF;

  INSERT INTO public.inbox_notifications (clinic_id, conversation_id, source, reason, payload)
  VALUES (p_clinic_id, p_conversation_id, p_source, p_reason, p_payload)
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.inbox_notification_create(uuid, uuid, text, text, jsonb)
  TO service_role;

-- Mark-as-read (atendente clica no sino) · authenticated apenas, scope por RLS.
CREATE OR REPLACE FUNCTION public.inbox_notification_mark_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_clinic_id uuid;
  v_updated int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  v_clinic_id := public.app_clinic_id();

  UPDATE public.inbox_notifications
  SET is_read = true, read_by = v_user_id, read_at = now()
  WHERE id = p_notification_id
    AND clinic_id = v_clinic_id
    AND is_read = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated > 0, 'updated', v_updated);
END
$$;

GRANT EXECUTE ON FUNCTION public.inbox_notification_mark_read(uuid) TO authenticated;

-- ── Sanity check ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_table_exists boolean;
  v_rls_enabled boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='inbox_notifications')
    INTO v_table_exists;
  IF NOT v_table_exists THEN RAISE EXCEPTION 'Sanity: inbox_notifications nao foi criada'; END IF;

  SELECT relrowsecurity FROM pg_class WHERE relname='inbox_notifications' AND relnamespace='public'::regnamespace
    INTO v_rls_enabled;
  IF NOT v_rls_enabled THEN RAISE EXCEPTION 'Sanity: RLS nao esta habilitada em inbox_notifications'; END IF;

  RAISE NOTICE 'Migration 847 OK · inbox_notifications + 2 RPCs criadas';
END $$;

-- Recarrega cache PostgREST · client passa a ver as RPCs imediatamente
NOTIFY pgrst, 'reload schema';
