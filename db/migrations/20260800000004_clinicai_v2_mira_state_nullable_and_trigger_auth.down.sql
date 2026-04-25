-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Rollback 800-04                                                          ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ ⚠ DESTRUTIVO PARCIAL · NÃO restaura NOT NULL nas colunas mira_state     ║
-- ║   (faria com que linhas atuais sem state quebrassem). Apenas restaura   ║
-- ║   o trigger antigo (sem Authorization header).                           ║
-- ║                                                                          ║
-- ║ Antes de rodar este down: garantir que edge function b2b-voucher-audio   ║
-- ║   foi revertida pra aceitar X-Voucher-Audio-Secret apenas (sem Bearer). ║
-- ║   Senao audio dispatch volta a falhar 401.                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public._b2b_voucher_audio_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_sb_url     text;
  v_audio_sec  text;
  v_payload    jsonb;
  v_req_id     bigint;
BEGIN
  IF NEW.is_demo THEN RETURN NEW; END IF;

  SELECT value INTO v_sb_url    FROM public.clinic_secrets WHERE key = 'supabase_url'         LIMIT 1;
  SELECT value INTO v_audio_sec FROM public.clinic_secrets WHERE key = 'voucher_audio_secret' LIMIT 1;

  IF v_sb_url IS NULL THEN v_sb_url := 'https://oqboitkpcvuaudouwvkl.supabase.co'; END IF;
  IF v_audio_sec IS NULL OR v_audio_sec = '' THEN
    RAISE WARNING '[voucher_audio] secret voucher_audio_secret nao configurado';
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object('voucher_id', NEW.id, 'skip_if_sent', true);

  BEGIN
    SELECT net.http_post(
      url     := v_sb_url || '/functions/v1/b2b-voucher-audio',
      headers := jsonb_build_object(
        'Content-Type',           'application/json',
        'X-Voucher-Audio-Secret', v_audio_sec
      ),
      body    := v_payload,
      timeout_milliseconds := 30000
    ) INTO v_req_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[voucher_audio] pg_net falhou: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_b2b_voucher_audio_auto ON public.b2b_vouchers;
CREATE TRIGGER trg_b2b_voucher_audio_auto
  AFTER INSERT ON public.b2b_vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public._b2b_voucher_audio_after_insert();

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN RAISE NOTICE '800-04 ROLLBACK · trigger restaurado para versao pre-Authorization Bearer'; END $$;
