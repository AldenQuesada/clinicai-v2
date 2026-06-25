-- =============================================================================
-- 20260800000201_clinicai_v2_lara_recovery_candidates  ·  RECOVERY RADAR · Prompt 2
--
-- RPC READ-ONLY que detecta conversas candidatas a recuperação por regras
-- DETERMINÍSTICAS (SQL puro · ZERO IA · ZERO persistência · ZERO envio).
-- Próximo número livre real do namespace Lara/secretaria (última = 200).
--
-- NÃO cria tabela. NÃO faz DML. NÃO gera mensagem final (isso é IA no Prompt 4).
-- Tenant-safe via app_clinic_id(). SECURITY DEFINER + search_path fixo.
--
-- Retorna 1 LINHA POR CONVERSA (dedup): primary_failure_type = maior score,
-- all_failure_types[] = todos os detectados, evidence = inbounds recentes.
--
-- Fontes confirmadas: wa_conversations (sem stage/temperature/last_human_msg →
-- vem de leads + wa_messages), wa_messages (sender humano/lara/lead/sistema/user),
-- leads, appointments (sem conversation_id → link por lead_id; data=scheduled_date;
-- no_show/cancel via timestamps), wa_outbox (broadcast), wa_phone_blacklist,
-- leads.wa_opt_in.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.lara_recovery_candidates(
  p_window_hours integer DEFAULT 72,
  p_limit integer DEFAULT 100,
  p_include_optout boolean DEFAULT false
)
 RETURNS TABLE (
   conversation_id uuid,
   lead_id uuid,
   lead_name text,
   phone text,
   inbox_role text,
   context_type text,
   primary_failure_type text,
   all_failure_types text[],
   candidate_reason text,
   priority_hint text,
   score_hint int,
   stage_hint text,
   last_message_at timestamptz,
   last_inbound_at timestamptz,
   last_outbound_at timestamptz,
   last_human_at timestamptz,
   last_lara_at timestamptz,
   hours_since_last_inbound numeric,
   hours_since_last_message numeric,
   evidence jsonb,
   is_optout boolean,
   source text
 )
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
#variable_conflict use_column
declare
  v_clinic uuid := public.app_clinic_id();
