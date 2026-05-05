-- =============================================================================
-- 20260800000129_clinicai_v2_create_wa_webhook_event_audit_view.sql
-- Versionamento da view de auditoria por evento (já aplicada manualmente)
-- =============================================================================
--
-- Agrega `wa_webhook_log_audit_view` (mig 128) por evento WhatsApp · 1 linha
-- por (source, endpoint, phone_number_id, provider_msg_id). Cada evento
-- normalmente tem N rows na log (raw + stageLog/evoTraceLog em cada fase
-- do pipeline) · esta view consolida em 1 row com flags de stage.
--
-- Stage flags (signature_reason cobre prefixos `stage:` Cloud e `evo:`
-- Evolution · code real em apps/lara/src/app/api/webhook/whatsapp{,-evolution}):
--   has_auth_ok            evo:auth_ok               (Evolution explícito)
--   has_event_messages_upsert evo:event_messages_upsert (Evolution filter)
--   has_phone_resolved     evo:phone_resolved        (Evolution)
--   has_tenant_resolved    evo:tenant_resolved (Evolution) +
--                          stage:after_resolveTenantContext (Cloud)
--   has_lead_conv_resolved evo:lead_conv_resolved (Evolution) +
--                          stage:after_resolveConversation (Cloud)
--   has_before_saveInbound *:before_saveInbound (ambos)
--   has_after_saveInbound_ok evo:after_saveInbound_ok (Evolution) +
--                            stage:after_saveInbound  (Cloud)
--
-- Detecção de problema (`is_problem` + `problem_reason`):
--   1. http_or_processing_error
--      result_status >= 400 em qualquer row do evento
--   2. started_saveInbound_but_not_saved
--      has_before_saveInbound = TRUE AND has_after_saveInbound_ok = FALSE
--   3. resolved_but_never_attempted_save
--      has_lead_conv_resolved = TRUE AND has_before_saveInbound = FALSE
--   NULL (não é problema) caso contrário.
--
-- Validação prod (snapshot 2026-05-05 · janela 24h):
--   total_events_24h                     = 397
--   problem_events_24h                   = 0
--   inbound_started_but_not_saved_24h    = 0
--   inbound_saved_ok_24h                 = 153
--   by_source_24h:
--     evolution: 386 total · 201 inbound · 185 outbound_device
--                · 374 with_push_name · 0 problems
--     cloud:      11 total · 0 inbound · 0 outbound_device
--                · 0 with_push_name · 0 problems
--
-- ⚠️  Esta migration é APENAS pra versionamento. A view JÁ ESTÁ em prod
-- (aplicada manualmente). Não rodar via supabase CLI ou Mgmt API.
-- =============================================================================

