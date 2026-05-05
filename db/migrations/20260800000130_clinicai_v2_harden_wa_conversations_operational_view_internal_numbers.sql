-- =============================================================================
-- 20260800000130_clinicai_v2_harden_wa_conversations_operational_view_internal_numbers.sql
-- Fase 2 da arquitetura de identidade · esconde conversas internas/arquivadas
-- =============================================================================
--
-- Contexto da auditoria de identidade WhatsApp (2026-05-05):
--
--   Fase 1 (commit 04ff583 · runtime guard) ⇒ ESTANCA novas colisões.
--     Bloqueia em 5 entry points (Evolution + Cloud + simulate-inbound +
--     resolveLead/resolveConversation + cold-open + cron reactivate) que
--     uma mensagem com phone presente em wa_numbers (ativo OU inativo) vire
--     lead/conversa externa.
--
--   Fase 2 (esta migration · view filter) ⇒ ESCONDE conversas internas/
--     arquivadas que JÁ existem no DB. Sem deletar nada · só remove da fila
--     operacional Luciana/Mirian. Limpeza física dos dados fica pra Fase 3.
--
--   Fase 3 (futuro) ⇒ limpeza cirúrgica · soft-delete de leads/identities
--     contaminadas + reconciliação cross-clinic. Aguarda dump/aprovação.
--
--   Fase 4 (futuro) ⇒ sanitização final de logs/credenciais.
--
-- Auditoria phase2_operational_view_exclusion (snapshot prod 2026-05-05):
--   total_in_operational_view          = 67
--   would_be_excluded_by_phase2         = 3
--   would_remain_after_phase2           = 64
--   has_metadata_archived_at            = 2
--   cross_internal_loop                 = 2
--   phone_matches_internal_wa_number    = 3
--
-- 3 conversas confirmadas pra exclusão:
--   da926b5c-3551-4dc1-8f61-d1d7a2498c70 · 5544998787673 ·
--     archived_reason=cross_internal_loop · matches Mira (B2B)
--   96df2c13-f666-4946-97b5-9267a25d813b · 5544998782003 ·
--     archived_reason=cross_internal_loop · matches Canal auxiliar
--   dd69b991-82da-4d7d-8445-08d2bd3a385b · 5544991622986 ·
--     matches Secretaria B&H (self-loop)
--
-- Filtros adicionados (sobre a definição de mig 126):
--
--   1. COALESCE(c.metadata->>'archived_at', '') = ''
--      Conversas marcadas como arquivadas em metadata (mesmo com status='active')
--      não aparecem na fila. Mig 117 (auto_greeting_claim) já respeita esse
--      campo · view alinhada agora.
--
--   2. COALESCE(c.metadata->>'archived_reason', '') <> 'cross_internal_loop'
--      Defesa adicional · cobre casos onde archived_at não foi preenchido mas
--      archived_reason marca o loop interno.
--
--   3. NOT EXISTS contra wa_numbers do clinic_id (sem filtro is_active) ·
--      cobre 4 padrões de match (digits exatos · 12c↔13c BR swap · last8 fallback)
--      via CTE `internal_phone_keys`.
--
-- ⚠️  CREATE OR REPLACE VIEW · idempotente · mantém 100% das colunas e nomes.
-- Mesma assinatura que mig 126 · qualquer caller (frontend, API, RPC) continua
-- funcionando sem mudança. Apenas reduz o conjunto de linhas.
--
-- Esta migration NÃO deve ser rodada via supabase CLI ou Mgmt API · pendente
-- aplicação manual em prod (igual mig 126/127/128/129 · gold-standard).
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

-- Fase 2 · CTE auxiliar com TODOS os formatos de match contra wa_numbers
-- por clinic_id. Cobre 4 padrões:
--   1. digits raw normalizado (regex \D → '')
--   2. variante 12c (drop 9 após DDD) quando row é 13c com 9
--   3. variante 13c (insere 9 após DDD) quando row é 12c
--   4. last8 (cauda 8 dígitos · fallback final)
-- Phones < 8 dígitos são ignorados (match não confiável).
-- UNION ALL evita dedup desnecessário · NOT EXISTS abaixo só precisa achar 1.
internal_phone_keys AS (
  SELECT wn.clinic_id, norm.d AS phone_key
    FROM public.wa_numbers wn
    CROSS JOIN LATERAL (
      SELECT regexp_replace(COALESCE(wn.phone, ''), '\D', '', 'g') AS d
    ) norm
   WHERE length(norm.d) >= 8

  UNION ALL

  -- 12c sem 9 após DDD · derivado de row 13c com 9
  SELECT wn.clinic_id,
         substring(norm.d FROM 1 FOR 4) || substring(norm.d FROM 6) AS phone_key
    FROM public.wa_numbers wn
    CROSS JOIN LATERAL (
      SELECT regexp_replace(COALESCE(wn.phone, ''), '\D', '', 'g') AS d
    ) norm
   WHERE length(norm.d) = 13
     AND substring(norm.d FROM 5 FOR 1) = '9'

  UNION ALL

  -- 13c com 9 após DDD · derivado de row 12c
  SELECT wn.clinic_id,
         substring(norm.d FROM 1 FOR 4) || '9' || substring(norm.d FROM 5) AS phone_key
    FROM public.wa_numbers wn
    CROSS JOIN LATERAL (
      SELECT regexp_replace(COALESCE(wn.phone, ''), '\D', '', 'g') AS d
    ) norm
   WHERE length(norm.d) = 12

  UNION ALL

  -- last8 fallback · cobre formatos exóticos não-BR e edge cases LID
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
  -- Filtro canônico do dashboard (Alden 2026-05-05): apenas a fonte
  -- "Secretaria B&H" governa este dashboard. Demais wa_numbers (SDR/Lara
  -- legacy, B2B/Mira, etc) ficam fora da view operacional.
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

    -- ── Fase 2 · filtros de internal/arquivado ──────────────────────────
    -- Conversas marcadas como arquivadas em metadata saem da fila operacional
    -- (espelha guard de mig 117 auto_greeting_claim · alinha view + RPC).
    AND COALESCE(c.metadata->>'archived_at', '') = ''
    AND COALESCE(c.metadata->>'archived_reason', '') <> 'cross_internal_loop'

    -- Conversa cujo phone bate com qualquer wa_number da própria clínica
    -- (active OU inactive · regra macro Fase 1) é loop interno · esconde da
    -- fila externa. Match via CTE internal_phone_keys (digits + variantes).
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
'Canonical operational view for Lara dashboard (Phase 2 hardened · 2026-05-05). Filters to current Secretaria B&H WhatsApp source only. Excludes internal wa_numbers (any phone in wa_numbers regardless of is_active) and conversations marked archived in metadata (archived_at OR archived_reason=cross_internal_loop). Ownership is Luciana or Mirian only. Mira and VOCÊ do not own dashboard conversations. Phase 1 (commit 04ff583) blocks new collisions in runtime; Phase 2 hides existing internal/archived conversations from the queue; Phase 3 (pending) cleans contaminated rows.';

-- =============================================================================
-- FIM · 20260800000130 · NÃO RODAR (view será aplicada manualmente em prod)
-- =============================================================================
