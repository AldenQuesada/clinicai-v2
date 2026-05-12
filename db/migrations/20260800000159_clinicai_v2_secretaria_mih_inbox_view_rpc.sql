-- ============================================================================
-- Migration 159 · clinicai-v2 · secretaria Mih (2986) inbox view + RPCs
-- ============================================================================
--
-- Propósito:
--   Blindar o DB contra regressão do incidente 2026-05-11 (Patch 1 corrigiu
--   no código a query do /secretaria · esta migration cria a fonte canônica
--   no banco). Três artefatos:
--
--   1. VIEW public.secretaria_mih_conversations_view
--      - Escopo HARDCODED no canal Mih (phone 5544991622986).
--      - Adiciona sort_at + is_preview_stale + preview_drift_seconds
--        derivados de wa_messages real · UI/RPC ordenam por sort_at e
--        deixam de afundar conversas com preview drifted.
--
--   2. RPC public.get_secretaria_mih_inbox(p_limit, p_before)
--      - Cursor-based em sort_at DESC (greatest do preview + msg + updated).
--      - Filtro tenant via app_clinic_id() (JWT) com fallback _default_clinic_id().
--      - Substitui no futuro a chamada ConversationRepository.listByStatus
--        com inbox_role='secretaria' (que mistura 4 canais legacy).
--
--   3. RPC public.get_secretaria_mih_health_check()
--      - Read-only · retorna jsonb com 9 counters + verdict.
--      - Verdicts em ordem de severidade:
--          FAIL_MIH_WA_NUMBER_NOT_FOUND
--          FAIL_MESSAGES_EXIST_BUT_VIEW_EMPTY
--          WARN_SECRETARIA_INBOX_ROLE_HAS_MULTIPLE_CHANNELS
--          WARN_PREVIEW_DRIFT
--          PASS_SECRETARIA_MIH_DB_HEALTHY
--      - Use por monitoring/cron read-only (sem efeito colateral).
--
-- Fora de escopo (NÃO toca):
--   - Triggers SQL existentes (incluindo _sync_wa_conversation_preview_v2)
--   - Backfill de last_message_at drift residual
--   - wa_outbox / agenda / cron / _wa_outbox_tick / _enqueue_agenda_alert
--   - wa_agenda_automations
--   - TS code (apps/lara/src/)
--   - Mira / vouchers / B2B
--   - Mensagens / envio real
--
-- Rollback: down DROP em ordem reversa (view depende das RPCs · drop RPCs
-- antes da view).
--
-- Apply controlado: prep · não aplicar nesta fase (review SQL primeiro).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. VIEW · escopo canônico do canal Mih
-- ────────────────────────────────────────────────────────────────────────────
--
-- Resolução do wa_number:
--   - phone='5544991622986' (canônico).
--   - is_active=true.
--   - Esperado 1 row por clinic. Caso multi-clinic, view retorna 1 row por
--     wa_number match (cada clinic com seu Mih).
--
-- Colunas derivadas:
--   - latest_message_at_from_messages: max(wa_messages.sent_at) por conv ·
--     ignora deleted_at.
--   - sort_at: GREATEST(last_message_at, max msg, updated_at) · ordem robusta
--     contra preview drift. NULLS LAST porque conversas sem msg podem existir.
--   - is_preview_stale: max msg > last_message_at + 60s (cosmético, ajuda dx).
--   - preview_drift_seconds: int em segundos · null se sem msg.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.secretaria_mih_conversations_view AS
WITH mih_channel AS (
  SELECT id, clinic_id
  FROM public.wa_numbers
  WHERE phone = '5544991622986'
    AND is_active = true
),
msg_max AS (
  SELECT m.conversation_id,
         max(m.sent_at) AS latest_message_at_from_messages
  FROM public.wa_messages m
  WHERE m.deleted_at IS NULL
  GROUP BY m.conversation_id
)
SELECT
  c.id,
  c.clinic_id,
  c.wa_number_id,
  c.phone,
  c.display_name,
  c.lead_id,
  c.status,
  c.inbox_role,
  c.unread_count,
  c.last_message_at,
  c.last_message_text,
  c.last_lead_msg,
  c.last_inbound_time,
  c.ai_enabled,
  c.ai_paused_until,
  c.assigned_to,
  c.assigned_at,
  c.created_at,
  c.updated_at,
  mm.latest_message_at_from_messages,
  GREATEST(
    c.last_message_at,
    mm.latest_message_at_from_messages,
    c.updated_at
  ) AS sort_at,
  CASE
    WHEN mm.latest_message_at_from_messages IS NOT NULL
     AND mm.latest_message_at_from_messages > COALESCE(c.last_message_at, '1970-01-01'::timestamptz) + interval '60 seconds'
    THEN true
    ELSE false
  END AS is_preview_stale,
  CASE
    WHEN mm.latest_message_at_from_messages IS NOT NULL AND c.last_message_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (mm.latest_message_at_from_messages - c.last_message_at))::int
    ELSE NULL
  END AS preview_drift_seconds
