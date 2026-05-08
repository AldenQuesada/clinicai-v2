-- =============================================================================
-- 20260800000145_clinicai_v2_secretaria_default_label.sql
-- Patch SECRETARIA KPI B (2026-05-07) · rename visual de "Luciana" pra "Secretaria"
-- =============================================================================
--
-- Contexto:
-- Auditoria 2026-05-07 confirmou que "Luciana" hoje NAO eh atribuicao real ·
-- eh bucket operacional default da Secretaria (90 conversas na fila Luciana,
-- mas Luciana real assigned_to = 1). Label confunde a operacao.
--
-- Esta migration trocou APENAS:
--   - operational_owner_label = 'Luciana'  → 'Secretaria'  (CASE ELSE branch)
--
-- Mantido (zero quebra de consumer):
--   - operational_owner = 'luciana' (internal key · UI/API filtram por isso)
--   - is_luciana = boolean (UI/API filtram por isso · mig 130 linha 367-374)
--   - is_dra, is_aguardando, is_urgente, is_secretaria, is_lara, is_voce, is_mira
--   - todas as 33 colunas existentes · mesmo shape · mesmo tipo
--   - filtros hardcoded (wa_number_id='ead8a6f9...' · inbox_role='secretaria')
--   - regra Mirian (lower(name) LIKE '%mirian%')
--   - filtros de archived/cross_internal_loop (mig 130)
--
-- NAO inclui:
--   - Alden (fica pra Onda 3 separada · vai precisar adicionar
--     LIKE '%alden%' OR role='owner' nos predicados is_dra/operational_owner)
--   - Resolver wa_number_id hardcoded (debito separado)
--   - Renomear chave 'luciana' → 'secretaria' (nao seguro · varios consumers
--     filtram por essa string · este patch eh APENAS o LABEL visual)
--
-- ⚠️  CREATE OR REPLACE VIEW · idempotente · mantem 100% das colunas e nomes.
-- Mesma assinatura que mig 130 · qualquer caller continua funcionando.
-- Single change: branch ELSE do CASE retorna 'Secretaria' em vez de 'Luciana'.
--
-- Esta migration deve ser aplicada manualmente em prod (gold-standard das
-- views · igual mig 126/127/128/129/130).
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

internal_phone_keys AS (
  SELECT wn.clinic_id, norm.d AS phone_key
    FROM public.wa_numbers wn
    CROSS JOIN LATERAL (
      SELECT regexp_replace(COALESCE(wn.phone, ''), '\D', '', 'g') AS d
    ) norm
   WHERE length(norm.d) >= 8

  UNION ALL

  SELECT wn.clinic_id,
         substring(norm.d FROM 1 FOR 4) || substring(norm.d FROM 6) AS phone_key
    FROM public.wa_numbers wn
    CROSS JOIN LATERAL (
      SELECT regexp_replace(COALESCE(wn.phone, ''), '\D', '', 'g') AS d
    ) norm
   WHERE length(norm.d) = 13
     AND substring(norm.d FROM 5 FOR 1) = '9'

  UNION ALL

  SELECT wn.clinic_id,
         substring(norm.d FROM 1 FOR 4) || '9' || substring(norm.d FROM 5) AS phone_key
    FROM public.wa_numbers wn
    CROSS JOIN LATERAL (
      SELECT regexp_replace(COALESCE(wn.phone, ''), '\D', '', 'g') AS d
    ) norm
   WHERE length(norm.d) = 12

  UNION ALL

  SELECT wn.clinic_id, right(norm.d, 8) AS phone_key
    FROM public.wa_numbers wn
    CROSS JOIN LATERAL (
      SELECT regexp_replace(COALESCE(wn.phone, ''), '\D', '', 'g') AS d
    ) norm
   WHERE length(norm.d) >= 8
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
  JOIN public.wa_numbers w
    ON w.id = c.wa_number_id
  LEFT JOIN msg_rollup mr
    ON mr.conversation_id = c.id
  LEFT JOIN public.profiles p
    ON p.id = c.assigned_to
  WHERE c.deleted_at IS NULL
    AND w.id = 'ead8a6f9-6e0e-4a89-8268-155392794f69'::uuid
    AND w.inbox_role = 'secretaria'
    AND w.is_active IS TRUE
    AND COALESCE(c.metadata->>'archived_at', '') = ''
    AND COALESCE(c.metadata->>'archived_reason', '') <> 'cross_internal_loop'
    AND NOT EXISTS (
      SELECT 1
        FROM internal_phone_keys ipk
       WHERE ipk.clinic_id = c.clinic_id
         AND (
           ipk.phone_key = regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g')
           OR ipk.phone_key = right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 8)
         )
    )
)

SELECT
  b.*,

  (
    b.status = 'active'
    AND b.assigned_to IS NOT NULL
  ) AS is_assigned,

  (
    b.status = 'active'
    AND b.assigned_to IS NOT NULL
    AND b.assigned_to_is_active IS TRUE
    AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%mirian%'
  ) AS is_dra,

  (
    b.status = 'active'
    AND b.assigned_to IS NULL
    AND COALESCE(b.ai_enabled, false) = true
    AND b.inbox_role NOT IN ('secretaria', 'b2b')
  ) AS is_lara,

  FALSE AS is_voce,

  (
    b.status = 'active'
    AND b.inbox_role = 'secretaria'
  ) AS is_secretaria,

  FALSE AS is_mira,

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

  -- ── Donos operacionais canônicos (mig 130 base · KPI B 2026-05-07) ──────
  -- operational_owner: chave INTERNAL · continua 'luciana' pra zero quebra
  -- de consumer (UI/API filtram por essa string em varios lugares).
  CASE
    WHEN b.status = 'active'
      AND b.assigned_to IS NOT NULL
      AND b.assigned_to_is_active IS TRUE
      AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%mirian%'
    THEN 'mirian'
    ELSE 'luciana'
  END AS operational_owner,

  -- operational_owner_label: VISUAL · "Luciana" virou "Secretaria" porque
  -- o bucket default eh fila operacional, nao pessoa (auditoria 2026-05-07
  -- confirmou Luciana real assigned_to = 1, fila Luciana = 90).
  CASE
    WHEN b.status = 'active'
      AND b.assigned_to IS NOT NULL
      AND b.assigned_to_is_active IS TRUE
      AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%mirian%'
    THEN 'Mirian'
    ELSE 'Secretaria'
  END AS operational_owner_label,

  -- is_luciana mantido como nome de coluna · semantica = "esta na fila
  -- Secretaria default" (NOT is_dra). Renomear coluna seria breaking change
  -- pra UI/API · fica como debt para limpeza futura.
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
'Canonical operational view for Lara dashboard (Phase 2 hardened · 2026-05-05 · KPI B label rename 2026-05-07). Filters to current Secretaria B&H WhatsApp source only. Excludes internal wa_numbers and conversations marked archived. Ownership is Mirian or default (Secretaria). Internal key operational_owner stays "luciana" for backward compat; visible label operational_owner_label = "Secretaria" (was "Luciana" until KPI B 2026-05-07 · audit confirmed it was bucket-default not person assignment). is_luciana column kept for backward compat (semantic: "in default Secretaria queue" · NOT is_dra).';

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- FIM · 20260800000145 · NÃO RODAR via supabase CLI/Mgmt API · aplicacao
-- manual em prod (gold-standard pra views · convencao mig 126-130).
-- =============================================================================
