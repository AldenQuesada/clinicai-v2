-- Rollback Migration 87 · P-12 multi-atendente · assignment
-- Ordem inversa: drop RPCs → drop index → drop colunas → notify

DROP FUNCTION IF EXISTS public.wa_conversation_unassign(uuid);
DROP FUNCTION IF EXISTS public.wa_conversation_assign(uuid, uuid);

DROP INDEX IF EXISTS public.wa_conversations_assigned_to_idx;

ALTER TABLE public.wa_conversations
  DROP COLUMN IF EXISTS assigned_at,
  DROP COLUMN IF EXISTS assigned_to;

NOTIFY pgrst, 'reload schema';
