-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-84 · clinicai-v2 · b2b_refer_lead_safe RPC                 ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Camada 10b · P3 · Race-safe dedup pra partner.refer_lead handler         ║
-- ║                                                                          ║
-- ║ Motivacao (auditoria 2026-04-29):                                        ║
-- ║   apps/mira/src/lib/webhook/handlers/b2b-refer-lead.ts faz duas          ║
-- ║   operacoes nao-atomicas: repos.leads.create() seguido de                ║
-- ║   repos.b2bAttributions.create(). Janela de race se 2 parceiras          ║
-- ║   indicam mesma pessoa quase simultaneamente · cria 2 leads + 2          ║
-- ║   attributions (duplicata silenciosa).                                   ║
-- ║                                                                          ║
-- ║ Estrategia (mirror do mig 800-12 b2b_voucher_issue_with_dedup):          ║
-- ║   1. Advisory lock por (clinic_id, phone[1]) · serializa concorrentes    ║
-- ║   2. Dedup com FOR UPDATE em leads (variantes de phone)                  ║
-- ║   3. Se hit ativo · reusa lead_id (registra attribution se nova)        ║
-- ║   4. Se hit soft-deleted · reativa (modelo excludente: paciente/        ║
-- ║      orcamento perdido pode ser indicado de novo)                        ║
-- ║   5. Se sem hit · INSERT novo lead com defaults canonicos               ║
-- ║   6. Sempre cria b2b_attribution apontando partnership -> lead          ║
-- ║                                                                          ║
-- ║ Schema canonico de leads (mig 800-60):                                   ║
-- ║   NOT NULL com DEFAULT: name='', phone='', source='manual',              ║
-- ║   source_type='manual', funnel='procedimentos', ai_persona='onboarder', ║
-- ║   temperature='warm', priority='normal', phase='lead', etc.              ║
-- ║   Constraint chk_leads_source aceita 'b2b_partnership_referral'.         ║
-- ║   Constraint chk_leads_source_type aceita 'referral'.                    ║
-- ║                                                                          ║
-- ║ Reactivation: o caller original (handler) NAO tem caso de re-indicacao  ║
-- ║   de lead soft-deleted (paciente). Mantemos o branch pra robustez ·     ║
-- ║   retorna action='reactivated' pra logging/alert.                        ║
-- ║                                                                          ║
-- ║ GOLD #3: SECURITY DEFINER + SET search_path = public, pg_catalog        ║
-- ║ GOLD #5: .down.sql pareado                                              ║
-- ║ GOLD #7: sanity check final                                             ║
-- ║ GOLD #10: NOTIFY pgrst reload schema                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── DROP versao anterior (idempotencia) ───────────────────────────────────
DROP FUNCTION IF EXISTS public.b2b_refer_lead_safe(uuid, uuid, text, text, text, text, jsonb);

