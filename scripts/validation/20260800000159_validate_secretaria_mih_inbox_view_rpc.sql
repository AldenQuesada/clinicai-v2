-- ============================================================================
-- FASE 2D.4 · VALIDATION · secretaria Mih inbox view + RPCs (Mig 159)
-- ============================================================================
-- Rode após apply da mig 159 · cole outputs no chat.
-- Todas SELECT read-only (zero mutação).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-1 · View existe + tem todas colunas derivadas obrigatórias
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  EXISTS (SELECT 1 FROM information_schema.views
    WHERE table_schema='public' AND table_name='secretaria_mih_conversations_view')
    AS view_exists,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='secretaria_mih_conversations_view'
      AND column_name IN ('sort_at','is_preview_stale','preview_drift_seconds','latest_message_at_from_messages'))
    AS derived_cols_count;
-- Esperado: view_exists=true · derived_cols_count=4

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-2 · View escopo · wa_number_id distinto (deve ser 1 só · Mih)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(DISTINCT wa_number_id) AS distinct_wa_numbers_in_view
FROM public.secretaria_mih_conversations_view;
-- Esperado: 1 (apenas wa_number_id da Mih)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-3 · View · wa_number_id resolvido bate com phone canônico
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  v.wa_number_id,
  w.phone AS resolved_phone,
  w.label AS resolved_label,
  v.wa_number_id = (SELECT id FROM public.wa_numbers WHERE phone='5544991622986' AND is_active=true LIMIT 1)
    AS matches_canonical_phone
FROM public.secretaria_mih_conversations_view v
JOIN public.wa_numbers w ON w.id = v.wa_number_id
LIMIT 1;
-- Esperado: matches_canonical_phone=true · resolved_phone='5544991622986' · resolved_label='Secretaria B&H'

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-4 · View NÃO inclui canais não-Mih com inbox_role='secretaria'
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS non_mih_secretaria_in_view
FROM public.secretaria_mih_conversations_view v
WHERE EXISTS (
  SELECT 1 FROM public.wa_numbers w
  WHERE w.id = v.wa_number_id AND w.phone <> '5544991622986'
);
-- Esperado: 0

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-5 · Compara view vs raw wa_conversations (filtro só por Mih)
-- ─────────────────────────────────────────────────────────────────────────────
WITH mih AS (SELECT id FROM public.wa_numbers WHERE phone='5544991622986' AND is_active=true LIMIT 1)
SELECT
  (SELECT count(*) FROM public.secretaria_mih_conversations_view v
    WHERE v.status IN ('active','paused')) AS view_active_paused,
  (SELECT count(*) FROM public.wa_conversations c
    WHERE c.wa_number_id = (SELECT id FROM mih)
      AND c.status IN ('active','paused')
      AND c.deleted_at IS NULL) AS raw_mih_active_paused;
-- Esperado: ambos iguais (delta ≤ 0)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-6 · Compara raw inbox_role vs view (deve diferir se há canais não-Mih)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.wa_conversations
    WHERE inbox_role='secretaria' AND status IN ('active','paused') AND deleted_at IS NULL)
    AS raw_inbox_role_secretaria,
  (SELECT count(*) FROM public.secretaria_mih_conversations_view
    WHERE status IN ('active','paused'))
    AS view_total,
  (SELECT count(*) FROM public.wa_conversations
    WHERE inbox_role='secretaria' AND status IN ('active','paused') AND deleted_at IS NULL)
  - (SELECT count(*) FROM public.secretaria_mih_conversations_view
    WHERE status IN ('active','paused'))
    AS non_mih_secretaria_drift;
-- Esperado: non_mih_secretaria_drift = 5 (Mira) + 0 (Marci) + 0 (Aux) = 5 atualmente

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-7 · sort_at robusto · max(view.sort_at) >= max(wa_conversations.last_message_at)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  max(sort_at) AS max_sort_at,
  max(last_message_at) AS max_last_message_at,
  max(sort_at) >= max(last_message_at) AS sort_at_robust
FROM public.secretaria_mih_conversations_view;
-- Esperado: sort_at_robust=true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-8 · Counter de preview drift (read-only · só observação)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  count(*) AS preview_stale_count,
  COALESCE(max(preview_drift_seconds), 0) AS max_drift_seconds
