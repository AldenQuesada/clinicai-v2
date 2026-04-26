-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-42 · clinicai-v2 · seed templates GAP (port hardcoded)    ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: zerar hardcode · todas mensagens em DB.        ║
-- ║                                                                          ║
-- ║ Seeds: 13 templates novos cobrindo gaps:                                 ║
-- ║   - voucher_issued_partner · port LITERAL de b2b-mira-router/index.ts   ║
-- ║   - voucher_validity_reminder, no_show_recovery, post_attendance,       ║
-- ║     post_purchase_upsell · drafts curtos (admin edita depois)           ║
-- ║   - admin_health_red_alert, cap_exceeded, application_received,         ║
-- ║     nps_excellent, high_impact · drafts pra Mirian (port system-insights)║
-- ║   - admin_daily_top_insight, activity_reminders, monthly_partner_digest ║
-- ║     · drafts dos digests cron                                           ║
-- ║                                                                          ║
-- ║ Variaveis suportadas (lidas via renderTemplate na fase B):              ║
-- ║   {parceira} {parceira_first} {convidada} {convidada_first}             ║
-- ║   {combo} {expira_em} {token} {link} {painel_parceira}                  ║
-- ║   {mes} {vouchers_mes} {vouchers_abertos} {cap} {procedimento}          ║
-- ║   {appointment_at} {parceria_count} {alerta_msg}                        ║
-- ║                                                                          ║
-- ║ Idempotente · ON CONFLICT (clinic_id, partnership_id, event_key,        ║
-- ║ recipient_role, channel) DO NOTHING.                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- Helper · garantir uniqueness compound key existente
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint con
      JOIN pg_class c ON c.oid=con.conrelid
     WHERE c.relname='b2b_comm_templates'
       AND con.contype='u'
       AND pg_get_constraintdef(con.oid) ~ 'event_key'
  ) THEN
    -- Sem unique compound · adiciona pra ON CONFLICT funcionar
    BEGIN
      ALTER TABLE public.b2b_comm_templates
        ADD CONSTRAINT b2b_comm_templates_event_role_channel_uniq
        UNIQUE NULLS NOT DISTINCT (clinic_id, partnership_id, event_key, recipient_role, channel);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'unique constraint ja existe ou colisao · pulando';
    END;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- Seed: voucher_issued_partner (parceiros · oficial port literal)
-- Port de C:/Users/Dr.Quesada/Documents/clinic-dashboard/supabase/functions/
-- b2b-mira-router/index.ts linhas 508-516.
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO public.b2b_comm_templates
  (clinic_id, event_key, channel, recipient_role, sender_instance, text_template, is_active, priority, notes)
SELECT c.id,
  'voucher_issued_partner',
  'text',
  'partner',
  'mira',
  E'✨ *Voucher enviado para {convidada}*\n\nAcabei de entregar o presente direto no WhatsApp dela, com o link, as orientações e o prazo de validade. Já pode descansar — o fio agora corre com a gente.\n\nAssim que ela abrir ou agendar, te aviso por aqui.\n\n📊 *Acompanhe em tempo real no seu painel:*\n{painel_parceira}\n\n{parceira_first}, obrigada pela confiança de sempre 💜\n— *Mira*, da Clínica Mirian de Paula',
  true,
  100,
  'Port literal de b2b-mira-router legacy (mig 800-42)'
  FROM public.clinics c
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- Seed: convidadas · ciclo de vida (4 templates draft)
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO public.b2b_comm_templates
  (clinic_id, event_key, channel, recipient_role, sender_instance, text_template, is_active, priority, notes)