FROM public.wa_conversations c
JOIN mih_channel mih
  ON mih.id = c.wa_number_id
 AND mih.clinic_id = c.clinic_id
LEFT JOIN msg_max mm ON mm.conversation_id = c.id
WHERE c.deleted_at IS NULL;

COMMENT ON VIEW public.secretaria_mih_conversations_view IS
  'Mig 159 · canônico do canal Secretaria Mih (5544991622986) · sort_at + '
  'is_preview_stale + preview_drift_seconds robustos a drift. Use via '
  'get_secretaria_mih_inbox() pra UI · view direto só pra audit/health.';

GRANT SELECT ON public.secretaria_mih_conversations_view TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RPC · cursor-based inbox listing
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_secretaria_mih_inbox(
  p_limit  int DEFAULT 50,
  p_before timestamptz DEFAULT NULL
)
RETURNS SETOF public.secretaria_mih_conversations_view
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_clinic uuid;
  v_limit  int;
BEGIN
  v_clinic := COALESCE(public.app_clinic_id(), public._default_clinic_id());
  v_limit  := greatest(1, least(200, COALESCE(p_limit, 50)));

  RETURN QUERY
    SELECT v.*
    FROM public.secretaria_mih_conversations_view v
    WHERE v.clinic_id = v_clinic
      AND v.status IN ('active','paused')
      AND (p_before IS NULL OR v.sort_at < p_before)
    ORDER BY v.sort_at DESC NULLS LAST
    LIMIT v_limit;
END
$function$;

COMMENT ON FUNCTION public.get_secretaria_mih_inbox(int, timestamptz) IS
  'Mig 159 · listagem cursor-based da inbox Mih · ordem por sort_at robusto '
  '(GREATEST de last_message_at + max wa_messages.sent_at + updated_at). '
  'Substitui no futuro ConversationRepository.listByStatus(inbox=secretaria) '
  'pra não misturar canais. Tenant via app_clinic_id() JWT.';

GRANT EXECUTE ON FUNCTION public.get_secretaria_mih_inbox(int, timestamptz)
  TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RPC · health check (read-only, retorna jsonb com counters + verdict)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_secretaria_mih_health_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_clinic                    uuid;
  v_mih_id                    uuid;
  v_inbox_role_total          int;
  v_mih_total                 int;
  v_non_mih_secretaria_total  int;
  v_msgs_24h                  int;
  v_convs_with_msgs_24h       int;
  v_view_rows_total           int;
  v_drift_count               int;
  v_max_drift                 int;
  v_verdict                   text;
