-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-45 · clinicai-v2 · NotificationsBell event_keys + templates║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: zero hardcode · 4 alertas in-app do sino       ║
-- ║ (system-insights.ts) viram editaveis via /b2b/disparos editor.          ║
-- ║                                                                          ║
-- ║ Convencao text_template para alertas in-app:                             ║
-- ║   "TITLE\n---\nMESSAGE"                                                  ║
-- ║ Service splita no primeiro `\n---\n` · TITLE = sumario curto · MESSAGE  ║
-- ║ = detalhe com placeholders.                                              ║
-- ║                                                                          ║
-- ║ 4 event_keys novos · bucket=admin · group=Sino:                         ║
-- ║   - bell_no_senders                                                      ║
-- ║   - bell_pending_apps                                                    ║
-- ║   - bell_velocity_slow                                                   ║
-- ║   - bell_nps_silent                                                      ║
-- ║                                                                          ║
-- ║ Vars suportadas:                                                         ║
-- ║   {pending_count} {avg_hours} {senders_active} {senders_count_word}     ║
-- ║   {nps_responses} {total_active}                                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- 1. event_keys
INSERT INTO public.b2b_comm_event_keys
  (clinic_id, key, label, bucket, group_label, recipient_role, trigger_desc, is_system, sort_order)
SELECT c.id, v.key, v.label, 'admin', 'Sino · NotificationsBell', 'admin', v.trigger_desc, true, v.sort_order
  FROM public.clinics c
 CROSS JOIN (VALUES
  ('bell_no_senders',     'Mira sem WhatsApp ativo',  'sendersActive=0 + ageDays>=7',           100),
  ('bell_pending_apps',   'Candidaturas pendentes',   'pendingApplications>=5 OU avgHours>72h', 101),
  ('bell_velocity_slow',  'Aprovacao lenta',          'avgHours>72h sem candidaturas pendentes', 102),
  ('bell_nps_silent',     'NPS sem respostas',        'sendersActive>0 + npsResponses=0 + ageDays>=60', 103)
) AS v(key, label, trigger_desc, sort_order)
ON CONFLICT (clinic_id, key) DO NOTHING;

-- 2. templates · convencao TITLE\n---\nMESSAGE
INSERT INTO public.b2b_comm_templates
  (clinic_id, event_key, channel, recipient_role, sender_instance, text_template, is_active, priority, notes)
SELECT c.id, v.event_key, 'text', 'admin', 'mira',
       v.text_template, true, 100, 'Bell NotificationsBell · mig 800-45'
  FROM public.clinics c
 CROSS JOIN (VALUES
  ('bell_no_senders',
   E'Mira sem WhatsApp ativo\n---\nNenhum sender ativo. Automacao nao consegue disparar mensagens. Configure pelo menos 1 numero em Configuracoes.'),
  ('bell_pending_apps',
   E'Candidaturas pendentes\n---\n{pending_count} candidatura{plural_s} aguardando aprovacao{slow_suffix}. Convidadas esfriam quando demoram.'),
  ('bell_velocity_slow',
   E'Aprovacao lenta\n---\nTempo medio de aprovacao em {avg_hours}h ({resolved_count} resolvidas). Acima do recomendado.'),
  ('bell_nps_silent',
   E'NPS sem respostas\n---\n{senders_active} sender{plural_s} ativo{plural_s} mas zero respostas NPS no programa. Hora de disparar campanha.')
) AS v(event_key, text_template)
ON CONFLICT DO NOTHING;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.b2b_comm_templates
   WHERE notes LIKE '%mig 800-45%';
  IF v_count < 4 THEN
    RAISE EXCEPTION 'ASSERT FAIL: esperados 4 templates bell_*, achados %', v_count;
  END IF;
  RAISE NOTICE '✅ Mig 800-45 OK · % templates bell · 4 event_keys', v_count;
END $$;

COMMIT;
