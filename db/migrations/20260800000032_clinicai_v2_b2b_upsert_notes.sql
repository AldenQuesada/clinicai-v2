-- =============================================================================
-- 800-32: estende b2b_partnership_upsert pra persistir o campo `notes`
-- =============================================================================
-- AUTOR:    Claude + Alden — 2026-04-26
-- CONTEXTO: O wizard de cadastrar/editar parceria (apps/mira/src/app/(authed)/
--           estudio/cadastrar/WizardClient.tsx) expõe o campo "Notas internas"
--           — texto livre pra equipe gravar como conheceu, observações, etc.
--           A coluna b2b_partnerships.notes ja existe no schema canonico
--           (clinic-dashboard mig 0270, linha 164).
--           O RPC b2b_partnership_upsert (clinic-dashboard mig 0768 — última
--           versão) NÃO incluía `notes` no INSERT/UPDATE → texto era enviado
--           pelo formulário e silenciosamente descartado.
--           Esta mig recria o RPC com `notes` adicionado, mantendo todos os
--           outros campos. CREATE OR REPLACE — backward compat.
-- IMPACTO:  CREATE OR REPLACE de public.b2b_partnership_upsert(text, jsonb).
--           Idempotente. Caller continua chamando com o mesmo payload — se
--           `notes` não estiver presente, vira NULL (ou mantém valor antigo
--           no UPDATE via COALESCE com EXCLUDED, que aqui é simples set).
-- ROLLBACK: Aplicar versão da mig 768 do clinic-dashboard (sem notes).
-- DEPENDE DE: Coluna b2b_partnerships.notes (clinic-dashboard mig 0270).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.b2b_partnership_upsert(p_slug text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_clinic_id  uuid := public.app_clinic_id();
  v_id         uuid;
  v_slug       text;
  v_name       text;
  v_phone_raw  text;
  v_phone_norm text;
  v_manager    text := NULLIF(trim(COALESCE(p_payload->>'account_manager', '')), '');
BEGIN
  v_slug := regexp_replace(
              translate(lower(coalesce(trim(p_slug), '')),
                'áàãâéèêíìîóòõôúùûç', 'aaaaeeeiiioooouuuc'),
              '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  IF length(v_slug) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_invalido',
      'detail', 'Slug deve ter no minimo 3 caracteres (recebido: ' || coalesce(p_slug,'NULL') || ')');
  END IF;

  v_name := trim(coalesce(p_payload->>'name', ''));
  IF length(v_name) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nome_invalido',
      'detail', 'Nome deve ter no minimo 3 caracteres');
  END IF;

  v_phone_raw := trim(coalesce(p_payload->>'contact_phone', ''));
  IF v_phone_raw = '' THEN
    v_phone_norm := NULL;
  ELSE
    v_phone_norm := public._b2b_normalize_phone(v_phone_raw);
    IF v_phone_norm IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'telefone_invalido',
        'detail', 'Telefone invalido (' || v_phone_raw || ').');
    END IF;
  END IF;

  INSERT INTO public.b2b_partnerships (
    clinic_id, slug, name, pillar, category, tier, type,
    dna_excelencia, dna_estetica, dna_proposito,
    contact_name, contact_phone, contact_email, contact_instagram, contact_website,
    voucher_combo, voucher_validity_days, voucher_min_notice_days, voucher_monthly_cap, voucher_delivery,
    voucher_unit_cost_brl,
    contrapartida, contrapartida_cadence,
    monthly_value_cap_brl, contract_duration_months, review_cadence_months, sazonais,
    slogans, narrative_quote, narrative_author, emotional_trigger,
    involved_professionals, status, created_by,
    is_collective, member_count, estimated_monthly_reach,
    lat, lng,
    contract_signed_date, contract_expiry_date, renewal_notice_days,
    auto_playbook_enabled,
    account_manager, assigned_at,
    -- ⬇ NOVO 800-32
    notes
  ) VALUES (
    v_clinic_id, v_slug, v_name,
    COALESCE(p_payload->>'pillar', 'outros'),
    p_payload->>'category',
    NULLIF(p_payload->>'tier','')::int,
    COALESCE(p_payload->>'type', 'institutional'),
    NULLIF(p_payload->>'dna_excelencia','')::int,
    NULLIF(p_payload->>'dna_estetica','')::int,
    NULLIF(p_payload->>'dna_proposito','')::int,
    p_payload->>'contact_name', v_phone_norm, p_payload->>'contact_email',
    p_payload->>'contact_instagram', p_payload->>'contact_website',
    p_payload->>'voucher_combo',
    COALESCE(NULLIF(p_payload->>'voucher_validity_days','')::int, 30),
    COALESCE(NULLIF(p_payload->>'voucher_min_notice_days','')::int, 15),
    NULLIF(p_payload->>'voucher_monthly_cap','')::int,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'voucher_delivery')), ARRAY['digital']),
    NULLIF(p_payload->>'voucher_unit_cost_brl','')::numeric,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'contrapartida')), ARRAY[]::text[]),
    p_payload->>'contrapartida_cadence',
    NULLIF(p_payload->>'monthly_value_cap_brl','')::numeric,
    NULLIF(p_payload->>'contract_duration_months','')::int,
    COALESCE(NULLIF(p_payload->>'review_cadence_months','')::int, 3),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'sazonais')), ARRAY[]::text[]),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'slogans')), ARRAY[]::text[]),
    p_payload->>'narrative_quote',
    p_payload->>'narrative_author',
    p_payload->>'emotional_trigger',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'involved_professionals')), ARRAY['mirian']),
    COALESCE(p_payload->>'status','prospect'),
    p_payload->>'created_by',
    COALESCE((p_payload->>'is_collective')::boolean, false),
    NULLIF(p_payload->>'member_count','')::int,
    NULLIF(p_payload->>'estimated_monthly_reach','')::int,
    NULLIF(p_payload->>'lat','')::numeric,
    NULLIF(p_payload->>'lng','')::numeric,
    NULLIF(p_payload->>'contract_signed_date','')::date,
    NULLIF(p_payload->>'contract_expiry_date','')::date,
    COALESCE(NULLIF(p_payload->>'renewal_notice_days','')::int, 60),
    COALESCE((p_payload->>'auto_playbook_enabled')::boolean, true),
    v_manager,
    CASE WHEN v_manager IS NOT NULL THEN now() ELSE NULL END,
    -- ⬇ NOVO
    NULLIF(trim(COALESCE(p_payload->>'notes', '')), '')
  )
  ON CONFLICT (clinic_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    pillar = EXCLUDED.pillar,
    category = EXCLUDED.category,
    tier = EXCLUDED.tier,
    type = EXCLUDED.type,
    dna_excelencia = EXCLUDED.dna_excelencia,
    dna_estetica = EXCLUDED.dna_estetica,
    dna_proposito = EXCLUDED.dna_proposito,
    contact_name = EXCLUDED.contact_name,
    contact_phone = EXCLUDED.contact_phone,
    contact_email = EXCLUDED.contact_email,
    contact_instagram = EXCLUDED.contact_instagram,
    contact_website = EXCLUDED.contact_website,
    voucher_combo = EXCLUDED.voucher_combo,
    voucher_validity_days = EXCLUDED.voucher_validity_days,
    voucher_min_notice_days = EXCLUDED.voucher_min_notice_days,
    voucher_monthly_cap = EXCLUDED.voucher_monthly_cap,
    voucher_delivery = EXCLUDED.voucher_delivery,
    voucher_unit_cost_brl = EXCLUDED.voucher_unit_cost_brl,
    contrapartida = EXCLUDED.contrapartida,
    contrapartida_cadence = EXCLUDED.contrapartida_cadence,
    monthly_value_cap_brl = EXCLUDED.monthly_value_cap_brl,
    contract_duration_months = EXCLUDED.contract_duration_months,
    review_cadence_months = EXCLUDED.review_cadence_months,
    sazonais = EXCLUDED.sazonais,
    slogans = EXCLUDED.slogans,
    narrative_quote = EXCLUDED.narrative_quote,
    narrative_author = EXCLUDED.narrative_author,
    emotional_trigger = EXCLUDED.emotional_trigger,
    involved_professionals = EXCLUDED.involved_professionals,
    status = EXCLUDED.status,
    is_collective = EXCLUDED.is_collective,
    member_count = EXCLUDED.member_count,
    estimated_monthly_reach = EXCLUDED.estimated_monthly_reach,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    contract_signed_date  = EXCLUDED.contract_signed_date,
    contract_expiry_date  = EXCLUDED.contract_expiry_date,
    renewal_notice_days   = EXCLUDED.renewal_notice_days,
    auto_playbook_enabled = EXCLUDED.auto_playbook_enabled,
    account_manager       = COALESCE(EXCLUDED.account_manager, b2b_partnerships.account_manager),
    assigned_at           = CASE
                              WHEN EXCLUDED.account_manager IS DISTINCT FROM b2b_partnerships.account_manager
                              THEN EXCLUDED.assigned_at
                              ELSE b2b_partnerships.assigned_at
                            END,
    -- ⬇ NOVO · só sobrescreve se payload trouxe valor não-vazio (preserva nota antiga)
    notes                 = COALESCE(EXCLUDED.notes, b2b_partnerships.notes),
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'slug', v_slug);
END
$$;

COMMENT ON FUNCTION public.b2b_partnership_upsert(text, jsonb) IS
  'Upsert idempotente. Aceita JSON payload com todos os campos da b2b_partnerships, incluindo account_manager (Bloco C 2026-04-22) e notes (mig 800-32 2026-04-26).';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_partnership_upsert') THEN
    RAISE EXCEPTION 'ASSERT FAIL: b2b_partnership_upsert sumiu';
  END IF;
  RAISE NOTICE '✅ Mig 800-32 OK — upsert estendido com notes';
END $$;

COMMIT;
