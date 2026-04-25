-- Down · 800-09 · reverte batch limit anti-avalanche · restaura 800-07.

-- Drop nova assinatura (timestamptz, int)
DROP FUNCTION IF EXISTS public.lara_voucher_followup_pick(timestamptz, int);
DROP FUNCTION IF EXISTS public.lara_voucher_followup_clear_stuck();

DROP INDEX IF EXISTS public.idx_b2b_vouchers_lara_followup_picking;

ALTER TABLE public.b2b_vouchers
  DROP COLUMN IF EXISTS lara_followup_picking_at;

-- Restaura assinatura 800-07: lara_voucher_followup_pick(p_now timestamptz)
CREATE OR REPLACE FUNCTION public.lara_voucher_followup_pick(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_results jsonb := '[]'::jsonb;
  v_row     record;
  v_bucket  text;
  v_first_recipient text;
  v_first_partner   text;
BEGIN
  FOR v_row IN
    SELECT
      v.id,
      v.clinic_id,
      v.partnership_id,
      v.recipient_name,
      v.recipient_phone,
      v.combo,
      v.audio_sent_at,
      v.lara_followup_sent_24h_at,
      v.lara_followup_sent_48h_at,
      v.lara_followup_sent_72h_at,
      p.name              AS partnership_name,
      p.contact_name      AS partner_contact_name,
      p.contact_phone     AS partner_contact_phone
    FROM public.b2b_vouchers v
    JOIN public.b2b_partnerships p ON p.id = v.partnership_id
    WHERE v.lara_followup_state = 'pending'
      AND v.recipient_phone IS NOT NULL
      AND v.audio_sent_at IS NOT NULL
      AND COALESCE(v.status, 'issued') NOT IN ('cancelled','redeemed','expired')
      AND v.audio_sent_at <= p_now - interval '24 hours'
    ORDER BY v.audio_sent_at ASC
    LIMIT 200
  LOOP
    IF v_row.lara_followup_sent_24h_at IS NULL THEN
      v_bucket := '24h';
    ELSIF v_row.lara_followup_sent_48h_at IS NULL
          AND v_row.audio_sent_at <= p_now - interval '48 hours' THEN
      v_bucket := '48h';
    ELSIF v_row.lara_followup_sent_72h_at IS NULL
          AND v_row.audio_sent_at <= p_now - interval '72 hours' THEN
      v_bucket := '72h';
    ELSE
      CONTINUE;
    END IF;

    v_first_recipient := split_part(COALESCE(v_row.recipient_name, ''), ' ', 1);
    v_first_partner   := split_part(COALESCE(v_row.partner_contact_name, v_row.partnership_name, ''), ' ', 1);

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'voucher_id',             v_row.id,
      'clinic_id',              v_row.clinic_id,
      'partnership_id',         v_row.partnership_id,
      'partnership_name',       v_row.partnership_name,
      'partner_contact_name',   v_row.partner_contact_name,
      'partner_contact_phone',  v_row.partner_contact_phone,
      'partner_first_name',     NULLIF(v_first_partner, ''),
      'recipient_name',         v_row.recipient_name,
      'recipient_first_name',   NULLIF(v_first_recipient, ''),
      'recipient_phone',        v_row.recipient_phone,
      'combo',                  v_row.combo,
      'audio_sent_at',          v_row.audio_sent_at,
      'bucket',                 v_bucket
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'items', v_results);
END
$$;

GRANT EXECUTE ON FUNCTION public.lara_voucher_followup_pick(timestamptz) TO service_role;

-- Restaura mark_followup_sent SEM picking_at (versão 800-07)
CREATE OR REPLACE FUNCTION public.lara_voucher_mark_followup_sent(
  p_voucher_id uuid,
  p_bucket     text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count     int;
  v_new_state text;
BEGIN
  IF p_bucket NOT IN ('24h','48h','72h') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_bucket');
  END IF;

  v_new_state := 'cold_' || p_bucket;

  IF p_bucket = '24h' THEN
    UPDATE public.b2b_vouchers
       SET lara_followup_sent_24h_at = COALESCE(lara_followup_sent_24h_at, now()),
           lara_followup_state       = v_new_state,
           updated_at                = now()
     WHERE id = p_voucher_id
       AND lara_followup_state = 'pending';
  ELSIF p_bucket = '48h' THEN
    UPDATE public.b2b_vouchers
       SET lara_followup_sent_48h_at = COALESCE(lara_followup_sent_48h_at, now()),
           lara_followup_state       = v_new_state,
           updated_at                = now()
     WHERE id = p_voucher_id
       AND lara_followup_state = 'cold_24h';
  ELSE
    UPDATE public.b2b_vouchers
       SET lara_followup_sent_72h_at = COALESCE(lara_followup_sent_72h_at, now()),
           lara_followup_state       = v_new_state,
           updated_at                = now()
     WHERE id = p_voucher_id
       AND lara_followup_state = 'cold_48h';
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_count > 0, 'updated', v_count, 'new_state', v_new_state);
END
$$;

GRANT EXECUTE ON FUNCTION public.lara_voucher_mark_followup_sent(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
