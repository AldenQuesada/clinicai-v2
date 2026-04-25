-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-12 · clinicai-v2 · b2b_voucher_issue_with_dedup           ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Fix F5 (Race condition na dedup pre-emit voucher)                       ║
-- ║                                                                          ║
-- ║ Problema (auditoria 2026-04-25):                                         ║
-- ║   apps/mira/.../b2b-emit-voucher.ts faz dedup global via                 ║
-- ║     LeadRepository.findInAnySystem(clinicId, phone)                      ║
-- ║   em paralelo (Promise.all 4 queries) · DEPOIS o handler de confirm     ║
-- ║   chama RPC b2b_voucher_issue. Janela de race entre dedup e create.     ║
-- ║                                                                          ║
-- ║ Cenario do bug:                                                          ║
-- ║   t=10:00.000 · Parceira A manda "voucher Maria 5544991111111"          ║
-- ║   t=10:00.080 · Parceira B (outra) manda "voucher Maria 5544991111111"  ║
-- ║   t=10:00.100 · A: dedup -> nao existe -> cria state voucher_confirm    ║
-- ║   t=10:00.180 · B: dedup -> nao existe -> cria state voucher_confirm    ║
-- ║   t=10:01.000 · A: SIM -> emite voucher                                 ║
-- ║   t=10:01.500 · B: SIM -> emite voucher (DUPLICADO!)                    ║
-- ║                                                                          ║
-- ║ Hoje raro (1 parceira ativa · Dani) · com 5+ parceiras simultaneas      ║
-- ║ vira problema. Fix preventivo.                                           ║
-- ║                                                                          ║
-- ║ Estrategia · single function RPC com advisory lock:                      ║
-- ║   1. pg_advisory_xact_lock(hashtext('b2b_v_dedup'), hashtext(phone))    ║
-- ║      · keyed na primeira variante de phone · serializa concorrentes      ║
-- ║      · transactional (auto-release no COMMIT/ROLLBACK)                   ║
-- ║   2. Dedup checks (4 niveis · FOR UPDATE pra durar lock ate commit)     ║
-- ║   3. Se hit: RETURN dedup_blocked (lock liberado no commit implicito)   ║
-- ║   4. Se sem hit: INSERT em b2b_vouchers + return id                     ║
-- ║                                                                          ║
-- ║ Por que advisory lock em vez de SERIALIZABLE:                            ║
-- ║   · SET LOCAL transaction_isolation dentro da funcao bate em             ║
-- ║     "must be called before any query" porque a funcao roda dentro       ║
-- ║     da transacao implicita que ja iniciou no caller (PostgREST).        ║
-- ║   · Advisory lock funciona em qualquer isolation, e cooperativo,        ║
-- ║     auto-release transactional (xact_lock = scope = transacao).         ║
-- ║   · Garantia equivalente: 2 chamadas concorrentes pra mesmo phone       ║
-- ║     serializam · 2a espera 1a commitar (ou abortar) · nao ve "vazio"   ║
-- ║     no dedup quando deveria ver voucher recem-criado.                   ║
-- ║                                                                          ║
-- ║ Caller (repository TS) ainda retenta com backoff em casos extremos     ║
-- ║ (deadlock detection, rede instavel) · 3 tentativas 100/300/700ms.       ║
-- ║                                                                          ║
-- ║ Compatibilidade:                                                         ║
-- ║   · b2b_voucher_issue ORIGINAL e mantido intacto (callers legacy ok)    ║
-- ║   · b2b_voucher_issue_with_dedup e funcao NOVA paralela                  ║
-- ║   · Caller resolve phone_variants no TS (phoneVariants util) e envia    ║
-- ║     como jsonb array no payload (chave 'phone_variants')                ║
-- ║                                                                          ║
-- ║ Contrato de retorno:                                                     ║
-- ║   { ok: true,  id, token, valid_until, theme }                          ║
-- ║   { ok: true,  dedup_hit: { kind, id, name?, phone, since,              ║
-- ║                              partnership_name? } }                      ║
-- ║   { ok: false, error: 'partnership_id_required' | ... }                 ║
-- ║                                                                          ║
-- ║ kind hierarchy (mais forte primeiro):                                    ║
-- ║   patient > lead > voucher_recipient > partner_referral                  ║
-- ║                                                                          ║
-- ║ GOLD #3: SECURITY DEFINER + SET search_path = public, extensions, pg_temp║
-- ║ GOLD #5: .down.sql pareado · DROP funcao nova                           ║
-- ║ GOLD #7: sanity check final                                              ║
-- ║ GOLD #10: NOTIFY pgrst reload schema                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── DROP versao anterior (caso exista de aplicacao previa) ─────────────────
DROP FUNCTION IF EXISTS public.b2b_voucher_issue_with_dedup(jsonb);

