-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-03 · clinicai-v2 · B2B auto-whitelist trigger             ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto (DECISAO ALDEN): quando uma parceria muda pra status='active' ║
-- ║   E `partner_phone` valida E.164, automaticamente insere a parceira em  ║
-- ║   b2b_partnership_wa_senders (whitelist). Antes era manual via UI/RPC. ║
-- ║                                                                          ║
-- ║ NOTA arquitetura: as tabelas b2b_partnerships, b2b_partnership_wa_senders ║
-- ║   ja existem em prod (canonico vem de clinic-dashboard migrations       ║
-- ║   270/370). clinicai-v2 e clinic-dashboard compartilham mesmo Supabase  ║
-- ║   project · nao duplicamos schema, so adicionamos o trigger novo.       ║
-- ║                                                                          ║
-- ║ Validacao E.164:                                                         ║
-- ║   ~ '^\+?[1-9][0-9]{10,14}$' (10-14 digitos com + opcional · BR=13d)    ║
-- ║                                                                          ║
-- ║ Comportamento:                                                           ║
-- ║   - status muda pra 'active' (vindo de qualquer outro)                   ║
-- ║   - contact_phone (62-col schema usa contact_phone, nao partner_phone) ║
-- ║     valida E.164                                                         ║
-- ║   - INSERT ON CONFLICT DO NOTHING em b2b_partnership_wa_senders         ║
-- ║   - Se contact_phone invalido → RAISE NOTICE (nao bloqueia activate)   ║
-- ║                                                                          ║
-- ║ GOLD #3 (search_path), #5 (.down), #7 (sanity), #10 (NOTIFY).            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public._b2b_on_partnership_active_whitelist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_phone_clean text;
  v_e164_ok     boolean;
BEGIN
  -- Sai cedo se status nao mudou pra 'active' ou ja era active
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;

  IF NEW.contact_phone IS NULL OR length(trim(NEW.contact_phone)) = 0 THEN
    RAISE NOTICE '[b2b_auto_whitelist] partnership % sem contact_phone · skip whitelist insert', NEW.id;
    RETURN NEW;
  END IF;

  -- Valida E.164 · aceita +5544998787673 ou 5544998787673
  v_e164_ok := NEW.contact_phone ~ '^\+?[1-9][0-9]{10,14}$';
  IF NOT v_e164_ok THEN
    RAISE NOTICE '[b2b_auto_whitelist] partnership % phone "%" nao bate E.164 · skip',
      NEW.id, NEW.contact_phone;
    RETURN NEW;
  END IF;

  -- Limpa pra storage padrao (sem +)
  v_phone_clean := regexp_replace(NEW.contact_phone, '\D', '', 'g');

  INSERT INTO public.b2b_partnership_wa_senders
    (clinic_id, partnership_id, phone, role, active)
  VALUES
    (NEW.clinic_id, NEW.id, v_phone_clean, 'owner', true)
  ON CONFLICT (clinic_id, phone_last8, partnership_id) DO UPDATE SET
    active = true;

  RAISE NOTICE '[b2b_auto_whitelist] partnership % whitelisted phone %', NEW.id, v_phone_clean;
  RETURN NEW;
END
$$;

-- ── Trigger ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_b2b_on_partnership_active ON public.b2b_partnerships;
CREATE TRIGGER trg_b2b_on_partnership_active
  AFTER INSERT OR UPDATE OF status ON public.b2b_partnerships
  FOR EACH ROW
  EXECUTE FUNCTION public._b2b_on_partnership_active_whitelist();

COMMENT ON FUNCTION public._b2b_on_partnership_active_whitelist() IS
  'AUTO-WHITELIST · ao ativar parceria com contact_phone E.164 valido, '
  'insere em b2b_partnership_wa_senders (idempotente). Decisao Alden 2026-04.';

-- ── Sanity check ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_func   boolean;
  v_trig   boolean;
  v_target boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='_b2b_on_partnership_active_whitelist')
    INTO v_func;
  SELECT EXISTS(SELECT 1 FROM pg_trigger
                WHERE tgname='trg_b2b_on_partnership_active'
                  AND NOT tgisinternal)
    INTO v_trig;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='b2b_partnership_wa_senders')
    INTO v_target;

  IF NOT v_target THEN
    RAISE EXCEPTION 'Sanity 800-03: b2b_partnership_wa_senders nao existe · '
                    'aplique clinic-dashboard mig 0370 (b2b_applications_whitelist) primeiro';
  END IF;

  IF NOT (v_func AND v_trig) THEN
    RAISE EXCEPTION 'Sanity 800-03: trigger auto-whitelist nao foi instalado · func=% trig=%',
      v_func, v_trig;
  END IF;

  RAISE NOTICE 'Migration 800-03 OK · auto-whitelist trigger ativo em b2b_partnerships';
END $$;

NOTIFY pgrst, 'reload schema';
