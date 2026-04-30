-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-88 · clinicai-v2 · guard de horario comercial em B2B       ║
-- ║   dispatch (Mira parou de mandar mensagens fora do horario combinado)    ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug em prod: triggers em b2b_vouchers chamavam _b2b_invoke_edge          ║
-- ║   sincronicamente, ignorando clinics.operating_hours · resultado:        ║
-- ║   parceiras recebiam WhatsApp as 02h (cron expired-sweep), 14h           ║
-- ║   (post-purchase-upsell) etc · sem regra de janela.                      ║
-- ║                                                                          ║
-- ║ Fix: 4 pecas                                                             ║
-- ║   1. _b2b_is_within_business_hours(clinic, ts)  · checa operating_hours ║
-- ║   2. _b2b_next_window_start(clinic, after)      · proxima abertura      ║
-- ║   3. tabela b2b_pending_dispatches              · fila de adiados       ║
-- ║   4. _b2b_invoke_edge atualizada                · enfileira se fora     ║
-- ║   5. b2b_pending_dispatches_drain(limit)        · worker drena          ║
-- ║                                                                          ║
-- ║ Cron worker: apps/mira/src/app/api/cron/b2b-pending-dispatches-worker   ║
-- ║   · a cada minuto · drena ate 50 itens elegiveis (scheduled_for<=now()  ║
-- ║   E dentro do horario comercial). Worker chama net.http_post direto     ║
-- ║   pra evitar loop atraves de _b2b_invoke_edge.                          ║
-- ║                                                                          ║
-- ║ Default safe (operating_hours NULL/empty): seg-sex 8h-21h SP,           ║
-- ║   sab 8h-18h, dom fechado. Conservador pra nao mandar de madrugada.     ║
-- ║                                                                          ║
-- ║ Bypass: chamadores podem passar `bypass_quiet_hours: true` no payload   ║
-- ║   pra forcar dispatch imediato (ex: admin commands urgentes).           ║
-- ║                                                                          ║
-- ║ Escopo: SO intercepta path='b2b-comm-dispatch'. Outras edges            ║
-- ║   (b2b-mira-router, b2b-insights-generator etc) passam direto.          ║
-- ║                                                                          ║
-- ║ GOLD #3 (search_path), #5 (.down), #7 (sanity), #10 (NOTIFY pgrst).     ║
-- ║ Multi-tenant: clinic_id resolvido via payload OR partnership_id JOIN    ║
-- ║   OR app_clinic_id() fallback. Default safe.                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. _b2b_is_within_business_hours(p_clinic_id, p_ts)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le clinics.operating_hours (JSONB com schema { seg: {aberto, manha:{ativo,
-- inicio, fim}, tarde:{...}}, ter:..., ..., dom:... }) e responde se p_ts
-- (default now()) cai dentro de uma janela aberta. Sempre converte pra TZ
-- America/Sao_Paulo antes de comparar dia/hora (clinica e brasileira).
--
-- Default: se operating_hours nao setado, assume seg-sex 8h-21h, sab 8h-18h,
-- dom fechado. Conservador pra evitar disparo silencioso fora de horario
-- quando clinica nao configurou.

