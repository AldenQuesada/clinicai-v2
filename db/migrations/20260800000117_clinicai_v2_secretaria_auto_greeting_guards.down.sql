-- Rollback de mig 117 · restaura `wa_secretaria_auto_greeting_claim` à versão da mig 114.
-- Remove os 4 guards (deleted_at / status / metadata / paused_by) e mantém apenas:
--   1. Bloqueio de outbound humano nas últimas 6h
--   2. Cooldown de 24h via UPDATE WHERE
-- Não toca em wa_secretaria_auto_greeting_unclaim, triggers, ou outras migrations.

BEGIN;

CREATE OR REPLACE FUNCTION public.wa_secretaria_auto_greeting_claim(
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_recent_outbound BOOLEAN;
  v_claimed UUID;
BEGIN
  -- Guard 1 (mig 114): outbound humano nas últimas 6h
  SELECT EXISTS (
    SELECT 1 FROM public.wa_messages
    WHERE conversation_id = p_conversation_id
      AND direction = 'outbound'
      AND sender = 'humano'
      AND sent_at > NOW() - INTERVAL '6 hours'
  ) INTO v_recent_outbound;

  IF v_recent_outbound THEN
    RETURN false;
  END IF;

  -- Guard 2 (mig 114): claim atomic com cooldown 24h
  UPDATE public.wa_conversations
  SET last_auto_greeting_at = NOW()
  WHERE id = p_conversation_id
    AND (last_auto_greeting_at IS NULL
         OR last_auto_greeting_at < NOW() - INTERVAL '24 hours')
  RETURNING id INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.wa_secretaria_auto_greeting_claim(UUID) IS
  'Claim atomic pra auto-greeting da secretaria · true=worker pode mandar · false=skip (Luciana ativa OU cooldown 24h).';

NOTIFY pgrst, 'reload schema';

COMMIT;