CREATE OR REPLACE VIEW public.wa_webhook_event_audit_view
WITH (security_invoker = true)
AS
SELECT
  v.source,
  v.endpoint,
  v.phone_number_id,
  v.provider_msg_id,

  -- ── Atributos canônicos do evento (deveriam ser coerentes within group) ─
  -- Pega o primeiro não-nulo determinístico via MAX FILTER · evita leakar
  -- linha "stage" precoce que ainda não tinha message_type.
  MAX(v.message_type) FILTER (WHERE v.message_type IS NOT NULL)
    AS message_type,

  -- from_me canônico do evento · regra explícita do spec
  -- (TRUE se qualquer row marcou outbound device · FALSE se qualquer row
  -- marcou inbound · NULL se nenhuma row trouxe fromMe extraível)
  CASE
    WHEN BOOL_OR(v.from_me IS TRUE)  THEN true
    WHEN BOOL_OR(v.from_me IS FALSE) THEN false
    ELSE NULL
  END AS from_me,

  -- has_push_name = qualquer row do grupo capturou pushName
  BOOL_OR(v.has_push_name) AS has_push_name,

  -- push_name_source_field consolidado · pega o primeiro não-nulo
  -- alfabeticamente determinístico
  MAX(v.push_name_source_field) FILTER (WHERE v.push_name_source_field IS NOT NULL)
    AS push_name_source_field,

  -- ── Janela temporal do evento ─────────────────────────────────────────
  MIN(v.hit_at) AS first_hit_at,
  MAX(v.hit_at) AS last_hit_at,
  COUNT(*)::int AS log_rows,

  -- ── Flags de pipeline · cobrindo prefixos Cloud (stage:) e Evolution (evo:)
  -- Conservador: ILIKE com substring final · captura nomes diferentes que
  -- representam o mesmo gate (ex: tenant_resolved vs after_resolveTenantContext).
  BOOL_OR(
    v.signature_reason ILIKE '%:auth_ok%'
    OR (v.signature_ok IS TRUE AND v.signature_reason IS NOT NULL)
  ) AS has_auth_ok,

  BOOL_OR(v.signature_reason ILIKE '%event_messages_upsert%')
    AS has_event_messages_upsert,

  BOOL_OR(v.signature_reason ILIKE '%phone_resolved%')
    AS has_phone_resolved,

  BOOL_OR(
    v.signature_reason ILIKE '%tenant_resolved%'
    OR v.signature_reason ILIKE '%after_resolveTenantContext%'
  ) AS has_tenant_resolved,

  BOOL_OR(
    v.signature_reason ILIKE '%lead_conv_resolved%'
    OR v.signature_reason ILIKE '%after_resolveConversation%'
  ) AS has_lead_conv_resolved,

  BOOL_OR(v.signature_reason ILIKE '%before_saveInbound%')
    AS has_before_saveInbound,

  -- after_saveInbound_ok: Evolution emite `evo:after_saveInbound_ok`,
  -- Cloud emite `stage:after_saveInbound` (sem _ok). Match conservador
  -- exige que NÃO seja `saveInbound_returned_null` (que também tem
  -- substring `saveInbound`).
  BOOL_OR(
    (v.signature_reason ILIKE '%after_saveInbound_ok%')
    OR (
      v.signature_reason ILIKE '%:after_saveInbound%'
      AND v.signature_reason NOT ILIKE '%returned_null%'
    )
  ) AS has_after_saveInbound_ok,

  -- ── Erros HTTP/processamento ──────────────────────────────────────────
  COUNT(*) FILTER (WHERE v.result_status >= 400)::int AS error_rows,

  -- ── Reasons / summaries arrays (debug/replay) ─────────────────────────
  array_agg(DISTINCT v.signature_reason) FILTER (WHERE v.signature_reason IS NOT NULL)
    AS signature_reasons,
  array_agg(DISTINCT v.result_summary)   FILTER (WHERE v.result_summary IS NOT NULL)
    AS result_summaries,

  -- ── Forense ──────────────────────────────────────────────────────────
  MAX(v.raw_body_length) AS max_raw_body_length,

  -- from_phone_masked: dentro do grupo deveria ser coerente · MAX é
  -- determinístico e cobre rows iniciais que ainda não tinham from_phone.
  MAX(v.from_phone_masked) FILTER (WHERE v.from_phone_masked IS NOT NULL)
    AS from_phone_masked,

  -- ── is_problem + problem_reason · ordem de precedência ────────────────
  -- 1) http_or_processing_error
  -- 2) started_saveInbound_but_not_saved
  -- 3) resolved_but_never_attempted_save
  -- (NULL → não é problema)
  CASE
    WHEN COUNT(*) FILTER (WHERE v.result_status >= 400) > 0
      THEN 'http_or_processing_error'
    WHEN BOOL_OR(v.signature_reason ILIKE '%before_saveInbound%')
      AND NOT BOOL_OR(
        (v.signature_reason ILIKE '%after_saveInbound_ok%')
        OR (
          v.signature_reason ILIKE '%:after_saveInbound%'
          AND v.signature_reason NOT ILIKE '%returned_null%'
        )
      )
      THEN 'started_saveInbound_but_not_saved'
    WHEN BOOL_OR(
        v.signature_reason ILIKE '%lead_conv_resolved%'
        OR v.signature_reason ILIKE '%after_resolveConversation%'
      )
      AND NOT BOOL_OR(v.signature_reason ILIKE '%before_saveInbound%')
      THEN 'resolved_but_never_attempted_save'
    ELSE NULL
  END AS problem_reason,

  (
    COUNT(*) FILTER (WHERE v.result_status >= 400) > 0
    OR (
      BOOL_OR(v.signature_reason ILIKE '%before_saveInbound%')
      AND NOT BOOL_OR(
        (v.signature_reason ILIKE '%after_saveInbound_ok%')
        OR (
          v.signature_reason ILIKE '%:after_saveInbound%'
          AND v.signature_reason NOT ILIKE '%returned_null%'
        )
      )
    )
    OR (
      BOOL_OR(
        v.signature_reason ILIKE '%lead_conv_resolved%'
        OR v.signature_reason ILIKE '%after_resolveConversation%'
      )
      AND NOT BOOL_OR(v.signature_reason ILIKE '%before_saveInbound%')
    )
  ) AS is_problem

FROM public.wa_webhook_log_audit_view v
GROUP BY
  v.source,
  v.endpoint,
  v.phone_number_id,
  v.provider_msg_id;

COMMENT ON VIEW public.wa_webhook_event_audit_view IS
'Aggregated event-level audit view over wa_webhook_log_audit_view. Groups webhook stage logs by provider_msg_id and exposes pipeline stage completion, inbound/outbound direction, pushName presence, and problem flags for replay/diagnostics.';

-- =============================================================================
-- FIM · 20260800000129 · NÃO RODAR (view já aplicada em prod manualmente)
-- =============================================================================
