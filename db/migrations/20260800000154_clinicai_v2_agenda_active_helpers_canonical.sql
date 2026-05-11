-- ============================================================================
-- Migration 154 · clinicai-v2 · agenda active helpers · canonical schema
-- ============================================================================
--
-- Propósito P0:
--   Recriar 2 funções que ainda lêem appointments.patient_name (coluna
--   removida no clean-slate da mig 062), trocando por subject_name:
--     - public.wa_daily_summary()              (cron daily-agenda-summary · ATIVO)
--     - public._render_appt_template(text, record)  (helper · STABLE SECURITY DEFINER)
--
-- Definições destas funções foram capturadas via pg_get_functiondef no banco
-- real (CLINIIC AI v2 · oqboitkpcvuaudouwvkl · 2026-05-11) e reproduzidas
-- aqui 1:1 EXCETO pelas trocas patient_name → subject_name. Toda lógica
-- (loop de profissionais, dedupe por appt_ref daily_summary_..., status
-- 'queued', priority 2, scheduled_at 08:00 BRT ou now() se já passou,
-- fallback 'Paciente'/'paciente', join professional_profiles, fallback
-- 'nossa equipe'/'nossa clinica') está preservada.
--
-- Escopo da mig:
--   - CREATE OR REPLACE FUNCTION public.wa_daily_summary()
--   - CREATE OR REPLACE FUNCTION public._render_appt_template(text, record)
--   - NOTIFY pgrst, 'reload schema'
--   - Sanity DO block antes do COMMIT
--
-- Fora de escopo (NÃO alteradas nesta mig):
--   - appt_upsert / appt_sync_batch / _appt_upsert_one (já corrigidas em mig 153)
--   - appt_list / appt_delete* / appt_create_series / appt_set_canonical /
--     appt_set_cortesia
--   - _enqueue_agenda_alert / _agenda_alert_min_before_tick (fase 2D.3B ·
--     pertencem a automações/outbox/min_before atualmente desligados)
--   - wa_outbox_worker / cron.job 71 / cron.job 72 (desligados intencionalmente)
--   - wa_agenda_automations / wa_outbox / WhatsApp / Evolution / Secretaria
--   - schema de qualquer tabela
--   - backfill
--
-- Rollback:
--   - Down: NO-OP defensivo (não restaura versões antigas quebradas)
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. public.wa_daily_summary()
--    Cron daily-agenda-summary chama esta função todo dia 08:00 BRT.
--    Único troca vs versão atual: o SELECT no loop interno lê subject_name
--    em vez de patient_name, e o fallback usa v_appt.subject_name.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_daily_summary()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_clinic_id uuid := public.app_clinic_id();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_today_txt text;
  v_dow_names text[] := array['Domingo','Segunda-feira','Terca-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sabado'];
  v_dow int;
  v_prof record;
  v_appt record;
  v_count int;
  v_total_sent int := 0;
  v_msg text;
  v_body text;
  v_idx int;
  v_phone text;
  v_sent_key text;
  v_first_name text;
  v_schedule_at timestamptz;
begin
  if v_clinic_id is null then
    raise exception 'not_authenticated';
  end if;

  v_dow := extract(dow from v_today)::int;
  v_today_txt := to_char(v_today, 'DD/MM/YYYY');
  v_schedule_at := (v_today::text || ' 08:00:00')::timestamp at time zone 'America/Sao_Paulo';

  if v_schedule_at < now() then
    v_schedule_at := now();
  end if;

  for v_prof in
    select distinct
      a.professional_name,
      pp.whatsapp,
      pp.phone,
      pp.display_name
    from public.appointments a
    left join public.professional_profiles pp
      on pp.display_name = a.professional_name
     and pp.clinic_id = v_clinic_id
    where a.clinic_id = v_clinic_id
      and a.scheduled_date = v_today
      and a.status not in ('cancelado','no_show')
      and (
        pp.whatsapp is not null and pp.whatsapp != ''
        or pp.phone is not null and pp.phone != ''
      )
  loop
    v_phone := regexp_replace(coalesce(v_prof.whatsapp, v_prof.phone, ''), '[^0-9]', '', 'g');

    if v_phone = '' then
      continue;
    end if;

    if length(v_phone) <= 11 then
      v_phone := '55' || v_phone;
    end if;

    v_sent_key := 'daily_summary_' || v_today::text || '_' || md5(coalesce(v_prof.professional_name, ''));

    if exists (
      select 1
      from public.wa_outbox
      where clinic_id = v_clinic_id
        and appt_ref = v_sent_key
        and status in ('queued','processing','retrying','sent')
    ) then
      continue;
    end if;

    v_count := 0;
    v_body := '';
    v_idx := 0;

    for v_appt in
      select subject_name, procedure_name, start_time, end_time, obs
      from public.appointments
      where clinic_id = v_clinic_id
        and scheduled_date = v_today
        and professional_name = v_prof.professional_name
        and status not in ('cancelado','no_show')
      order by start_time
    loop
      v_idx := v_idx + 1;
      v_count := v_count + 1;

      v_body := v_body || v_idx || '. *' || coalesce(v_appt.subject_name, 'Paciente') || '*' || chr(10);
      v_body := v_body || '   ' || coalesce(v_appt.procedure_name, '-') || chr(10);
      v_body := v_body || '   ' || to_char(v_appt.start_time, 'HH24:MI');

      if v_appt.end_time is not null then
        v_body := v_body || ' - ' || to_char(v_appt.end_time, 'HH24:MI');
      end if;

      v_body := v_body || chr(10);

      if v_appt.obs is not null and v_appt.obs != '' then
        v_body := v_body || '   Obs: ' || v_appt.obs || chr(10);
      end if;

      v_body := v_body || chr(10);
    end loop;

    if v_count = 0 then
      continue;
    end if;

    v_first_name := split_part(initcap(coalesce(v_prof.display_name, v_prof.professional_name, '')), ' ', 1);

    v_msg := '*Clinica - Agenda do Dia*' || chr(10);
    v_msg := v_msg || v_dow_names[v_dow + 1] || ', ' || v_today_txt || chr(10);
    v_msg := v_msg || v_count || ' agendamento' || case when v_count > 1 then 's' else '' end || chr(10);
    v_msg := v_msg || '------------------------------' || chr(10) || chr(10);
    v_msg := v_msg || v_body;
    v_msg := v_msg || '------------------------------' || chr(10);
    v_msg := v_msg || 'Bom dia e sucesso ' || coalesce(v_first_name, '') || '!';

    insert into public.wa_outbox (
      clinic_id,
      lead_id,
      phone,
      content,
      scheduled_at,
      status,
      priority,
      appt_ref
    ) values (
      v_clinic_id,
      null,
      v_phone,
      v_msg,
      v_schedule_at,
      'queued',
      2,
      v_sent_key
    );

    v_total_sent := v_total_sent + 1;
  end loop;

  return v_total_sent;
