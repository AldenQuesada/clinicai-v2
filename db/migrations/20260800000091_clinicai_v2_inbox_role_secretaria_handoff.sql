-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 91 · clinicai-v2 · inbox_role + handoff Lara→Secretaria        ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto: hoje a clinic tem 1 numero (Lara SDR · 554499588773) que       ║
-- ║   alimenta /conversas. Adicionamos suporte a multiplos numeros com       ║
-- ║   roles distintos · 'sdr' (Lara) e 'secretaria'.                          ║
-- ║                                                                          ║
-- ║   Casos cobertos:                                                        ║
-- ║     1. Inbound direto na secretaria · lead manda no numero da clinica   ║
-- ║        (sem passar pela Lara). Webhook detecta inbox_role='secretaria'   ║
-- ║        e PULA generateResponse · vai direto pra inbox da secretaria.    ║
-- ║     2. Handoff Lara→Secretaria · IA decide passar (tag) ou atendente    ║
-- ║        clica botao. Marca conversation original com handoff_at,         ║
-- ║        pausa Lara 30d, dispara inbox_notification pra secretaria.       ║
-- ║                                                                          ║
-- ║ Mudancas:                                                                ║
-- ║   - wa_numbers.inbox_role · CHECK ('sdr' | 'secretaria') DEFAULT 'sdr'   ║
-- ║   - wa_conversations.inbox_role · denorm cache (evita JOIN no list)     ║
-- ║   - wa_conversations.handoff_to_secretaria_at · timestamp do handoff    ║
-- ║   - wa_conversations.handoff_to_secretaria_by · profile que disparou    ║
-- ║   - Trigger ai_inbox_role_sync · copia inbox_role do wa_numbers no      ║
-- ║     INSERT/UPDATE de wa_conversations.wa_number_id                      ║
-- ║   - RPC wa_conversation_handoff_secretaria(p_id) · atomic               ║
-- ║                                                                          ║
-- ║ Backfill:                                                                ║
-- ║   - wa_numbers existentes → inbox_role='sdr' (todos sao Lara hoje)      ║
-- ║   - wa_conversations existentes → inbox_role='sdr'                      ║
-- ║                                                                          ║
-- ║ Seguranca:                                                               ║
-- ║   - SECURITY DEFINER + search_path locked                                ║
-- ║   - clinic_id sempre via _sdr_clinic_id() · nunca literal                ║
-- ║   - GRANT EXECUTE TO authenticated · zero anon                           ║
-- ║                                                                          ║
-- ║ Idempotencia: ADD COLUMN IF NOT EXISTS · CREATE OR REPLACE em RPC.      ║
-- ║ Rollback: 20260800000091_..._handoff.down.sql                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. wa_numbers · adiciona inbox_role
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.wa_numbers
  ADD COLUMN IF NOT EXISTS inbox_role text;

-- Backfill: tudo que existe hoje vira 'sdr' (todos os oficiais sao Lara).
UPDATE public.wa_numbers
   SET inbox_role = 'sdr'
 WHERE inbox_role IS NULL;

-- Constraint: NOT NULL + CHECK depois do backfill.
ALTER TABLE public.wa_numbers
  ALTER COLUMN inbox_role SET NOT NULL,
  ALTER COLUMN inbox_role SET DEFAULT 'sdr';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'wa_numbers_inbox_role_check'
  ) THEN
    ALTER TABLE public.wa_numbers
      ADD CONSTRAINT wa_numbers_inbox_role_check
      CHECK (inbox_role IN ('sdr', 'secretaria'));
  END IF;
END $$;

COMMENT ON COLUMN public.wa_numbers.inbox_role IS
  'Mig 91 · qual inbox alimenta · sdr=Lara, secretaria=clinic. Default sdr (todos os oficiais antes da mig 91).';

-- Index pra resolver inbox role rapido no webhook.
CREATE INDEX IF NOT EXISTS idx_wa_numbers_inbox_role_active
  ON public.wa_numbers (clinic_id, inbox_role)
  WHERE is_active = true;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. wa_conversations · inbox_role denorm + handoff fields
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS inbox_role text,
  ADD COLUMN IF NOT EXISTS handoff_to_secretaria_at timestamptz,
  ADD COLUMN IF NOT EXISTS handoff_to_secretaria_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Backfill: todas as conversas existentes vieram da Lara (sdr).
UPDATE public.wa_conversations
   SET inbox_role = 'sdr'
 WHERE inbox_role IS NULL;

ALTER TABLE public.wa_conversations
  ALTER COLUMN inbox_role SET NOT NULL,
  ALTER COLUMN inbox_role SET DEFAULT 'sdr';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'wa_conversations_inbox_role_check'
  ) THEN
    ALTER TABLE public.wa_conversations
      ADD CONSTRAINT wa_conversations_inbox_role_check
      CHECK (inbox_role IN ('sdr', 'secretaria'));
  END IF;
