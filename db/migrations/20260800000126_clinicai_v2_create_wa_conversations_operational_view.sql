-- =============================================================================
-- 20260800000127_clinicai_v2_create_wa_conversations_operational_view.sql
-- Versionamento da view operacional canônica (já aplicada manualmente em prod)
-- =============================================================================
--
-- Single source of truth pro dashboard de conversas Lara V2 (Alden 2026-05-05).
-- A view governa pills/filas no frontend · substitui regras espalhadas e
-- tags legadas (pronto_agendar/perguntou_preco/precisa_humano/...) que viravam
-- "tag zumbi" sem mecanismo de saída.
--
-- Modelo de donos operacionais (regra canônica):
--   - 'mirian'  → conversa atribuída à Dra (assigned_to = perfil "mirian"
--                 active na clínica)
--   - 'luciana' → todas as outras conversas active do dashboard
--
-- VOCÊ e MIRA NÃO são donos operacionais neste dashboard:
--   - is_voce = FALSE sempre
--   - is_mira = FALSE sempre
--   - LARA aparece como estado da IA (is_lara), não como dono
--
-- ⚠️  Esta migration é APENAS pra versionamento. A view JÁ ESTÁ em prod
-- (aplicada manualmente). Não rodar via supabase CLI ou Mgmt API.
-- =============================================================================

CREATE OR REPLACE VIEW public.wa_conversations_operational_view
WITH (security_invoker = true)
AS
WITH msg_rollup AS (
  SELECT
    m.conversation_id,

    MAX(m.sent_at) FILTER (
      WHERE m.direction = 'inbound'
    ) AS last_inbound_msg,

    -- Última resposta humana válida (não Lara/IA/system).
    -- Cobertura ampla: sender='humano' OU (ai_generated=false E sender NOT IN
    -- pool de IA). Essa redundância é proposital · em mensagens antigas o
    -- campo `sender` pode estar NULL ou 'agent' antes da convenção atual.
    MAX(m.sent_at) FILTER (
      WHERE m.direction = 'outbound'
        AND (
          m.sender = 'humano'
          OR (
            COALESCE(m.ai_generated, false) = false
            AND COALESCE(m.sender, '') NOT IN ('lara', 'assistant', 'ai', 'system')
          )
        )
    ) AS last_human_msg,

    MAX(m.sent_at) FILTER (
      WHERE m.direction = 'outbound'
        AND (
          m.sender = 'lara'
          OR COALESCE(m.ai_generated, false) = true
        )
    ) AS last_lara_msg,

    MAX(m.sent_at) FILTER (
      WHERE m.direction = 'outbound'
    ) AS last_outbound_msg

  FROM public.wa_messages m
  WHERE m.deleted_at IS NULL
  GROUP BY m.conversation_id
),

base AS (
  SELECT
    c.id,
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

    NULLIF(
      TRIM(
        CONCAT_WS(
          ' ',
          NULLIF(p.first_name, ''),
          NULLIF(p.last_name, '')
        )
      ),
      ''
    ) AS assigned_to_name,

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

    mr.last_inbound_msg,
    mr.last_human_msg,
    mr.last_lara_msg,
    mr.last_outbound_msg,

    ROUND(
      (
        EXTRACT(
          EPOCH FROM (
            now() - COALESCE(mr.last_inbound_msg, c.last_inbound_time, c.last_lead_msg)
          )
        ) / 60
      )::numeric,
      1
    ) AS minutes_since_last_inbound,

    c.created_at,
    c.updated_at,
    c.deleted_at

  FROM public.wa_conversations c
  LEFT JOIN msg_rollup mr
    ON mr.conversation_id = c.id
  LEFT JOIN public.profiles p
    ON p.id = c.assigned_to
)

