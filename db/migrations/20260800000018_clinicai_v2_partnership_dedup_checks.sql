-- =============================================================================
-- 800-18: dedup checks pro form de cadastro B2B (slug + telefone)
-- =============================================================================
-- AUTOR:    Claude + Alden — 2026-04-25
-- CONTEXTO: Form de cadastro hoje submete e espera erro generico do DB quando
--           o slug ja existe. Com dedup em tempo real, user ve conflito antes
--           de clicar salvar. Mesmo padrao pra telefone — warning que pode
--           estar ja associado a outra parceria. Port da legacy mig 761.
-- IMPACTO:  2 RPCs novas, read-only, GRANT authenticated.
-- =============================================================================

BEGIN;

-- ─── 1. b2b_partnership_slug_check ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_partnership_slug_check(
  p_slug       text,
  p_exclude_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_slug      text := lower(trim(COALESCE(p_slug, '')));
  v_row       record;
  v_suggest   text;
  v_n         int := 2;
BEGIN
  IF v_slug = '' OR length(v_slug) < 3 THEN
    RETURN jsonb_build_object('ok', true, 'exists', false);
  END IF;

  SELECT id, name, status
    INTO v_row
    FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id
     AND slug = v_slug
     AND (p_exclude_id IS NULL OR id <> p_exclude_id)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'exists', false);
  END IF;

  WHILE v_n < 22 LOOP
    v_suggest := v_slug || '-' || v_n;
    IF NOT EXISTS (
      SELECT 1 FROM public.b2b_partnerships
       WHERE clinic_id = v_clinic_id AND slug = v_suggest
    ) THEN
      EXIT;
    END IF;
    v_n := v_n + 1;
    v_suggest := NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'exists', true,
    'partnership', jsonb_build_object('id', v_row.id, 'name', v_row.name, 'status', v_row.status),
    'suggested', v_suggest
  );
END $$;

COMMENT ON FUNCTION public.b2b_partnership_slug_check(text, uuid) IS
  'Check se slug esta livre. Retorna { exists, partnership?, suggested } pra UI avisar antes do upsert.';

GRANT EXECUTE ON FUNCTION public.b2b_partnership_slug_check(text, uuid) TO authenticated;

-- ─── 2. b2b_partnership_phone_check ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_partnership_phone_check(
  p_phone      text,
  p_exclude_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_digits    text := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_last11    text;
  v_matches   jsonb := '[]'::jsonb;
BEGIN
  IF length(v_digits) < 10 THEN
    RETURN jsonb_build_object('ok', true, 'exists', false, 'matches', v_matches);
  END IF;

  v_last11 := right(v_digits, 11);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'status', p.status, 'phone', p.contact_phone
  )), '[]'::jsonb)
    INTO v_matches
    FROM public.b2b_partnerships p
   WHERE p.clinic_id = v_clinic_id
     AND p.contact_phone IS NOT NULL
     AND right(regexp_replace(p.contact_phone, '\D', '', 'g'), 11) = v_last11
     AND (p_exclude_id IS NULL OR p.id <> p_exclude_id);

  RETURN jsonb_build_object(
    'ok', true,
    'exists', jsonb_array_length(v_matches) > 0,
    'matches', v_matches
  );
END $$;

COMMENT ON FUNCTION public.b2b_partnership_phone_check(text, uuid) IS
  'Check se telefone ja esta em outra parceria. Match por last11 digits. Warning (nao bloqueia) — contato compartilhado pode ser legitimo.';

GRANT EXECUTE ON FUNCTION public.b2b_partnership_phone_check(text, uuid) TO authenticated;

-- ─── 3. ASSERTS ──────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_partnership_slug_check') THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_partnership_slug_check nao existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_partnership_phone_check') THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_partnership_phone_check nao existe';
  END IF;
  RAISE NOTICE '✅ Mig 800-18 OK — dedup RPCs slug + phone prontas';
END $$;

COMMIT;
