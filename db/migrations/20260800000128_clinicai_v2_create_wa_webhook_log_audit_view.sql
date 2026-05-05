-- =============================================================================
-- 20260800000128_clinicai_v2_create_wa_webhook_log_audit_view.sql
-- Versionamento da view de auditoria de webhooks (já aplicada manualmente)
-- =============================================================================
--
-- View `wa_webhook_log_audit_view` enriquece `wa_webhook_log` com extração
-- por regex de campos críticos pra forense/debug do fluxo WhatsApp:
--   - provider_msg_id (wamid Meta · key.id Evolution · etc)
--   - source ('cloud' | 'evolution' | 'other')
--   - raw_remote_or_from (remoteJid/from/recipient_id)
--   - from_me boolean (eco device · separar inbound vs outbound)
--   - has_push_name + push_name_source_field (catalogo qual campo entrega
--     o nome em cada instance · audit 2026-05-05 da fix do LID)
--   - raw_shape (json_object_like / json_array_like / base64_jpeg_like /
--     data_url_like / non_json_text / empty)
--
-- DECISÃO IMPORTANTE: NÃO faz cast `raw_body::jsonb`. Alguns hits têm
-- raw_body com binário base64 ou data: URL (mídia inbound antes do parse)
-- · cast quebraria toda a view. Em vez disso usa `regexp_match` sobre
-- `text` · conservador, sem panic em payload malformado.
--
-- Fonte: `public.wa_webhook_log` (mig 108) · sem alteração à tabela base.
--
-- Validação prod (snapshot 2026-05-05 · janela 24h):
--   total_24h               = 2189
--   with_provider_24h       = 2189
--   without_provider_24h    = 0
--   with_push_name_24h      = 2154
--   by_source_24h:
--     evolution: 2178 total · 2178 with_provider · 2154 with_push_name
--     cloud:       11 total ·   11 with_provider ·    0 with_push_name
--
-- ⚠️  Esta migration é APENAS pra versionamento. A view JÁ ESTÁ em prod
-- (aplicada manualmente). Não rodar via supabase CLI ou Mgmt API.
-- =============================================================================

CREATE OR REPLACE VIEW public.wa_webhook_log_audit_view
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    l.id                AS log_id,
    l.hit_at,
    l.endpoint,
    l.method,
    l.signature_ok,
    l.signature_reason,
    l.phone_number_id,
    l.from_phone,
    l.message_type,
    l.result_status,
    l.result_summary,
    COALESCE(length(l.raw_body), 0) AS raw_body_length,
    l.raw_body,

    -- ── source · derivado do endpoint ────────────────────────────────────
    CASE
      WHEN l.endpoint ILIKE '%evolution%' THEN 'evolution'
      WHEN l.endpoint ILIKE '%whatsapp%'  THEN 'cloud'
      ELSE 'other'
    END AS source,

    -- ── raw_shape · classifica antes de tentar extrair ──────────────────
    -- empty                · raw_body NULL ou string vazia (após trim)
    -- json_object_like     · começa com '{'
    -- json_array_like      · começa com '['
    -- base64_jpeg_like     · começa com '/9j/' (assinatura JPEG base64)
    -- data_url_like        · começa com 'data:'
    -- non_json_text        · qualquer outro
    CASE
      WHEN l.raw_body IS NULL OR length(btrim(l.raw_body)) = 0 THEN 'empty'
      WHEN substring(btrim(l.raw_body), 1, 1) = '{' THEN 'json_object_like'
      WHEN substring(btrim(l.raw_body), 1, 1) = '[' THEN 'json_array_like'
      WHEN substring(btrim(l.raw_body), 1, 4) = '/9j/' THEN 'base64_jpeg_like'
      WHEN substring(btrim(l.raw_body), 1, 5) = 'data:' THEN 'data_url_like'
      ELSE 'non_json_text'
    END AS raw_shape

  FROM public.wa_webhook_log l
),