-- ── RPC: b2b_refer_lead_safe ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_refer_lead_safe(
  p_partnership_id  uuid,
  p_clinic_id       uuid,
  p_phone           text,
  p_name            text   DEFAULT NULL,
  p_email           text   DEFAULT NULL,
  p_partner_slug    text   DEFAULT NULL,
  p_metadata        jsonb  DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_phone_normalized text;
  v_phone_variants   text[];
  v_existing_lead    public.leads%ROWTYPE;
  v_partnership_row  public.b2b_partnerships%ROWTYPE;
  v_new_lead_id      uuid;
  v_action           text;
  v_lock_key         text;
  v_tags             text[];
BEGIN
  -- 1. Validacao basica
  IF p_partnership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_id_required');
  END IF;
  IF p_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_id_required');
  END IF;

  v_phone_normalized := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF length(v_phone_normalized) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;

  -- 2. Resolve parceria (multi-tenant strict · ADR-028)
  SELECT * INTO v_partnership_row
    FROM public.b2b_partnerships
   WHERE id = p_partnership_id
     AND clinic_id = p_clinic_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  -- 3. Variantes de phone pra dedup (espelha logica clinic-dashboard)
  --    a) raw normalizado
  --    b) com prefixo 55
  --    c) sem prefixo 55
  --    d) sem 9 extra apos DDD (10 digitos)
  v_phone_variants := ARRAY[
    v_phone_normalized,
    '55' || v_phone_normalized,
    regexp_replace(v_phone_normalized, '^55', ''),
    regexp_replace(v_phone_normalized, '^(\d{2})9(\d{8})$', '\1\2')
  ];

  -- 4. Advisory lock keyed em (clinic_id, phone[1]) · serializa concorrentes
  --    pra mesma combinacao clinica + telefone.
  v_lock_key := 'b2b_refer:' || p_clinic_id::text || ':' || v_phone_variants[1];
  PERFORM pg_advisory_xact_lock(
    hashtext('b2b_refer_lead_safe')::int,
    hashtext(v_lock_key)::int
  );

  -- 5. Dedup atomic com FOR UPDATE
  SELECT * INTO v_existing_lead
    FROM public.leads
   WHERE clinic_id = p_clinic_id
     AND phone = ANY(v_phone_variants)
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing_lead.deleted_at IS NOT NULL THEN
      -- Reativa lead soft-deleted (paciente/orcamento perdido sendo re-indicado)
      UPDATE public.leads
         SET deleted_at = NULL,
             updated_at = now()
       WHERE id = v_existing_lead.id;
      v_new_lead_id := v_existing_lead.id;
      v_action := 'reactivated';
    ELSE
      v_new_lead_id := v_existing_lead.id;
      v_action := 'reused';
    END IF;
  ELSE
    -- 6. Sem hit · INSERT novo respeitando defaults canonicos do schema
    --    (mig 800-60). Tags = ['b2b_referral', <slug>] preservando logica
    --    do handler original.
    v_tags := ARRAY['b2b_referral']::text[];
    IF p_partner_slug IS NOT NULL AND length(trim(p_partner_slug)) > 0 THEN
      v_tags := v_tags || p_partner_slug;
    END IF;

    INSERT INTO public.leads (
      clinic_id,
      phone,
      name,
      email,
      phase,
      temperature,
      source,
      source_type,
      ai_persona,
      funnel,
      metadata
    ) VALUES (
      p_clinic_id,
      v_phone_normalized,
      COALESCE(NULLIF(p_name, ''), ''),
      NULLIF(p_email, ''),
      'lead',
      'warm',
      'b2b_partnership_referral',
      'referral',
      'onboarder',
      'procedimentos',
      COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_new_lead_id;

    -- Aplica tags via UPDATE separado (column tags nao existe no schema
    -- canonico mig 800-60 · projeto pode ter coluna tags em mig posterior;
    -- aqui usamos UPDATE com EXCEPTION pra tolerar ausencia da coluna).
    BEGIN
      UPDATE public.leads
         SET tags = v_tags
       WHERE id = v_new_lead_id;
    EXCEPTION WHEN undefined_column THEN
      -- Schema canonico nao tem coluna tags · ignora silenciosamente.
      NULL;
    END;

    v_action := 'created';
  END IF;

  -- 7. Cria b2b_attribution (idempotente by composite key partnership+lead)
  --    Best-effort: se b2b_attributions tem unique constraint que dispara,
  --    ignoramos · attribution ja existe.
  BEGIN
    INSERT INTO public.b2b_attributions (
      clinic_id,
      partnership_id,
      lead_id,
      attribution_type,
      weight,
      meta
    ) VALUES (
      p_clinic_id,
      p_partnership_id,
      v_new_lead_id,
      'referral',
      1,
      jsonb_build_object(
        'source', 'mira_refer_lead',
        'partner_slug', p_partner_slug,
        'action', v_action
      )
    );
  EXCEPTION WHEN unique_violation THEN
    -- attribution ja existe · ok, dedup natural
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', v_new_lead_id,
    'action', v_action
  );
END;
$$;

-- ── Permissions ───────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.b2b_refer_lead_safe(uuid, uuid, text, text, text, text, jsonb)
  TO authenticated, service_role;

-- ── Sanity check ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn    boolean;
  v_grant boolean;
  v_src   text;
BEGIN
  SELECT EXISTS(
    SELECT 1
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'b2b_refer_lead_safe'
  ) INTO v_fn;

  SELECT has_function_privilege(
    'service_role',
    'public.b2b_refer_lead_safe(uuid, uuid, text, text, text, text, jsonb)',
    'EXECUTE'
  ) INTO v_grant;

  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'b2b_refer_lead_safe';

  IF NOT (v_fn AND v_grant) THEN
    RAISE EXCEPTION 'Sanity 800-84 FAIL · fn=% grant=%', v_fn, v_grant;
  END IF;

  IF v_src NOT LIKE '%pg_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'Sanity 800-84 FAIL · funcao sem pg_advisory_xact_lock';
  END IF;
  IF v_src NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'Sanity 800-84 FAIL · funcao sem FOR UPDATE';
  END IF;

  RAISE NOTICE 'Migration 800-84 OK · b2b_refer_lead_safe advisory_xact_lock + FOR UPDATE + dedup';
END $$;

NOTIFY pgrst, 'reload schema';
