-- DOWN da mig 82 · restaura definicao anterior do bridge (com colunas obsoletas).
-- Atencao: rollback aqui NAO faz sentido logico (re-introduz o bug), mas
-- mantemos a versao quebrada por convenção de simetria das migrations.

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
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;
  IF v_phone = '' THEN RETURN NEW; END IF;

  SELECT id, name, slug INTO v_partnership
    FROM public.b2b_partnerships WHERE id = NEW.partnership_id;

  SELECT id INTO v_existing_id
    FROM public.leads
   WHERE clinic_id = v_clinic_id
     AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 8) = right(v_phone, 8)
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    v_lead_id := v_existing_id;
    UPDATE public.leads
       SET tags = (SELECT array_agg(DISTINCT t) FROM unnest(
              COALESCE(tags, ARRAY[]::text[]) || ARRAY[
                'voucher_' || v_partnership.slug, 'b2b'
              ]) t),
           data = COALESCE(data, '{}'::jsonb) ||
             jsonb_build_object(
               'b2b_voucher_token', NEW.token,
               'b2b_voucher_id', NEW.id,
               'b2b_partnership_name', v_partnership.name,
               'b2b_partnership_slug', v_partnership.slug,
               'b2b_voucher_issued_at', NEW.issued_at
             ),
           updated_at = now()
     WHERE id = v_lead_id;
  ELSE
    v_lead_id := gen_random_uuid();
    INSERT INTO public.leads (
      id, clinic_id, name, phone, status, phase, temperature, priority,
      channel_mode, ai_persona, funnel, tipo,
      source_type, origem,
      tags, data, wa_opt_in, conversation_status
    ) VALUES (
      v_lead_id, v_clinic_id, v_name, v_phone,
      'new', 'lead', 'hot', 'normal',
      'whatsapp', 'onboarder', 'procedimentos', 'Lead',
      'referral', v_partnership.name,
      ARRAY['voucher_' || v_partnership.slug, 'b2b'],
      jsonb_build_object(
        'b2b_voucher_token', NEW.token,
        'b2b_voucher_id', NEW.id,
        'b2b_partnership_name', v_partnership.name,
        'b2b_partnership_slug', v_partnership.slug,
        'b2b_voucher_issued_at', NEW.issued_at,
        'source_detail', 'Voucher B2B emitido via Mira'
      ),
      true, 'new'
    );
  END IF;

  RETURN NEW;
END
$$;

COMMIT;
