-- Down 800-16 · clinicai-v2 · partner_conversion_monthly

DROP FUNCTION IF EXISTS public.b2b_partner_conversion_monthly_all(text);
DROP FUNCTION IF EXISTS public.b2b_partner_conversion_monthly(text, uuid);
DROP FUNCTION IF EXISTS public._b2b_partner_conv_month_stats(uuid, uuid, text);