-- ── RPC: b2b_voucher_issue_with_dedup ──────────────────────────────────────
-- Inputs (p_payload jsonb):
--   partnership_id   uuid    REQUIRED
--   recipient_name   text
--   recipient_phone  text
--   recipient_cpf    text    optional
--   combo            text    optional (default da parceria)
--   notes            text    optional
--   validity_days    int     optional (default da parceria)
--   theme            text    optional ('dark' | 'light' · default 'dark')
--   is_demo          bool    optional (default false)
--   phone_variants   jsonb   optional · array de phones a checar.
--                            Se ausente, usa apenas recipient_phone.
--
-- Output (jsonb):
--   sucesso emit:    { ok:true, id, token, valid_until, theme, is_demo }
--   sucesso dedup:   { ok:true, dedup_hit: { kind, id, name, phone,
--                                              since, partnership_name } }
--   falha:           { ok:false, error }
CREATE OR REPLACE FUNCTION public.b2b_voucher_issue_with_dedup(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_clinic_id        uuid;
  v_partnership_id   uuid;
  v_combo            text;
  v_validity         int;
  v_theme            text;
  v_is_demo          boolean;
  v_token            text;
  v_id               uuid;
  v_try              int := 0;
  v_recipient_name   text;
  v_recipient_phone  text;
  v_recipient_cpf    text;
  v_notes            text;
  v_phone_variants   text[];
  v_phone_variants_jsonb jsonb;
  v_skip_dedup       boolean := false;
  v_lead_row         record;
  v_voucher_row      record;
  v_attrib_row       record;
  v_partnership_name text;
  v_lock_key         text;
BEGIN
  -- ── 1. Valida partnership_id ────────────────────────────────────────
  v_partnership_id := NULLIF(p_payload->>'partnership_id', '')::uuid;
  IF v_partnership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_id_required');
  END IF;

  -- Resolve clinic_id pela parceria · multi-tenant strict (ADR-028)
  SELECT clinic_id, voucher_validity_days, voucher_combo
    INTO v_clinic_id, v_validity, v_combo
    FROM public.b2b_partnerships
   WHERE id = v_partnership_id
   LIMIT 1;

  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  -- ── 2. Resolve campos do payload ────────────────────────────────────
  v_combo    := COALESCE(NULLIF(p_payload->>'combo', ''), v_combo, 'voucher_default');
  v_validity := COALESCE(NULLIF(p_payload->>'validity_days', '')::int, v_validity, 30);
  v_theme    := COALESCE(NULLIF(p_payload->>'theme', ''), 'dark');
  IF v_theme NOT IN ('dark', 'light') THEN v_theme := 'dark'; END IF;
  v_is_demo  := COALESCE((p_payload->>'is_demo')::boolean, false);

  v_recipient_name  := NULLIF(p_payload->>'recipient_name', '');
  v_recipient_phone := NULLIF(p_payload->>'recipient_phone', '');
  v_recipient_cpf   := NULLIF(p_payload->>'recipient_cpf', '');
  v_notes           := NULLIF(p_payload->>'notes', '');

  -- ── 3. Resolve phone_variants ───────────────────────────────────────
  -- Caller envia array (gerado via phoneVariants util TS). Fallback: usa
  -- so o recipient_phone se nao mandou variants.
  v_phone_variants_jsonb := p_payload->'phone_variants';
  IF v_phone_variants_jsonb IS NOT NULL
     AND jsonb_typeof(v_phone_variants_jsonb) = 'array'
     AND jsonb_array_length(v_phone_variants_jsonb) > 0
  THEN
    SELECT array_agg(value::text)
      INTO v_phone_variants
      FROM jsonb_array_elements_text(v_phone_variants_jsonb) AS t(value);
  ELSIF v_recipient_phone IS NOT NULL THEN
    v_phone_variants := ARRAY[v_recipient_phone];
  ELSE
    v_phone_variants := ARRAY[]::text[];
  END IF;

  -- Demo voucher pode ser pra propria parceira · skip dedup explicito
  -- (decisao Alden: voucher demo tem propria semantica, nao gera duplicata).
  IF v_is_demo OR array_length(v_phone_variants, 1) IS NULL THEN
    v_skip_dedup := true;
  END IF;

  -- ── 4. Dedup atomic com advisory lock + FOR UPDATE ──────────────────
  -- Hierarquia: patient > lead > voucher_recipient > partner_referral.
  -- Advisory lock keyed em (clinic_id, phone[1]) serializa concorrentes
  -- pra mesmo phone. FOR UPDATE bloqueia rows existentes ate commit.
  -- Combinado: race fica impossivel pra mesma combinacao clinica+phone.
  IF NOT v_skip_dedup THEN
    -- Lock key: namespace 'b2b_v_dedup' + clinic_id + primeira variante
    -- de phone. xact_lock = auto-release no COMMIT/ROLLBACK · cooperativo.
    v_lock_key := 'b2b_v_dedup:' || v_clinic_id::text || ':' || v_phone_variants[1];
    PERFORM pg_advisory_xact_lock(
      hashtext('b2b_voucher_issue_with_dedup')::int,
      hashtext(v_lock_key)::int
    );

    -- 4a. Patient (leads.phase = 'patient' · prioridade maxima)
    SELECT id, name, phone, created_at
      INTO v_lead_row
      FROM public.leads
     WHERE clinic_id = v_clinic_id
       AND phase = 'patient'
       AND phone = ANY(v_phone_variants)
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'dedup_hit', jsonb_build_object(
          'kind',  'patient',
          'id',    v_lead_row.id,
          'name',  v_lead_row.name,
          'phone', v_lead_row.phone,
          'since', v_lead_row.created_at
        )
      );
    END IF;

    -- 4b. Lead (qualquer phase != patient)
    SELECT id, name, phone, created_at
      INTO v_lead_row
      FROM public.leads
     WHERE clinic_id = v_clinic_id
       AND (phase IS NULL OR phase <> 'patient')
       AND phone = ANY(v_phone_variants)
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'dedup_hit', jsonb_build_object(
          'kind',  'lead',
          'id',    v_lead_row.id,
          'name',  v_lead_row.name,
          'phone', v_lead_row.phone,
          'since', v_lead_row.created_at
        )
      );
    END IF;

    -- 4c. voucher_recipient (b2b_vouchers · pega o mais antigo)
    SELECT id, recipient_name, recipient_phone, partnership_id, issued_at
      INTO v_voucher_row
      FROM public.b2b_vouchers
     WHERE clinic_id = v_clinic_id
       AND recipient_phone = ANY(v_phone_variants)
     ORDER BY issued_at ASC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      -- Resolve partnership name best-effort (sem lock)
      SELECT name INTO v_partnership_name
        FROM public.b2b_partnerships
       WHERE id = v_voucher_row.partnership_id
       LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true,
        'dedup_hit', jsonb_build_object(
          'kind',             'voucher_recipient',
          'id',               v_voucher_row.id,
          'name',             v_voucher_row.recipient_name,
          'phone',            v_voucher_row.recipient_phone,
          'since',            v_voucher_row.issued_at,
          'partnership_name', v_partnership_name
        )
      );
    END IF;

    -- 4d. partner_referral (b2b_attributions.lead_phone direto)
    -- Schema clinic-dashboard mig 0360: b2b_attributions tem lead_phone
    -- (nao FK pra leads). Lookup direto por lead_phone variants.
    -- Em pratica este caminho raro · 4a/4b ja teriam pego se houvesse lead.
    SELECT id, partnership_id, lead_phone, lead_name, created_at
      INTO v_attrib_row
      FROM public.b2b_attributions
     WHERE clinic_id = v_clinic_id
       AND lead_phone = ANY(v_phone_variants)
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      SELECT name INTO v_partnership_name
        FROM public.b2b_partnerships
       WHERE id = v_attrib_row.partnership_id
       LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true,
        'dedup_hit', jsonb_build_object(
          'kind',             'partner_referral',
          'id',               v_attrib_row.id,
          'name',             v_attrib_row.lead_name,
          'phone',            COALESCE(v_attrib_row.lead_phone, v_phone_variants[1]),
          'since',            v_attrib_row.created_at,
          'partnership_name', v_partnership_name
        )
      );
    END IF;
  END IF;

  -- ── 5. Sem hit · INSERT voucher (mesma logica do b2b_voucher_issue) ──
  LOOP
    v_token := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    BEGIN
      INSERT INTO public.b2b_vouchers (
        clinic_id, partnership_id, combo,
        recipient_name, recipient_cpf, recipient_phone,
        token, valid_until, theme,
        status, notes, is_demo
      ) VALUES (
        v_clinic_id, v_partnership_id, v_combo,
        v_recipient_name,
        v_recipient_cpf,
        v_recipient_phone,
        v_token,
        now() + (v_validity || ' days')::interval,
        v_theme,
        'issued',
        v_notes,
        v_is_demo
      ) RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_try := v_try + 1;
      IF v_try > 5 THEN RAISE; END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',          true,
    'id',          v_id,
    'token',       v_token,
    'theme',       v_theme,
    'is_demo',     v_is_demo,
    'valid_until', now() + (v_validity || ' days')::interval
  );
