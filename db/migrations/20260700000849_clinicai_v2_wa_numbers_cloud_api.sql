-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 849 · clinicai-v2 · wa_numbers extends Cloud API              ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto: ADR-028 multi-tenant inegociavel · webhook da Lara nova       ║
-- ║   precisa resolver clinic_id via phone_number_id da Meta Cloud. Tabela  ║
-- ║   wa_numbers (Evolution legacy) so tinha instance_id/api_url/api_key.   ║
-- ║   Adiciona 4 colunas pra suportar Cloud API:                            ║
-- ║     - phone_number_id      (Meta Cloud · UNIQUE quando is_active)       ║
-- ║     - access_token         (Bearer token Meta · long-lived)             ║
-- ║     - verify_token         (Webhook handshake handshake · UNIQUE ativo) ║
-- ║     - business_account_id  (WABA · pra futuras APIs)                    ║
-- ║                                                                          ║
-- ║ Helper RPC: wa_numbers_resolve_by_phone_number_id(text)                 ║
-- ║   retorna { clinic_id, wa_number_id, access_token } pro webhook.        ║
-- ║                                                                          ║
-- ║ Idempotência: ADD COLUMN IF NOT EXISTS, todas DDL safe pra re-run.      ║
-- ║ Rollback: 20260700000849_clinicai_v2_wa_numbers_cloud_api.down.sql      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Colunas Cloud API ───────────────────────────────────────────────────
ALTER TABLE public.wa_numbers
  ADD COLUMN IF NOT EXISTS phone_number_id      text,
  ADD COLUMN IF NOT EXISTS access_token         text,
  ADD COLUMN IF NOT EXISTS verify_token         text,
  ADD COLUMN IF NOT EXISTS business_account_id  text;

COMMENT ON COLUMN public.wa_numbers.phone_number_id     IS 'Meta Cloud Phone Number ID · usado pra resolver clinic_id em webhooks';
COMMENT ON COLUMN public.wa_numbers.access_token        IS 'Bearer token Meta Cloud · long-lived per number';
COMMENT ON COLUMN public.wa_numbers.verify_token        IS 'Token de handshake do webhook GET (Meta valida)';
COMMENT ON COLUMN public.wa_numbers.business_account_id IS 'WhatsApp Business Account ID (WABA) opcional';

-- ── Índices únicos (parciais por is_active) ─────────────────────────────
-- Phone Number ID precisa ser unique entre numbers ativos · 2 numbers
-- desativados podem ter o mesmo (legacy/restore scenarios).
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_numbers_phone_number_id_active
  ON public.wa_numbers (phone_number_id)
  WHERE phone_number_id IS NOT NULL AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_numbers_verify_token_active
  ON public.wa_numbers (verify_token)
  WHERE verify_token IS NOT NULL AND is_active = true;

-- Lookup quente · webhook resolve clinic_id por phone_number_id
CREATE INDEX IF NOT EXISTS idx_wa_numbers_phone_number_id
  ON public.wa_numbers (phone_number_id)
  WHERE phone_number_id IS NOT NULL;

-- ── RPC helper · resolve credenciais Cloud API por phone_number_id ──────
-- Webhook chama logo no entry point · retorna jsonb com clinic_id + tokens.
-- Service role only · webhook entry e unauth (Meta envia direto).
CREATE OR REPLACE FUNCTION public.wa_numbers_resolve_by_phone_number_id(
  p_phone_number_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_row record;
BEGIN
  IF p_phone_number_id IS NULL OR p_phone_number_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_number_id ausente');
  END IF;

  SELECT id, clinic_id, phone_number_id, access_token, verify_token
    INTO v_row
    FROM public.wa_numbers
   WHERE phone_number_id = p_phone_number_id
     AND is_active = true
   LIMIT 1;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_number_id nao encontrado ou inativo');
  END IF;

  RETURN jsonb_build_object(
    'ok',                true,
    'wa_number_id',      v_row.id,
    'clinic_id',         v_row.clinic_id,
    'phone_number_id',   v_row.phone_number_id,
    'access_token',      v_row.access_token,
    'verify_token',      v_row.verify_token
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.wa_numbers_resolve_by_phone_number_id(text) TO service_role;
-- authenticated NÃO tem acesso · vazaria access_token entre clínicas.

-- ── RPC helper · resolve por verify_token (handshake GET) ───────────────
CREATE OR REPLACE FUNCTION public.wa_numbers_resolve_by_verify_token(
  p_verify_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_row record;
BEGIN
  IF p_verify_token IS NULL OR p_verify_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'verify_token ausente');
  END IF;

  SELECT id, clinic_id
    INTO v_row
    FROM public.wa_numbers
   WHERE verify_token = p_verify_token
     AND is_active = true
   LIMIT 1;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  RETURN jsonb_build_object(
    'ok',           true,
    'wa_number_id', v_row.id,
    'clinic_id',    v_row.clinic_id
  );
END
$$;

GRANT EXECUTE ON FUNCTION public.wa_numbers_resolve_by_verify_token(text) TO service_role;

-- ── Sanity check ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_col_phone     boolean;
  v_col_token     boolean;
  v_col_verify    boolean;
  v_col_waba      boolean;
  v_func_resolve  boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='wa_numbers' AND column_name='phone_number_id')
    INTO v_col_phone;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='wa_numbers' AND column_name='access_token')
    INTO v_col_token;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='wa_numbers' AND column_name='verify_token')
    INTO v_col_verify;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
                WHERE table_schema='public' AND table_name='wa_numbers' AND column_name='business_account_id')
    INTO v_col_waba;

  IF NOT (v_col_phone AND v_col_token AND v_col_verify AND v_col_waba) THEN
    RAISE EXCEPTION 'Sanity 849: colunas wa_numbers nao adicionadas · phone=% token=% verify=% waba=%',
      v_col_phone, v_col_token, v_col_verify, v_col_waba;
  END IF;

  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='wa_numbers_resolve_by_phone_number_id')
    INTO v_func_resolve;
  IF NOT v_func_resolve THEN RAISE EXCEPTION 'Sanity 849: RPC resolve_by_phone_number_id nao foi criada'; END IF;

  RAISE NOTICE 'Migration 849 OK · wa_numbers extends Cloud API + 2 RPCs';
END $$;

NOTIFY pgrst, 'reload schema';
