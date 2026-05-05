-- =============================================================================
-- 20260800000127_clinicai_v2_wa_identity_architecture.sql
-- Versionamento da arquitetura de identidade WhatsApp (já aplicada manualmente)
-- =============================================================================
--
-- Snapshot do estado de prod (Alden 2026-05-05). Função + 3 tabelas + 8
-- índices + backfill orphan-safe da Secretaria B&H. Tudo idempotente
-- (CREATE OR REPLACE / IF NOT EXISTS / NOT EXISTS no INSERT).
--
-- Modelo (1 contact ↔ N identities):
--   wa_contacts            ← 1 linha por pessoa (cross-channel · cross-jid)
--   wa_contact_identities  ← N chaves por contact (phone variants, jid_phone,
--                             jid_lid, remote_jid, wa_number_phone, ...)
--   wa_identity_conflicts  ← bucket de matches ambíguos (resolução manual)
--
-- A normalização é centralizada em `_wa_identity_norm(type, value)`:
--   - phone_*               → só dígitos (regexp_replace \D '', '')
--   - jid/remote_jid/...    → lower + trim
--   - manual_alias/outros   → lower + trim
--
-- UNIQUE strong: (clinic_id, identity_type, identity_value_norm) WHERE
--   identity_type IN (phone_e164, phone_br_with_9, phone_br_without_9,
--   jid_phone, jid_lid, remote_jid, wa_number_phone, provider_contact_id)
-- AND deleted_at IS NULL.
--
-- Identidades "weak" (phone_last8/last9) NÃO entram no UNIQUE · servem de
-- fallback de match (LID-aware) sem disparar conflito imediato.
--
-- ⚠️  Esta migration é APENAS pra versionamento. Função/tabelas/índices/
-- backfill JÁ ESTÃO em prod. Não rodar via supabase CLI ou Mgmt API.
-- =============================================================================

