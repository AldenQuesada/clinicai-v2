-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-141 · clinicai-v2 · _b2b_invoke_edge Authorization header ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug em produção (2026-05-07 · smoke b2b-comm-dispatch ledger):          ║
-- ║   Trigger _b2b_voucher_dispatch_on_status_change → _b2b_invoke_edge →   ║
-- ║   net.http_post → b2b-comm-dispatch · gateway Supabase rejeitava com    ║
-- ║   401 UNAUTHORIZED_NO_AUTH_HEADER porque a edge herda verify_jwt=true   ║
-- ║   (default · não está em config.toml) e o helper net.http_post só       ║
-- ║   passava 'Content-Type'.                                                ║
-- ║                                                                          ║
-- ║ Fix: _b2b_invoke_edge agora lê                                           ║
-- ║   public.clinic_secrets WHERE key='supabase_service_role_key'           ║
-- ║ e adiciona 'Authorization: Bearer <key>' no header. Mesmo padrão         ║
-- ║ canônico já usado por b2b_voucher_audio_queue_dispatch (mig 131         ║
-- ║ linhas 308-334). Sem secret presente → fallback header mínimo +         ║
-- ║ RAISE WARNING · não derruba a função (compat com edges verify_jwt=false ║
-- ║ tipo b2b-mira-router).                                                   ║
-- ║                                                                          ║
-- ║ NÃO mudou:                                                               ║
-- ║   - assinatura _b2b_invoke_edge(p_path text, p_body jsonb)              ║
-- ║   - guard quiet_hours pra path='b2b-comm-dispatch'                      ║
-- ║   - INSERT em b2b_pending_dispatches quando fora do horário             ║
-- ║   - retorno jsonb (queued OR request_id)                                ║
-- ║   - SECURITY DEFINER + search_path                                       ║
-- ║   - GRANT EXECUTE TO anon, authenticated, service_role                  ║
-- ║                                                                          ║
-- ║ ZERO secret inline neste arquivo · service_role_key fica em             ║
-- ║ clinic_secrets (RLS-protected · service_role only).                     ║
-- ║                                                                          ║
-- ║ Aplicada manualmente em prod 2026-05-07. Validação observada:           ║
-- ║   final_decision = PASS_MIG_141_AUTHORIZATION_HEADER_READY               ║
-- ║   _b2b_invoke_edge contém:                                               ║
-- ║     - Authorization                                                      ║
-- ║     - Bearer                                                             ║
-- ║     - clinic_secrets                                                     ║
-- ║     - supabase_service_role_key                                          ║
-- ║     - net.http_post                                                      ║
-- ║     - quiet_hours preservado                                             ║
-- ║     - b2b_pending_dispatches preservado                                  ║
-- ║   sem JWT inline.                                                        ║
-- ║                                                                          ║
-- ║ Idempotente · CREATE OR REPLACE FUNCTION · roda múltiplas vezes sem    ║
-- ║ efeito colateral · sanity final RAISE WARNING/NOTICE sem exception.    ║
-- ║                                                                          ║
-- ║ ADR-029: SECURITY DEFINER + SET search_path                              ║
-- ║ GOLD-STANDARD: idempotente · sanity check final · pgrst reload          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CREATE OR REPLACE FUNCTION public._b2b_invoke_edge
--    Adiciona Authorization Bearer · preserva todo o resto da mig 88.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._b2b_invoke_edge(
  p_path text,
  p_body jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_url            text;
  v_request_id     bigint;
  v_bypass         boolean;
  v_clinic_id      uuid;
  v_partnership_id uuid;
  v_pending_id     uuid;
  v_scheduled_for  timestamptz;
  v_event_key      text;
  v_service_key    text;
  v_headers        jsonb;
BEGIN
  v_url := 'https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/' || p_path;

  -- ─── Guard de horário · só para path b2b-comm-dispatch ────────────────
  IF p_path = 'b2b-comm-dispatch' THEN
    v_bypass := COALESCE((p_body ->> 'bypass_quiet_hours')::boolean, false);

    IF NOT v_bypass THEN
      -- Resolve clinic_id em ordem de preferência
      v_clinic_id := NULLIF(p_body ->> 'clinic_id', '')::uuid;

      IF v_clinic_id IS NULL THEN
        v_partnership_id := NULLIF(p_body ->> 'partnership_id', '')::uuid;
        IF v_partnership_id IS NOT NULL THEN
          SELECT clinic_id INTO v_clinic_id
            FROM public.b2b_partnerships
           WHERE id = v_partnership_id
           LIMIT 1;
        END IF;
      END IF;

      IF v_clinic_id IS NULL THEN
        v_clinic_id := public.app_clinic_id();
      END IF;

      -- Decisão: dentro/fora do horário comercial
      IF NOT public._b2b_is_within_business_hours(v_clinic_id, now()) THEN
        v_scheduled_for := public._b2b_next_window_start(v_clinic_id, now());
        v_event_key     := NULLIF(p_body ->> 'event_key', '');

        INSERT INTO public.b2b_pending_dispatches (
          clinic_id, edge_path, payload, scheduled_for,
          reason, source_event_key, partnership_id
        ) VALUES (
          v_clinic_id, p_path, p_body, v_scheduled_for,
          'quiet_hours', v_event_key, v_partnership_id
        ) RETURNING id INTO v_pending_id;

        RAISE NOTICE '[_b2b_invoke_edge] queued (quiet_hours) id=% scheduled=% event=%',
          v_pending_id, v_scheduled_for, v_event_key;

        RETURN jsonb_build_object(
          'ok',            true,
          'queued',        true,
          'pending_id',    v_pending_id,
          'scheduled_for', v_scheduled_for,
          'reason',        'quiet_hours'
        );
      END IF;
    END IF;
  END IF;

  -- ─── Headers · Authorization Bearer pra atender verify_jwt=true ──────
  -- Lê service_role_key de clinic_secrets (mesmo padrão da mig 131 ·
  -- b2b_voucher_audio_queue_dispatch). Quando ausente, fallback pra header
  -- mínimo (Content-Type só) · edges com verify_jwt=false (b2b-mira-router
  -- etc) continuam funcionais sem JWT.
  --
  -- ZERO secret inline · valor vem 100% de public.clinic_secrets.
  SELECT value INTO v_service_key
    FROM public.clinic_secrets
   WHERE key = 'supabase_service_role_key'
   LIMIT 1;

  IF v_service_key IS NOT NULL AND v_service_key <> '' THEN
    v_headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    );
  ELSE
    RAISE WARNING '[_b2b_invoke_edge] supabase_service_role_key ausente em clinic_secrets · edges com verify_jwt=true vão falhar (path=%)', p_path;
    v_headers := jsonb_build_object('Content-Type', 'application/json');
  END IF;

  -- ─── Caminho normal · fire-and-forget via pg_net ──────────────────────
  SELECT net.http_post(
    url     := v_url,
    headers := v_headers,
    body    := p_body,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id, 'url', v_url);

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'edge invoke falhou (%): %', p_path, SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- Mantém grants existentes (compat com clinic-dashboard caller anon)
GRANT EXECUTE ON FUNCTION public._b2b_invoke_edge(text, jsonb)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public._b2b_invoke_edge(text, jsonb) IS
'Mig 141 · adiciona Authorization Bearer · service_role_key de clinic_secrets · resolve UNAUTHORIZED_NO_AUTH_HEADER em edges com verify_jwt=true (b2b-comm-dispatch). Quiet_hours + b2b_pending_dispatches preservados.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Sanity check final (regra GOLD #7) · sem exception fatal · sem
--    imprimir o valor do secret. Apenas valida shape da função e presença
--    do secret em clinic_secrets (sem dump).
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_def              text;
  v_secret_present   boolean;
  v_func_exists      int;
