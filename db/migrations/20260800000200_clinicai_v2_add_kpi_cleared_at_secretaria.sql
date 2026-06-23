-- ============================================================================
-- clinicai-v2 · Secretaria · ENCERRAR operacional via kpi_cleared_at
-- migration 200 · base canônica = mig 199 (effective-reply)
-- ----------------------------------------------------------------------------
-- OBJETIVO: permitir "Encerrar" uma pendência da Secretaria SEM remover a
--   conversa da inbox/timeline e SEM quebrar a ordem natural do WhatsApp.
--   O Encerrar só limpa as LENTES de KPI (Aguardando/Urgente).
--
-- COLUNA: wa_conversations.kpi_cleared_at timestamptz NULL
--   - NÃO é status, NÃO arquiva, NÃO resolve, NÃO esconde, NÃO reordena.
--   - is_aguardando/is_urgente passam a respeitar: se houver limpeza
--     operacional (kpi_cleared_at) >= última msg do paciente, sai dos KPIs.
--   - Se o paciente falar DEPOIS de kpi_cleared_at, reabre automaticamente
--     (patient_last_at > kpi_cleared_at).
--
-- ESCOPO: adiciona a coluna + CREATE OR REPLACE VIEW (199 + cláusula kpi).
--   Preserva colunas/ordem/grants/security_invoker/filtros. Não muda
--   status/last_message_at/sort_at/deleted_at. Não faz UPDATE de dados.
--   Não toca sla.ts/Lara/envio.
-- ============================================================================

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS kpi_cleared_at timestamptz NULL;

COMMENT ON COLUMN public.wa_conversations.kpi_cleared_at IS
  'Operational KPI clear marker for Secretaria. Does NOT resolve, archive, hide, reorder, or close the conversation. If the patient sends a newer inbound message (patient_last_at > kpi_cleared_at), KPIs reopen automatically.';