begin
  if v_clinic is null then
    return;  -- sem tenant, sem candidatos
  end if;

  return query
  with base as (
    select
      c.id as conv_id, c.lead_id, c.phone, c.inbox_role, c.context_type,
      c.last_message_at, c.last_ai_msg as last_lara_at, c.kpi_cleared_at,
      c.funnel as conv_funnel, c.assigned_to,
      coalesce(c.last_inbound_time, c.last_lead_msg) as last_inbound_at,
      l.name as lead_name, l.temperature, l.funnel as lead_funnel, l.phase, l.wa_opt_in,
      regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') as nphone
    from public.wa_conversations c
    left join public.leads l
      on l.id = c.lead_id
     and l.clinic_id = v_clinic
     and l.deleted_at is null
    where c.clinic_id = v_clinic
      and c.deleted_at is null
      and c.inbox_role in ('secretaria', 'sdr')
      and c.last_message_at >= now() - interval '30 days'   -- base limitada (custo)
  ),
  last_human as (
    select m.conversation_id, max(m.sent_at) as last_human_at
    from public.wa_messages m
    where m.direction = 'outbound' and m.sender = 'humano' and m.deleted_at is null
      and m.conversation_id in (select conv_id from base)
    group by m.conversation_id
  ),
  recent_inbound as (
    select m.conversation_id,
      string_agg(lower(coalesce(m.content, '')), ' || ') as itext,
      jsonb_agg(jsonb_build_object('at', m.sent_at, 'who', 'lead', 'excerpt', left(coalesce(m.content, ''), 160))
                order by m.sent_at desc) as inbound_ev
    from public.wa_messages m
    where m.direction = 'inbound' and m.deleted_at is null
      and m.sent_at >= now() - (p_window_hours || ' hours')::interval
      and m.conversation_id in (select conv_id from base)
    group by m.conversation_id
  ),
  appt as (
    select a.lead_id,
      bool_or(a.scheduled_date >= current_date and a.status = 'agendado') as has_future_appt,
      bool_or(a.no_show_em is not null and a.no_show_em >= now() - interval '30 days') as recent_no_show,
      bool_or(a.cancelado_em is not null and a.cancelado_em >= now() - interval '30 days') as recent_cancel,
      max(a.scheduled_date) filter (where a.scheduled_date < current_date or a.status = 'finalizado') as last_past_date
    from public.appointments a
    where a.clinic_id = v_clinic and a.deleted_at is null
      and a.lead_id in (select lead_id from base where lead_id is not null)
    group by a.lead_id
  ),
  campaign as (
    select o.conversation_id, bool_or(o.broadcast_id is not null) as has_broadcast
    from public.wa_outbox o
    where o.clinic_id = v_clinic and o.broadcast_id is not null and o.status = 'sent'
      and o.conversation_id in (select conv_id from base)
    group by o.conversation_id
  ),
  blk as (
    select distinct regexp_replace(coalesce(phone, ''), '\D', '', 'g') as nphone
    from public.wa_phone_blacklist
    where clinic_id = v_clinic
      and regexp_replace(coalesce(phone, ''), '\D', '', 'g') <> ''
  ),
  sig as (
    select
      b.*,
      lh.last_human_at,
      ri.itext, ri.inbound_ev,
      ap.has_future_appt, ap.recent_no_show, ap.recent_cancel, ap.last_past_date,
      cp.has_broadcast,
      (blk.nphone is not null) as in_blacklist,
      round((extract(epoch from now() - coalesce(b.last_inbound_at, b.last_message_at)) / 3600.0)::numeric, 1) as hrs_inbound,
      round((extract(epoch from now() - b.last_message_at) / 3600.0)::numeric, 1) as hrs_msg,
      (b.last_message_at >= now() - (p_window_hours || ' hours')::interval) as within_window,
      (b.last_inbound_at is not null
        and b.last_inbound_at > coalesce(lh.last_human_at, 'epoch'::timestamptz)) as patient_last_no_human,
      coalesce(ri.itext, '') ~ 'valor|pre[çc]o|quanto|custa|or[çc]amento|investimento|parcel|pix|cart[ãa]o' as asked_price,
      coalesce(ri.itext, '') ~ 'hor[áa]rio|agenda|tem vaga|quando|dispon[íi]vel|marcar|agendar|consulta' as asked_avail,
      coalesce(ri.itext, '') ~ 'caro|vou pensar|n[ãa]o tenho dinheiro|mais barato|desconto|achei alto|depois eu vejo' as objection,
      coalesce(ri.itext, '') ~ 'tenho interesse|quero|gostei|me chama|como fa[çc]o|pode me passar' as interest,
      coalesce(ri.itext, '') ~ 'pare|n[ãa]o quero|remover|sair|n[ãa]o me chama|n[ãa]o tenho interesse|descadastr' as said_stop
    from base b
    left join last_human lh on lh.conversation_id = b.conv_id
    left join recent_inbound ri on ri.conversation_id = b.conv_id
    left join appt ap on ap.lead_id = b.lead_id
    left join campaign cp on cp.conversation_id = b.conv_id
    left join blk on blk.nphone = b.nphone and b.nphone <> ''
  ),
  sig2 as (
    select s.*,
      (s.in_blacklist or coalesce(s.wa_opt_in, true) = false or s.said_stop) as is_optout
    from sig s
  ),
  findings as (
    -- TERMINAL: opt-out (score 0 · nunca sugere recuperação)
    select conv_id, 'stop_or_optout_do_not_contact'::text as ftype, 0 as score, 'P3'::text as prio,
           'opt-out / blacklist / paciente pediu parar'::text as reason
      from sig2 where is_optout
    union all
    select conv_id, 'no_human_reply',
           case when hrs_inbound <= 4 then 95 when hrs_inbound <= 12 then 85 else 75 end,
           case when hrs_inbound <= 4 then 'P0' when hrs_inbound <= 24 then 'P1' else 'P2' end,
           'paciente falou por último sem resposta humana há ' || hrs_inbound || 'h'
      from sig2 where not is_optout and within_window and patient_last_no_human
    union all
    select conv_id, 'late_reply',
           case when hrs_inbound > 4 and (asked_price or asked_avail) then 88 when hrs_inbound > 12 then 70 else 50 end,
           case when hrs_inbound > 4 and (asked_price or asked_avail) then 'P0' when hrs_inbound > 12 then 'P1' else 'P2' end,
           'resposta atrasada (' || hrs_inbound || 'h) com paciente aguardando'
      from sig2 where not is_optout and within_window and patient_last_no_human and hrs_inbound > 4
    union all
    select conv_id, 'asked_price_no_close',
           case when hrs_inbound <= 24 then 90 else 65 end,
           case when hrs_inbound <= 24 then 'P0' else 'P1' end,
           'paciente perguntou preço e não foi conduzido ao fechamento'
      from sig2 where not is_optout and within_window and asked_price and not coalesce(has_future_appt, false)
    union all
    select conv_id, 'asked_availability_no_booking',
           case when hrs_inbound <= 24 then 90 else 65 end,
           case when hrs_inbound <= 24 then 'P0' else 'P1' end,
           'paciente pediu horário e não há agendamento futuro confirmado'
      from sig2 where not is_optout and within_window and asked_avail and not coalesce(has_future_appt, false)
    union all
    select conv_id, 'price_objection_not_handled', 70, 'P1',
           'objeção de preço sem tratamento'
      from sig2 where not is_optout and within_window and objection
    union all
    select conv_id, 'lead_interest_ignored',
           case when patient_last_no_human then 80 else 60 end,
           case when patient_last_no_human then 'P1' else 'P2' end,
           'lead demonstrou interesse e não foi conduzido'
      from sig2 where not is_optout and within_window and interest
    union all
    select conv_id, 'campaign_responded_not_closed', 80, 'P1',
           'respondeu campanha e ficou sem follow-up de fechamento'
      from sig2 where not is_optout and has_broadcast and patient_last_no_human
    union all
    select conv_id, 'no_follow_up',
           case when hrs_msg between 24 and 48 then 58 else 45 end, 'P2',
           'conversa esfriou há ' || hrs_msg || 'h sem follow-up'
      from sig2 where not is_optout and hrs_msg between 24 and 72
    union all
    select conv_id, 'no_show_recovery', 85, 'P1',
           'no-show sem recuperação / reagendamento'
      from sig2 where not is_optout and recent_no_show and not coalesce(has_future_appt, false)
    union all
    select conv_id, 'reschedule_not_completed', 75, 'P1',
           'cancelamento sem novo agendamento futuro'
      from sig2 where not is_optout and recent_cancel and not coalesce(has_future_appt, false)
    union all
    select conv_id, 'post_consult_no_followup', 60, 'P2',
           'pós-consulta sem follow-up de fechamento'
      from sig2 where not is_optout and last_past_date is not null
        and not coalesce(has_future_appt, false) and patient_last_no_human
  ),
  agg as (
    select conv_id,
      array_agg(distinct ftype) as all_ftypes,
      (array_agg(ftype order by score desc, ftype asc))[1] as primary_ftype,
      max(score) as top_score,
      (array_agg(prio order by score desc, ftype asc))[1] as primary_prio,
      (array_agg(reason order by score desc, ftype asc))[1] as primary_reason
    from findings
    group by conv_id
  )
  select
    s.conv_id, s.lead_id, s.lead_name::text, s.phone::text, s.inbox_role::text, s.context_type::text,
    a.primary_ftype::text, a.all_ftypes::text[],
    a.primary_reason::text, a.primary_prio::text, a.top_score,
    coalesce(s.phase, s.lead_funnel, s.conv_funnel)::text as stage_hint,
    s.last_message_at, s.last_inbound_at,
    nullif(greatest(coalesce(s.last_human_at, 'epoch'::timestamptz), coalesce(s.last_lara_at, 'epoch'::timestamptz)), 'epoch'::timestamptz) as last_outbound_at,
    s.last_human_at, s.last_lara_at,
    s.hrs_inbound, s.hrs_msg,
    coalesce(s.inbound_ev, '[]'::jsonb) as evidence,
    s.is_optout,
    'lara_recovery_candidates'::text as source
  from agg a
  join sig2 s on s.conv_id = a.conv_id
  where (p_include_optout or not s.is_optout)
  order by a.top_score desc, s.last_inbound_at desc nulls last
  limit greatest(coalesce(p_limit, 100), 1);
end;
$function$;

-- GRANTS · read-only · consumida pela API/UI da secretaria (authenticated) + server (service_role)
REVOKE ALL ON FUNCTION public.lara_recovery_candidates(integer, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lara_recovery_candidates(integer, integer, boolean) TO authenticated, service_role;
