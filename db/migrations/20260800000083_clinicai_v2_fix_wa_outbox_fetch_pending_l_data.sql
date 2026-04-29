-- ============================================================================
-- Mig 83 · Fix wa_outbox_fetch_pending · l.data → l.metadata
-- ============================================================================
--
-- BUG: RPC wa_outbox_fetch_pending lia l.data->>'queixa_principal' mas a
-- coluna `data` em leads foi renomeada/removida no REFACTOR LEAD MODEL.
-- Coluna canônica é `metadata` (jsonb).
--
-- Sintoma: cron `wa-outbox-worker` falha a cada minuto com HTTP 500
--   {"error":"fetch_pending_failed","detail":"column l.data does not exist"}
--
-- Detectado depois do fix da mig 82 (b2b_voucher_to_lead_bridge) durante
-- monitoramento de pipeline 29/04/2026.
--
-- Fix mínimo: replace l.data por l.metadata. Mantém COALESCE com '' como
-- fallback (queixa_principal pode não existir em leads novos, especialmente
-- os criados via voucher B2B onde queixa não é coletada na origem).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.wa_outbox_fetch_pending(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_result jsonb;
  v_ids uuid[];
BEGIN
  WITH pending AS (
    SELECT id, phone, content, template_id, conversation_id, lead_id, media_url, media_caption, broadcast_id
    FROM wa_outbox
    WHERE clinic_id = v_clinic_id AND status = 'pending'
      AND (scheduled_at IS NULL OR scheduled_at <= now())
      AND attempts < max_attempts
    ORDER BY priority ASC, created_at ASC
    LIMIT p_limit FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE wa_outbox SET status = 'processing', attempts = attempts + 1, processed_at = now()
    WHERE id IN (SELECT id FROM pending) RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM updated;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',              o.id,
      'phone',           o.phone,
      'content',         (
        regexp_replace(
          regexp_replace(
            COALESCE(o.content, ''),
            '\[nome\]',
            COALESCE(NULLIF(split_part(COALESCE(l.name, ''), ' ', 1), ''), 'tudo bem'),
            'gi'
          ),
          '\[queixa\]',
          COALESCE(NULLIF(b.target_filter->>'queixa', ''), 'sua queixa'),
          'gi'
        )
      ),
      'conversation_id', o.conversation_id,
      'lead_id',         o.lead_id,
      'media_url',       o.media_url,
      'media_caption',   o.media_caption,
      'lead_name',       COALESCE(l.name, ''),
      -- FIX mig 83: l.data → l.metadata (REFACTOR LEAD MODEL)
      'lead_queixa',     COALESCE((l.metadata->>'queixa_principal')::text, ''),
      'media_position',  COALESCE(b.media_position, 'above')
    )
  ), '[]'::jsonb)
  INTO v_result
  FROM wa_outbox o
  LEFT JOIN leads l         ON l.id = o.lead_id
  LEFT JOIN wa_broadcasts b ON b.id = o.broadcast_id
  WHERE o.id = ANY(COALESCE(v_ids, '{}'));

  RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
