-- ============================================================================
-- Auto-greeting da secretaria · guards · arquivada / handoff / metadata
-- ============================================================================
--
-- Contexto · audit 2026-05-04:
--
-- Mig 114 introduziu o RPC `wa_secretaria_auto_greeting_claim(uuid)` com
-- 2 guards (outbound humano 6h + cooldown 24h via UPDATE WHERE). Bug
-- confirmado em prod hoje:
--
--   conversa da926b5c estava `metadata.archived_reason='cross_internal_loop'`
--   + `paused_by='human_handoff'` e mesmo assim recebeu greeting às 11:15.
--
-- Causa: nenhum dos 2 guards de mig 114 olhava status / metadata / paused_by.
-- "Cross_internal_loop" é arquivamento operacional (Mira tentou conversar com
-- Lara · loop bot-to-bot detectado) · greeting NUNCA deve disparar.
--
-- Esta mig redefine `wa_secretaria_auto_greeting_claim` adicionando 4 guards
-- defensivos (mantém os 2 existentes):
--
--   ❌ deleted_at IS NULL
--   ❌ status NOT IN ('archived', 'resolved', 'closed')
--   ❌ metadata->>'archived_at' IS NULL
--   ❌ paused_by NOT IN ('human_handoff', 'archived')
--
-- Defesa em camadas: SELECT EXISTS pré-check + UPDATE WHERE espelhado · race-safe
-- mesmo se conv mudar de status entre os 2 passos.
--
-- Versionamento da correção JÁ aplicada em prod (não reaplica em DB que já tem).
-- CREATE OR REPLACE é idempotente.
--
-- Não toca: wa_secretaria_auto_greeting_unclaim · triggers · outras migrations.
--
-- ADR-029: SECURITY DEFINER + SET search_path · GRANT só service_role (já feito mig 114).

BEGIN;

-- ── 1. Redefine RPC claim · com 4 guards adicionais ───────────────────────

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
  -- Guard 1: pré-check defensivo.
  -- Não dispara greeting se a conversa não existe, foi deletada, arquivada,
  -- resolvida, fechada, marcada como archived_at em metadata, ou está em
  -- handoff humano / arquivamento operacional.
  IF NOT EXISTS (
    SELECT 1
    FROM public.wa_conversations c
    WHERE c.id = p_conversation_id
      AND c.deleted_at IS NULL
      AND COALESCE(c.status, 'active') NOT IN ('archived', 'resolved', 'closed')
      AND COALESCE(c.metadata, '{}'::jsonb)->>'archived_at' IS NULL
      AND (
        c.paused_by IS NULL
        OR c.paused_by NOT IN ('human_handoff', 'archived')
      )
  ) THEN
    RETURN false;
  END IF;

  -- Guard 2: outbound humano nas últimas 6h cobre Luciana ativa + auto-greeting
  -- recente salvo como sender='humano'. Filtra deleted_at IS NULL pra não
  -- contar mensagens soft-deleted como "conversa ativa".
  SELECT EXISTS (
    SELECT 1
    FROM public.wa_messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.direction = 'outbound'
      AND m.sender = 'humano'
      AND m.deleted_at IS NULL
      AND m.sent_at > now() - interval '6 hours'
  )
  INTO v_recent_outbound;

  IF v_recent_outbound THEN
    RETURN false;
  END IF;

  -- Guard 3: claim atomic com cooldown 24h + filtros do Guard 1 espelhados.
  -- Defesa em camadas: se status/metadata/paused_by mudarem entre Guard 1
  -- e este UPDATE, a WHERE clause aqui ainda bloqueia o claim.
  UPDATE public.wa_conversations c
     SET last_auto_greeting_at = now()
   WHERE c.id = p_conversation_id
     AND c.deleted_at IS NULL
     AND COALESCE(c.status, 'active') NOT IN ('archived', 'resolved', 'closed')
     AND COALESCE(c.metadata, '{}'::jsonb)->>'archived_at' IS NULL
     AND (
       c.paused_by IS NULL
       OR c.paused_by NOT IN ('human_handoff', 'archived')
     )
     AND (
       c.last_auto_greeting_at IS NULL
       OR c.last_auto_greeting_at < now() - interval '24 hours'
     )
   RETURNING c.id INTO v_claimed;

  -- v_claimed = NULL se: (a) conv não existe, (b) cooldown ainda ativo,
  -- ou (c) algum guard novo bloqueou no UPDATE.
  RETURN v_claimed IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.wa_secretaria_auto_greeting_claim(UUID) IS
  'Claim atomic pra auto-greeting da secretaria · 4 guards (deleted/status/metadata/paused_by) + cooldown 24h + outbound humano 6h · true=worker pode mandar · false=skip.';

-- ── 2. Sanity check ────────────────────────────────────────────────────────

DO $$
DECLARE
  v_definer BOOLEAN;
  v_src TEXT;
BEGIN
  SELECT prosecdef, prosrc INTO v_definer, v_src
  FROM pg_proc
  WHERE pronamespace='public'::regnamespace
    AND proname='wa_secretaria_auto_greeting_claim';

  IF v_definer IS NOT TRUE THEN
    RAISE EXCEPTION 'mig 117 · function não é SECURITY DEFINER';
  END IF;

  -- Garante que os 4 guards estão presentes no source
  IF v_src NOT LIKE '%deleted_at IS NULL%'
     OR v_src NOT LIKE '%archived%'
     OR v_src NOT LIKE '%archived_at%'
     OR v_src NOT LIKE '%human_handoff%' THEN
    RAISE EXCEPTION 'mig 117 · source não contém os 4 guards esperados';
  END IF;

  RAISE NOTICE 'mig 117 · auto_greeting_claim com 4 guards · DEFINER · OK';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
