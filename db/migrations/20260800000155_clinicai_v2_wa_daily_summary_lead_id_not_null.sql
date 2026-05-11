-- ============================================================================
-- Migration 155 · clinicai-v2 · wa_daily_summary · lead_id NOT NULL safety
-- ============================================================================
--
-- Propósito P0:
--   Corrigir P0 latente em public.wa_daily_summary(): hoje insere em
--   public.wa_outbox com lead_id = NULL, mas wa_outbox.lead_id é uuid
--   NOT NULL. Quando houver agenda real do dia, o cron daily-agenda-summary
--   (job 12 · 0 11 * * *) falha no insert. Sem dados futuros agora · risco
--   imediato baixo · mas o bug está armado.
--
-- Estratégia (sem mexer em schema, sem criar lead institucional, sem
-- ativar nada):
--   1. Adicionar variável local v_summary_lead_id uuid no DECLARE.
--   2. Para cada profissional/dia, ANTES do INSERT em wa_outbox:
--      buscar um lead_id real entre os appointments daquele profissional
--      no dia (ORDER BY start_time LIMIT 1, filtrando deleted_at IS NULL,
--      status não cancelado/no_show, lead_id IS NOT NULL).
--   3. Se v_summary_lead_id IS NULL → CONTINUE (não insere · não throw ·
--      cron continua saudável quando o resumo for só patient_id-only).
--   4. No INSERT, usar v_summary_lead_id em vez de NULL.
--
-- Estrutura preservada 1:1 da mig 154 (def real capturada via
-- pg_get_functiondef):
--   - SECURITY DEFINER
--   - SET search_path TO 'public', 'extensions', 'pg_temp'
--   - cálculo de v_today em America/Sao_Paulo
--   - schedule 08:00 BRT ou now() se passou
--   - dedupe por appt_ref (daily_summary_<date>_<md5>) + status
--   - normalização phone (regexp_replace + prefix '55' se length ≤ 11)
--   - loop em professional_profiles via display_name = a.professional_name
--   - mensagem com emojis/separadores
--   - subject_name (mig 154) inalterado
--   - fallback 'Paciente' inalterado
--   - priority 2, status 'queued', appt_ref preservados
--
-- Fora de escopo:
--   - schema de tabelas (wa_outbox.lead_id permanece NOT NULL)
--   - _render_appt_template (mig 154 inalterada)
--   - _enqueue_agenda_alert / _agenda_alert_min_before_tick (fase 2D.3B)
--   - cron.job 12/71/72 (todos inalterados)
--   - wa_outbox_worker / wa_agenda_automations / WhatsApp / Evolution /
--     Secretaria
--   - lead institucional (decisão: NÃO criar)
--   - agenda_alerts_log (fase futura)
--   - TS Lara v2
--   - backfill / DML em qualquer tabela
--
-- Rollback:
--   - Down NO-OP defensivo (não restaura bug com lead_id null)
-- ============================================================================

BEGIN;

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
  v_summary_lead_id uuid;  -- mig 155: resolve lead_id real para satisfazer wa_outbox.lead_id NOT NULL
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

    -- mig 155: resolver lead_id real entre os appointments do profissional/dia.
    -- wa_outbox.lead_id é uuid NOT NULL · sem isto o INSERT falha quando
    -- houver agenda real. Se todos os appts forem patient_id-only (lead_id IS
    -- NULL · pacientes recorrentes promovidos), pular o resumo deste
    -- profissional silenciosamente (sem throw · cron continua saudável).
    v_summary_lead_id := NULL;
    select a.lead_id
      into v_summary_lead_id
      from public.appointments a
     where a.clinic_id = v_clinic_id
       and a.scheduled_date = v_today
       and a.professional_name = v_prof.professional_name
       and a.status not in ('cancelado','no_show')
       and a.deleted_at is null
       and a.lead_id is not null
     order by a.start_time
     limit 1;

    if v_summary_lead_id is null then
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
      v_summary_lead_id,
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
  'Cron daily-agenda-summary · resumo de agenda do dia por profissional via wa_outbox. Mig 155 (2026-05-11): resolve v_summary_lead_id real entre os appointments do profissional/dia (wa_outbox.lead_id é NOT NULL · INSERT com NULL falhava). Se todos os appts do profissional/dia forem patient_id-only, pula o resumo silenciosamente (cron continua saudável). Resto idêntico à versão pós-mig 154.';

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY CHECK (DO block · dentro da transação · aborta apply se faltar)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='wa_daily_summary'
  ) THEN
    RAISE EXCEPTION 'sanity: wa_daily_summary nao existe pos-replace';
  END IF;

  SELECT pg_get_functiondef('public.wa_daily_summary()'::regprocedure) INTO v_def;
  IF position('v_summary_lead_id' IN v_def) = 0 THEN
    RAISE EXCEPTION 'sanity: wa_daily_summary nao tem v_summary_lead_id';
  END IF;
  IF position('patient_name' IN v_def) > 0 THEN
    RAISE EXCEPTION 'sanity: wa_daily_summary ainda menciona patient_name';
  END IF;
  IF position('v_clinic_id,' || chr(10) || '      null,' IN v_def) > 0
     OR position('v_clinic_id, null, v_phone' IN v_def) > 0 THEN
    RAISE EXCEPTION 'sanity: wa_daily_summary ainda insere lead_id NULL';
  END IF;

  RAISE NOTICE 'mig 155 · wa_daily_summary lead_id resolvido em runtime · sanity OK';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
