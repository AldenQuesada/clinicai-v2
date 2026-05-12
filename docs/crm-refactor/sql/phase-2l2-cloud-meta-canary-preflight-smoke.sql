-- ============================================================================
-- CRM_PHASE_2L.2 · SMOKE TRANSACIONAL · CLOUD META CANARY PREFLIGHT
-- ============================================================================
-- BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. ZERO chamada Meta/Evolution.
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id        uuid := public._default_clinic_id();
  v_actor_uid        uuid;
  v_baseline         jsonb;

  -- Template fixtures
  v_tpl_unknown_id   uuid;
  v_tpl_approved_id  uuid;
  v_tpl_rejected_id  uuid;

  -- Eligibility queries
  v_unknown_candidate boolean;
  v_approved_candidate boolean;
  v_rejected_candidate boolean;
  v_approved_count   int;

  -- Audit log fixtures
  v_log_dry_run_id   uuid;
  v_log_blocked_id   uuid;
  v_log_dry_run_row  record;
  v_log_blocked_row  record;

  -- Invalid attempts
  v_invalid_status_caught text;
  v_invalid_hash_caught   text;
BEGIN
  SELECT id INTO v_actor_uid FROM public.app_users
   WHERE clinic_id = v_clinic_id LIMIT 1;

  SELECT jsonb_build_object(
    'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox),
    'canary_attempts_total', (SELECT count(*) FROM public.wa_cloud_meta_canary_attempts),
    'templates_total', (SELECT count(*) FROM public.wa_message_templates)
  ) INTO v_baseline;

  -- ════════════════════════════════════════════════════════════════════
  -- A · Template com meta_approval_status='unknown' (não elegível canary)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.wa_message_templates (
    clinic_id, type, name, message, active, slug, content,
    meta_approval_status, meta_template_name, meta_language, meta_category
  ) VALUES (
    v_clinic_id, 'utility', 'Smoke 2L2 Unknown', 'corpo unknown',
    true, 'smoke-2l2-unknown', 'corpo unknown',
    'unknown', 'smoke_unknown', 'pt_BR', 'utility'
  ) RETURNING id INTO v_tpl_unknown_id;

  SELECT (active AND meta_approval_status='approved') INTO v_unknown_candidate
  FROM public.wa_message_templates WHERE id = v_tpl_unknown_id;

  -- ════════════════════════════════════════════════════════════════════
  -- B · Template com meta_approval_status='approved' (elegível canary)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.wa_message_templates (
    clinic_id, type, name, message, active, slug, content,
    meta_approval_status, meta_approval_checked_at,
    meta_template_name, meta_language, meta_category
  ) VALUES (
    v_clinic_id, 'utility', 'Smoke 2L2 Approved', 'corpo approved',
    true, 'smoke-2l2-approved', 'corpo approved',
    'approved', now(),
    'smoke_approved', 'pt_BR', 'utility'
  ) RETURNING id INTO v_tpl_approved_id;

  SELECT (active AND meta_approval_status='approved') INTO v_approved_candidate
  FROM public.wa_message_templates WHERE id = v_tpl_approved_id;

  -- ════════════════════════════════════════════════════════════════════
  -- C · Template rejected (não elegível)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.wa_message_templates (
    clinic_id, type, name, message, active, slug, content,
    meta_approval_status, meta_rejection_reason, meta_template_name, meta_language
  ) VALUES (
    v_clinic_id, 'utility', 'Smoke 2L2 Rejected', 'corpo rejected',
    true, 'smoke-2l2-rejected', 'corpo rejected',
    'rejected', 'TAG_CONTENT_MISMATCH', 'smoke_rejected', 'pt_BR'
  ) RETURNING id INTO v_tpl_rejected_id;

  SELECT (active AND meta_approval_status='approved') INTO v_rejected_candidate
  FROM public.wa_message_templates WHERE id = v_tpl_rejected_id;

  -- Total candidates (active + approved) inserted in smoke
  SELECT count(*) INTO v_approved_count
  FROM public.wa_message_templates
  WHERE active = true AND meta_approval_status = 'approved'
    AND name LIKE 'Smoke 2L2%';

  -- ════════════════════════════════════════════════════════════════════
  -- D · Audit log dry_run (recipient masked: sha256 hash + last4)
  -- ════════════════════════════════════════════════════════════════════
  -- Hash sintético (16+ chars · simula sha256 truncado de telefone)
  v_log_dry_run_id := public.wa_cloud_meta_canary_log(
    p_clinic_id              := v_clinic_id,
    p_wa_number_id           := NULL,
    p_template_id            := v_tpl_approved_id,
    p_template_name          := 'smoke_approved',
    p_template_language      := 'pt_BR',
    p_recipient_hash         := encode(digest('5544999999999', 'sha256'), 'hex'),
    p_recipient_last4        := '9999',
    p_dry_run                := true,
    p_status                 := 'dry_run',
    p_block_reason           := NULL,
    p_provider_message_id    := NULL,
    p_request_payload_masked := '{"template":"smoke_approved","recipient":"masked:9999"}'::jsonb,
    p_response_payload_masked:= '{"dry_run":true,"would_send":false}'::jsonb,
    p_error_message          := NULL,
    p_created_by             := v_actor_uid
  );

  SELECT id, status, dry_run, recipient_last4, length(recipient_hash) AS hash_len
    INTO v_log_dry_run_row
  FROM public.wa_cloud_meta_canary_attempts WHERE id = v_log_dry_run_id;

  -- ════════════════════════════════════════════════════════════════════
  -- E · Audit log blocked (template_not_approved)
  -- ════════════════════════════════════════════════════════════════════
  v_log_blocked_id := public.wa_cloud_meta_canary_log(
    p_clinic_id              := v_clinic_id,
    p_wa_number_id           := NULL,
    p_template_id            := v_tpl_unknown_id,
    p_template_name          := 'smoke_unknown',
    p_template_language      := 'pt_BR',
    p_recipient_hash         := encode(digest('5544988888888', 'sha256'), 'hex'),
    p_recipient_last4        := '8888',
    p_dry_run                := false,
    p_status                 := 'blocked',
    p_block_reason           := 'template_not_approved',
    p_provider_message_id    := NULL,
    p_request_payload_masked := '{}'::jsonb,
    p_response_payload_masked:= '{}'::jsonb,
    p_error_message          := NULL,
    p_created_by             := v_actor_uid
  );

  SELECT id, status, block_reason, dry_run
    INTO v_log_blocked_row
  FROM public.wa_cloud_meta_canary_attempts WHERE id = v_log_blocked_id;

  -- ════════════════════════════════════════════════════════════════════
  -- F · Constraint enforcement · status inválido
  -- ════════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.wa_cloud_meta_canary_log(
      v_clinic_id, NULL, v_tpl_approved_id, 'smoke_approved', 'pt_BR',
      encode(digest('test', 'sha256'), 'hex'), '0000',
      true, 'INVALID_STATUS', NULL, NULL,
      '{}'::jsonb, '{}'::jsonb, NULL, v_actor_uid
    );
    v_invalid_status_caught := 'NOT_CAUGHT';
  EXCEPTION WHEN OTHERS THEN
    v_invalid_status_caught := 'CAUGHT_' || SQLERRM;
  END;

  -- G · Constraint enforcement · recipient_hash muito curto
  BEGIN
    PERFORM public.wa_cloud_meta_canary_log(
      v_clinic_id, NULL, v_tpl_approved_id, 'smoke_approved', 'pt_BR',
      'short', '0000',
      true, 'dry_run', NULL, NULL,
      '{}'::jsonb, '{}'::jsonb, NULL, v_actor_uid
    );
    v_invalid_hash_caught := 'NOT_CAUGHT';
  EXCEPTION WHEN OTHERS THEN
    v_invalid_hash_caught := 'CAUGHT_' || SQLERRM;
  END;

  -- ════════════════════════════════════════════════════════════════════
  -- Force ROLLBACK
  -- ════════════════════════════════════════════════════════════════════
  RAISE EXCEPTION 'SMOKE_RESULT_2L2:%', jsonb_build_object(
    'baseline', v_baseline,
    'test_a_unknown_not_candidate', NOT v_unknown_candidate,
    'test_b_approved_is_candidate', v_approved_candidate,
    'test_c_rejected_not_candidate', NOT v_rejected_candidate,
    'approved_smoke_count', v_approved_count,
    'test_d_dry_run_log', jsonb_build_object(
      'status', v_log_dry_run_row.status,
      'dry_run', v_log_dry_run_row.dry_run,
      'last4', v_log_dry_run_row.recipient_last4,
      'hash_len', v_log_dry_run_row.hash_len,
      'masking_ok', (v_log_dry_run_row.hash_len = 64 AND v_log_dry_run_row.recipient_last4 = '9999')
    ),
    'test_e_blocked_log', jsonb_build_object(
      'status', v_log_blocked_row.status,
      'block_reason', v_log_blocked_row.block_reason,
      'dry_run', v_log_blocked_row.dry_run
    ),
    'test_f_invalid_status_caught', v_invalid_status_caught,
    'test_g_invalid_hash_caught', v_invalid_hash_caught,
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_delta', (SELECT count(*) FROM public.wa_outbox) - (v_baseline->>'wa_outbox_total')::int
  )::text;
END
$BLK$;
