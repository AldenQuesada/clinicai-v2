-- ============================================================================
-- Migration 168 · clinicai-v2 · CLOUD META CANARY PREFLIGHT FOUNDATION
-- ============================================================================
--
-- Propósito (CRM_PHASE_2L.2):
--   Fundação técnica para canary Cloud Meta SEM envio real.
--
--   1. Mirror seguro do Meta approval status em wa_message_templates
--      (6 colunas novas · null/unknown por default · canary só aceita 'approved')
--   2. Tabela audit `wa_cloud_meta_canary_attempts` com mascaramento de
--      número (recipient_hash + last4 only) e payload mascarado
--   3. RLS multi-tenant · GRANT minimal · audit imutável (sem UPDATE público)
--
-- Estado seguro pós-apply:
--   - Colunas novas em wa_message_templates: TODAS NULL/default seguro
--     (nenhum template marcado approved automaticamente)
--   - Tabela canary attempts vazia
--   - Zero alteração em wa_outbox · zero alteração em cron · worker 71 OFF
--
-- Fora de escopo:
--   - Edge function `wa-canary-send` (arquivo separado · não deploy)
--   - Real send · gates documentados em doc 68
--   - Cron alter · job 71 OFF
--   - wa_outbox · zero touch
--
-- Rollback: down DROP ordenado (colunas + tabela · seguro).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ALTER wa_message_templates · adicionar mirror de Meta approval
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.wa_message_templates
  ADD COLUMN IF NOT EXISTS meta_approval_status     text,
  ADD COLUMN IF NOT EXISTS meta_approval_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS meta_template_name       text,
  ADD COLUMN IF NOT EXISTS meta_language            text,
  ADD COLUMN IF NOT EXISTS meta_category            text,
  ADD COLUMN IF NOT EXISTS meta_rejection_reason    text,
  ADD COLUMN IF NOT EXISTS meta_payload             jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Constraint do enum approval status (drop+create idempotente)
ALTER TABLE public.wa_message_templates
  DROP CONSTRAINT IF EXISTS chk_wa_template_meta_approval_status;

ALTER TABLE public.wa_message_templates
  ADD CONSTRAINT chk_wa_template_meta_approval_status CHECK (
    meta_approval_status IS NULL
    OR meta_approval_status IN ('approved','pending','rejected','paused','disabled','unknown')
  );

CREATE INDEX IF NOT EXISTS idx_wa_template_meta_approved_active
  ON public.wa_message_templates (clinic_id, meta_approval_status, active)
  WHERE meta_approval_status = 'approved' AND active = true;

COMMENT ON COLUMN public.wa_message_templates.meta_approval_status IS
  'Mig 168 (CRM_PHASE_2L.2) · mirror do Meta Business Manager approval status. '
  'Canary/real send EXIGE approved. Default null/unknown · admin deve preencher '
  'manualmente após conferência no Meta Business Manager (sem chamar Graph API).';

COMMENT ON COLUMN public.wa_message_templates.meta_template_name IS
  'Nome do template registrado na Meta (case-sensitive · usado em messages.template.name).';

COMMENT ON COLUMN public.wa_message_templates.meta_language IS
  'Código BCP-47 (ex: pt_BR, en_US) registrado no template Meta.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. TABELA wa_cloud_meta_canary_attempts (audit · mascarado)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_cloud_meta_canary_attempts (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                uuid,
  wa_number_id             uuid REFERENCES public.wa_numbers(id) ON DELETE SET NULL,
  template_id              uuid REFERENCES public.wa_message_templates(id) ON DELETE SET NULL,
  template_name            text,
  template_language        text,
  recipient_hash           text        NOT NULL,
  recipient_last4          text,
  dry_run                  boolean     NOT NULL DEFAULT true,
  status                   text        NOT NULL,
  block_reason             text,
  provider_message_id      text,
  request_payload_masked   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  response_payload_masked  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error_message            text,
  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_canary_status CHECK (
    status IN ('dry_run','blocked','sent','delivered','failed','timeout')
  ),
  CONSTRAINT chk_canary_recipient_hash_len CHECK (length(recipient_hash) >= 16),
  CONSTRAINT chk_canary_last4_format CHECK (
    recipient_last4 IS NULL OR (length(recipient_last4) = 4 AND recipient_last4 ~ '^[0-9]{4}$')
  )
);

