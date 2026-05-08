-- =============================================================================
-- 20260800000147_clinicai_v2_secretaria_owner_normalization_fix.sql
-- Versiona correcao manual aplicada em prod 2026-05-08:
--   - Default bucket eh 'secretaria' (nao 'luciana')
--   - Luciana so aparece se ha assigned_to real ativo com nome Luciana
--   - is_luciana so true com Luciana real (nao bucket)
--   - is_secretaria true quando active + inbox_role=secretaria + assigned_to NULL
--   - Soft-delete dos 4 registros debug que apareciam na fila
-- =============================================================================
--
-- Contexto:
-- Mig 146 (Onda 3 Alden) deixou ELSE='luciana' por compat de codigo · UI/repo
-- ainda filtravam por operational_owner='luciana' OR is_luciana=true. Apos
-- correcao manual da Mirian, a view foi normalizada pra 'secretaria' como
-- default. Esta migration versiona EXATAMENTE esse estado.
--
-- Estado em prod apos correcao manual (validado 2026-05-08):
--   total_active=87, secretaria=85, alden=1, mirian=1,
--   archived_remaining=0, luciana_total=0, is_luciana_count=0
--
-- Mudanças vs mig 146:
--   1. operational_owner: branch 'luciana' so dispara pra Luciana real
--      (assigned_to ativo + nome LIKE %luciana%) · ELSE final = 'secretaria'.
--   2. operational_owner_label: idem · ELSE final = 'Secretaria'.
--   3. is_luciana: TRUE so com Luciana real ativa (nao mais bucket default).
--   4. is_secretaria: TRUE so com active + inbox=secretaria + assigned_to NULL
--      (nao apenas active + inbox=secretaria como antes da mig 130).
--   5. Soft-delete idempotente dos 4 IDs debug.
--
-- Preservado:
--   - 46 colunas · mesmos tipos · mesma ordem.
--   - Filtros wa_number_id='ead8a6f9...' + inbox_role='secretaria' (mig 130).
--   - Filtros archived/cross_internal_loop (mig 130).
--   - Mirian via LIKE %mirian% (mig 130 compat).
--   - Alden via UUID 06757b9f-... (mig 146).
--
-- ⚠️  CREATE OR REPLACE VIEW · idempotente. UPDATE de soft-delete tambem
-- idempotente (NAO tocara registros ja com deleted_at).
-- Aplicacao manual em prod (gold-standard pra views · convencao mig 126-146).
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

  -- is_secretaria · ATIVO + inbox=secretaria + assigned_to NULL (bucket
  -- default · operadora ainda nao pegou · sem dono medico). Antes (pre mig
  -- 147) era apenas active+inbox=secretaria · agora explicita assignment NULL.
  (
    b.status = 'active'
    AND b.inbox_role = 'secretaria'
    AND b.assigned_to IS NULL
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

  -- ── Donos operacionais canônicos (mig 147 · 2026-05-08 normalization) ──
  -- operational_owner: 4 buckets explicitos
  --   'mirian'     · Mirian via LIKE %mirian% (compat prod desde mig 130)
  --   'alden'      · Alden via UUID 06757b9f-... (mig 146)
  --   'luciana'    · Luciana real ativa (LIKE %luciana% AND ativo AND
  --                  NAO eh Alden) · pessoa atribuida · NAO eh fila default
  --   'secretaria' · ELSE final · bucket default · assigned_to NULL OR
  --                  qualquer atribuicao nao reconhecida.
  -- Ordem dos branches importa · primeiro Mirian · depois Alden · depois
  -- assigned_to NULL eh secretaria · depois Luciana real · ELSE secretaria.
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
    WHEN b.assigned_to IS NULL
    THEN 'secretaria'
    WHEN b.status = 'active'
      AND b.assigned_to IS NOT NULL
      AND b.assigned_to_is_active IS TRUE
      AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%luciana%'
      AND b.assigned_to <> '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid
    THEN 'luciana'
    ELSE 'secretaria'
  END AS operational_owner,

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
    WHEN b.assigned_to IS NULL
    THEN 'Secretaria'
    WHEN b.status = 'active'
      AND b.assigned_to IS NOT NULL
      AND b.assigned_to_is_active IS TRUE
      AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%luciana%'
      AND b.assigned_to <> '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid
    THEN 'Luciana'
    ELSE 'Secretaria'
  END AS operational_owner_label,

  -- is_luciana · TRUE so com Luciana real ativa atribuida. Bucket default
  -- (assigned_to NULL ou nao reconhecido) NAO conta mais como is_luciana ·
  -- usar is_secretaria pra isso.
  (
    b.status = 'active'
    AND b.assigned_to IS NOT NULL
    AND b.assigned_to_is_active IS TRUE
    AND lower(COALESCE(b.assigned_to_name, '')) LIKE '%luciana%'
    AND b.assigned_to <> '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid
  ) AS is_luciana

FROM base b
WHERE b.deleted_at IS NULL;

COMMENT ON VIEW public.wa_conversations_operational_view IS
'Canonical operational view for Lara dashboard (Phase 2 hardened 2026-05-05 · KPI B label 2026-05-07 · Onda 3 Alden 2026-05-08 · Owner normalization 2026-05-08). Filters to current Secretaria B&H WhatsApp source only. Excludes internal wa_numbers, archived, and cross_internal_loop. Owners: Mirian (LIKE name compat), Alden (UUID), Luciana (LIKE name · only if real assignment), Secretaria (default bucket · assigned_to NULL or unrecognized). is_luciana TRUE only for real Luciana assignment · is_secretaria TRUE only for active+inbox=secretaria+assigned_to=NULL. is_dra remains Mirian-only.';

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- Cleanup idempotente · soft-delete dos 4 registros debug/test que vinham
-- aparecendo na fila Secretaria. Aplicado manualmente em 2026-05-08 ·
-- versionado aqui pra reprodutibilidade. WHERE deleted_at IS NULL garante
-- nao re-tocar registros ja deletados em rerun.
-- =============================================================================

UPDATE public.wa_conversations
SET
  deleted_at = COALESCE(deleted_at, now()),
  updated_at = now(),
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'deleted_reason', 'cleanup_debug_archived_secretaria',
    'deleted_by_fix', 'manual_cleanup_after_secretaria_owner_normalization',
    'deleted_at_manual', to_jsonb(now())
  )
WHERE id IN (
  '89164ffc-5f7c-4993-8007-c3e8624ef9ac'::uuid,
  'b0d5ce49-d495-45eb-b95f-ae42332de2ea'::uuid,
  '1038bf94-f333-4751-8781-7c0a8670a640'::uuid,
  '960ed900-563f-4eec-847f-98b693db22e6'::uuid
)
AND deleted_at IS NULL;

-- =============================================================================
-- FIM · 20260800000147 · Aplicacao manual em prod ja realizada · este arquivo
-- versiona o estado atual + permite rerun idempotente em ambientes futuros.
-- =============================================================================
