-- Rollback Mig 101 · volta UNIQUE original (sem wa_number_id no scope)
DROP INDEX IF EXISTS public.uq_wa_conv_clinic_phone_wn_last8;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_conv_clinic_phone_last8
  ON public.wa_conversations (clinic_id, (right(regexp_replace(phone, '\D', '', 'g'), 8)))
  WHERE phone IS NOT NULL;
