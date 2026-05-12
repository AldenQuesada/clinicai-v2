-- ============================================================================
-- Migration 168 · DOWN · DROP canary preflight foundation
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.wa_cloud_meta_canary_log(
  uuid, uuid, uuid, text, text, text, text, boolean, text, text, text, jsonb, jsonb, text, uuid
);
DROP TABLE IF EXISTS public.wa_cloud_meta_canary_attempts;

ALTER TABLE public.wa_message_templates
  DROP CONSTRAINT IF EXISTS chk_wa_template_meta_approval_status;

ALTER TABLE public.wa_message_templates
  DROP COLUMN IF EXISTS meta_approval_status,
  DROP COLUMN IF EXISTS meta_approval_checked_at,
  DROP COLUMN IF EXISTS meta_template_name,
  DROP COLUMN IF EXISTS meta_language,
  DROP COLUMN IF EXISTS meta_category,
  DROP COLUMN IF EXISTS meta_rejection_reason,
  DROP COLUMN IF EXISTS meta_payload;

DROP INDEX IF EXISTS public.idx_wa_template_meta_approved_active;

NOTIFY pgrst, 'reload schema';

COMMIT;
