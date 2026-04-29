-- ============================================================================
-- Mig 82 · Fix _b2b_voucher_to_lead_bridge · alinhar com schema atual de leads
-- ============================================================================
--
-- BUG: trigger _b2b_voucher_to_lead_bridge tenta INSERT em colunas obsoletas
-- de leads (status, tipo, origem, tags, data, conversation_status). O REFACTOR
-- LEAD MODEL (docs/REFACTOR_LEAD_MODEL.md, fases 0-10 concluidas) substituiu
-- essas colunas por phase, source, source_type, metadata. A funcao trigger
-- ficou para tras e bloqueia QUALQUER emissao de voucher com:
--   "[b2b_voucher_issue] column 'status' of relation 'leads' does not exist"
--
-- Sintoma reportado por Alden 2026-04-29: emissao manual via /vouchers/novo
-- modal mostra alerta de schema apos clicar Enfileirar.
--
-- Fix:
--   1. INSERT branch · usar colunas atuais
--      - status='new'              → REMOVER (phase ja cobre estado inicial)
--      - phase='lead'              → mantido
--      - tipo='Lead'               → REMOVER (não existe)
--      - origem=v_partnership.name → mover pra metadata.b2b_partnership_name
--      - source_type='referral'    → mantido (CHECK constraint permite)
--      - source                    → setar 'b2b_partnership_referral' (canonical)
--      - tags=ARRAY[...]           → mover pra metadata.b2b_tags
--      - data=jsonb...             → renomear pra metadata
--      - conversation_status='new' → REMOVER (não existe)
--   2. UPDATE branch (lead pre-existente) · merge em metadata em vez de data,
--      preserva phase atual (nao regredir lead que ja avancou).
--   3. ADR-009 mantido: gen_random_uuid() pra id (UUID puro).
--
-- Idempotente: CREATE OR REPLACE FUNCTION. Trigger trg_b2b_voucher_to_lead
-- ja existe e continua apontando pro mesmo nome de funcao.
--
-- Audiência: trigger AFTER INSERT em b2b_vouchers. Roda como SECURITY DEFINER
-- da owner (postgres) · sem RLS · sem mudança de GRANT.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._b2b_voucher_to_lead_bridge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id   uuid := NEW.clinic_id;
  v_lead_id     uuid;
  v_phone       text := regexp_replace(COALESCE(NEW.recipient_phone, ''), '\D', '', 'g');
  v_name        text := NEW.recipient_name;
  v_partnership record;
  v_existing_id uuid;
  v_b2b_payload jsonb;
BEGIN
  -- Demos nao criam lead
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;
  IF v_phone = '' THEN RETURN NEW; END IF;

  SELECT id, name, slug INTO v_partnership
    FROM public.b2b_partnerships WHERE id = NEW.partnership_id;

  -- Payload comum gravado em metadata pra rastreabilidade (origem, voucher,
  -- tags · evita ALTER TABLE em leads pra cada caso de uso novo).
  v_b2b_payload := jsonb_build_object(
    'b2b_voucher_token',     NEW.token,
    'b2b_voucher_id',        NEW.id::text,
    'b2b_partnership_id',    NEW.partnership_id::text,
    'b2b_partnership_name',  v_partnership.name,
    'b2b_partnership_slug',  v_partnership.slug,
    'b2b_voucher_issued_at', NEW.issued_at,
    'b2b_tags',              jsonb_build_array(
                               'voucher_' || COALESCE(v_partnership.slug, 'parceria'),
                               'b2b'
                             )
  );

  -- Tenta achar lead existente por phone (last 8)
  SELECT id INTO v_existing_id
    FROM public.leads
   WHERE clinic_id = v_clinic_id
     AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 8) = right(v_phone, 8)
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Atualiza lead existente · merge em metadata, NÃO regride phase.
    UPDATE public.leads
       SET metadata   = COALESCE(metadata, '{}'::jsonb) || v_b2b_payload,
           updated_at = now()
     WHERE id = v_existing_id;
  ELSE
    -- Cria lead novo · UUID puro (ADR-004/009)
    v_lead_id := gen_random_uuid();
    INSERT INTO public.leads (
      id, clinic_id, name, phone,
      phase, temperature, priority,
      channel_mode, ai_persona, funnel,
      source, source_type,
      metadata, wa_opt_in
    ) VALUES (
      v_lead_id, v_clinic_id, v_name, v_phone,
      'lead', 'hot', 'normal',
      'whatsapp', 'onboarder', 'procedimentos',
      'b2b_partnership_referral', 'referral',
      v_b2b_payload, true
    );
  END IF;

  RETURN NEW;
END
$$;

-- Recriar trigger pra garantir bind correto (idempotente)
DROP TRIGGER IF EXISTS trg_b2b_voucher_to_lead ON public.b2b_vouchers;
CREATE TRIGGER trg_b2b_voucher_to_lead
  AFTER INSERT ON public.b2b_vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public._b2b_voucher_to_lead_bridge();

-- ===== Sanity check (regra GOLD #7 do projeto) =====
DO $$
DECLARE
  v_fn_exists boolean;
  v_tg_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
     WHERE n.nspname='public' AND p.proname='_b2b_voucher_to_lead_bridge'
  ) INTO v_fn_exists;

  SELECT EXISTS(
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_b2b_voucher_to_lead'
       AND tgrelid = 'public.b2b_vouchers'::regclass
  ) INTO v_tg_exists;

  IF NOT v_fn_exists THEN RAISE EXCEPTION 'fn _b2b_voucher_to_lead_bridge nao existe pos-mig'; END IF;
  IF NOT v_tg_exists THEN RAISE EXCEPTION 'trigger trg_b2b_voucher_to_lead nao existe pos-mig'; END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