CREATE OR REPLACE VIEW public.wa_conversations_operational_view
WITH (security_invoker = true) AS
WITH msg_rollup AS (
  SELECT m.conversation_id,
    max(m.sent_at) FILTER (WHERE m.direction = 'inbound'::text) AS last_inbound_msg,
    max(m.sent_at) FILTER (WHERE m.direction = 'outbound'::text AND (m.sender = 'humano'::text OR COALESCE(m.ai_generated, false) = false AND (COALESCE(m.sender, ''::text) <> ALL (ARRAY['lara'::text, 'assistant'::text, 'ai'::text, 'system'::text])))) AS last_human_msg,
    max(m.sent_at) FILTER (WHERE m.direction = 'outbound'::text AND (m.sender = 'lara'::text OR COALESCE(m.ai_generated, false) = true)) AS last_lara_msg,
    max(m.sent_at) FILTER (WHERE m.direction = 'outbound'::text) AS last_outbound_msg
  FROM wa_messages m
  WHERE m.deleted_at IS NULL
  GROUP BY m.conversation_id
), internal_phone_keys AS (
  SELECT wn.clinic_id, norm.d AS phone_key
  FROM wa_numbers wn
    CROSS JOIN LATERAL ( SELECT regexp_replace(COALESCE(wn.phone, ''::text), '\D'::text, ''::text, 'g'::text) AS d) norm
  WHERE length(norm.d) >= 8
  UNION ALL
  SELECT wn.clinic_id, SUBSTRING(norm.d FROM 1 FOR 4) || SUBSTRING(norm.d FROM 6) AS phone_key
  FROM wa_numbers wn
    CROSS JOIN LATERAL ( SELECT regexp_replace(COALESCE(wn.phone, ''::text), '\D'::text, ''::text, 'g'::text) AS d) norm
  WHERE length(norm.d) = 13 AND SUBSTRING(norm.d FROM 5 FOR 1) = '9'::text
  UNION ALL
  SELECT wn.clinic_id, (SUBSTRING(norm.d FROM 1 FOR 4) || '9'::text) || SUBSTRING(norm.d FROM 5) AS phone_key
  FROM wa_numbers wn
    CROSS JOIN LATERAL ( SELECT regexp_replace(COALESCE(wn.phone, ''::text), '\D'::text, ''::text, 'g'::text) AS d) norm
  WHERE length(norm.d) = 12
  UNION ALL
  SELECT wn.clinic_id, "right"(norm.d, 8) AS phone_key
  FROM wa_numbers wn
    CROSS JOIN LATERAL ( SELECT regexp_replace(COALESCE(wn.phone, ''::text), '\D'::text, ''::text, 'g'::text) AS d) norm
  WHERE length(norm.d) >= 8
), base AS (
  SELECT c.id,
    c.clinic_id,
    c.lead_id,
    c.wa_number_id,
    c.phone,
    c.display_name,
    c.remote_jid,
    c.status,
    c.ai_enabled,
    c.inbox_role,
    c.paused_by,
    c.ai_paused_until,
    c.assigned_to,
    c.assigned_at,
    NULLIF(TRIM(BOTH FROM concat_ws(' '::text, NULLIF(p.first_name, ''::text), NULLIF(p.last_name, ''::text))), ''::text) AS assigned_to_name,
    p.role AS assigned_to_role,
    p.is_active AS assigned_to_is_active,
    c.tags,
    c.metadata,
    c.unread_count,
    c.last_message_at,
    c.last_message_text,
    c.last_lead_msg,
    c.last_inbound_time,
    c.last_ai_msg,
    c.kpi_cleared_at,
    mr.last_inbound_msg,
    mr.last_human_msg,
    mr.last_lara_msg,
    mr.last_outbound_msg,
    round(EXTRACT(epoch FROM now() - COALESCE(mr.last_inbound_msg, c.last_inbound_time, c.last_lead_msg)) / 60::numeric, 1) AS minutes_since_last_inbound,
    COALESCE(mr.last_inbound_msg, c.last_inbound_time, c.last_lead_msg) AS patient_last_at,
    GREATEST(
      COALESCE(mr.last_human_msg, '1970-01-01 00:00:00+00'::timestamp with time zone),
      COALESCE(mr.last_lara_msg,  '1970-01-01 00:00:00+00'::timestamp with time zone)
    ) AS last_effective_reply_at,
    (c.status = 'active'::text
      AND COALESCE(mr.last_inbound_msg, c.last_inbound_time, c.last_lead_msg) IS NOT NULL
      AND COALESCE(mr.last_inbound_msg, c.last_inbound_time, c.last_lead_msg) > GREATEST(
            COALESCE(mr.last_human_msg, '1970-01-01 00:00:00+00'::timestamp with time zone),
            COALESCE(mr.last_lara_msg,  '1970-01-01 00:00:00+00'::timestamp with time zone)
          )
    ) AS is_waiting_effective_reply,
    c.created_at,
    c.updated_at,
    c.deleted_at
  FROM wa_conversations c
    JOIN wa_numbers w ON w.id = c.wa_number_id
    LEFT JOIN msg_rollup mr ON mr.conversation_id = c.id
    LEFT JOIN profiles p ON p.id = c.assigned_to
  WHERE c.deleted_at IS NULL
    AND w.id = 'ead8a6f9-6e0e-4a89-8268-155392794f69'::uuid
    AND w.inbox_role = 'secretaria'::text
    AND w.is_active IS TRUE
    AND COALESCE(c.metadata ->> 'archived_at'::text, ''::text) = ''::text
    AND COALESCE(c.metadata ->> 'archived_reason'::text, ''::text) <> 'cross_internal_loop'::text
    AND NOT (EXISTS ( SELECT 1
        FROM internal_phone_keys ipk
        WHERE ipk.clinic_id = c.clinic_id
          AND (ipk.phone_key = regexp_replace(COALESCE(c.phone, ''::text), '\D'::text, ''::text, 'g'::text)
            OR ipk.phone_key = "right"(regexp_replace(COALESCE(c.phone, ''::text), '\D'::text, ''::text, 'g'::text), 8))))
), final_calc AS (
  -- is_aguardando final = esperando resposta efetiva E sem limpeza de KPI
  -- posterior/igual à última mensagem do paciente (Encerrar). Se o paciente
  -- falar depois do kpi_cleared_at, patient_last_at > kpi_cleared_at → reabre.
  SELECT b.*,
    (b.is_waiting_effective_reply
      AND (b.kpi_cleared_at IS NULL OR b.patient_last_at > b.kpi_cleared_at)
    ) AS is_aguardando_calc
  FROM base b
)
SELECT id,
  clinic_id,
  lead_id,
  wa_number_id,
  phone,
  display_name,
  remote_jid,
  status,
  ai_enabled,
  inbox_role,
  paused_by,
  ai_paused_until,
  assigned_to,
  assigned_at,
  assigned_to_name,
  assigned_to_role,
  assigned_to_is_active,
  tags,
  metadata,
  unread_count,
  last_message_at,
  last_message_text,
  last_lead_msg,
  last_inbound_time,
  last_ai_msg,
  last_inbound_msg,
  last_human_msg,
  last_lara_msg,
  last_outbound_msg,
  minutes_since_last_inbound,
  created_at,
  updated_at,
  deleted_at,
  status = 'active'::text AND assigned_to IS NOT NULL AS is_assigned,
  status = 'active'::text AND assigned_to IS NOT NULL AND assigned_to_is_active IS TRUE AND lower(COALESCE(assigned_to_name, ''::text)) ~~ '%mirian%'::text AS is_dra,
  status = 'active'::text AND assigned_to IS NULL AND COALESCE(ai_enabled, false) = true AND (inbox_role <> ALL (ARRAY['secretaria'::text, 'b2b'::text])) AS is_lara,
  false AS is_voce,
  status = 'active'::text AND inbox_role = 'secretaria'::text AND assigned_to IS NULL AS is_secretaria,
  false AS is_mira,
  -- ── is_aguardando = effective-reply + respeita kpi_cleared_at ──
  is_aguardando_calc AS is_aguardando,
  -- ── is_urgente = mesma base + threshold ──
  is_aguardando_calc AND (now() - patient_last_at) > '00:05:00'::interval AS is_urgente,
  -- ── response_color = mesma base ──
  CASE
    WHEN NOT is_aguardando_calc THEN 'none'::text
    WHEN (now() - patient_last_at) > '00:30:00'::interval THEN 'critico'::text
    WHEN (now() - patient_last_at) > '00:05:00'::interval THEN 'vermelho'::text
    ELSE 'aguardando'::text
  END AS response_color,
  status = 'active'::text AND COALESCE(tags, ARRAY[]::text[]) && ARRAY['pronto_agendar'::text, 'perguntou_preco'::text, 'precisa_humano'::text, 'emergencia'::text, 'qualificado'::text] AS has_legacy_operational_tag,
  CASE
    WHEN status = 'active'::text AND assigned_to IS NOT NULL AND assigned_to_is_active IS TRUE AND lower(COALESCE(assigned_to_name, ''::text)) ~~ '%mirian%'::text THEN 'mirian'::text
    WHEN status = 'active'::text AND assigned_to = '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid AND assigned_to_is_active IS TRUE THEN 'alden'::text
    WHEN assigned_to IS NULL THEN 'secretaria'::text
    WHEN status = 'active'::text AND assigned_to IS NOT NULL AND assigned_to_is_active IS TRUE AND lower(COALESCE(assigned_to_name, ''::text)) ~~ '%luciana%'::text AND assigned_to <> '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid THEN 'luciana'::text
    ELSE 'secretaria'::text
  END AS operational_owner,
  CASE
    WHEN status = 'active'::text AND assigned_to IS NOT NULL AND assigned_to_is_active IS TRUE AND lower(COALESCE(assigned_to_name, ''::text)) ~~ '%mirian%'::text THEN 'Mirian'::text
    WHEN status = 'active'::text AND assigned_to = '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid AND assigned_to_is_active IS TRUE THEN 'Alden'::text
    WHEN assigned_to IS NULL THEN 'Secretaria'::text
    WHEN status = 'active'::text AND assigned_to IS NOT NULL AND assigned_to_is_active IS TRUE AND lower(COALESCE(assigned_to_name, ''::text)) ~~ '%luciana%'::text AND assigned_to <> '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid THEN 'Luciana'::text
    ELSE 'Secretaria'::text
  END AS operational_owner_label,
  status = 'active'::text AND assigned_to IS NOT NULL AND assigned_to_is_active IS TRUE AND lower(COALESCE(assigned_to_name, ''::text)) ~~ '%luciana%'::text AND assigned_to <> '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid AS is_luciana
FROM final_calc
WHERE deleted_at IS NULL;
