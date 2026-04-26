-- Down 800-18 · clinicai-v2 · partnership dedup checks

DROP FUNCTION IF EXISTS public.b2b_partnership_phone_check(text, uuid);
DROP FUNCTION IF EXISTS public.b2b_partnership_slug_check(text, uuid);