BEGIN
  v_clinic := COALESCE(public.app_clinic_id(), public._default_clinic_id());

  -- Resolve canal Mih · phone canônico + fallback label.
  SELECT id INTO v_mih_id
  FROM public.wa_numbers
  WHERE clinic_id = v_clinic
    AND phone = '5544991622986'
    AND is_active = true
  LIMIT 1;

  IF v_mih_id IS NULL THEN
    SELECT id INTO v_mih_id
    FROM public.wa_numbers
    WHERE clinic_id = v_clinic
      AND label = 'Secretaria B&H'
      AND is_active = true
    LIMIT 1;
  END IF;

  IF v_mih_id IS NULL THEN
    RETURN jsonb_build_object(
      'verdict', 'FAIL_MIH_WA_NUMBER_NOT_FOUND',
      'mih_wa_number_id', NULL,
      'clinic_id', v_clinic
    );
  END IF;

  -- Counters paralelos (todas conditions já indexadas).
  SELECT count(*) INTO v_inbox_role_total
  FROM public.wa_conversations c
  WHERE c.clinic_id = v_clinic
    AND c.inbox_role = 'secretaria'
    AND c.status IN ('active','paused')
    AND c.deleted_at IS NULL;

  SELECT count(*) INTO v_mih_total
  FROM public.wa_conversations c
  WHERE c.clinic_id = v_clinic
    AND c.wa_number_id = v_mih_id
    AND c.status IN ('active','paused')
    AND c.deleted_at IS NULL;

  v_non_mih_secretaria_total := GREATEST(0, v_inbox_role_total - v_mih_total);

  SELECT count(*) INTO v_msgs_24h
  FROM public.wa_messages m
  JOIN public.wa_conversations c ON c.id = m.conversation_id
  WHERE c.wa_number_id = v_mih_id
    AND m.sent_at >= now() - interval '24 hours'
    AND m.deleted_at IS NULL;

  SELECT count(DISTINCT cv.id) INTO v_convs_with_msgs_24h
  FROM public.wa_conversations cv
  JOIN public.wa_messages m ON m.conversation_id = cv.id
  WHERE cv.wa_number_id = v_mih_id
    AND m.sent_at >= now() - interval '24 hours'
    AND m.deleted_at IS NULL;

  SELECT count(*) INTO v_view_rows_total
  FROM public.secretaria_mih_conversations_view v
  WHERE v.clinic_id = v_clinic
    AND v.status IN ('active','paused');

  SELECT count(*), COALESCE(max(preview_drift_seconds), 0)
    INTO v_drift_count, v_max_drift
  FROM public.secretaria_mih_conversations_view v
  WHERE v.clinic_id = v_clinic
    AND v.is_preview_stale = true;

  -- Verdict por severidade · primeira condição satisfeita ganha.
  IF v_msgs_24h > 0 AND v_view_rows_total = 0 THEN
    v_verdict := 'FAIL_MESSAGES_EXIST_BUT_VIEW_EMPTY';
  ELSIF v_non_mih_secretaria_total > 0 THEN
    v_verdict := 'WARN_SECRETARIA_INBOX_ROLE_HAS_MULTIPLE_CHANNELS';
  ELSIF v_drift_count > 0 THEN
    v_verdict := 'WARN_PREVIEW_DRIFT';
  ELSE
    v_verdict := 'PASS_SECRETARIA_MIH_DB_HEALTHY';
  END IF;

  RETURN jsonb_build_object(
    'mih_wa_number_id', v_mih_id,
    'clinic_id', v_clinic,
    'inbox_role_secretaria_total', v_inbox_role_total,
    'mih_conversations_total', v_mih_total,
    'non_mih_secretaria_conversations_total', v_non_mih_secretaria_total,
    'messages_24h', v_msgs_24h,
    'conversations_with_messages_24h', v_convs_with_msgs_24h,
    'view_rows_total', v_view_rows_total,
    'preview_drift_count', v_drift_count,
    'max_preview_drift_seconds', v_max_drift,
    'verdict', v_verdict
  );
END
$function$;

COMMENT ON FUNCTION public.get_secretaria_mih_health_check() IS
  'Mig 159 · health check read-only do canal Secretaria Mih. Retorna jsonb '
  'com 9 counters + verdict. Use por monitoring/cron · zero efeito colateral.';

GRANT EXECUTE ON FUNCTION public.get_secretaria_mih_health_check()
  TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY CHECK (dentro da transação · aborta apply em violação)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_view_exists       boolean;
  v_rpc_inbox_exists  boolean;
  v_rpc_health_exists boolean;
  v_view_has_sort_at  boolean;
  v_view_has_stale    boolean;
  v_view_has_drift    boolean;
  v_view_has_latest   boolean;
BEGIN
  -- VIEW existe
  SELECT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema='public' AND table_name='secretaria_mih_conversations_view'
  ) INTO v_view_exists;

  IF NOT v_view_exists THEN
    RAISE EXCEPTION 'sanity: secretaria_mih_conversations_view nao foi criada';
  END IF;

  -- Colunas derivadas obrigatórias
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='secretaria_mih_conversations_view' AND column_name='sort_at')
    INTO v_view_has_sort_at;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='secretaria_mih_conversations_view' AND column_name='is_preview_stale')
    INTO v_view_has_stale;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='secretaria_mih_conversations_view' AND column_name='preview_drift_seconds')
    INTO v_view_has_drift;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='secretaria_mih_conversations_view' AND column_name='latest_message_at_from_messages')
    INTO v_view_has_latest;

  IF NOT v_view_has_sort_at THEN
    RAISE EXCEPTION 'sanity: view nao tem coluna sort_at';
  END IF;
  IF NOT v_view_has_stale THEN
    RAISE EXCEPTION 'sanity: view nao tem coluna is_preview_stale';
  END IF;
  IF NOT v_view_has_drift THEN
    RAISE EXCEPTION 'sanity: view nao tem coluna preview_drift_seconds';
  END IF;
  IF NOT v_view_has_latest THEN
    RAISE EXCEPTION 'sanity: view nao tem coluna latest_message_at_from_messages';
  END IF;

  -- RPCs existem
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_secretaria_mih_inbox'
  ) INTO v_rpc_inbox_exists;
  IF NOT v_rpc_inbox_exists THEN
    RAISE EXCEPTION 'sanity: RPC get_secretaria_mih_inbox nao foi criada';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_secretaria_mih_health_check'
  ) INTO v_rpc_health_exists;
  IF NOT v_rpc_health_exists THEN
    RAISE EXCEPTION 'sanity: RPC get_secretaria_mih_health_check nao foi criada';
  END IF;

  RAISE NOTICE 'mig 159 · view + 2 RPCs criados · sort_at/preview drift colunas presentes';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