SELECT
  b.*,

  -- ── Estado de atribuição ────────────────────────────────────────────────
  (
    b.status = 'active'
    AND b.assigned_to IS NOT NULL
  ) AS is_assigned,

  -- Dra (Mirian) detectada via match de nome no profile vinculado a
  -- assigned_to · resiliente a mudanças de user_id e a múltiplas Mirian's
  -- (case-insensitive · contém "mirian" no nome composto).
  (
    b.status = 'active'
    AND b.assigned_to IS NOT NULL
    AND b.assigned_to_is_active IS TRUE
    AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%mirian%'
  ) AS is_dra,

  -- Lara como estado da IA · NÃO é dona operacional · só sinaliza que IA
  -- ainda conduz a conv (conv não atribuída + ai_enabled=true + canal SDR).
  (
    b.status = 'active'
    AND b.assigned_to IS NULL
    AND COALESCE(b.ai_enabled, false) = true
    AND b.inbox_role NOT IN ('secretaria', 'b2b')
  ) AS is_lara,

  -- VOCÊ e MIRA: forçados FALSE · neste dashboard só Luciana/Mirian governam.
  -- (is_secretaria continua refletindo inbox_role='secretaria' pra contextos
  -- que ainda dependem dele · não é dono operacional aqui)
  FALSE AS is_voce,

  (
    b.status = 'active'
    AND b.inbox_role = 'secretaria'
  ) AS is_secretaria,

  FALSE AS is_mira,

  -- ── SLA secretária (Aguardando/Urgente) ─────────────────────────────────
  (
    b.status = 'active'
    AND COALESCE(b.ai_enabled, false) = false
    AND COALESCE(b.unread_count, 0) > 0
    AND COALESCE(b.last_inbound_msg, b.last_inbound_time, b.last_lead_msg) IS NOT NULL
    AND COALESCE(b.last_inbound_msg, b.last_inbound_time, b.last_lead_msg)
        > COALESCE(b.last_human_msg, '1970-01-01'::timestamptz)
  ) AS is_aguardando,

  (
    b.status = 'active'
    AND COALESCE(b.ai_enabled, false) = false
    AND COALESCE(b.unread_count, 0) > 0
    AND COALESCE(b.last_inbound_msg, b.last_inbound_time, b.last_lead_msg) IS NOT NULL
    AND COALESCE(b.last_inbound_msg, b.last_inbound_time, b.last_lead_msg)
        > COALESCE(b.last_human_msg, '1970-01-01'::timestamptz)
    AND now() - COALESCE(b.last_inbound_msg, b.last_inbound_time, b.last_lead_msg) > interval '5 minutes'
  ) AS is_urgente,

  CASE
    WHEN NOT (
      b.status = 'active'
      AND COALESCE(b.ai_enabled, false) = false
      AND COALESCE(b.unread_count, 0) > 0
      AND COALESCE(b.last_inbound_msg, b.last_inbound_time, b.last_lead_msg) IS NOT NULL
      AND COALESCE(b.last_inbound_msg, b.last_inbound_time, b.last_lead_msg)
          > COALESCE(b.last_human_msg, '1970-01-01'::timestamptz)
    ) THEN 'none'

    WHEN now() - COALESCE(b.last_inbound_msg, b.last_inbound_time, b.last_lead_msg) > interval '30 minutes'
      THEN 'critico'

    WHEN now() - COALESCE(b.last_inbound_msg, b.last_inbound_time, b.last_lead_msg) > interval '5 minutes'
      THEN 'vermelho'

    ELSE 'aguardando'
  END AS response_color,

  -- ── Tag legada (zumbi) · sinalização pra audit, não governa pills ──────
  (
    b.status = 'active'
    AND COALESCE(b.tags, ARRAY[]::text[]) && ARRAY[
      'pronto_agendar',
      'perguntou_preco',
      'precisa_humano',
      'emergencia',
      'qualificado'
    ]::text[]
  ) AS has_legacy_operational_tag,

  -- ── Donos operacionais canônicos (regra Alden 2026-05-05) ──────────────
  -- Apenas 2 buckets neste dashboard: 'mirian' (Dra) e 'luciana' (todo o
  -- resto active). Mira/Você ficam de fora porque não assumem conversa
  -- operacional aqui.
  CASE
    WHEN b.status = 'active'
      AND b.assigned_to IS NOT NULL
      AND b.assigned_to_is_active IS TRUE
      AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%mirian%'
    THEN 'mirian'
    ELSE 'luciana'
  END AS operational_owner,

  CASE
    WHEN b.status = 'active'
      AND b.assigned_to IS NOT NULL
      AND b.assigned_to_is_active IS TRUE
      AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%mirian%'
    THEN 'Mirian'
    ELSE 'Luciana'
  END AS operational_owner_label,

  -- is_luciana = active AND NOT is_dra (default pro fluxo da secretaria)
  (
    b.status = 'active'
    AND NOT (
      b.assigned_to IS NOT NULL
      AND b.assigned_to_is_active IS TRUE
      AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%mirian%'
    )
  ) AS is_luciana

FROM base b
WHERE b.deleted_at IS NULL;

COMMENT ON VIEW public.wa_conversations_operational_view IS
'Canonical operational view for Lara conversations. Derives inbox pills/queues from database fields instead of legacy tags. Operational owners: mirian (Dra) e luciana (default). VOCÊ e MIRA forced FALSE neste dashboard. Retorno intentionally excluded until structured return_due_at exists.';

-- =============================================================================
-- FIM · 20260800000127 · NÃO RODAR (view já aplicada em prod manualmente)
-- =============================================================================