end;
$function$;

COMMENT ON FUNCTION public.wa_daily_summary() IS
  'Cron daily-agenda-summary · gera resumo de agenda do dia por profissional via wa_outbox. Mig 154 (2026-05-11): leitura troca patient_name → subject_name. Resto idêntico à versão pré-154 capturada via pg_get_functiondef.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. public._render_appt_template(text, record)
--    Helper STABLE SECURITY DEFINER · interpola placeholders {{nome}}/{{data}}/etc.
--    Único troca vs versão atual: {{nome}} usa subject_name com NULLIF para
--    cair em fallback 'paciente' se subject_name for string vazia (default
--    do schema atual é '').
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._render_appt_template(p_template text, p_appt record)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_out       text := p_template;
  v_date_br   text;
  v_time_br   text;
  v_prof_name text;
  v_clinic    text;
BEGIN
  IF p_template IS NULL OR p_template = '' THEN
    RETURN p_template;
  END IF;

  v_date_br := TO_CHAR(p_appt.scheduled_date, 'DD/MM/YYYY');
  v_time_br := LEFT(p_appt.start_time::text, 5);

  -- Nome do profissional (join). Fallback: 'nossa equipe'.
  v_prof_name := COALESCE((
    SELECT display_name FROM public.professional_profiles
    WHERE id = p_appt.professional_id
  ), 'nossa equipe');

  -- Nome da clinica (join clinics.name). Fallback: 'nossa clinica'.
  -- SECURITY DEFINER porque RLS em clinics ainda filtra por policy;
  -- essa funcao precisa ler o nome mesmo chamada por background jobs.
  BEGIN
    SELECT name INTO v_clinic
      FROM public.clinics
     WHERE id = p_appt.clinic_id
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_clinic := NULL;
  END;
  IF v_clinic IS NULL OR v_clinic = '' THEN
    v_clinic := 'nossa clinica';
  END IF;

  -- Placeholders canonicos
  v_out := REPLACE(v_out, '{{nome}}',              COALESCE(NULLIF(p_appt.subject_name, ''), 'paciente'));
  v_out := REPLACE(v_out, '{{data}}',              v_date_br);
  v_out := REPLACE(v_out, '{{hora}}',              v_time_br);
  v_out := REPLACE(v_out, '{{profissional}}',      v_prof_name);
  v_out := REPLACE(v_out, '{{profissional_nome}}', v_prof_name);
  v_out := REPLACE(v_out, '{{procedimento}}',      COALESCE(NULLIF(p_appt.procedure_name, ''), 'Consulta'));
  v_out := REPLACE(v_out, '{{clinica}}',           v_clinic);
  v_out := REPLACE(v_out, '{{clinic_name}}',       v_clinic);

  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public._render_appt_template(text, record) IS
  'Helper interpolador de placeholders {{nome}}/{{data}}/{{hora}}/{{profissional}}/{{procedimento}}/{{clinica}}. Mig 154 (2026-05-11): {{nome}} usa subject_name com NULLIF (default schema é '''') → fallback ''paciente''. Resto idêntico à versão pré-154 capturada via pg_get_functiondef.';

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY CHECK (DO block · dentro da transação · aborta apply se faltar)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='wa_daily_summary'
  ) THEN
    RAISE EXCEPTION 'sanity: wa_daily_summary nao existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='_render_appt_template'
  ) THEN
    RAISE EXCEPTION 'sanity: _render_appt_template nao existe';
  END IF;
  RAISE NOTICE 'mig 154 · wa_daily_summary + _render_appt_template recriados canon';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