extracted AS (
  SELECT
    b.*,

    -- ── provider_msg_id · 5 padrões cobertos ────────────────────────────
    -- ordem: key.id (Evolution) → messages[].id (Cloud inbound) →
    -- statuses[].id (Cloud delivery) → wa_message_id (legacy/diag) →
    -- messageId (camelCase variantes)
    COALESCE(
      (regexp_match(b.raw_body, '"key"\s*:\s*\{[^{}]*"id"\s*:\s*"([^"]+)"'))[1],
      (regexp_match(b.raw_body, '"messages"\s*:\s*\[[^\]]*?"id"\s*:\s*"([^"]+)"'))[1],
      (regexp_match(b.raw_body, '"statuses"\s*:\s*\[[^\]]*?"id"\s*:\s*"([^"]+)"'))[1],
      (regexp_match(b.raw_body, '"wa_message_id"\s*:\s*"([^"]+)"'))[1],
      (regexp_match(b.raw_body, '"messageId"\s*:\s*"([^"]+)"'))[1]
    ) AS provider_msg_id,

    -- ── raw_remote_or_from · jid/phone que originou ─────────────────────
    COALESCE(
      (regexp_match(b.raw_body, '"remoteJid"\s*:\s*"([^"]+)"'))[1],
      (regexp_match(b.raw_body, '"from"\s*:\s*"([^"]+)"'))[1],
      (regexp_match(b.raw_body, '"recipient_id"\s*:\s*"([^"]+)"'))[1]
    ) AS raw_remote_or_from,

    -- ── fromMe · separa eco device de inbound real ──────────────────────
    (regexp_match(b.raw_body, '"fromMe"\s*:\s*(true|false)'))[1] AS from_me_text,

    -- ── pushName extraído (text apenas · presença/ausência) ─────────────
    COALESCE(
      (regexp_match(b.raw_body, '"pushName"\s*:\s*"([^"]+)"'))[1],
      (regexp_match(b.raw_body, '"notifyName"\s*:\s*"([^"]+)"'))[1],
      (regexp_match(b.raw_body, '"verifiedBizName"\s*:\s*"([^"]+)"'))[1],
      (regexp_match(b.raw_body, '"display_name"\s*:\s*"([^"]+)"'))[1],
      (regexp_match(b.raw_body, '"profile"\s*:\s*\{[^{}]*"name"\s*:\s*"([^"]+)"'))[1]
    ) AS extracted_push_name,

    -- ── push_name_source_field · qual campo entregou o nome ─────────────
    -- Replica a ordem de prioridade do helper extractPushNameFromEvolution
    -- + variantes Cloud · permite catalogar em prod qual campo está em uso
    -- por instance/wa_number sem expor o valor.
    CASE
      WHEN b.raw_body ~ '"data"\s*:\s*\{[^{}]*"pushName"\s*:\s*"[^"]+"'  THEN 'data.pushName'
      WHEN b.raw_body ~ '"pushName"\s*:\s*"[^"]+"'                       THEN 'pushName'
      WHEN b.raw_body ~ '"data"\s*:\s*\{[^{}]*"notifyName"\s*:\s*"[^"]+"' THEN 'data.notifyName'
      WHEN b.raw_body ~ '"data"\s*:\s*\{[^{}]*"verifiedBizName"\s*:\s*"[^"]+"' THEN 'data.verifiedBizName'
      WHEN b.raw_body ~ '"profile"\s*:\s*\{[^{}]*"display_name"\s*:\s*"[^"]+"' THEN 'profile.display_name'
      WHEN b.raw_body ~ '"contacts"\s*:\s*\[[^\]]*?"profile"\s*:\s*\{[^{}]*"name"\s*:\s*"[^"]+"' THEN 'contacts.profile.name'
      ELSE NULL
    END AS push_name_source_field

  FROM base b
)

SELECT
  e.log_id,
  e.hit_at,
  e.endpoint,
  e.method,
  e.source,
  e.signature_ok,
  e.signature_reason,
  e.phone_number_id,
  e.from_phone,

  -- from_phone_masked · zera todos exceto últimos 4 dígitos (LGPD-friendly
  -- pra dashboards de audit que não devem expor número completo).
  CASE
    WHEN e.from_phone IS NULL OR length(e.from_phone) <= 4 THEN e.from_phone
    ELSE repeat('*', length(e.from_phone) - 4) || right(e.from_phone, 4)
  END AS from_phone_masked,

  e.message_type,
  e.result_status,
  e.result_summary,

  e.provider_msg_id,
  e.raw_remote_or_from,

  e.from_me_text,
  CASE
    WHEN e.from_me_text = 'true'  THEN true
    WHEN e.from_me_text = 'false' THEN false
    ELSE NULL
  END AS from_me,

  (e.extracted_push_name IS NOT NULL) AS has_push_name,
  e.push_name_source_field,

  e.raw_shape,
  e.raw_body_length,
  e.raw_body

FROM extracted e;

COMMENT ON VIEW public.wa_webhook_log_audit_view IS
'Audit view over wa_webhook_log. Extracts provider_msg_id, source, fromMe, pushName presence, stage and raw shape without casting raw_body to jsonb, because some raw bodies may contain non-JSON/base64 content.';

-- =============================================================================
-- FIM · 20260800000128 · NÃO RODAR (view já aplicada em prod manualmente)
-- =============================================================================