END $$;

COMMENT ON COLUMN public.wa_conversations.inbox_role IS
  'Mig 91 · denorm cache do wa_numbers.inbox_role · evita JOIN em todo list query. Mantido sync via trigger ai_inbox_role_sync.';
COMMENT ON COLUMN public.wa_conversations.handoff_to_secretaria_at IS
  'Mig 91 · timestamp do handoff pra secretaria (Lara passou o lead). NULL = sem handoff.';
COMMENT ON COLUMN public.wa_conversations.handoff_to_secretaria_by IS
  'Mig 91 · profile que clicou no handoff (NULL quando IA decidiu via tag [ACIONAR_HUMANO:secretaria]).';

-- Index pra dashboard secretaria · lista handoffs pendentes ordenado.
CREATE INDEX IF NOT EXISTS idx_wa_conversations_handoff_secretaria
  ON public.wa_conversations (clinic_id, handoff_to_secretaria_at DESC)
  WHERE handoff_to_secretaria_at IS NOT NULL;

-- Index pra filter principal do /secretaria · todas conversas da inbox.
CREATE INDEX IF NOT EXISTS idx_wa_conversations_inbox_role_active
  ON public.wa_conversations (clinic_id, inbox_role, last_message_at DESC)
  WHERE status = 'active';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Trigger · sync inbox_role do wa_numbers no INSERT/UPDATE
-- ═══════════════════════════════════════════════════════════════════════
-- Quando wa_number_id e setado/alterado, copia inbox_role da tabela
-- wa_numbers automaticamente · garante denorm consistente.
CREATE OR REPLACE FUNCTION public.fn_wa_conversations_inbox_role_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role text;
BEGIN
  IF NEW.wa_number_id IS NULL THEN
    -- Sem wa_number_id, mantem default 'sdr' (legacy / Evolution).
    NEW.inbox_role := COALESCE(NEW.inbox_role, 'sdr');
    RETURN NEW;
  END IF;

  -- INSERT ou UPDATE com mudanca de wa_number_id · re-resolve.
  IF TG_OP = 'INSERT' OR NEW.wa_number_id IS DISTINCT FROM OLD.wa_number_id THEN
    SELECT inbox_role INTO v_role
      FROM public.wa_numbers
     WHERE id = NEW.wa_number_id;
    NEW.inbox_role := COALESCE(v_role, 'sdr');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_conversations_inbox_role_sync
  ON public.wa_conversations;

CREATE TRIGGER trg_wa_conversations_inbox_role_sync
  BEFORE INSERT OR UPDATE OF wa_number_id
  ON public.wa_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_wa_conversations_inbox_role_sync();

COMMENT ON FUNCTION public.fn_wa_conversations_inbox_role_sync() IS
  'Mig 91 · BEFORE INSERT/UPDATE em wa_conversations · sincroniza inbox_role com wa_numbers.';

-- ═══════════════════════════════════════════════════════════════════════
-- 4. RPC · wa_conversation_handoff_secretaria(p_conv_id)
-- ═══════════════════════════════════════════════════════════════════════
-- Atomic operation: pausa Lara 30d + dispara inbox_notification.
-- Chamado quando:
--   (a) IA emite [ACIONAR_HUMANO:secretaria] no webhook · auth.uid()=NULL
--   (b) Atendente clica "Passar pra Secretaria" no painel direito
--
-- clinic_id resolvido da PROPRIA conversation (nao via _sdr_clinic_id) ·
-- evita divergencia quando service_role chama (webhook nao tem GUC). Quando
-- authenticated chama, valida ownership cross-checkando _sdr_clinic_id.
--
-- Source da inbox_notification = 'system' (CHECK existente em mig 847 nao
-- aceita 'handoff_*'). Tipo do evento vai no payload.kind.
--
-- Nao cria nova conversa · secretaria precisa iniciar proativo do numero
-- dela (template Cloud API) na Fase 5. Aqui apenas marca + sinaliza.
CREATE OR REPLACE FUNCTION public.wa_conversation_handoff_secretaria(
  p_conversation_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller     uuid := auth.uid();   -- NULL quando service_role chama
  v_now        timestamptz := now();
  v_pause_until timestamptz := v_now + interval '30 days';
  v_clinic     uuid;
  v_lead_id    uuid;
  v_phone      text;
  v_already    boolean;
BEGIN
  -- 1. Resolve clinic_id direto da conversation (single source of truth).
  SELECT clinic_id, lead_id, phone, (handoff_to_secretaria_at IS NOT NULL)
    INTO v_clinic, v_lead_id, v_phone, v_already
    FROM public.wa_conversations
   WHERE id = p_conversation_id;

  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'conversation_not_found');
  END IF;

  -- 2. Quando atendente chama (authenticated), valida ownership cross-clinic.
  --    service_role (webhook) NAO precisa · ja resolveu via wa_numbers.
  IF v_caller IS NOT NULL THEN
    IF v_clinic IS DISTINCT FROM public._sdr_clinic_id() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  -- 3. Idempotente · ja marcado, retorna ok sem repetir notification.
  IF v_already THEN
    RETURN jsonb_build_object('ok', true, 'already_handed_off', true);
  END IF;

  -- 4. Marca handoff + pausa Lara 30 dias.
  UPDATE public.wa_conversations
     SET handoff_to_secretaria_at = v_now,
         handoff_to_secretaria_by = v_caller,
         ai_paused_until          = v_pause_until,
         ai_enabled               = false,
         ai_paused_by             = 'handoff_secretaria',
         ai_paused_at             = v_now
   WHERE id = p_conversation_id;

  -- 5. Dispara inbox_notification pra secretaria · source='system' (CHECK
  --    da mig 847 nao aceita 'handoff_*'); kind no payload.
  PERFORM public.inbox_notification_create(
    v_clinic,
    p_conversation_id,
    'system',
    COALESCE(p_reason, 'Lara passou o lead pra secretaria'),
    jsonb_build_object(
      'kind',         'handoff_secretaria',
      'lead_id',      v_lead_id,
      'phone',        v_phone,
      'caller',       v_caller,
      'pause_until',  v_pause_until
    )
  );

  RETURN jsonb_build_object(
    'ok',           true,
    'clinic_id',    v_clinic,
    'handoff_at',   v_now,
    'pause_until',  v_pause_until
  );