SELECT c.id, v.event_key, 'text', 'beneficiary', 'mih',
       v.text_template, true, 100, 'Draft inicial mig 800-42 · admin edita no editor'
  FROM public.clinics c
 CROSS JOIN (VALUES
  ('voucher_validity_reminder',
   E'Oi {convidada_first}! 💛\n\nSeu voucher cortesia da {parceira} expira em *{expira_em}*. Bora reservar um horário antes de perder?\n\nTá aqui pra ajudar: {link}'),
  ('voucher_no_show_recovery',
   E'Oi {convidada_first}, tudo bem? 🤍\n\nVi que você teve um imprevisto e não conseguiu vir. Sem problema · acontece. Quer remarcar com a gente? Tenho horários novos abrindo.\n\nMe chama por aqui que eu te ajusto direitinho.'),
  ('voucher_post_attendance',
   E'Oi {convidada_first}! ✨\n\nObrigada por vir até a gente hoje. Espero que tenha se sentido bem cuidada.\n\nQualquer dúvida sobre o que conversamos, é só me chamar. A {parceira} também tá feliz que você veio.\n\nUm beijo!'),
  ('voucher_post_purchase_upsell',
   E'Oi {convidada_first}! 💎\n\nQue alegria saber que você seguiu com a gente. A Mirian fica muito feliz quando uma indicação da {parceira} vira família.\n\nNo seu próximo retorno, posso te apresentar nosso protocolo {combo}? Ele complementa lindamente o que você já fez.\n\nSem pressa · só quando fizer sentido pra você.')
) AS v(event_key, text_template)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- Seed: admin · alertas (5 templates) + digest (3 templates)
-- recipient_role='admin' · sender_instance='mira'
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO public.b2b_comm_templates
  (clinic_id, event_key, channel, recipient_role, sender_instance, text_template, is_active, priority, notes)
SELECT c.id, v.event_key, 'text', 'admin', 'mira',
       v.text_template, true, 100, 'Draft inicial mig 800-42 · admin edita no editor'
  FROM public.clinics c
 CROSS JOIN (VALUES
  -- ─── Alertas (5) ───────────────────────────────────────────────────
  ('admin_health_red_alert',
   E'🚨 *Saúde crítica · {parceira}*\n\nA parceria com a {parceira} está em saúde vermelha. Vale uma ligação ou aplicar o playbook de retenção esta semana.\n\nDetalhes no painel: /partnerships/{partnership_id}'),
  ('admin_cap_exceeded',
   E'🚦 *Cap mensal estourado · {parceira}*\n\nO custo dos vouchers já passou de *R$ {cap}* este mês na parceria com a {parceira}. Vale revisar combo ou pausar emissão.'),
  ('admin_application_received',
   E'📨 *Candidatura nova*\n\nUma candidata acabou de entrar pelo formulário. Bora avaliar antes que ela esfrie?\n\nVer em /b2b/candidaturas'),
  ('admin_nps_excellent',
   E'⭐ *NPS excelente · {parceira}*\n\nA {parceira} respondeu o NPS com nota alta. Momento perfeito pra reforçar a parceria ou propor upgrade pra parceria de imagem.'),
  ('admin_high_impact',
   E'💎 *Alto impacto · {parceira}*\n\nA {parceira} já converteu *{vouchers_mes} vouchers* em pacientes este mês. Considere parceria de imagem · ela tá entregando muito.'),
  -- ─── Digest (3) ────────────────────────────────────────────────────
  ('admin_daily_top_insight',
   E'☀️ *Bom dia, Mirian*\n\n{alerta_msg}'),
  ('admin_activity_reminders',
   E'📋 *Atividades de parcerias · próximas 48h*\n\n{alerta_msg}'),
  ('admin_monthly_partner_digest',
   E'📊 *Fechamento de {mes}*\n\n{alerta_msg}')
) AS v(event_key, text_template)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERTS · esperamos +13 templates novos
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.b2b_comm_templates;
  IF v_count < 25 THEN
    RAISE EXCEPTION 'ASSERT FAIL: esperados >= 25 templates apos seed, achados %', v_count;
  END IF;
  RAISE NOTICE '✅ Mig 800-42 OK · total templates: %', v_count;
END $$;

COMMIT;