-- ── 1. FUNÇÃO DE NORMALIZAÇÃO ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._wa_identity_norm(
  p_identity_type text,
  p_identity_value text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT
    CASE
      WHEN p_identity_value IS NULL THEN NULL
      WHEN p_identity_type IN (
        'phone_e164', 'phone_br_with_9', 'phone_br_without_9',
        'phone_last8', 'phone_last9', 'wa_number_phone'
      )
      THEN NULLIF(regexp_replace(p_identity_value, '\D', '', 'g'), '')
      WHEN p_identity_type IN (
        'jid_phone', 'jid_lid', 'remote_jid', 'provider_contact_id'
      )
      THEN NULLIF(lower(trim(p_identity_value)), '')
      ELSE NULLIF(lower(trim(p_identity_value)), '')
    END;
$function$;

COMMENT ON FUNCTION public._wa_identity_norm(text, text) IS
'Normalização canônica de identidades WhatsApp · phones=só dígitos · jids=lower+trim · usado pelo UNIQUE strong em wa_contact_identities.';

-- ── 2. TABELA wa_contacts (1 linha por pessoa) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_contacts (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid          NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  primary_lead_id   uuid          REFERENCES public.leads(id) ON DELETE SET NULL,
  display_name      text,
  phone_preferred   text,
  status            text          NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active', 'merged', 'archived', 'conflict')),
  source            text          NOT NULL DEFAULT 'identity_architecture',
  confidence_score  integer       NOT NULL DEFAULT 100
                                  CHECK (confidence_score BETWEEN 0 AND 100),
  metadata          jsonb         NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at     timestamptz,
  last_seen_at      timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

COMMENT ON TABLE public.wa_contacts IS
'Contato canônico WhatsApp · 1 linha por pessoa real · agrega N identidades (phones, jids, lids) · sucessor do modelo per-channel.';

COMMENT ON COLUMN public.wa_contacts.primary_lead_id IS
'Lead "principal" deste contato · pode ser NULL se contact ainda não foi promovido a lead. SET NULL no DELETE pra preservar contact mesmo se lead for hard-deleted.';

COMMENT ON COLUMN public.wa_contacts.status IS
'active=normal · merged=apontado pra outro contact (depois de dedup) · archived=opt-out/inativo · conflict=match ambíguo precisa resolver.';

COMMENT ON COLUMN public.wa_contacts.source IS
'Origem do contact (identity_architecture | manual | import_csv | webhook | ...) · usado pra audit do backfill.';

COMMENT ON COLUMN public.wa_contacts.metadata IS
'JSONB livre · usado pra rastrear orfãos (raw_conversation_lead_id quando lead não existe na FK), tags de origem, notas internas.';

-- ── 3. TABELA wa_contact_identities (N chaves por contact) ──────────────────

CREATE TABLE IF NOT EXISTS public.wa_contact_identities (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid          NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contact_id            uuid          NOT NULL REFERENCES public.wa_contacts(id) ON DELETE CASCADE,
  lead_id               uuid          REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id       uuid          REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
  wa_number_id          uuid          REFERENCES public.wa_numbers(id) ON DELETE SET NULL,
  identity_type         text          NOT NULL
                                      CHECK (identity_type IN (
                                        'phone_e164',
                                        'phone_br_with_9',
                                        'phone_br_without_9',
                                        'phone_last8',
                                        'phone_last9',
                                        'jid_phone',
                                        'jid_lid',
                                        'remote_jid',
                                        'wa_number_phone',
                                        'provider_contact_id',
                                        'manual_alias'
                                      )),
  identity_value        text          NOT NULL,
  identity_value_norm   text,
  confidence_score      integer       NOT NULL DEFAULT 100
                                      CHECK (confidence_score BETWEEN 0 AND 100),
  source                text          NOT NULL DEFAULT 'manual_or_backfill',
  is_primary            boolean       NOT NULL DEFAULT false,
  is_verified           boolean       NOT NULL DEFAULT false,
  first_seen_at         timestamptz,
  last_seen_at          timestamptz,
  metadata              jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz   NOT NULL DEFAULT now(),
  updated_at            timestamptz   NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  CONSTRAINT chk_wa_contact_identities_norm_not_empty
    CHECK (identity_value_norm IS NOT NULL AND length(identity_value_norm) > 0)
);

COMMENT ON TABLE public.wa_contact_identities IS
'Chave de identidade WhatsApp (phone variant · jid_phone · jid_lid · remote_jid · wa_number_phone · provider_contact_id · manual_alias) · N rows por wa_contact.';

COMMENT ON COLUMN public.wa_contact_identities.identity_value_norm IS
'Valor normalizado via _wa_identity_norm(type, value) · usado pelo UNIQUE strong e pelo lookup.';

COMMENT ON COLUMN public.wa_contact_identities.is_primary IS
'Marca a identidade "preferida" do contact daquele tipo (ex: phone_e164 canônico) · UI usa pra exibir.';

COMMENT ON COLUMN public.wa_contact_identities.is_verified IS
'TRUE quando passou validação humana ou bateu com cadastro existente · pra futuro fluxo de merge automático.';

-- ── 4. TABELA wa_identity_conflicts (bucket de ambiguidade) ─────────────────

CREATE TABLE IF NOT EXISTS public.wa_identity_conflicts (
  id                          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                   uuid          NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conflict_type               text          NOT NULL DEFAULT 'ambiguous_identity_match',
  identity_type               text,
  identity_value              text,
  identity_value_norm         text,
  candidate_contact_ids       uuid[]        NOT NULL DEFAULT '{}'::uuid[],
  candidate_lead_ids          uuid[]        DEFAULT '{}'::uuid[],
  candidate_conversation_ids  uuid[]        DEFAULT '{}'::uuid[],
  resolution_status           text          NOT NULL DEFAULT 'open'
                                            CHECK (resolution_status IN (
                                              'open', 'resolved', 'ignored', 'needs_human_review'
                                            )),
  resolved_contact_id         uuid          REFERENCES public.wa_contacts(id) ON DELETE SET NULL,
  resolution_notes            text,
  metadata                    jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at                  timestamptz   NOT NULL DEFAULT now(),
  resolved_at                 timestamptz,
  resolved_by                 uuid
);

COMMENT ON TABLE public.wa_identity_conflicts IS
'Bucket pra matches ambíguos (mesmo identity_value_norm aponta pra múltiplos contacts) · resolução humana via UI · NÃO popula automaticamente no backfill inicial.';

COMMENT ON COLUMN public.wa_identity_conflicts.candidate_contact_ids IS
'Array de wa_contacts.id em conflito · resolução escolhe um e marca os outros como merged.';

-- ── 5. ÍNDICES ──────────────────────────────────────────────────────────────

-- 5.1 UNIQUE strong (per-clinic · 8 tipos sem ambiguidade · ignora deletados)
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_contact_identities_strong
  ON public.wa_contact_identities
  USING btree (clinic_id, identity_type, identity_value_norm)
  WHERE (
    (deleted_at IS NULL)
    AND (identity_type = ANY (ARRAY[
      'phone_e164',
      'phone_br_with_9',
      'phone_br_without_9',
      'jid_phone',
      'jid_lid',
      'remote_jid',
      'wa_number_phone',
      'provider_contact_id'
    ]))
  );

-- 5.2 Reverse lookup contact → identities
CREATE INDEX IF NOT EXISTS idx_wa_contact_identities_contact
  ON public.wa_contact_identities
  USING btree (contact_id)
  WHERE (deleted_at IS NULL);

-- 5.3 Reverse lookup lead → identities (só quando lead vinculado)
CREATE INDEX IF NOT EXISTS idx_wa_contact_identities_lead
  ON public.wa_contact_identities
  USING btree (lead_id)
  WHERE (lead_id IS NOT NULL AND deleted_at IS NULL);

-- 5.4 Reverse lookup conversation → identities
CREATE INDEX IF NOT EXISTS idx_wa_contact_identities_conversation
  ON public.wa_contact_identities
  USING btree (conversation_id)
  WHERE (conversation_id IS NOT NULL AND deleted_at IS NULL);

-- 5.5 Reverse lookup wa_number → identities
CREATE INDEX IF NOT EXISTS idx_wa_contact_identities_wa_number
  ON public.wa_contact_identities
  USING btree (wa_number_id)
  WHERE (wa_number_id IS NOT NULL AND deleted_at IS NULL);

-- 5.6 Weak lookup (last8/last9 · LID fallback · NÃO no UNIQUE)
CREATE INDEX IF NOT EXISTS idx_wa_contact_identities_weak_lookup
  ON public.wa_contact_identities
  USING btree (clinic_id, identity_type, identity_value_norm)
  WHERE (
    (deleted_at IS NULL)
    AND (identity_type = ANY (ARRAY['phone_last8', 'phone_last9']))
  );

-- 5.7 Inbox de conflitos abertos (UI: ordena DESC por criação)
CREATE INDEX IF NOT EXISTS idx_wa_identity_conflicts_open
  ON public.wa_identity_conflicts
  USING btree (clinic_id, resolution_status, created_at DESC)
  WHERE (resolution_status = ANY (ARRAY['open', 'needs_human_review']));

-- 5.8 Lookup de conflito por identity (descobrir conflito existente antes de
-- abrir um novo)
CREATE INDEX IF NOT EXISTS idx_wa_identity_conflicts_identity
  ON public.wa_identity_conflicts
  USING btree (clinic_id, identity_type, identity_value_norm);

-- ── 6. BACKFILL ORPHAN-SAFE · SECRETARIA B&H ────────────────────────────────
--
-- Fonte canônica: wa_number_id = 'ead8a6f9-6e0e-4a89-8268-155392794f69'
-- Cria 1 wa_contact por wa_conversation existente nesse canal (se ainda não
-- houver contact apontando pra mesma conversation). Cria identidades strong
-- (phone_e164/phone_br_with_9/phone_br_without_9 · derivadas de c.phone) e
-- weak (phone_last8/phone_last9) com NOT EXISTS pra ser re-rodável.
--
-- Orphan-safe: se conversation.lead_id apontar pra um lead que NÃO existe
-- (FK órfã do tempo do refactor), o lead_id NÃO é gravado nem em
-- wa_contacts.primary_lead_id nem em wa_contact_identities.lead_id · o
-- raw_conversation_lead_id fica em metadata pra audit posterior.
--
-- NÃO popula wa_identity_conflicts neste backfill · conflitos serão
-- detectados na próxima ingestão real ou em script dedicado.

DO $backfill$
DECLARE
  v_secretaria_wa_number_id uuid := 'ead8a6f9-6e0e-4a89-8268-155392794f69'::uuid;
BEGIN
  -- 6.1 wa_contacts (1 por conversation que ainda não tem contact)
  --
  -- CTE `orphan_lead_ids` lista os lead_ids que wa_conversations referenciam
  -- mas que NÃO existem em public.leads (FK órfã do tempo do refactor).
  -- Usado pra:
  --   (a) flagear `lead_was_orphan=true` em metadata
  --   (b) garantir que `valid_lead_id` (resultado do LEFT JOIN) seja NULL
  --       quando o lead é órfão · evita FK violation em primary_lead_id
  WITH orphan_lead_ids AS (
    SELECT DISTINCT c.lead_id
      FROM public.wa_conversations c
      WHERE c.wa_number_id = v_secretaria_wa_number_id
        AND c.deleted_at IS NULL
        AND c.lead_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.leads l2 WHERE l2.id = c.lead_id
        )
  )
  INSERT INTO public.wa_contacts (
    clinic_id,
    primary_lead_id,
    display_name,
    phone_preferred,
    status,
    source,
    confidence_score,
    metadata,
    first_seen_at,
    last_seen_at
  )
  SELECT
    c.clinic_id,
    -- valid_lead_id: l.id (do LEFT JOIN public.leads) é NULL quando órfão
    -- (orphan-safe) · só grava primary_lead_id se o lead realmente existe
    l.id AS valid_lead_id,
    NULLIF(c.display_name, '') AS display_name,
    NULLIF(c.phone, '')        AS phone_preferred,
    'active'                   AS status,
    'identity_architecture'    AS source,
    100                        AS confidence_score,
    jsonb_strip_nulls(jsonb_build_object(
      'backfill_source',           'secretaria_bh_2026_05_05',
      'wa_number_id',              c.wa_number_id::text,
      'conversation_id',           c.id::text,
      -- preserva o lead_id "cru" mesmo quando órfão · audit posterior
      'raw_conversation_lead_id',  c.lead_id::text,
      'lead_was_orphan',           CASE
                                     WHEN c.lead_id IN (SELECT lead_id FROM orphan_lead_ids)
                                     THEN true
                                     ELSE NULL
                                   END
    )) AS metadata,
    COALESCE(c.created_at, c.last_message_at) AS first_seen_at,
    COALESCE(c.last_message_at, c.updated_at) AS last_seen_at
  FROM public.wa_conversations c
  LEFT JOIN public.leads l
    ON l.id = c.lead_id
   AND l.clinic_id = c.clinic_id
  WHERE c.wa_number_id = v_secretaria_wa_number_id
    AND c.deleted_at IS NULL
    -- não recria contact pra conversation que já tem identity vinculada
    AND NOT EXISTS (
      SELECT 1
      FROM public.wa_contact_identities i
      WHERE i.conversation_id = c.id
        AND i.deleted_at IS NULL
    );

  -- 6.2 wa_contact_identities · STRONG (phone variants do c.phone)
  -- phone_e164 (dígitos do c.phone tal qual)
  INSERT INTO public.wa_contact_identities (
    clinic_id,
    contact_id,
    lead_id,
    conversation_id,
    wa_number_id,
    identity_type,
    identity_value,
    identity_value_norm,
    confidence_score,
    source,
    is_primary,
    is_verified,
    first_seen_at,
    last_seen_at,
    metadata
  )
  SELECT
    c.clinic_id,
    wc.id              AS contact_id,
    l.id               AS lead_id,
    c.id               AS conversation_id,
    c.wa_number_id     AS wa_number_id,
    'phone_e164'       AS identity_type,
    c.phone            AS identity_value,
    public._wa_identity_norm('phone_e164', c.phone) AS identity_value_norm,
    100                AS confidence_score,
    'manual_or_backfill' AS source,
    true               AS is_primary,
    false              AS is_verified,
    COALESCE(c.created_at, c.last_message_at) AS first_seen_at,
    COALESCE(c.last_message_at, c.updated_at) AS last_seen_at,
    jsonb_build_object('backfill_source', 'secretaria_bh_2026_05_05')
  FROM public.wa_conversations c
  JOIN public.wa_contacts wc
    ON wc.clinic_id = c.clinic_id
   AND (wc.metadata->>'conversation_id') = c.id::text
  LEFT JOIN public.leads l
    ON l.id = c.lead_id
   AND l.clinic_id = c.clinic_id
  WHERE c.wa_number_id = v_secretaria_wa_number_id
    AND c.deleted_at IS NULL
    AND c.phone IS NOT NULL
    AND public._wa_identity_norm('phone_e164', c.phone) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.wa_contact_identities i
      WHERE i.clinic_id = c.clinic_id
        AND i.identity_type = 'phone_e164'
        AND i.identity_value_norm = public._wa_identity_norm('phone_e164', c.phone)
        AND i.deleted_at IS NULL
    );

  -- phone_br_with_9 (13 dígitos · 55 + DDD + 9 + 8 dígitos)
  INSERT INTO public.wa_contact_identities (
    clinic_id, contact_id, lead_id, conversation_id, wa_number_id,
    identity_type, identity_value, identity_value_norm,
    confidence_score, source, is_primary, is_verified,
    first_seen_at, last_seen_at, metadata
  )
  SELECT
    c.clinic_id, wc.id, l.id, c.id, c.wa_number_id,
    'phone_br_with_9',
    -- canoniza pra 13c se phone tem 12c (insere o 9 após DDD)
    CASE
      WHEN length(regexp_replace(c.phone, '\D', '', 'g')) = 13 THEN regexp_replace(c.phone, '\D', '', 'g')
      WHEN length(regexp_replace(c.phone, '\D', '', 'g')) = 12 THEN
        substring(regexp_replace(c.phone, '\D', '', 'g'), 1, 4)
        || '9'
        || substring(regexp_replace(c.phone, '\D', '', 'g'), 5, 8)
      ELSE NULL
    END AS identity_value,
    CASE
      WHEN length(regexp_replace(c.phone, '\D', '', 'g')) = 13 THEN regexp_replace(c.phone, '\D', '', 'g')
      WHEN length(regexp_replace(c.phone, '\D', '', 'g')) = 12 THEN
        substring(regexp_replace(c.phone, '\D', '', 'g'), 1, 4)
        || '9'
        || substring(regexp_replace(c.phone, '\D', '', 'g'), 5, 8)
      ELSE NULL
    END AS identity_value_norm,
    100, 'manual_or_backfill', false, false,
    COALESCE(c.created_at, c.last_message_at),
    COALESCE(c.last_message_at, c.updated_at),
    jsonb_build_object('backfill_source', 'secretaria_bh_2026_05_05')
  FROM public.wa_conversations c
  JOIN public.wa_contacts wc
    ON wc.clinic_id = c.clinic_id
   AND (wc.metadata->>'conversation_id') = c.id::text
  LEFT JOIN public.leads l
    ON l.id = c.lead_id
   AND l.clinic_id = c.clinic_id
  WHERE c.wa_number_id = v_secretaria_wa_number_id
    AND c.deleted_at IS NULL
    AND c.phone IS NOT NULL
    AND length(regexp_replace(c.phone, '\D', '', 'g')) IN (12, 13)
    AND NOT EXISTS (
      SELECT 1 FROM public.wa_contact_identities i
      WHERE i.clinic_id = c.clinic_id
        AND i.identity_type = 'phone_br_with_9'
        AND i.identity_value_norm = (
          CASE
            WHEN length(regexp_replace(c.phone, '\D', '', 'g')) = 13 THEN regexp_replace(c.phone, '\D', '', 'g')
            WHEN length(regexp_replace(c.phone, '\D', '', 'g')) = 12 THEN
              substring(regexp_replace(c.phone, '\D', '', 'g'), 1, 4)
              || '9'
              || substring(regexp_replace(c.phone, '\D', '', 'g'), 5, 8)
            ELSE NULL
          END
        )
        AND i.deleted_at IS NULL
    );

  -- phone_br_without_9 (12 dígitos · 55 + DDD + 8 dígitos)
  INSERT INTO public.wa_contact_identities (
    clinic_id, contact_id, lead_id, conversation_id, wa_number_id,
    identity_type, identity_value, identity_value_norm,
    confidence_score, source, is_primary, is_verified,
    first_seen_at, last_seen_at, metadata
  )
  SELECT
    c.clinic_id, wc.id, l.id, c.id, c.wa_number_id,
    'phone_br_without_9',
    CASE
      WHEN length(regexp_replace(c.phone, '\D', '', 'g')) = 12 THEN regexp_replace(c.phone, '\D', '', 'g')
      WHEN length(regexp_replace(c.phone, '\D', '', 'g')) = 13 THEN
        substring(regexp_replace(c.phone, '\D', '', 'g'), 1, 4)
        || substring(regexp_replace(c.phone, '\D', '', 'g'), 6, 8)
      ELSE NULL
    END AS identity_value,
    CASE
      WHEN length(regexp_replace(c.phone, '\D', '', 'g')) = 12 THEN regexp_replace(c.phone, '\D', '', 'g')
      WHEN length(regexp_replace(c.phone, '\D', '', 'g')) = 13 THEN
        substring(regexp_replace(c.phone, '\D', '', 'g'), 1, 4)
        || substring(regexp_replace(c.phone, '\D', '', 'g'), 6, 8)
      ELSE NULL
    END AS identity_value_norm,
    100, 'manual_or_backfill', false, false,
    COALESCE(c.created_at, c.last_message_at),
    COALESCE(c.last_message_at, c.updated_at),
    jsonb_build_object('backfill_source', 'secretaria_bh_2026_05_05')
  FROM public.wa_conversations c
  JOIN public.wa_contacts wc
    ON wc.clinic_id = c.clinic_id
   AND (wc.metadata->>'conversation_id') = c.id::text
  LEFT JOIN public.leads l
    ON l.id = c.lead_id
   AND l.clinic_id = c.clinic_id
  WHERE c.wa_number_id = v_secretaria_wa_number_id
    AND c.deleted_at IS NULL
    AND c.phone IS NOT NULL
    AND length(regexp_replace(c.phone, '\D', '', 'g')) IN (12, 13)
    AND NOT EXISTS (
      SELECT 1 FROM public.wa_contact_identities i
      WHERE i.clinic_id = c.clinic_id
        AND i.identity_type = 'phone_br_without_9'
        AND i.identity_value_norm = (
          CASE
            WHEN length(regexp_replace(c.phone, '\D', '', 'g')) = 12 THEN regexp_replace(c.phone, '\D', '', 'g')
            WHEN length(regexp_replace(c.phone, '\D', '', 'g')) = 13 THEN
              substring(regexp_replace(c.phone, '\D', '', 'g'), 1, 4)
              || substring(regexp_replace(c.phone, '\D', '', 'g'), 6, 8)
            ELSE NULL
          END
        )
        AND i.deleted_at IS NULL
    );

  -- 6.3 wa_contact_identities · WEAK (phone_last8/phone_last9 · LID fallback)
  -- last8 (últimos 8 dígitos · NÃO entra no UNIQUE strong)
  INSERT INTO public.wa_contact_identities (
    clinic_id, contact_id, lead_id, conversation_id, wa_number_id,
    identity_type, identity_value, identity_value_norm,
    confidence_score, source, is_primary, is_verified,
    first_seen_at, last_seen_at, metadata
  )
  SELECT
    c.clinic_id, wc.id, l.id, c.id, c.wa_number_id,
    'phone_last8',
    right(regexp_replace(c.phone, '\D', '', 'g'), 8) AS identity_value,
    right(regexp_replace(c.phone, '\D', '', 'g'), 8) AS identity_value_norm,
    100, 'manual_or_backfill', false, false,
    COALESCE(c.created_at, c.last_message_at),
    COALESCE(c.last_message_at, c.updated_at),
    jsonb_build_object('backfill_source', 'secretaria_bh_2026_05_05')
  FROM public.wa_conversations c
  JOIN public.wa_contacts wc
    ON wc.clinic_id = c.clinic_id
   AND (wc.metadata->>'conversation_id') = c.id::text
  LEFT JOIN public.leads l
    ON l.id = c.lead_id
   AND l.clinic_id = c.clinic_id
  WHERE c.wa_number_id = v_secretaria_wa_number_id
    AND c.deleted_at IS NULL
    AND c.phone IS NOT NULL
    AND length(regexp_replace(c.phone, '\D', '', 'g')) >= 8
    AND NOT EXISTS (
      SELECT 1 FROM public.wa_contact_identities i
      WHERE i.clinic_id = c.clinic_id
        AND i.contact_id = wc.id
        AND i.identity_type = 'phone_last8'
        AND i.identity_value_norm = right(regexp_replace(c.phone, '\D', '', 'g'), 8)
        AND i.deleted_at IS NULL
    );

  -- last9 (últimos 9 dígitos · cobre números com/sem DDI)
  INSERT INTO public.wa_contact_identities (
    clinic_id, contact_id, lead_id, conversation_id, wa_number_id,
    identity_type, identity_value, identity_value_norm,
    confidence_score, source, is_primary, is_verified,
    first_seen_at, last_seen_at, metadata
  )
  SELECT
    c.clinic_id, wc.id, l.id, c.id, c.wa_number_id,
    'phone_last9',
    right(regexp_replace(c.phone, '\D', '', 'g'), 9) AS identity_value,
    right(regexp_replace(c.phone, '\D', '', 'g'), 9) AS identity_value_norm,
    100, 'manual_or_backfill', false, false,
    COALESCE(c.created_at, c.last_message_at),
    COALESCE(c.last_message_at, c.updated_at),
    jsonb_build_object('backfill_source', 'secretaria_bh_2026_05_05')
  FROM public.wa_conversations c
  JOIN public.wa_contacts wc
    ON wc.clinic_id = c.clinic_id
   AND (wc.metadata->>'conversation_id') = c.id::text
  LEFT JOIN public.leads l
    ON l.id = c.lead_id
   AND l.clinic_id = c.clinic_id
  WHERE c.wa_number_id = v_secretaria_wa_number_id
    AND c.deleted_at IS NULL
    AND c.phone IS NOT NULL
    AND length(regexp_replace(c.phone, '\D', '', 'g')) >= 9
    AND NOT EXISTS (
      SELECT 1 FROM public.wa_contact_identities i
      WHERE i.clinic_id = c.clinic_id
        AND i.contact_id = wc.id
        AND i.identity_type = 'phone_last9'
        AND i.identity_value_norm = right(regexp_replace(c.phone, '\D', '', 'g'), 9)
        AND i.deleted_at IS NULL
    );

  -- 6.4 remote_jid (se a conversation tem remote_jid · derivado do canal)
  INSERT INTO public.wa_contact_identities (
    clinic_id, contact_id, lead_id, conversation_id, wa_number_id,
    identity_type, identity_value, identity_value_norm,
    confidence_score, source, is_primary, is_verified,
    first_seen_at, last_seen_at, metadata
  )
  SELECT
    c.clinic_id, wc.id, l.id, c.id, c.wa_number_id,
    'remote_jid',
    c.remote_jid,
    public._wa_identity_norm('remote_jid', c.remote_jid),
    100, 'manual_or_backfill', false, false,
    COALESCE(c.created_at, c.last_message_at),
    COALESCE(c.last_message_at, c.updated_at),
    jsonb_build_object('backfill_source', 'secretaria_bh_2026_05_05')
  FROM public.wa_conversations c
  JOIN public.wa_contacts wc
    ON wc.clinic_id = c.clinic_id
   AND (wc.metadata->>'conversation_id') = c.id::text
  LEFT JOIN public.leads l
    ON l.id = c.lead_id
   AND l.clinic_id = c.clinic_id
  WHERE c.wa_number_id = v_secretaria_wa_number_id
    AND c.deleted_at IS NULL
    AND c.remote_jid IS NOT NULL
    AND public._wa_identity_norm('remote_jid', c.remote_jid) IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.wa_contact_identities i
      WHERE i.clinic_id = c.clinic_id
        AND i.identity_type = 'remote_jid'
        AND i.identity_value_norm = public._wa_identity_norm('remote_jid', c.remote_jid)
        AND i.deleted_at IS NULL
    );

  -- NOTA: wa_identity_conflicts NÃO é populado neste backfill · qualquer
  -- match ambíguo (mesmo identity_value_norm em múltiplos contacts) será
  -- detectado pela próxima ingestão real ou por script dedicado · isso
  -- evita "fechar" contacts agora com base em phone duplicado entre
  -- canais (resolver caso a caso).