END $$;

COMMENT ON FUNCTION public.wa_conversation_handoff_secretaria(uuid, text) IS
  'Mig 91 · atomic handoff Lara→Secretaria · pausa Lara 30d + dispara inbox_notification. Idempotente.';

-- authenticated · atendente pode disparar via UI.
GRANT EXECUTE ON FUNCTION public.wa_conversation_handoff_secretaria(uuid, text)
  TO authenticated;
-- service_role · webhook dispara quando IA emite tag [ACIONAR_HUMANO:secretaria].
GRANT EXECUTE ON FUNCTION public.wa_conversation_handoff_secretaria(uuid, text)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. SANITY CHECKS
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_col_num_role     boolean;
  v_col_conv_role    boolean;
  v_col_conv_handoff boolean;
  v_func_handoff     boolean;
  v_trigger          boolean;
  v_legacy_null_num  int;
  v_legacy_null_conv int;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='wa_numbers' AND column_name='inbox_role'
  ) INTO v_col_num_role;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='wa_conversations' AND column_name='inbox_role'
  ) INTO v_col_conv_role;

  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='wa_conversations' AND column_name='handoff_to_secretaria_at'
  ) INTO v_col_conv_handoff;

  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='wa_conversation_handoff_secretaria'
  ) INTO v_func_handoff;

  SELECT EXISTS(
    SELECT 1 FROM pg_trigger
     WHERE tgname='trg_wa_conversations_inbox_role_sync'
  ) INTO v_trigger;

  SELECT count(*) FROM public.wa_numbers WHERE inbox_role IS NULL INTO v_legacy_null_num;
  SELECT count(*) FROM public.wa_conversations WHERE inbox_role IS NULL INTO v_legacy_null_conv;

  IF NOT v_col_num_role THEN
    RAISE EXCEPTION 'Sanity 91: wa_numbers.inbox_role nao foi adicionada';
  END IF;
  IF NOT v_col_conv_role THEN
    RAISE EXCEPTION 'Sanity 91: wa_conversations.inbox_role nao foi adicionada';
  END IF;
  IF NOT v_col_conv_handoff THEN
    RAISE EXCEPTION 'Sanity 91: wa_conversations.handoff_to_secretaria_at nao foi adicionada';
  END IF;
  IF NOT v_func_handoff THEN
    RAISE EXCEPTION 'Sanity 91: RPC wa_conversation_handoff_secretaria nao foi criada';
  END IF;
  IF NOT v_trigger THEN
    RAISE EXCEPTION 'Sanity 91: trigger trg_wa_conversations_inbox_role_sync nao foi criada';
  END IF;
  IF v_legacy_null_num > 0 THEN
    RAISE EXCEPTION 'Sanity 91: % rows em wa_numbers com inbox_role NULL · backfill falhou', v_legacy_null_num;
  END IF;
  IF v_legacy_null_conv > 0 THEN
    RAISE EXCEPTION 'Sanity 91: % rows em wa_conversations com inbox_role NULL · backfill falhou', v_legacy_null_conv;
  END IF;

  RAISE NOTICE 'Migration 91 OK · inbox_role + handoff secretaria + trigger + RPC criados';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
