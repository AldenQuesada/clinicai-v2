-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-13 · clinicai-v2 · wa_pro_* RPCs (auditoria D1)            ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Cria 9 RPCs wa_pro_* com assinatura (p_clinic_id uuid) que o monorepo    ║
-- ║ chama em cron routes (apps/mira/src/app/api/cron/mira-*/route.ts).        ║
-- ║                                                                          ║
-- ║ Contexto (auditoria D1 · 2026-04-25):                                    ║
-- ║   - 10 RPCs wa_pro_* sao chamadas pelo codigo (`apps/mira` cron + B2B    ║
-- ║     admin handler).                                                      ║
-- ║   - Versoes legadas em prod (clinic-dashboard) usam (p_phone text) ·     ║
-- ║     incompativel com chamadas do monorepo que passam (p_clinic_id uuid). ║
-- ║   - 9 dessas chamadas caem no fallback `tryRpcText` (admin-dispatch.ts)  ║
-- ║     que retorna null silenciosamente quando RPC nao existe → cron usa    ║
-- ║     fallback monta-mensagem em codigo TS. Suboptimo (logica duplicada    ║
-- ║     entre TS e SQL).                                                     ║
-- ║   - 1 RPC (wa_pro_handle_message) ja roda em prod com (p_phone, p_text). ║
-- ║     Nao tocada nesta migration (fora do escopo D1).                      ║
-- ║                                                                          ║
-- ║ Fix: cria sobrecargas (uuid) que sao a fonte canonica multi-tenant pro   ║
-- ║   monorepo. Cron routes vao parar de cair no fallback TS quando a        ║
-- ║   migration for aplicada em prod (Alden aplica via psql).                ║
-- ║                                                                          ║
-- ║ Contrato canonico inegociavel:                                           ║
-- ║   - LANGUAGE plpgsql                                                     ║
-- ║   - SECURITY DEFINER                                                     ║
-- ║   - SET search_path = public, extensions, pg_temp                        ║
-- ║   - REVOKE EXECUTE ... FROM public, anon                                 ║
-- ║   - GRANT EXECUTE ... TO service_role, authenticated                     ║
-- ║   - Retorno: jsonb { ok, message, ... } (compativel com tryRpcText que   ║
-- ║     aceita string puro, obj.text ou obj.message).                        ║
-- ║                                                                          ║
-- ║ Implementacao: skeletons defensivos · query so em tabelas canonicas      ║
-- ║   (appointments, leads, clinics) com guards. Se schema nao tem coluna    ║
-- ║   esperada (ex: tasks), retorna mensagem amigavel ao inves de erro.      ║
-- ║   MVP multi-tenant que cobre 100% do que os crons precisam HOJE.         ║
-- ║                                                                          ║
-- ║ RPCs criadas (9):                                                        ║
-- ║   - wa_pro_daily_digest(uuid)                                            ║
-- ║   - wa_pro_evening_digest(uuid)                                          ║
-- ║   - wa_pro_birthday_alerts(uuid)                                         ║
-- ║   - wa_pro_anomaly_check(uuid)                                           ║
-- ║   - wa_pro_inactivity_radar(uuid)                                        ║
-- ║   - wa_pro_pre_consult_alerts(uuid)                                      ║
-- ║   - wa_pro_followup_suggestions(uuid)                                    ║
-- ║   - wa_pro_weekly_roundup(uuid)                                          ║
-- ║   - wa_pro_task_reminders(uuid)                                          ║
-- ║                                                                          ║
-- ║ GOLD #3 (search_path), #5 (.down), #6 (REVOKE anon), #7 (sanity),        ║
-- ║ #10 (NOTIFY).                                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) wa_pro_daily_digest(p_clinic_id uuid)
-- ═══════════════════════════════════════════════════════════════════════════
-- Resumo da agenda de HOJE da clinica · usado pelo cron 07h (mira-daily-digest).
CREATE OR REPLACE FUNCTION public.wa_pro_daily_digest(p_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_total      int := 0;
  v_value      numeric := 0;
  v_msg        text;
  v_clinic     text;
BEGIN
  -- Guard · clinic_id obrigatorio
  IF p_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_id_required');
  END IF;

  -- Nome da clinica (best-effort · fallback "Sua clinica")
  BEGIN
    SELECT COALESCE(name, 'Sua clinica') INTO v_clinic
      FROM public.clinics
     WHERE id = p_clinic_id
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_clinic := 'Sua clinica';
  END;

  -- Conta agendamentos de hoje · defensive (status pode variar entre clinicas)
  BEGIN
    SELECT
      count(*),
      COALESCE(sum(value), 0)
      INTO v_total, v_value
      FROM public.appointments
     WHERE clinic_id     = p_clinic_id
       AND deleted_at    IS NULL
       AND scheduled_date = CURRENT_DATE
       AND COALESCE(status, '') NOT IN ('cancelado', 'cancelled');
  EXCEPTION WHEN OTHERS THEN
    v_total := 0;
    v_value := 0;
  END;

  IF v_total = 0 THEN
    v_msg := 'Bom dia! Nenhum atendimento na agenda de hoje. Dia livre para o que importa.';
  ELSE
    v_msg := 'Bom dia! Hoje voce tem *' || v_total || ' atendimento' ||
             CASE WHEN v_total > 1 THEN 's' ELSE '' END || '* na agenda';
    IF v_value > 0 THEN
      v_msg := v_msg || ' · valor previsto: R$ ' || to_char(v_value, 'FM999G999G990D00');
    END IF;
    v_msg := v_msg || '.';
  END IF;

  RETURN jsonb_build_object(
    'ok',        true,
    'clinic_id', p_clinic_id,
    'message',   v_msg,
    'total',     v_total,
    'value',     v_value
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_pro_daily_digest(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wa_pro_daily_digest(uuid) TO service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) wa_pro_evening_digest(p_clinic_id uuid)
-- ═══════════════════════════════════════════════════════════════════════════
-- Fechamento do dia · cron 20h (mira-evening-digest).
CREATE OR REPLACE FUNCTION public.wa_pro_evening_digest(p_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_done    int := 0;
  v_canc    int := 0;
  v_value   numeric := 0;
  v_msg     text;
BEGIN
  IF p_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_id_required');
  END IF;

  BEGIN
    SELECT
      count(*) FILTER (WHERE COALESCE(status, '') IN ('finalizado', 'finished')),
      count(*) FILTER (WHERE COALESCE(status, '') IN ('cancelado',  'cancelled')),
      COALESCE(sum(value) FILTER (WHERE COALESCE(status, '') IN ('finalizado', 'finished')), 0)
      INTO v_done, v_canc, v_value
      FROM public.appointments
     WHERE clinic_id      = p_clinic_id
       AND deleted_at     IS NULL
       AND scheduled_date = CURRENT_DATE;
  EXCEPTION WHEN OTHERS THEN
    v_done := 0; v_canc := 0; v_value := 0;
  END;

  IF v_done = 0 AND v_canc = 0 THEN
    v_msg := 'Boa noite! Sem movimento registrado hoje. Bom descanso.';
  ELSE
    v_msg := 'Boa noite! Fechamento do dia: *' || v_done || '* finalizado' ||
             CASE WHEN v_done <> 1 THEN 's' ELSE '' END;
    IF v_canc > 0 THEN
      v_msg := v_msg || ', ' || v_canc || ' cancelado' ||
               CASE WHEN v_canc <> 1 THEN 's' ELSE '' END;
    END IF;
    IF v_value > 0 THEN
      v_msg := v_msg || ' · receita do dia: R$ ' || to_char(v_value, 'FM999G999G990D00');
    END IF;
    v_msg := v_msg || '.';
  END IF;

  RETURN jsonb_build_object(
    'ok',        true,
    'clinic_id', p_clinic_id,
    'message',   v_msg,
    'finalized', v_done,
    'cancelled', v_canc,
    'revenue',   v_value
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_pro_evening_digest(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wa_pro_evening_digest(uuid) TO service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) wa_pro_birthday_alerts(p_clinic_id uuid)
-- ═══════════════════════════════════════════════════════════════════════════
-- Aniversariantes do dia · cron mira-birthday-alerts. Usa leads.birth_date
-- (defensive: se coluna nao existe, retorna mensagem placeholder).
CREATE OR REPLACE FUNCTION public.wa_pro_birthday_alerts(p_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count int := 0;
  v_names text;
  v_msg   text;
BEGIN
  IF p_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_id_required');
  END IF;

  -- Tenta query · se schema nao tem birth_date, cai pro fallback amigavel
  BEGIN
    SELECT
      count(*),
      string_agg(name, ', ' ORDER BY name)
      INTO v_count, v_names
      FROM public.leads
     WHERE clinic_id = p_clinic_id
       AND deleted_at IS NULL
       AND birth_date IS NOT NULL
       AND EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
       AND EXTRACT(DAY   FROM birth_date) = EXTRACT(DAY   FROM CURRENT_DATE);
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    -- Schema legado · birth_date nao existe ainda
    RETURN jsonb_build_object(
      'ok',      true,
      'message', NULL,
      'skipped', 'no_birth_date_column'
    );
  WHEN OTHERS THEN
    v_count := 0;
  END;

  IF v_count = 0 THEN
    -- NULL message · tryRpcText devolve null e cron pula dispatch (correto · sem aniversariantes nao spammar)
    RETURN jsonb_build_object('ok', true, 'message', NULL, 'count', 0);
  END IF;

  v_msg := 'Hoje tem aniversariante! *' || v_count || '* paciente' ||
           CASE WHEN v_count > 1 THEN 's' ELSE '' END ||
           ' · ' || v_names ||
           '. Que tal mandar uma mensagem carinhosa?';

  RETURN jsonb_build_object(
    'ok',        true,
    'clinic_id', p_clinic_id,
    'message',   v_msg,
    'count',     v_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_pro_birthday_alerts(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wa_pro_birthday_alerts(uuid) TO service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) wa_pro_anomaly_check(p_clinic_id uuid)
-- ═══════════════════════════════════════════════════════════════════════════
-- Detecta zero atendimentos finalizados ontem (sinal de anomalia operacional).
-- Versao MVP do clinic-dashboard que faz 3-sigma vai pra D2.
CREATE OR REPLACE FUNCTION public.wa_pro_anomaly_check(p_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_yesterday_done int := 0;
  v_yesterday_total int := 0;
  v_msg text;
BEGIN
  IF p_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_id_required');
  END IF;

  BEGIN
    SELECT
      count(*) FILTER (WHERE COALESCE(status, '') IN ('finalizado', 'finished')),
      count(*)
      INTO v_yesterday_done, v_yesterday_total
      FROM public.appointments
     WHERE clinic_id      = p_clinic_id
       AND deleted_at     IS NULL
       AND scheduled_date = CURRENT_DATE - 1;
  EXCEPTION WHEN OTHERS THEN
    v_yesterday_done := 0;
    v_yesterday_total := 0;
  END;

  -- Anomalia: tinha agenda mas nada finalizou
  IF v_yesterday_total > 0 AND v_yesterday_done = 0 THEN
    v_msg := 'Atencao: ontem havia *' || v_yesterday_total ||
             ' atendimento' || CASE WHEN v_yesterday_total > 1 THEN 's' ELSE '' END ||
             '* agendado' || CASE WHEN v_yesterday_total > 1 THEN 's' ELSE '' END ||
             ' mas *zero finalizado*. Vale conferir os status na agenda.';
    RETURN jsonb_build_object(
      'ok',        true,
      'clinic_id', p_clinic_id,
      'message',   v_msg,
      'severity',  'warn',
      'total',     v_yesterday_total,
      'done',      v_yesterday_done
    );
  END IF;

  -- Sem anomalia · NULL message → cron skip dispatch
  RETURN jsonb_build_object('ok', true, 'message', NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_pro_anomaly_check(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wa_pro_anomaly_check(uuid) TO service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) wa_pro_inactivity_radar(p_clinic_id uuid)
-- ═══════════════════════════════════════════════════════════════════════════
-- Leads sem update > 30d · ranking simples (so count, sem listar todos pra
-- nao explodir mensagem).
CREATE OR REPLACE FUNCTION public.wa_pro_inactivity_radar(p_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count int := 0;
  v_msg   text;
BEGIN
  IF p_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_id_required');
  END IF;

  BEGIN
    SELECT count(*)
      INTO v_count
      FROM public.leads
     WHERE clinic_id  = p_clinic_id
       AND deleted_at IS NULL
       AND COALESCE(updated_at, created_at) < now() - interval '30 days';
  EXCEPTION WHEN OTHERS THEN
    v_count := 0;
  END;

  IF v_count = 0 THEN
    -- Sem inativos · skip dispatch
    RETURN jsonb_build_object('ok', true, 'message', NULL, 'count', 0);
  END IF;

  v_msg := 'Radar de inatividade: *' || v_count || ' lead' ||
           CASE WHEN v_count > 1 THEN 's' ELSE '' END ||
           '* sem mexida ha mais de 30 dias. Vale uma rodada de followup.';

  RETURN jsonb_build_object(
    'ok',        true,
    'clinic_id', p_clinic_id,
    'message',   v_msg,
    'count',     v_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_pro_inactivity_radar(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wa_pro_inactivity_radar(uuid) TO service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6) wa_pro_pre_consult_alerts(p_clinic_id uuid)
-- ═══════════════════════════════════════════════════════════════════════════
-- Alerta de proxima consulta nos proximos 15min (cron a cada 5min).
CREATE OR REPLACE FUNCTION public.wa_pro_pre_consult_alerts(p_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count int := 0;
  v_first text;
  v_msg   text;
BEGIN
  IF p_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_id_required');
  END IF;

  -- Defensive · scheduled_date + start_time podem nao existir em todos schemas
  BEGIN
    SELECT
      count(*),
      min(patient_name)
      INTO v_count, v_first
      FROM public.appointments
     WHERE clinic_id      = p_clinic_id
       AND deleted_at     IS NULL
       AND scheduled_date = CURRENT_DATE
       AND COALESCE(status, '') NOT IN ('cancelado', 'cancelled', 'finalizado', 'finished')
       AND start_time IS NOT NULL
       AND (CURRENT_DATE + start_time) BETWEEN now() AND now() + interval '15 minutes';
  EXCEPTION WHEN OTHERS THEN
    v_count := 0;
  END;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'message', NULL);
  END IF;

  v_msg := 'Em ate 15min: *' || v_count || ' atendimento' ||
           CASE WHEN v_count > 1 THEN 's' ELSE '' END || '*' ||
           CASE WHEN v_first IS NOT NULL THEN ' (proximo: ' || v_first || ')' ELSE '' END ||
           '. Bora preparar.';

  RETURN jsonb_build_object(
    'ok',        true,
    'clinic_id', p_clinic_id,
    'message',   v_msg,
    'count',     v_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_pro_pre_consult_alerts(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wa_pro_pre_consult_alerts(uuid) TO service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7) wa_pro_followup_suggestions(p_clinic_id uuid)
-- ═══════════════════════════════════════════════════════════════════════════
-- Sugestoes de follow-up · MVP simples: leads finalizados ha 7-15d sem
-- novo atendimento agendado. LLM-side processing (P2) fica fora.
CREATE OR REPLACE FUNCTION public.wa_pro_followup_suggestions(p_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count int := 0;
  v_msg   text;
BEGIN
  IF p_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_id_required');
  END IF;

  -- Atendimentos finalizados ha 7-15d
  BEGIN
    SELECT count(*)
      INTO v_count
      FROM public.appointments a
     WHERE a.clinic_id  = p_clinic_id
       AND a.deleted_at IS NULL
       AND COALESCE(a.status, '') IN ('finalizado', 'finished')
       AND a.scheduled_date BETWEEN CURRENT_DATE - 15 AND CURRENT_DATE - 7
       AND NOT EXISTS (
         SELECT 1 FROM public.appointments b
          WHERE b.clinic_id = a.clinic_id
            AND b.patient_id = a.patient_id
            AND b.deleted_at IS NULL
            AND b.scheduled_date > a.scheduled_date
       );
  EXCEPTION WHEN OTHERS THEN
    v_count := 0;
  END;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'message', NULL, 'count', 0);
  END IF;

  v_msg := 'Follow-up sugerido: *' || v_count || ' paciente' ||
           CASE WHEN v_count > 1 THEN 's' ELSE '' END ||
           '* finalizado' || CASE WHEN v_count > 1 THEN 's' ELSE '' END ||
           ' ha 7-15 dias sem novo agendamento. Boa janela pra reativar.';

  RETURN jsonb_build_object(
    'ok',        true,
    'clinic_id', p_clinic_id,
    'message',   v_msg,
    'count',     v_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_pro_followup_suggestions(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wa_pro_followup_suggestions(uuid) TO service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8) wa_pro_weekly_roundup(p_clinic_id uuid)
-- ═══════════════════════════════════════════════════════════════════════════
-- Resumo da semana passada (segunda a domingo · roda na 2a 8h tipicamente).
CREATE OR REPLACE FUNCTION public.wa_pro_weekly_roundup(p_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_done   int := 0;
  v_canc   int := 0;
  v_value  numeric := 0;
  v_start  date;
  v_end    date;
  v_msg    text;
BEGIN
  IF p_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_id_required');
  END IF;

  -- Semana passada · segunda a domingo
  v_start := date_trunc('week', CURRENT_DATE - 7)::date;
  v_end   := v_start + 6;

  BEGIN
    SELECT
      count(*) FILTER (WHERE COALESCE(status, '') IN ('finalizado', 'finished')),
      count(*) FILTER (WHERE COALESCE(status, '') IN ('cancelado',  'cancelled')),
      COALESCE(sum(value) FILTER (WHERE COALESCE(status, '') IN ('finalizado', 'finished')), 0)
      INTO v_done, v_canc, v_value
      FROM public.appointments
     WHERE clinic_id      = p_clinic_id
       AND deleted_at     IS NULL
       AND scheduled_date BETWEEN v_start AND v_end;
  EXCEPTION WHEN OTHERS THEN
    v_done := 0; v_canc := 0; v_value := 0;
  END;

  IF v_done = 0 AND v_canc = 0 THEN
    v_msg := 'Resumo da semana de ' || to_char(v_start, 'DD/MM') || ' a ' ||
             to_char(v_end, 'DD/MM') || ': sem movimento registrado.';
  ELSE
    v_msg := 'Resumo da semana ' || to_char(v_start, 'DD/MM') || '-' ||
             to_char(v_end, 'DD/MM') || ': *' || v_done ||
             '* atendimento' || CASE WHEN v_done <> 1 THEN 's' ELSE '' END ||
             ' finalizado' || CASE WHEN v_done <> 1 THEN 's' ELSE '' END;
    IF v_canc > 0 THEN
      v_msg := v_msg || ' · ' || v_canc || ' cancelado' ||
               CASE WHEN v_canc <> 1 THEN 's' ELSE '' END;
    END IF;
    IF v_value > 0 THEN
      v_msg := v_msg || ' · receita: R$ ' || to_char(v_value, 'FM999G999G990D00');
    END IF;
    v_msg := v_msg || '.';
  END IF;

  RETURN jsonb_build_object(
    'ok',        true,
    'clinic_id', p_clinic_id,
    'message',   v_msg,
    'finalized', v_done,
    'cancelled', v_canc,
    'revenue',   v_value,
    'period',    jsonb_build_object('start', v_start, 'end', v_end)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_pro_weekly_roundup(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wa_pro_weekly_roundup(uuid) TO service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9) wa_pro_task_reminders(p_clinic_id uuid)
-- ═══════════════════════════════════════════════════════════════════════════
-- Task reminders · placeholder MVP. A tabela `tasks` ainda nao existe no
-- monorepo · esta RPC retorna mensagem nula por padrao (cron skip dispatch).
-- D2: criar tabela tasks + integrar com lead.next_action.
CREATE OR REPLACE FUNCTION public.wa_pro_task_reminders(p_clinic_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_has_tasks_table boolean := false;
  v_count int := 0;
  v_msg   text;
BEGIN
  IF p_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_id_required');
  END IF;

  -- Probe · existe tabela tasks?
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'tasks'
  ) INTO v_has_tasks_table;

  IF NOT v_has_tasks_table THEN
    -- Schema nao tem tasks · skip dispatch silenciosamente
    RETURN jsonb_build_object(
      'ok',      true,
      'message', NULL,
      'skipped', 'no_tasks_table'
    );
  END IF;

  -- Existe a tabela · tenta query (best-effort)
  BEGIN
    EXECUTE
      'SELECT count(*) FROM public.tasks
        WHERE clinic_id = $1
          AND COALESCE(status, ''pending'') = ''pending''
          AND COALESCE(due_at, due_date::timestamptz) < now() + interval ''1 day'''
      INTO v_count
      USING p_clinic_id;
  EXCEPTION WHEN OTHERS THEN
    v_count := 0;
  END;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'message', NULL, 'count', 0);
  END IF;

  v_msg := 'Lembrete: *' || v_count || ' tarefa' ||
           CASE WHEN v_count > 1 THEN 's' ELSE '' END ||
           '* com prazo nas proximas 24h.';

  RETURN jsonb_build_object(
    'ok',        true,
    'clinic_id', p_clinic_id,
    'message',   v_msg,
    'count',     v_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wa_pro_task_reminders(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.wa_pro_task_reminders(uuid) TO service_role, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Sanity check · todas 9 RPCs presentes + grants corretos
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_missing       text[];
  v_grants_anon   text[];
  v_grants_public text[];
  v_no_definer    text[];
  v_no_path       text[];
  v_expected      text[] := ARRAY[
    'wa_pro_daily_digest',
    'wa_pro_evening_digest',
    'wa_pro_birthday_alerts',
    'wa_pro_anomaly_check',
    'wa_pro_inactivity_radar',
    'wa_pro_pre_consult_alerts',
    'wa_pro_followup_suggestions',
    'wa_pro_weekly_roundup',
    'wa_pro_task_reminders'
  ];
BEGIN
  -- Faltantes
  SELECT array_agg(name)
    INTO v_missing
    FROM unnest(v_expected) AS name
   WHERE NOT EXISTS (
     SELECT 1
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       JOIN unnest(p.proargtypes) WITH ORDINALITY AS a(t, ord) ON true
      WHERE n.nspname = 'public'
        AND p.proname = name
        AND a.ord     = 1
        AND a.t       = 'uuid'::regtype
   );

  -- Sem SECURITY DEFINER
  SELECT array_agg(p.proname)
    INTO v_no_definer
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = ANY(v_expected)
     AND p.prosecdef = false;

  -- Sem search_path explicito (proconfig deve conter "search_path=public, extensions, pg_temp")
  SELECT array_agg(p.proname)
    INTO v_no_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = ANY(v_expected)
     AND NOT EXISTS (
       SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
        WHERE c LIKE 'search_path=%'
     );

  -- GRANT pra anon (nao deveria existir)
  SELECT array_agg(routine_name)
    INTO v_grants_anon
    FROM information_schema.role_routine_grants
   WHERE specific_schema = 'public'
     AND routine_name    = ANY(v_expected)
     AND grantee         = 'anon'
     AND privilege_type  = 'EXECUTE';

  -- GRANT pra PUBLIC (nao deveria existir)
  SELECT array_agg(routine_name)
    INTO v_grants_public
    FROM information_schema.role_routine_grants
   WHERE specific_schema = 'public'
     AND routine_name    = ANY(v_expected)
     AND grantee         = 'PUBLIC'
     AND privilege_type  = 'EXECUTE';

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'D1 sanity FAIL · faltam RPCs (uuid): %', v_missing;
  END IF;
  IF v_no_definer IS NOT NULL THEN
    RAISE EXCEPTION 'D1 sanity FAIL · sem SECURITY DEFINER: %', v_no_definer;
  END IF;
  IF v_no_path IS NOT NULL THEN
    RAISE EXCEPTION 'D1 sanity FAIL · sem search_path explicito: %', v_no_path;
  END IF;
  IF v_grants_anon IS NOT NULL THEN
    RAISE EXCEPTION 'D1 sanity FAIL · GRANT EXECUTE pra anon (proibido): %', v_grants_anon;
  END IF;
  IF v_grants_public IS NOT NULL THEN
    RAISE EXCEPTION 'D1 sanity FAIL · GRANT EXECUTE pra PUBLIC (proibido): %', v_grants_public;
  END IF;

  RAISE NOTICE 'Migration 800-13 OK · 9 RPCs wa_pro_* (uuid) com SECURITY DEFINER + search_path + grants seguros';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