BEGIN
  -- 3.1 · função existe
  SELECT count(*) INTO v_func_exists
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = '_b2b_invoke_edge';
  IF v_func_exists < 1 THEN
    RAISE WARNING '[mig 141 sanity] _b2b_invoke_edge ausente';
    RETURN;
  END IF;

  -- 3.2 · definição contém os tokens esperados (sem imprimir o secret)
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = '_b2b_invoke_edge'
   LIMIT 1;

  IF v_def IS NULL OR position('Authorization' IN v_def) = 0 THEN
    RAISE WARNING '[mig 141 sanity] _b2b_invoke_edge NÃO contém Authorization';
  END IF;

  IF v_def IS NULL OR position('clinic_secrets' IN v_def) = 0 THEN
    RAISE WARNING '[mig 141 sanity] _b2b_invoke_edge NÃO referencia clinic_secrets';
  END IF;

  IF v_def IS NULL OR position('supabase_service_role_key' IN v_def) = 0 THEN
    RAISE WARNING '[mig 141 sanity] _b2b_invoke_edge NÃO referencia supabase_service_role_key';
  END IF;

  IF v_def IS NULL OR position('quiet_hours' IN v_def) = 0 THEN
    RAISE WARNING '[mig 141 sanity] _b2b_invoke_edge perdeu lógica de quiet_hours';
  END IF;

  IF v_def IS NULL OR position('b2b_pending_dispatches' IN v_def) = 0 THEN
    RAISE WARNING '[mig 141 sanity] _b2b_invoke_edge perdeu INSERT em b2b_pending_dispatches';
  END IF;

  -- 3.3 · secret presente em clinic_secrets (sem expor valor · só boolean)
  SELECT EXISTS(
    SELECT 1
      FROM public.clinic_secrets
     WHERE key = 'supabase_service_role_key'
       AND value IS NOT NULL
       AND value <> ''
  ) INTO v_secret_present;

  IF NOT v_secret_present THEN
    RAISE WARNING '[mig 141 sanity] supabase_service_role_key ausente/vazio em clinic_secrets · edges com verify_jwt=true vão continuar falhando até secret ser populado';
  END IF;

  RAISE NOTICE '[mig 141] sanity ok · _b2b_invoke_edge agora envia Authorization Bearer';
END
$sanity$;