CREATE INDEX IF NOT EXISTS idx_canary_attempts_clinic_created
  ON public.wa_cloud_meta_canary_attempts (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canary_attempts_status
  ON public.wa_cloud_meta_canary_attempts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_canary_attempts_recipient_hash
  ON public.wa_cloud_meta_canary_attempts (recipient_hash, created_at DESC);

COMMENT ON TABLE public.wa_cloud_meta_canary_attempts IS
  'Mig 168 (CRM_PHASE_2L.2) · audit imutável de canary attempts Cloud Meta. '
  'NUNCA armazena número completo · só recipient_hash (sha256) + last4 + payload masked. '
  'INSERT via edge SECURITY DEFINER · SELECT authenticated same-clinic · sem UPDATE público.';

-- RLS
ALTER TABLE public.wa_cloud_meta_canary_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS canary_attempts_select_same_clinic
  ON public.wa_cloud_meta_canary_attempts;
CREATE POLICY canary_attempts_select_same_clinic
  ON public.wa_cloud_meta_canary_attempts
  FOR SELECT TO authenticated
  USING (
    clinic_id IS NULL  -- canary global (sem tenant fixado)
    OR clinic_id = public.app_clinic_id()
  );

-- Sem policy INSERT/UPDATE/DELETE para authenticated · audit imutável
-- service_role faz INSERT via edge

GRANT SELECT ON public.wa_cloud_meta_canary_attempts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.wa_cloud_meta_canary_attempts TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Helper fn: wa_cloud_meta_canary_log (SECURITY DEFINER · audit insert)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_cloud_meta_canary_log(
  p_clinic_id              uuid,
  p_wa_number_id           uuid,
  p_template_id            uuid,
  p_template_name          text,
  p_template_language      text,
  p_recipient_hash         text,
  p_recipient_last4        text,
  p_dry_run                boolean,
  p_status                 text,
  p_block_reason           text,
  p_provider_message_id    text,
  p_request_payload_masked jsonb,
  p_response_payload_masked jsonb,
  p_error_message          text,
  p_created_by             uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_recipient_hash IS NULL OR length(p_recipient_hash) < 16 THEN
    RAISE EXCEPTION 'canary_log: recipient_hash obrigatório (min 16 chars)';
  END IF;

  IF p_status NOT IN ('dry_run','blocked','sent','delivered','failed','timeout') THEN
    RAISE EXCEPTION 'canary_log: status inválido %', p_status;
  END IF;

  INSERT INTO public.wa_cloud_meta_canary_attempts (
    clinic_id, wa_number_id, template_id, template_name, template_language,
    recipient_hash, recipient_last4,
    dry_run, status, block_reason,
    provider_message_id,
    request_payload_masked, response_payload_masked,
    error_message, created_by
  ) VALUES (
    p_clinic_id, p_wa_number_id, p_template_id, p_template_name, p_template_language,
    p_recipient_hash, p_recipient_last4,
    p_dry_run, p_status, p_block_reason,
    p_provider_message_id,
    COALESCE(p_request_payload_masked, '{}'::jsonb),
    COALESCE(p_response_payload_masked, '{}'::jsonb),
    p_error_message, p_created_by
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.wa_cloud_meta_canary_log IS
  'Mig 168 (CRM_PHASE_2L.2) · helper SECURITY DEFINER para edge logar canary '
  'attempts com validação básica (recipient_hash min 16 chars · status enum).';

GRANT EXECUTE ON FUNCTION public.wa_cloud_meta_canary_log(uuid, uuid, uuid, text, text, text, text, boolean, text, text, text, jsonb, jsonb, text, uuid)
  TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- SANITY DO BLOCK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_col_status_ok   boolean;
  v_col_payload_ok  boolean;
  v_table_ok        boolean;
  v_fn_ok           boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wa_message_templates'
      AND column_name='meta_approval_status'
  ) INTO v_col_status_ok;
  IF NOT v_col_status_ok THEN RAISE EXCEPTION 'sanity: meta_approval_status não criada'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wa_message_templates'
      AND column_name='meta_payload'
  ) INTO v_col_payload_ok;
  IF NOT v_col_payload_ok THEN RAISE EXCEPTION 'sanity: meta_payload não criada'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='wa_cloud_meta_canary_attempts'
  ) INTO v_table_ok;
  IF NOT v_table_ok THEN RAISE EXCEPTION 'sanity: wa_cloud_meta_canary_attempts não criada'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='wa_cloud_meta_canary_log'
  ) INTO v_fn_ok;
  IF NOT v_fn_ok THEN RAISE EXCEPTION 'sanity: wa_cloud_meta_canary_log não criada'; END IF;

  RAISE NOTICE 'mig 168 · template approval mirror + canary audit + helper criados';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
