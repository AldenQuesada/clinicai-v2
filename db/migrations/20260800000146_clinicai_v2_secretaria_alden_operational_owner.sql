-- =============================================================================
-- 20260800000146_clinicai_v2_secretaria_alden_operational_owner.sql
-- Patch SECRETARIA ONDA 3 (2026-05-08) · adicionar Alden como dono operacional
-- =============================================================================
--
-- Decisão Alden: incluir Dr. Alden Quesada (profile_id 06757b9f-...) na fila
-- da Secretaria como dono operacional separado · NUNCA classificar por LIKE
-- de nome (homonimo · risco de pegar "Aldenize", etc).
--
-- Mirian continua via LIKE '%mirian%' por compat (validado em prod desde mig
-- 130 · zero homonimo conhecido). Alden entra por UUID puro.
--
-- Mudanças (única coisa que altera vs mig 145):
--   1. operational_owner: novo branch 'alden' antes do ELSE 'luciana'.
--   2. operational_owner_label: novo branch 'Alden' antes do ELSE 'Secretaria'.
--   3. is_luciana: agora false TAMBÉM pra conversas atribuidas ao Alden ativo.
--   4. is_dra: continua APENAS pra Mirian · Alden NAO eh "Dra".
--
-- Preservado (zero quebra de consumer):
--   - operational_owner = 'luciana' continua chave interna do bucket default
--     (UI/API filtram por essa string em 12+ lugares · spec ratifica).
--   - operational_owner_label = 'Secretaria' continua label visual pro bucket
--     default (mig 145).
--   - is_luciana boolean (semantica = "esta na fila Secretaria default").
--   - is_dra boolean (semantica = "Mirian via LIKE").
--   - 33 colunas visíveis · 46 totais com derivadas · mesmo tipo · mesma ordem.
--   - Filtros wa_number_id='ead8a6f9...' + inbox_role='secretaria' (mig 130).
--   - Filtros archived/cross_internal_loop (mig 130).
--
-- Counts esperados pos-migration (baseline atual: 91 total · 90 Secretaria · 1 Mirian):
--   - total_view: 91 (sem mudança)
--   - Mirian: 1 (sem mudança)
--   - Alden: 0 (nenhuma conv atribuida ainda)
--   - Secretaria default: 90 (sem mudança)
--   APOS smoke de transfer: alden=1, secretaria=89, mirian=1, total=91.
--
-- ⚠️  CREATE OR REPLACE VIEW · idempotente · safe rerun.
-- Aplicacao manual em prod (gold-standard pra views · mig 126/127/128/129/130/145).
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

  -- is_dra · APENAS Mirian (LIKE preservado · validado em prod desde mig 130).
  -- Alden NAO eh "Dra" · sai do bucket Dra mesmo sendo owner.
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

  -- ── Donos operacionais canônicos (mig 130 base · KPI B 145 · Onda 3 146) ──
  -- operational_owner: chave INTERNAL.
  --   'mirian' · LIKE name (compat prod)
  --   'alden'  · UUID 06757b9f-2a03-43ae-bd37-28021eb6afeb (Onda 3)
  --   'luciana' · default · qualquer outro assigned ou null
  -- Ordem dos branches importa · Mirian primeiro pra LIKE pegar antes de cair
  -- em ELSE · Alden segundo · ELSE final = bucket Secretaria default.
  CASE
    WHEN b.status = 'active'
      AND b.assigned_to IS NOT NULL
      AND b.assigned_to_is_active IS TRUE
      AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%mirian%'
    THEN 'mirian'
    WHEN b.status = 'active'
      AND b.assigned_to = '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid
      AND b.assigned_to_is_active IS TRUE
    THEN 'alden'
    ELSE 'luciana'
  END AS operational_owner,

  -- operational_owner_label: VISUAL.
  CASE
    WHEN b.status = 'active'
      AND b.assigned_to IS NOT NULL
      AND b.assigned_to_is_active IS TRUE
      AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%mirian%'
    THEN 'Mirian'
    WHEN b.status = 'active'
      AND b.assigned_to = '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid
      AND b.assigned_to_is_active IS TRUE
    THEN 'Alden'
    ELSE 'Secretaria'
  END AS operational_owner_label,

  -- is_luciana = active AND NOT Mirian AND NOT Alden (default da Secretaria).
  -- Mantido nome da coluna por compat (UI/API filtram por is_luciana em 8+
  -- lugares · spec rejeita rename neste patch · semantica eh "esta na fila
  -- Secretaria default · nem Mirian nem Alden ativos").
  (
    b.status = 'active'
    AND NOT (
      b.assigned_to IS NOT NULL
      AND b.assigned_to_is_active IS TRUE
      AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%mirian%'
    )
    AND NOT (
      b.assigned_to = '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid
      AND b.assigned_to_is_active IS TRUE
    )
  ) AS is_luciana

FROM base b
WHERE b.deleted_at IS NULL;

COMMENT ON VIEW public.wa_conversations_operational_view IS
'Canonical operational view for Lara dashboard (Phase 2 hardened 2026-05-05 · KPI B label 2026-05-07 · Onda 3 Alden 2026-05-08). Filters to current Secretaria B&H WhatsApp source only. Excludes internal wa_numbers and conversations marked archived. Ownership is Mirian (LIKE name compat), Alden (UUID 06757b9f-...), or default (Secretaria). Internal key operational_owner stays "luciana" for backward compat (default bucket); is_luciana column kept (semantic: "in default Secretaria queue · neither Mirian nor Alden"). is_dra remains Mirian-only · Alden is owner but NOT "Dra" by product decision.';

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- FIM · 20260800000146 · NÃO RODAR via supabase CLI/Mgmt API · aplicacao
-- manual em prod (gold-standard pra views · convencao mig 126-145).
-- =============================================================================