CREATE OR REPLACE FUNCTION public._b2b_is_within_business_hours(
  p_clinic_id uuid,
  p_ts        timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_oh         jsonb;
  v_local_ts   timestamp;  -- timestamp WITHOUT tz, ja em SP
  v_dow        int;        -- ISO: 1=seg, 7=dom
  v_dia_key    text;
  v_dia        jsonb;
  v_hhmm       text;       -- 'HH24:MI'
  v_manha      jsonb;
  v_tarde      jsonb;
BEGIN
  -- Le operating_hours se clinic existe; senao usa default
  SELECT operating_hours INTO v_oh
    FROM public.clinics
   WHERE id = p_clinic_id
   LIMIT 1;

  v_local_ts := (p_ts AT TIME ZONE 'America/Sao_Paulo')::timestamp;
  v_dow      := EXTRACT(ISODOW FROM v_local_ts)::int;
  v_dia_key  := CASE v_dow
                  WHEN 1 THEN 'seg' WHEN 2 THEN 'ter' WHEN 3 THEN 'qua'
                  WHEN 4 THEN 'qui' WHEN 5 THEN 'sex' WHEN 6 THEN 'sab'
                  WHEN 7 THEN 'dom' END;
  v_hhmm     := to_char(v_local_ts, 'HH24:MI');

  -- Default conservador se operating_hours vazio/null
  IF v_oh IS NULL OR v_oh = '{}'::jsonb OR (v_oh -> v_dia_key) IS NULL THEN
    -- seg-sex 8-21, sab 8-18, dom fechado
    IF v_dow = 7 THEN RETURN false; END IF;
    IF v_dow = 6 THEN
      RETURN v_hhmm >= '08:00' AND v_hhmm <= '18:00';
    END IF;
    RETURN v_hhmm >= '08:00' AND v_hhmm <= '21:00';
  END IF;

  v_dia := v_oh -> v_dia_key;

  -- Se dia explicitamente fechado
  IF COALESCE((v_dia ->> 'aberto')::boolean, true) = false THEN
    RETURN false;
  END IF;

  v_manha := v_dia -> 'manha';
  v_tarde := v_dia -> 'tarde';

  -- Manha
  IF v_manha IS NOT NULL
     AND COALESCE((v_manha ->> 'ativo')::boolean, true) = true
     AND v_hhmm >= COALESCE(v_manha ->> 'inicio', '08:30')
     AND v_hhmm <= COALESCE(v_manha ->> 'fim',    '12:00') THEN
    RETURN true;
  END IF;

  -- Tarde
  IF v_tarde IS NOT NULL
     AND COALESCE((v_tarde ->> 'ativo')::boolean, true) = true
     AND v_hhmm >= COALESCE(v_tarde ->> 'inicio', '13:30')
     AND v_hhmm <= COALESCE(v_tarde ->> 'fim',    '18:00') THEN
    RETURN true;
  END IF;

  RETURN false;
EXCEPTION WHEN OTHERS THEN
  -- Fail-safe: em caso de erro inesperado, assume FORA do horario
  -- (mensagem fica enfileirada · admin pode liberar manualmente). Eh melhor
  -- adiar do que mandar erradamente.
  RAISE WARNING '[_b2b_is_within_business_hours] fail-safe block: %', SQLERRM;
  RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION public._b2b_is_within_business_hours(uuid, timestamptz)
  TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. _b2b_next_window_start(p_clinic_id, p_after)
-- ═══════════════════════════════════════════════════════════════════════════
-- Retorna o proximo timestamptz em que o relogio entrara dentro do horario
-- comercial DA CLINICA, depois de p_after. Itera ate 8 dias pra frente
-- (cobre semana cheia + 1) e retorna o primeiro inicio de janela aberta.
-- Se nao achar nada (clinica zerada), retorna p_after + 12h como fallback.

CREATE OR REPLACE FUNCTION public._b2b_next_window_start(
  p_clinic_id uuid,
  p_after     timestamptz DEFAULT now()
) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_oh        jsonb;
  v_cursor    timestamptz;
  v_local     timestamp;
  v_dow       int;
  v_dia_key   text;
  v_dia       jsonb;
  v_manha     jsonb;
  v_tarde     jsonb;
  v_today     date;
  v_candidate timestamptz;
  i           int;

  -- Helper: builda timestamptz para hh:mm em SP no dia "v_today"
  v_hh        int;
  v_mm        int;
BEGIN
  SELECT operating_hours INTO v_oh
    FROM public.clinics
   WHERE id = p_clinic_id
   LIMIT 1;

  v_cursor := p_after;

  FOR i IN 0..8 LOOP
    v_local   := (v_cursor AT TIME ZONE 'America/Sao_Paulo')::timestamp;
    v_today   := v_local::date;
    v_dow     := EXTRACT(ISODOW FROM v_local)::int;
    v_dia_key := CASE v_dow
                   WHEN 1 THEN 'seg' WHEN 2 THEN 'ter' WHEN 3 THEN 'qua'
                   WHEN 4 THEN 'qui' WHEN 5 THEN 'sex' WHEN 6 THEN 'sab'
                   WHEN 7 THEN 'dom' END;

    -- Resolve dia (default conservador se NULL)
    IF v_oh IS NULL OR v_oh = '{}'::jsonb OR (v_oh -> v_dia_key) IS NULL THEN
      v_dia := jsonb_build_object(
        'aberto', v_dow != 7,  -- domingo fechado por default
        'manha',  jsonb_build_object('ativo', true, 'inicio', '08:00',
                                     'fim',   CASE WHEN v_dow = 6 THEN '12:00' ELSE '12:00' END),
        'tarde',  jsonb_build_object('ativo', v_dow != 6,  -- sab so manha 8-18 (consolida)
                                     'inicio', '13:30',
                                     'fim',    CASE WHEN v_dow = 6 THEN '18:00' ELSE '21:00' END)
      );
      -- Para sabado, simplifica: 1 janela so · 8-18
      IF v_dow = 6 THEN
        v_dia := jsonb_build_object(
          'aberto', true,
          'manha',  jsonb_build_object('ativo', true, 'inicio', '08:00', 'fim', '18:00'),
          'tarde',  jsonb_build_object('ativo', false, 'inicio', '13:30', 'fim', '18:00')
        );
      END IF;
    ELSE
      v_dia := v_oh -> v_dia_key;
    END IF;

    -- Se dia fechado, pula pra meia-noite do proximo dia (em SP)
    IF COALESCE((v_dia ->> 'aberto')::boolean, true) = false THEN
      v_cursor := ((v_today + interval '1 day') || ' 00:00:00')::timestamp
                    AT TIME ZONE 'America/Sao_Paulo';
      CONTINUE;
    END IF;

    v_manha := v_dia -> 'manha';
    v_tarde := v_dia -> 'tarde';

    -- Tenta manha
    IF v_manha IS NOT NULL
       AND COALESCE((v_manha ->> 'ativo')::boolean, true) = true THEN
      v_hh := split_part(COALESCE(v_manha ->> 'inicio', '08:00'), ':', 1)::int;
      v_mm := split_part(COALESCE(v_manha ->> 'inicio', '08:00'), ':', 2)::int;
      v_candidate := (v_today + make_time(v_hh, v_mm, 0))::timestamp
                       AT TIME ZONE 'America/Sao_Paulo';
      IF v_candidate > p_after THEN
        RETURN v_candidate;
      END IF;
      -- Se ja passou da manha hoje, ainda pode pegar tarde
    END IF;

    -- Tenta tarde
    IF v_tarde IS NOT NULL
       AND COALESCE((v_tarde ->> 'ativo')::boolean, true) = true THEN
      v_hh := split_part(COALESCE(v_tarde ->> 'inicio', '13:30'), ':', 1)::int;
      v_mm := split_part(COALESCE(v_tarde ->> 'inicio', '13:30'), ':', 2)::int;
      v_candidate := (v_today + make_time(v_hh, v_mm, 0))::timestamp
                       AT TIME ZONE 'America/Sao_Paulo';
      IF v_candidate > p_after THEN
        RETURN v_candidate;
      END IF;
    END IF;

    -- Nada hoje · pula pra meia-noite do proximo
    v_cursor := ((v_today + interval '1 day') || ' 00:00:00')::timestamp
                  AT TIME ZONE 'America/Sao_Paulo';
  END LOOP;

  -- Fallback: 12h depois (nao deveria chegar aqui)
  RAISE WARNING '[_b2b_next_window_start] no window found em 8 dias para clinic=%', p_clinic_id;
  RETURN p_after + interval '12 hours';
END $$;

GRANT EXECUTE ON FUNCTION public._b2b_next_window_start(uuid, timestamptz)
  TO authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Tabela b2b_pending_dispatches
-- ═══════════════════════════════════════════════════════════════════════════
-- Fila de mensagens adiadas pelo guard de horario. Worker drena via
-- b2b_pending_dispatches_drain a cada minuto.
--
-- Status:
--   pending     · aguardando · scheduled_for + horario comercial
--   processing  · worker pegou, esta dispatching
--   done        · enviado · request_id do net.http_post salvo
--   failed      · 3 attempts falharam · admin investiga
--   cancelled   · admin cancelou manualmente
--
-- Idempotencia: dedup_key opcional · permite trigger nao duplicar quando
-- mesmo evento dispara 2x rapidamente (ex: status update repetido).

CREATE TABLE IF NOT EXISTS public.b2b_pending_dispatches (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL DEFAULT public.app_clinic_id(),
  edge_path       text        NOT NULL,
  payload         jsonb       NOT NULL,
  scheduled_for   timestamptz NOT NULL DEFAULT now(),
  status          text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','processing','done','failed','cancelled')),
  reason          text        NULL,        -- 'quiet_hours' | 'manual_schedule' | 'retry'
  source_event_key text       NULL,        -- pra debugging (ex: 'voucher_purchased')
  partnership_id  uuid        NULL,        -- nullable · admin-only events nao tem
  attempts        int         NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NULL,
  last_error      text        NULL,
  request_id      bigint      NULL,        -- net.http_post id quando done
  dedup_key       text        NULL,        -- opcional, evita duplicar
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.b2b_pending_dispatches IS
  'Fila de B2B dispatches adiados pelo guard de horario comercial (mig 800-88). '
  'Worker /api/cron/b2b-pending-dispatches-worker drena a cada minuto.';

CREATE INDEX IF NOT EXISTS idx_b2b_pending_dispatches_pick
  ON public.b2b_pending_dispatches (status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_b2b_pending_dispatches_clinic_status
  ON public.b2b_pending_dispatches (clinic_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_b2b_pending_dispatches_dedup
  ON public.b2b_pending_dispatches (dedup_key)
  WHERE dedup_key IS NOT NULL AND status IN ('pending','processing');

-- RLS · service_role + authenticated (admins veem da propria clinica)
ALTER TABLE public.b2b_pending_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "b2b_pending_dispatches_service_all" ON public.b2b_pending_dispatches;
CREATE POLICY "b2b_pending_dispatches_service_all" ON public.b2b_pending_dispatches
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "b2b_pending_dispatches_authed_read" ON public.b2b_pending_dispatches;
CREATE POLICY "b2b_pending_dispatches_authed_read" ON public.b2b_pending_dispatches
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

-- Trigger updated_at (reusa funcao existente da queue se houver, senao cria)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='_b2b_pending_dispatches_set_updated_at') THEN
    CREATE OR REPLACE FUNCTION public._b2b_pending_dispatches_set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, extensions, pg_temp
    AS $body$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END $body$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_pending_dispatches_updated_at
  ON public.b2b_pending_dispatches;
CREATE TRIGGER trg_b2b_pending_dispatches_updated_at
  BEFORE UPDATE ON public.b2b_pending_dispatches
  FOR EACH ROW
  EXECUTE FUNCTION public._b2b_pending_dispatches_set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. _b2b_invoke_edge ATUALIZADA · guard de horario para b2b-comm-dispatch
-- ═══════════════════════════════════════════════════════════════════════════
-- Mantem assinatura compativel com versao do clinic-dashboard (path, body).
-- Quando path = 'b2b-comm-dispatch' E payload nao tem `bypass_quiet_hours=true`:
--   1. Resolve clinic_id (body OR partnership_id JOIN OR app_clinic_id())
--   2. Se DENTRO do horario · faz net.http_post normal (caminho atual)
--   3. Se FORA do horario · INSERT em b2b_pending_dispatches com
--      scheduled_for = _b2b_next_window_start(clinic_id) e retorna
--      { ok:true, queued:true, scheduled_for, pending_id }
--
-- Outras edges (b2b-mira-router, b2b-insights-generator etc) passam direto.

CREATE OR REPLACE FUNCTION public._b2b_invoke_edge(
  p_path text,
  p_body jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_url           text;
  v_request_id    bigint;
  v_bypass        boolean;
  v_clinic_id     uuid;
  v_partnership_id uuid;
  v_pending_id    uuid;
  v_scheduled_for timestamptz;
  v_event_key     text;
BEGIN
  v_url := 'https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/' || p_path;

  -- ─── Guard de horario · so para path b2b-comm-dispatch ────────────────
  IF p_path = 'b2b-comm-dispatch' THEN
    v_bypass := COALESCE((p_body ->> 'bypass_quiet_hours')::boolean, false);

    IF NOT v_bypass THEN
      -- Resolve clinic_id em ordem de preferencia
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

      -- Decisao
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

  -- ─── Caminho normal · fire-and-forget via pg_net ──────────────────────
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := p_body,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id, 'url', v_url);

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'edge invoke falhou (%): %', p_path, SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

-- Mantem grants existentes (compat com clinic-dashboard caller anon)
GRANT EXECUTE ON FUNCTION public._b2b_invoke_edge(text, jsonb)
  TO anon, authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. b2b_pending_dispatches_drain(p_limit)
-- ═══════════════════════════════════════════════════════════════════════════
-- Worker chamado pelo cron · pega ate p_limit pending elegiveis (scheduled_for
-- <= now() E _b2b_is_within_business_hours(clinic_id) = true), marca como
-- processing, dispara via net.http_post e marca done · retry policy: max 3
-- attempts, depois marca failed.
--
-- Concorrencia segura: FOR UPDATE SKIP LOCKED (multi-worker safe).

CREATE OR REPLACE FUNCTION public.b2b_pending_dispatches_drain(
  p_limit int DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_limit       int;
  v_row         record;
  v_request_id  bigint;
  v_url         text;
  v_processed   int := 0;
  v_failed      int := 0;
  v_skipped     int := 0;  -- elegiveis pelo scheduled_for mas fora do horario
BEGIN
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));

  -- Pick: pending + scheduled_for vencido + dentro do horario · marca
  -- como processing num go (evita race com outros workers).
  FOR v_row IN
    UPDATE public.b2b_pending_dispatches
       SET status          = 'processing',
           attempts        = attempts + 1,
           last_attempt_at = now()
     WHERE id IN (
       SELECT id FROM public.b2b_pending_dispatches
        WHERE status = 'pending'
          AND scheduled_for <= now()
          AND public._b2b_is_within_business_hours(clinic_id, now()) = true
        ORDER BY scheduled_for ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT v_limit
     )
    RETURNING id, clinic_id, edge_path, payload, attempts
  LOOP
    v_url := 'https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/' || v_row.edge_path;

    BEGIN
      SELECT net.http_post(
        url     := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := v_row.payload,
        timeout_milliseconds := 30000
      ) INTO v_request_id;

      UPDATE public.b2b_pending_dispatches
         SET status        = 'done',
             request_id    = v_request_id,
             last_error    = NULL
       WHERE id = v_row.id;

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      IF v_row.attempts >= 3 THEN
        UPDATE public.b2b_pending_dispatches
           SET status     = 'failed',
               last_error = LEFT(SQLERRM, 1000)
         WHERE id = v_row.id;
        v_failed := v_failed + 1;
      ELSE
        UPDATE public.b2b_pending_dispatches
           SET status     = 'pending',
               last_error = LEFT(SQLERRM, 1000)
         WHERE id = v_row.id;
        v_failed := v_failed + 1;
      END IF;
    END;
  END LOOP;

  -- Conta quantos pending estao FORA do horario (skipped esta janela)
  SELECT COUNT(*) INTO v_skipped
    FROM public.b2b_pending_dispatches
   WHERE status = 'pending'
     AND scheduled_for <= now()
     AND NOT public._b2b_is_within_business_hours(clinic_id, now());

  RETURN jsonb_build_object(
    'ok',         true,
    'processed',  v_processed,
    'failed',     v_failed,
    'skipped',    v_skipped,
    'ts',         now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_pending_dispatches_drain(int)
  TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- ASSERTS · sanity
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_fn_within  boolean;
  v_fn_next    boolean;
  v_fn_invoke  boolean;
  v_fn_drain   boolean;
  v_table      boolean;
  v_idx_pick   boolean;
  v_pol_svc    boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='_b2b_is_within_business_hours')
    INTO v_fn_within;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='_b2b_next_window_start')
    INTO v_fn_next;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='_b2b_invoke_edge')
    INTO v_fn_invoke;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='b2b_pending_dispatches_drain')
    INTO v_fn_drain;
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='b2b_pending_dispatches')
    INTO v_table;
  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
                AND indexname='idx_b2b_pending_dispatches_pick')
    INTO v_idx_pick;
  SELECT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
                AND tablename='b2b_pending_dispatches'
                AND policyname='b2b_pending_dispatches_service_all')
    INTO v_pol_svc;

  IF NOT (v_fn_within AND v_fn_next AND v_fn_invoke AND v_fn_drain
          AND v_table AND v_idx_pick AND v_pol_svc) THEN
    RAISE EXCEPTION 'Sanity 800-88 FAIL · within=% next=% invoke=% drain=% table=% idx=% pol=%',
      v_fn_within, v_fn_next, v_fn_invoke, v_fn_drain, v_table, v_idx_pick, v_pol_svc;
  END IF;

  RAISE NOTICE 'Migration 800-88 OK · quiet hours guard + pending dispatches queue + worker drain';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