FROM public.secretaria_mih_conversations_view
WHERE is_preview_stale = true;
-- Esperado: counts > 0 indicam drift residual (mig 158 não corrige · Patch 2 backfill)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-9 · RPC get_secretaria_mih_inbox retorna rows ordenadas DESC
-- ─────────────────────────────────────────────────────────────────────────────
WITH r AS (
  SELECT id, sort_at, row_number() OVER (ORDER BY sort_at DESC NULLS LAST) AS rn
  FROM public.get_secretaria_mih_inbox(10, NULL)
)
SELECT count(*) AS rpc_rows,
       bool_and(
         lead(sort_at) OVER (ORDER BY rn) IS NULL
         OR sort_at >= lead(sort_at) OVER (ORDER BY rn)
       ) AS desc_order_ok
FROM r;
-- Esperado: rpc_rows > 0 · desc_order_ok=true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-10 · RPC cursor (p_before) corta corretamente
-- ─────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS rows_before_cursor
FROM public.get_secretaria_mih_inbox(50, now() - interval '1 year');
-- Esperado: 0 (cursor muito antigo · tudo é mais recente)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-11 · RPC health check · retorna jsonb completo
-- ─────────────────────────────────────────────────────────────────────────────
SELECT public.get_secretaria_mih_health_check() AS health;
-- Esperado: chave 'verdict' presente · uma das 5:
--   PASS_SECRETARIA_MIH_DB_HEALTHY
--   FAIL_MIH_WA_NUMBER_NOT_FOUND
--   FAIL_MESSAGES_EXIST_BUT_VIEW_EMPTY
--   WARN_SECRETARIA_INBOX_ROLE_HAS_MULTIPLE_CHANNELS
--   WARN_PREVIEW_DRIFT
-- Atualmente esperamos WARN_SECRETARIA_INBOX_ROLE_HAS_MULTIPLE_CHANNELS
-- (5 convs Mira ainda carregam inbox_role='secretaria') OU WARN_PREVIEW_DRIFT
-- se Mih ainda tem drift residual · ambos são WARN aceitáveis.

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-12 · Health check · counters internos consistentes
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  h->>'verdict' AS verdict,
  (h->>'inbox_role_secretaria_total')::int AS inbox_role_total,
  (h->>'mih_conversations_total')::int AS mih_total,
  (h->>'non_mih_secretaria_conversations_total')::int AS non_mih_total,
  (h->>'view_rows_total')::int AS view_total,
  (h->>'view_rows_total')::int = (h->>'mih_conversations_total')::int AS view_eq_mih
FROM (SELECT public.get_secretaria_mih_health_check() AS h) x;
-- Esperado: view_eq_mih=true (view canônica = wa_conversations real do Mih)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-13 · Grants · authenticated tem SELECT na view + EXECUTE nas RPCs
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  has_table_privilege('authenticated', 'public.secretaria_mih_conversations_view', 'SELECT')
    AS authenticated_can_select_view,
  has_function_privilege('authenticated', 'public.get_secretaria_mih_inbox(int, timestamptz)', 'EXECUTE')
    AS authenticated_can_exec_inbox,
  has_function_privilege('authenticated', 'public.get_secretaria_mih_health_check()', 'EXECUTE')
    AS authenticated_can_exec_health;
-- Esperado: todos true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-14 · Counters operacionais Mih · zero mudança vs baseline
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.wa_conversations
    WHERE wa_number_id=(SELECT id FROM public.wa_numbers WHERE phone='5544991622986' AND is_active=true LIMIT 1)
      AND status IN ('active','paused') AND deleted_at IS NULL)
    AS mih_active_now,
  (SELECT count(*) FROM public.wa_outbox WHERE created_at >= now() - interval '5 minutes')
    AS wa_outbox_last_5min,
  (SELECT count(*) FROM public.agenda_alerts_log WHERE created_at >= now() - interval '5 minutes')
    AS agenda_alerts_log_last_5min;
-- Esperado: mih_active_now ~115 (igual ao baseline) · outbox 0 · log 0

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-15 · Tracker registra mig 159
-- ─────────────────────────────────────────────────────────────────────────────
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20260800000159';
-- Esperado: { version: '20260800000159', name: 'repair_marker' }