END
$backfill$;

-- ── 7. VALIDAÇÃO POST-BACKFILL (executar manualmente em prod) ───────────────
--
-- Esperado em prod (snapshot 2026-05-05 · Secretaria B&H apenas):
--   wa_contacts            ≈ 62
--   wa_contact_identities  ≈ 360 (5 por contact em média:
--                                 phone_e164 + with_9 + without_9 + last8 + last9
--                                 + remote_jid quando aplicável)
--   wa_identity_conflicts  = 0 (ainda)
--
-- Queries de verificação:
--
--   SELECT
--     (SELECT count(*) FROM public.wa_contacts
--       WHERE source = 'identity_architecture'
--         AND deleted_at IS NULL)               AS contacts,
--     (SELECT count(*) FROM public.wa_contact_identities
--       WHERE source = 'manual_or_backfill'
--         AND deleted_at IS NULL)               AS identities,
--     (SELECT count(*) FROM public.wa_identity_conflicts) AS conflicts;
--
--   -- contacts órfãos de lead (audit · raw_conversation_lead_id preservado)
--   SELECT count(*) FROM public.wa_contacts
--    WHERE primary_lead_id IS NULL
--      AND (metadata->>'lead_was_orphan')::boolean IS TRUE;
--
--   -- distribuição de identidades por tipo
--   SELECT identity_type, count(*) AS qty
--     FROM public.wa_contact_identities
--    WHERE source = 'manual_or_backfill'
--      AND deleted_at IS NULL
--    GROUP BY 1
--    ORDER BY 2 DESC;

-- =============================================================================
-- FIM · 20260800000127 · NÃO RODAR (arquitetura já aplicada em prod manualmente)
-- =============================================================================
