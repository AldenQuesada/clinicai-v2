-- Rollback de 20260800000050_clinicai_v2_lara_conversation_lock.sql

BEGIN;

DROP FUNCTION IF EXISTS wa_clear_stuck_locks(INT);
DROP FUNCTION IF EXISTS wa_release_conversation(UUID, UUID);
DROP FUNCTION IF EXISTS wa_claim_conversation(UUID, INT);

DROP INDEX IF EXISTS idx_wa_conversations_processing_locked_at;

ALTER TABLE wa_conversations
  DROP COLUMN IF EXISTS processing_locked_at,
  DROP COLUMN IF EXISTS processing_lock_id;

NOTIFY pgrst, 'reload schema';

COMMIT;