END
$function$;

-- ── Permissions ─────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.b2b_voucher_issue_with_dedup(jsonb) TO service_role;

-- ── Sanity check ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn       boolean;
  v_grant    boolean;
  v_legacy   boolean;
  v_src      text;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='b2b_voucher_issue_with_dedup'
       AND pg_get_function_arguments(p.oid) = 'p_payload jsonb'
  ) INTO v_fn;

  -- Garante que b2b_voucher_issue legacy continua intacto
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='b2b_voucher_issue'
       AND pg_get_function_arguments(p.oid) = 'p_payload jsonb'
  ) INTO v_legacy;

  SELECT has_function_privilege(
    'service_role',
    'public.b2b_voucher_issue_with_dedup(jsonb)',
    'EXECUTE'
  ) INTO v_grant;

  -- Confirma que o body tem SET LOCAL transaction_isolation = 'serializable'
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='b2b_voucher_issue_with_dedup';

  IF NOT (v_fn AND v_legacy AND v_grant) THEN
    RAISE EXCEPTION 'Sanity 800-12 FAIL · fn=% legacy=% grant=%',
      v_fn, v_legacy, v_grant;
  END IF;

  IF v_src NOT LIKE '%pg_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'Sanity 800-12 FAIL · funcao sem pg_advisory_xact_lock';
  END IF;

  IF v_src NOT LIKE '%FOR UPDATE%' THEN
    RAISE EXCEPTION 'Sanity 800-12 FAIL · funcao sem FOR UPDATE em dedup';
  END IF;

  RAISE NOTICE 'Migration 800-12 OK · b2b_voucher_issue_with_dedup advisory_xact_lock + FOR UPDATE + 4 niveis dedup';
END $$;

NOTIFY pgrst, 'reload schema';
