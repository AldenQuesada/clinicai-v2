-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-04 · clinicai-v2 · 2 fixes urgentes (25/04/2026 manhã)    ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto: incidente Dani Mendes · 26 vouchers perdidos por 2 bugs em    ║
-- ║   cadeia. Fixes ja aplicados em prod via tmp scripts; esta migration    ║
-- ║   formaliza no repo + serve de doc.                                      ║
-- ║                                                                          ║
-- ║ FIX 1 · mira_conversation_state legacy NOT NULL                          ║
-- ║   Tabela existia da Mira antiga com state (jsonb NOT NULL) e context     ║
-- ║   (text NOT NULL). RPC mira_state_set da Mira nova so populava           ║
-- ║   state_key/state_value · INSERT quebrava com NOT NULL violation.        ║
-- ║   Resultado: state nunca era gravado · preempcao do voucher_confirm      ║
-- ║   nunca disparava · todos os SIM caiam em partner.other.                 ║
-- ║                                                                          ║
-- ║ FIX 2 · trigger _b2b_voucher_audio_after_insert auth header              ║
-- ║   Trigger usava header X-Voucher-Audio-Secret. Edge function             ║
-- ║   b2b-voucher-audio foi atualizada e agora exige Authorization Bearer    ║
-- ║   (verify_jwt=true). Resultado: net.http_post recebia 401                ║
-- ║   UNAUTHORIZED_NO_AUTH_HEADER · audio_sent_at ficava NULL.               ║
-- ║                                                                          ║
-- ║ Idempotencia: ALTER COLUMN ... DROP NOT NULL e idempotente. CREATE OR    ║
-- ║   REPLACE FUNCTION re-aplica sempre.                                     ║
-- ║                                                                          ║
-- ║ Rollback: 20260800000004_*.down.sql                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ═══════════════════════════════════════════════════════════════════════════
-- FIX 1 · DROP NOT NULL nas colunas legadas de mira_conversation_state
-- ═══════════════════════════════════════════════════════════════════════════

-- DO blocks pra tolerar tabela com schema variando (algumas colunas podem
-- ja estar nullable se rodou em ambiente que nao tinha Mira antiga).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'mira_conversation_state'
       AND column_name = 'state'
       AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.mira_conversation_state ALTER COLUMN state DROP NOT NULL;
    RAISE NOTICE '800-04 · ALTER state DROP NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'mira_conversation_state'
       AND column_name = 'context'
       AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.mira_conversation_state ALTER COLUMN context DROP NOT NULL;
    RAISE NOTICE '800-04 · ALTER context DROP NOT NULL';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIX 2 · CREATE OR REPLACE _b2b_voucher_audio_after_insert · headers
-- ═══════════════════════════════════════════════════════════════════════════
-- Adiciona Authorization Bearer (service_role_key) · mantem X-Voucher-Audio-
-- Secret pra compat caso edge volte a aceitar. Service role key vem do
-- clinic_secrets (vault canonico) · NUNCA hardcoded.

CREATE OR REPLACE FUNCTION public._b2b_voucher_audio_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_sb_url       text;
  v_audio_sec    text;
  v_service_key  text;
  v_payload      jsonb;
  v_headers      jsonb;
  v_req_id       bigint;
BEGIN
  -- Voucher demo: nao envia audio beneficiario (a parceira sabe que e exemplo)
  IF NEW.is_demo THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_sb_url
    FROM public.clinic_secrets WHERE key = 'supabase_url' LIMIT 1;
  SELECT value INTO v_audio_sec
    FROM public.clinic_secrets WHERE key = 'voucher_audio_secret' LIMIT 1;
  SELECT value INTO v_service_key
    FROM public.clinic_secrets WHERE key = 'supabase_service_role_key' LIMIT 1;

  IF v_sb_url IS NULL THEN
    v_sb_url := 'https://oqboitkpcvuaudouwvkl.supabase.co';
  END IF;

  IF v_audio_sec IS NULL OR v_audio_sec = '' THEN
    RAISE WARNING '[voucher_audio] secret voucher_audio_secret nao configurado · pulando audio';
    RETURN NEW;
  END IF;

  IF v_service_key IS NULL OR v_service_key = '' THEN
    RAISE WARNING '[voucher_audio] secret supabase_service_role_key nao configurado · pulando audio (edge exige Authorization Bearer apos atualizacao 25/04/2026)';
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object('voucher_id', NEW.id, 'skip_if_sent', true);
  v_headers := jsonb_build_object(
    'Content-Type',           'application/json',
    'Authorization',          'Bearer ' || v_service_key,
    'X-Voucher-Audio-Secret', v_audio_sec
  );

  BEGIN
    SELECT net.http_post(
      url     := v_sb_url || '/functions/v1/b2b-voucher-audio',
      headers := v_headers,
      body    := v_payload,
      timeout_milliseconds := 30000
    ) INTO v_req_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[voucher_audio] pg_net falhou: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Recriar trigger (CREATE OR REPLACE FUNCTION sozinho não recria trigger
-- · trigger ja referenciava o nome certo, mas redeclaro pra ter certeza)
DROP TRIGGER IF EXISTS trg_b2b_voucher_audio_auto ON public.b2b_vouchers;
CREATE TRIGGER trg_b2b_voucher_audio_auto
  AFTER INSERT ON public.b2b_vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public._b2b_voucher_audio_after_insert();

-- ═══════════════════════════════════════════════════════════════════════════
-- Adicionar service_role_key em clinic_secrets se ainda nao existe
-- (necessario pro novo header Authorization Bearer)
-- IMPORTANT: o seed REAL do valor e feito via UI ou SQL manual com o key
-- correto · esta migration apenas garante a chave existe pra nao bloquear.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.clinic_secrets (clinic_id, key, value, notes)
VALUES (
  public._default_clinic_id(),
  'supabase_service_role_key',
  '',
  'Service role key (vault) · usado pelo trigger b2b_voucher_audio pra '
  || 'autenticar contra edge function. Deve ser preenchido manualmente '
  || 'apos esta migration. Sem isso, voucher audio NAO dispara (logs '
  || 'mostram WARNING).'
)
ON CONFLICT (clinic_id, key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- Sanity check final (regra GOLD #7)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_state_nullable    boolean;
  v_context_nullable  boolean;
  v_trigger_exists    boolean;
  v_secret_row_exists boolean;
BEGIN
  SELECT (is_nullable = 'YES') INTO v_state_nullable
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='mira_conversation_state'
     AND column_name='state';

  SELECT (is_nullable = 'YES') INTO v_context_nullable
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='mira_conversation_state'
     AND column_name='context';

  SELECT EXISTS(
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_b2b_voucher_audio_auto'
       AND tgrelid = 'public.b2b_vouchers'::regclass
  ) INTO v_trigger_exists;

  SELECT EXISTS(
    SELECT 1 FROM public.clinic_secrets WHERE key = 'supabase_service_role_key'
  ) INTO v_secret_row_exists;

  IF NOT (v_state_nullable AND v_context_nullable AND v_trigger_exists AND v_secret_row_exists) THEN
    RAISE EXCEPTION '800-04 sanity FAIL · state_nullable=% context_nullable=% trigger_exists=% secret_row=%',
      v_state_nullable, v_context_nullable, v_trigger_exists, v_secret_row_exists;
  END IF;

  RAISE NOTICE '800-04 OK · mira_state nullable + trigger auth recreated + secret row reservada';
END $$;
