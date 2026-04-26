-- DOWN da mig 800-41 · restaura catalog hardcoded RPC + tabela drop
BEGIN;
DROP FUNCTION IF EXISTS public.b2b_comm_event_key_upsert(jsonb);
DROP FUNCTION IF EXISTS public.b2b_comm_event_key_delete(text);
-- b2b_comm_events_catalog() volta ao hardcoded em mig anterior · CR no proximo deploy
DROP TABLE IF EXISTS public.b2b_comm_event_keys;
COMMIT;
