-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-132 · clinicai-v2 · b2b_log_outbound_message scope fix    ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug em produção (audit 2026-05-06):                                     ║
-- ║   A função public.b2b_log_outbound_message(p_payload jsonb) lê          ║
-- ║   v_wa_number_id do payload mas faz fallback by-phone-only quando o    ║
-- ║   primeiro SELECT scoped não acha conversa · pega conv de outro canal. ║
-- ║                                                                          ║
-- ║   Caso real: Dani Mendes (5544999658821) tinha conv no canal Mih por   ║
-- ║   voucher emit anterior · partner_confirmation veio via mira-mirian    ║
-- ║   mas RPC pegou conv Mih existente · dispatch_log com sender_instance  ║
-- ║   correto mas wa_messages na conv ERRADA. Quebrou rastreabilidade.     ║
-- ║                                                                          ║
-- ║ Patch CIRÚRGICO (apenas A-G · 100% do source preservado fora dessas):  ║
-- ║   A) Adiciona variável v_inbox_role.                                    ║
-- ║   B) Resolve v_inbox_role de wa_numbers (clinic_id+is_active=true)     ║
-- ║      após resolve v_wa_number_id por sender_instance.                  ║
-- ║   C) Ajusta v_context_type · 'mira_b2b' também quando v_inbox_role='b2b'║
-- ║      (não só por recipient_role).                                       ║
-- ║   D) Resolução de conversa SEM fallback by-phone-only quando            ║
-- ║      v_wa_number_id IS NOT NULL · IF/ELSE estrito.                     ║
-- ║   E) INSERT wa_conversations inclui inbox_role explícito (COALESCE     ║
-- ║      com derivação por context_type).                                   ║
-- ║   F) UPDATE wa_conversations atualiza inbox_role não destrutivo         ║
-- ║      (COALESCE(v_inbox_role, inbox_role)).                             ║
-- ║   G) Buscas de wa_conversations filtram deleted_at IS NULL.            ║
-- ║                                                                          ║
-- ║ Preservado 20/20 do source atual:                                       ║
-- ║   1.  Validação payload object (jsonb_typeof)                           ║
-- ║   2.  Fallback _default_clinic_id()                                     ║
-- ║   3.  Extração recipient_phone/phone (alias)                            ║
-- ║   4.  Validação length(v_phone_digits) >= 8                             ║
-- ║   5.  Parse seguro UUIDs (regex match antes de cast)                    ║
-- ║   6.  Resolve wa_number_id por sender_instance                          ║
-- ║   7.  v_meta completo (source/voucher_id/partnership_id/recipient_role/ ║
-- ║       sender_instance/wa_number_id)                                     ║
-- ║   8.  pg_advisory_xact_lock por (clinic+wa_number_id+last8)            ║
-- ║   9.  Resolve lead por metadata->>'b2b_voucher_id' primeiro             ║
-- ║   10. Fallback lead por telefone (com source ordering)                  ║
-- ║   11. Cria lead mínimo com source/source_type derivados de role         ║
-- ║   12. Update metadata do lead existente (anexa b2b_voucher_id)         ║
-- ║   13. Content fallback per content_type (audio/image/document/text)    ║
-- ║   14. Status whitelist (pending/sent/delivered/read/failed/received/    ║
-- ║       deleted)                                                          ║
-- ║   15. sent_at override do payload (COALESCE com now())                 ║
-- ║   16. INSERT wa_messages com TODOS os campos atuais                     ║
-- ║   17. Idempotência por provider_msg_id (lookup-first)                   ║
-- ║   18. Dispatch_log sem duplicar (lookup por wa_message_id+event_key)    ║
-- ║   19. Retorno JSON (ok/lead_id/conversation_id/message_id/dispatch_id/ ║
-- ║       provider_msg_id/idempotent_message)                               ║
-- ║   20. REVOKE/GRANT + NOTIFY pgrst                                       ║
-- ║                                                                          ║
-- ║ Idempotente · CREATE OR REPLACE FUNCTION · roda multiplas vezes sem    ║
-- ║ efeito colateral.                                                        ║
-- ║                                                                          ║
-- ║ ADR-029: SECURITY DEFINER + SET search_path · GRANT explicito          ║
-- ║ GOLD-STANDARD: idempotente · sanity check final · pgrst reload          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CREATE OR REPLACE FUNCTION public.b2b_log_outbound_message(jsonb)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.b2b_log_outbound_message(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_clinic_id uuid;
  v_voucher_id uuid;
  v_partnership_id uuid;
  v_template_id uuid;
  v_wa_number_id uuid;

  v_phone_raw text;
  v_phone_digits text;
  v_phone_last8 text;
  v_recipient_name text;
  v_recipient_role text;
  v_context_type text;
  v_inbox_role text;  -- patch 132 · A: inbox_role derivado de wa_numbers

  v_event_key text;
  v_sender_instance text;
  v_channel text;
  v_content text;
  v_content_type text;
  v_media_url text;
  v_audio_url text;
  v_provider_msg_id text;
  v_status text;
  v_sent_at timestamptz;

  v_lead_id uuid;
  v_conversation_id uuid;
  v_message_id uuid;
  v_dispatch_id uuid;

  v_lead_source text;
  v_lead_source_type text;
  v_meta jsonb;
  v_conversation_meta jsonb;
  v_dispatch_meta jsonb;
BEGIN
  /*
    b2b_log_outbound_message(p_payload)

    Objetivo:
    Registrar no fluxo canônico do dash novo uma mensagem B2B/voucher
    que já foi enviada pelo WhatsApp/Evolution.

    Faz:
    1. resolve/cria lead;
    2. resolve/cria wa_conversations;
    3. insere wa_messages com provider_msg_id;
    4. insere b2b_comm_dispatch_log;
    5. deixa o trigger trg_sync_wa_conversation_preview_v2 atualizar o preview.

    Não envia WhatsApp.
    Não chama Evolution.

    Patch 132 (audit 2026-05-06):
    · Resolução de conversa scoped por wa_number_id quando fornecido
      (sem fallback by-phone-only que misturava canais).
    · inbox_role/context_type explícitos · alinhados com wa_numbers.
    · deleted_at IS NULL nas buscas de conv.
  */

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payload_object_required');
  END IF;

  v_clinic_id := COALESCE(
    NULLIF(p_payload->>'clinic_id', '')::uuid,
    public._default_clinic_id()
  );

  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_id_required');
  END IF;

  v_phone_raw := COALESCE(
    NULLIF(p_payload->>'recipient_phone', ''),
    NULLIF(p_payload->>'phone', '')
  );

  v_phone_digits := regexp_replace(COALESCE(v_phone_raw, ''), '\D', '', 'g');

  IF length(v_phone_digits) < 8 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_recipient_phone',
      'recipient_phone', v_phone_raw
    );
  END IF;

  v_phone_last8 := right(v_phone_digits, 8);

  v_voucher_id := CASE
    WHEN COALESCE(p_payload->>'voucher_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (p_payload->>'voucher_id')::uuid
    ELSE NULL
  END;

  v_partnership_id := CASE
    WHEN COALESCE(p_payload->>'partnership_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (p_payload->>'partnership_id')::uuid
    ELSE NULL
  END;

  v_template_id := CASE
    WHEN COALESCE(p_payload->>'template_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (p_payload->>'template_id')::uuid
    ELSE NULL
  END;

  v_wa_number_id := CASE
    WHEN COALESCE(p_payload->>'wa_number_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN (p_payload->>'wa_number_id')::uuid
    ELSE NULL
  END;

  v_recipient_name := COALESCE(
    NULLIF(trim(p_payload->>'recipient_name'), ''),
    NULLIF(trim(p_payload->>'display_name'), ''),
    v_phone_digits
  );

  v_recipient_role := COALESCE(NULLIF(p_payload->>'recipient_role', ''), 'beneficiary');

  v_event_key := COALESCE(NULLIF(p_payload->>'event_key', ''), 'voucher_issued_beneficiary');
  v_sender_instance := NULLIF(p_payload->>'sender_instance', '');
  v_channel := COALESCE(NULLIF(p_payload->>'channel', ''), 'evolution');

  IF v_channel NOT IN ('cloud', 'evolution') THEN
    v_channel := 'evolution';
  END IF;

  v_content := NULLIF(p_payload->>'content', '');
  v_content_type := COALESCE(NULLIF(p_payload->>'content_type', ''), 'text');

  IF v_content IS NULL THEN
    v_content := CASE
      WHEN v_content_type = 'audio' THEN '[áudio enviado]'
      WHEN v_content_type = 'image' THEN '[imagem enviada]'
      WHEN v_content_type = 'document' THEN '[documento enviado]'
      ELSE '[mensagem enviada]'
    END;
  END IF;

  v_media_url := NULLIF(p_payload->>'media_url', '');
  v_audio_url := COALESCE(NULLIF(p_payload->>'audio_url', ''), v_media_url);

  v_provider_msg_id := COALESCE(
    NULLIF(p_payload->>'provider_msg_id', ''),
    NULLIF(p_payload->>'wa_message_id', '')
  );

  v_status := COALESCE(NULLIF(p_payload->>'status', ''), 'sent');

  IF v_status NOT IN ('pending', 'sent', 'delivered', 'read', 'failed', 'received', 'deleted') THEN
    v_status := 'sent';
  END IF;

  v_sent_at := COALESCE(NULLIF(p_payload->>'sent_at', '')::timestamptz, now());

  IF v_wa_number_id IS NULL AND v_sender_instance IS NOT NULL THEN
    SELECT id
      INTO v_wa_number_id
      FROM public.wa_numbers
     WHERE clinic_id = v_clinic_id
       AND is_active = true
       AND instance_id = v_sender_instance
     ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
     LIMIT 1;
  END IF;

  -- patch 132 · B: resolve v_inbox_role de wa_numbers (clinic_id+is_active)
  -- · usado em C/E/F pra setar inbox_role explícito em wa_conversations.
  IF v_wa_number_id IS NOT NULL THEN
    SELECT inbox_role
      INTO v_inbox_role
      FROM public.wa_numbers
     WHERE id = v_wa_number_id
       AND clinic_id = v_clinic_id
       AND is_active = true
     LIMIT 1;
  END IF;

  -- patch 132 · C: context_type também respeita inbox_role='b2b' (não só
  -- recipient_role) · canais b2b sempre criam conv como mira_b2b.
  v_context_type := CASE
    WHEN v_inbox_role = 'b2b'
      OR v_recipient_role IN ('partner', 'partnership', 'sender', 'admin') THEN 'mira_b2b'
    ELSE 'lara_beneficiary'
  END;

  v_meta := COALESCE(p_payload->'meta', '{}'::jsonb)
    || jsonb_build_object(
      'source', 'b2b_log_outbound_message',
      'voucher_id', CASE WHEN v_voucher_id IS NULL THEN NULL ELSE v_voucher_id::text END,
      'partnership_id', CASE WHEN v_partnership_id IS NULL THEN NULL ELSE v_partnership_id::text END,
      'recipient_role', v_recipient_role,
      'sender_instance', v_sender_instance,
      'wa_number_id', CASE WHEN v_wa_number_id IS NULL THEN NULL ELSE v_wa_number_id::text END
    );

  /*
    Serializa por clínica + canal + telefone.
    Evita race entre dois envios quase simultâneos para a mesma pessoa.
  */
  PERFORM pg_advisory_xact_lock(
    hashtext('b2b_log_outbound_message')::int,
    hashtext(v_clinic_id::text || ':' || COALESCE(v_wa_number_id::text, 'no_wa_number') || ':' || v_phone_last8)::int
  );

  /*
    1) Resolve lead.
    Primeiro tenta pelo metadata do voucher criado pelo bridge.
  */
  IF v_voucher_id IS NOT NULL THEN
    SELECT id
      INTO v_lead_id
      FROM public.leads
     WHERE clinic_id = v_clinic_id
       AND deleted_at IS NULL
       AND metadata->>'b2b_voucher_id' = v_voucher_id::text
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  /*
    2) Fallback por telefone.
  */
  IF v_lead_id IS NULL THEN
    SELECT id
      INTO v_lead_id
      FROM public.leads
     WHERE clinic_id = v_clinic_id
       AND deleted_at IS NULL
       AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 8) = v_phone_last8
     ORDER BY
       CASE WHEN source = 'b2b_partnership_referral' THEN 0 ELSE 1 END,
       created_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  /*
    3) Fallback final: cria lead mínimo.
    Beneficiária vira b2b_partnership_referral.
    Parceiro/admin vira manual + source_type b2b_partner_contact.
  */
  IF v_lead_id IS NULL THEN
    v_lead_source := CASE
      WHEN v_recipient_role IN ('partner', 'partnership', 'sender', 'admin') THEN 'manual'
      ELSE 'b2b_partnership_referral'
    END;

    v_lead_source_type := CASE
      WHEN v_recipient_role IN ('partner', 'partnership', 'sender', 'admin') THEN 'b2b_partner_contact'
      ELSE 'referral'
    END;

    BEGIN
      INSERT INTO public.leads (
        clinic_id,
        name,
        phone,
        phase,
        temperature,
        priority,
        channel_mode,
        ai_persona,
        funnel,
        source,
        source_type,
        metadata,
        wa_opt_in,
        phase_origin,
        phase_updated_at,
        phase_updated_by
      )
      VALUES (
        v_clinic_id,
        v_recipient_name,
        v_phone_digits,
        'lead',
        CASE
          WHEN v_recipient_role IN ('partner', 'partnership', 'sender', 'admin') THEN 'warm'
          ELSE 'hot'
        END,
        'normal',
        'whatsapp',
        'onboarder',
        'procedimentos',
        v_lead_source,
        v_lead_source_type,
        v_meta,
        true,
        'rpc:b2b_log_outbound_message',
        now(),
        auth.uid()
      )
      RETURNING id INTO v_lead_id;

    EXCEPTION WHEN unique_violation THEN
      SELECT id
        INTO v_lead_id
        FROM public.leads
       WHERE clinic_id = v_clinic_id
         AND deleted_at IS NULL
         AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 8) = v_phone_last8
       ORDER BY created_at DESC
       LIMIT 1;
    END;
  ELSE
    UPDATE public.leads
       SET metadata = COALESCE(metadata, '{}'::jsonb) || v_meta,
           updated_at = now()
     WHERE id = v_lead_id
       AND clinic_id = v_clinic_id;
  END IF;

  IF v_lead_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'lead_resolve_failed',
      'recipient_phone', v_phone_digits
    );
  END IF;

  /*
    4) Resolve/cria conversa.
    A unique real usa clinic_id + wa_number_id + last8.

    Patch 132 · D: scoped strict quando v_wa_number_id IS NOT NULL ·
    sem fallback by-phone-only que misturava canais. Compat retroativa
    mantida pra payloads sem wa_number_id (busca legacy by-phone).
    Patch 132 · G: deleted_at IS NULL em ambas as buscas.
  */
  IF v_wa_number_id IS NOT NULL THEN
    SELECT id
      INTO v_conversation_id
      FROM public.wa_conversations
     WHERE clinic_id = v_clinic_id
       AND wa_number_id = v_wa_number_id
       AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 8) = v_phone_last8
       AND deleted_at IS NULL
     ORDER BY created_at DESC NULLS LAST
     LIMIT 1
     FOR UPDATE;
  ELSE
    SELECT id
      INTO v_conversation_id
      FROM public.wa_conversations
     WHERE clinic_id = v_clinic_id
       AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 8) = v_phone_last8
       AND deleted_at IS NULL
     ORDER BY created_at DESC NULLS LAST
     LIMIT 1
     FOR UPDATE;
  END IF;

  v_conversation_meta := jsonb_build_object(
    'source', 'b2b_log_outbound_message',
    'voucher_id', CASE WHEN v_voucher_id IS NULL THEN NULL ELSE v_voucher_id::text END,
    'partnership_id', CASE WHEN v_partnership_id IS NULL THEN NULL ELSE v_partnership_id::text END,
    'recipient_role', v_recipient_role,
    'sender_instance', v_sender_instance
  );

  IF v_conversation_id IS NULL THEN
    BEGIN
      -- patch 132 · E: inbox_role explícito · COALESCE com derivação por context_type.
      INSERT INTO public.wa_conversations (
        clinic_id,
        lead_id,
        wa_number_id,
        phone,
        status,
        ai_persona,
        ai_enabled,
        display_name,
        funnel,
        metadata,
        context_type,
        inbox_role
      )
      VALUES (
        v_clinic_id,
        v_lead_id,
        v_wa_number_id,
        v_phone_digits,
        'active',
        'onboarder',
        false,
        v_recipient_name,
        'procedimentos',
        v_conversation_meta,
        v_context_type,
        COALESCE(v_inbox_role, CASE WHEN v_context_type = 'mira_b2b' THEN 'b2b' ELSE 'sdr' END)
      )
      RETURNING id INTO v_conversation_id;

    EXCEPTION WHEN unique_violation THEN
      -- patch 132 · G: deleted_at IS NULL na busca de fallback do unique violation.
      SELECT id
        INTO v_conversation_id
        FROM public.wa_conversations
       WHERE clinic_id = v_clinic_id
         AND (
           (v_wa_number_id IS NOT NULL AND wa_number_id = v_wa_number_id)
           OR v_wa_number_id IS NULL
         )
         AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 8) = v_phone_last8
         AND deleted_at IS NULL
       ORDER BY created_at DESC NULLS LAST
       LIMIT 1;
    END;
  END IF;

  IF v_conversation_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'conversation_resolve_failed',
      'lead_id', v_lead_id,
      'recipient_phone', v_phone_digits
    );
  END IF;

  -- patch 132 · F: inbox_role atualizado de forma não destrutiva.
  UPDATE public.wa_conversations
     SET lead_id = COALESCE(lead_id, v_lead_id),
         wa_number_id = COALESCE(wa_number_id, v_wa_number_id),
         phone = COALESCE(NULLIF(phone, ''), v_phone_digits),
         display_name = COALESCE(NULLIF(display_name, ''), v_recipient_name),
         status = CASE
           WHEN status IN ('archived', 'closed', 'blocked') THEN 'active'
           ELSE COALESCE(status, 'active')
         END,
         context_type = COALESCE(context_type, v_context_type),
         inbox_role = COALESCE(v_inbox_role, inbox_role),
         metadata = COALESCE(metadata, '{}'::jsonb) || v_conversation_meta,
         deleted_at = NULL,
         updated_at = now()
   WHERE id = v_conversation_id
     AND clinic_id = v_clinic_id;

  /*
    5) Insere wa_messages com idempotência por provider_msg_id.
  */
  IF v_provider_msg_id IS NOT NULL THEN
    SELECT id
      INTO v_message_id
      FROM public.wa_messages
     WHERE clinic_id = v_clinic_id
       AND provider_msg_id = v_provider_msg_id
     LIMIT 1;
  END IF;

  IF v_message_id IS NULL THEN
    INSERT INTO public.wa_messages (
      conversation_id,
      clinic_id,
      direction,
      sender,
      content,
      content_type,
      media_url,
      template_id,
      status,
      ai_generated,
      wa_message_id,
      provider_msg_id,
      sent_at,
      phone,
      channel
    )
    VALUES (
      v_conversation_id,
      v_clinic_id,
      'outbound',
      COALESCE(NULLIF(p_payload->>'sender', ''), 'sistema'),
      v_content,
      v_content_type,
      v_media_url,
      v_template_id,
      v_status,
      COALESCE((p_payload->>'ai_generated')::boolean, true),
      v_provider_msg_id,
      v_provider_msg_id,
      v_sent_at,
      v_phone_digits,
      v_channel
    )
    RETURNING id INTO v_message_id;
  END IF;

  /*
    6) Insere dispatch log sem duplicar quando provider_msg_id já existe.
  */
  IF v_provider_msg_id IS NOT NULL THEN
    SELECT id
      INTO v_dispatch_id
      FROM public.b2b_comm_dispatch_log
     WHERE clinic_id = v_clinic_id
       AND wa_message_id = v_provider_msg_id
       AND event_key = v_event_key
       AND COALESCE(recipient_role, '') = COALESCE(v_recipient_role, '')
       AND right(regexp_replace(COALESCE(recipient_phone, ''), '\D', '', 'g'), 8) = v_phone_last8
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  v_dispatch_meta := COALESCE(p_payload->'dispatch_meta', '{}'::jsonb)
    || jsonb_build_object(
      'source', 'b2b_log_outbound_message',
      'lead_id', v_lead_id::text,
      'conversation_id', v_conversation_id::text,
      'message_id', v_message_id::text,
      'provider_msg_id', v_provider_msg_id,
      'content_type', v_content_type
    );

  IF v_dispatch_id IS NULL THEN
    INSERT INTO public.b2b_comm_dispatch_log (
      clinic_id,
      partnership_id,
      template_id,
      event_key,
      channel,
      recipient_role,
      recipient_phone,
      sender_instance,
      text_content,
      audio_url,
      wa_message_id,
      status,
      error_message,
      meta
    )
    VALUES (
      v_clinic_id,
      v_partnership_id,
      v_template_id,
      v_event_key,
      v_channel,
      v_recipient_role,
      v_phone_digits,
      v_sender_instance,
      CASE WHEN v_content_type = 'audio' THEN NULL ELSE v_content END,
      CASE WHEN v_content_type = 'audio' THEN v_audio_url ELSE NULL END,
      v_provider_msg_id,
      CASE WHEN v_status = 'failed' THEN 'failed' ELSE 'sent' END,
      NULLIF(p_payload->>'error_message', ''),
      v_dispatch_meta
    )
    RETURNING id INTO v_dispatch_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', v_lead_id,
    'conversation_id', v_conversation_id,
    'message_id', v_message_id,
    'dispatch_id', v_dispatch_id,
    'provider_msg_id', v_provider_msg_id,
    'idempotent_message', v_provider_msg_id IS NOT NULL AND EXISTS (
      SELECT 1
        FROM public.wa_messages
       WHERE id = v_message_id
         AND created_at < now() - interval '1 millisecond'
    )
  );
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. GRANT · função só chamável por service_role
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.b2b_log_outbound_message(jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.b2b_log_outbound_message(jsonb) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Sanity check final (regra GOLD #7)
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_check int;
BEGIN
  -- Função existe + signature correta
  SELECT COUNT(*) INTO v_check
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'b2b_log_outbound_message';
  IF v_check < 1 THEN
    RAISE EXCEPTION '[mig 132 sanity] b2b_log_outbound_message NAO criada';
  END IF;

  -- GRANT correto pro service_role
  SELECT COUNT(*) INTO v_check
    FROM information_schema.role_routine_grants
   WHERE specific_schema = 'public'
     AND routine_name    = 'b2b_log_outbound_message'
     AND grantee         = 'service_role'
     AND privilege_type  = 'EXECUTE';
  IF v_check < 1 THEN
    RAISE WARNING '[mig 132 sanity] GRANT EXECUTE service_role nao registrado';
  END IF;

  RAISE NOTICE '[mig 132] sanity ok · b2b_log_outbound_message scope-aware aplicada';
END
$sanity$;

COMMIT;
