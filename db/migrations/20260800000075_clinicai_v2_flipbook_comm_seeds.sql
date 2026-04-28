-- Seeds · event_keys + templates + sequences + steps do funil de venda flipbook.
--
-- Trio respeitado (regra feedback_event_dispatch_trio): event_key + template +
-- sequence_step que dispara, todos no MESMO commit. Templates sem dispatch são
-- bugs invisíveis.
--
-- 8 event_keys, 8 templates, 2 sequences, 8 steps.
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- EVENT KEYS · transacionais (1) + lead recovery (4) + buyer onboarding (3)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.flipbook_comm_event_keys (key, label, category, trigger_desc, is_system, sort_order)
VALUES
  -- transacional · disparado direto pelo webhook Asaas
  ('buyer_purchase_confirmed',
   'Compra confirmada · boas-vindas',
   'transactional',
   'webhook Asaas PAYMENT_CONFIRMED + PAYMENT_RECEIVED',
   true, 10),

  -- sequência de recuperação de carrinho (lead em charge_created sem pagar)
  ('lead_recovery_30min',
   'Recuperação · 30min sem pagar',
   'sequence_lead',
   'buyer.status=charge_created há 30min',
   true, 20),
  ('lead_recovery_6h',
   'Recuperação · 6h sem pagar',
   'sequence_lead',
   'buyer.status=charge_created há 6h',
   true, 21),
  ('lead_recovery_24h',
   'Recuperação · 24h sem pagar (urgência preço)',
   'sequence_lead',
   'buyer.status=charge_created há 24h',
   true, 22),
  ('lead_recovery_72h',
   'Recuperação · 72h última chance',
   'sequence_lead',
   'buyer.status=charge_created há 72h',
   true, 23),

  -- sequência de onboarding pós-compra
  ('buyer_onboarding_d1',
   'Onboarding · check-in D+1',
   'sequence_buyer',
   'buyer.status=converted há 1 dia',
   true, 30),
  ('buyer_onboarding_d7_upsell',
   'Onboarding · upsell Premium D+7',
   'sequence_buyer',
   'buyer.status=converted há 7 dias',
   true, 31),
  ('buyer_onboarding_d30_referral',
   'Onboarding · NPS + indicação D+30',
   'sequence_buyer',
   'buyer.status=converted há 30 dias',
   true, 32)
ON CONFLICT (key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- TEMPLATES · 1 body por event_key (channel=whatsapp, language=pt)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.flipbook_comm_templates (event_key, channel, language, body, variables, is_active)
VALUES
  ('buyer_purchase_confirmed', 'whatsapp', 'pt', E'Olá {{buyer_name}}, sua compra de *{{book_title}}* foi confirmada ✨\n\nAbra seu livro aqui: {{access_link}}\n\nEsse link é seu — não compartilha. Boa leitura!', '["buyer_name","book_title","access_link"]'::jsonb, true),

  ('lead_recovery_30min', 'whatsapp', 'pt', E'Oi {{buyer_name}}, vi que você ia destravar *{{book_title}}* mas o pagamento ainda não chegou. Se travou no PIX, te passo aqui de novo:\n\n{{checkout_link}}', '["buyer_name","book_title","checkout_link"]'::jsonb, true),
  ('lead_recovery_6h', 'whatsapp', 'pt', E'{{buyer_name}}, seu QR-code do *{{book_title}}* expira em 18h. Quer que eu mande uma versão pra copiar e colar?\n\n{{checkout_link}}', '["buyer_name","book_title","checkout_link"]'::jsonb, true),
  ('lead_recovery_24h', 'whatsapp', 'pt', E'{{buyer_name}}, última chance no preço de hoje (R$ {{price}}). Amanhã volta pro valor normal.\n\nGarante seu *{{book_title}}*: {{checkout_link}}', '["buyer_name","book_title","price","checkout_link"]'::jsonb, true),
  ('lead_recovery_72h', 'whatsapp', 'pt', E'{{buyer_name}}, vou parar de te lembrar 🙂 Se mudar de ideia, *{{book_title}}* segue te esperando. Qualquer dúvida, me chama aqui.', '["buyer_name","book_title"]'::jsonb, true),

  ('buyer_onboarding_d1', 'whatsapp', 'pt', E'{{buyer_name}}, conseguiu abrir *{{book_title}}* tranquilo? Qualquer rolo (link não funciona, página não carrega, etc) me responde aqui que eu resolvo.', '["buyer_name","book_title"]'::jsonb, true),
  ('buyer_onboarding_d7_upsell', 'whatsapp', 'pt', E'{{buyer_name}}, já que você curtiu *{{book_title}}*, separei uma oferta exclusiva: Biblioteca Premium com TODOS os meus livros + lançamentos futuros, por R$ {{premium_price}}/mês (preço só pra leitor confirmado).\n\nQuer destravar?\n{{premium_link}}', '["buyer_name","book_title","premium_price","premium_link"]'::jsonb, true),
  ('buyer_onboarding_d30_referral', 'whatsapp', 'pt', E'{{buyer_name}}, 30 dias depois — de 0 a 10, quanto você indicaria *{{book_title}}* pra um amigo?\n\nSe veio gente do seu círculo, te passo 30% de comissão por cada um que comprar pelo seu link: {{referral_link}}', '["buyer_name","book_title","referral_link"]'::jsonb, true)
ON CONFLICT (event_key, channel, language) WHERE is_active = true DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEQUENCES · 2 jornadas
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.flipbook_comm_sequences (name, trigger_status, description, is_active)
VALUES
  ('lead_recovery',
   'charge_created',
   'Recuperação de carrinho · 4 mensagens em 72h até abandonar',
   true),
  ('buyer_onboarding',
   'converted',
   'Onboarding pós-compra · 3 mensagens (D+1 check-in, D+7 upsell Premium, D+30 NPS+referral)',
   true)
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEQUENCE STEPS · ligam sequence + delay + event_key
-- ═══════════════════════════════════════════════════════════════════════════
WITH seq AS (SELECT id, name FROM public.flipbook_comm_sequences)
INSERT INTO public.flipbook_comm_sequence_steps (sequence_id, position, delay_minutes, event_key, exit_condition, is_active)
SELECT seq.id, v.position, v.delay_minutes, v.event_key, v.exit_condition, true
  FROM seq
  CROSS JOIN (VALUES
    -- lead_recovery
    ('lead_recovery', 1, 30,    'lead_recovery_30min',  'buyer.status = converted'),
    ('lead_recovery', 2, 360,   'lead_recovery_6h',     'buyer.status = converted'),
    ('lead_recovery', 3, 1440,  'lead_recovery_24h',    'buyer.status = converted'),
    ('lead_recovery', 4, 4320,  'lead_recovery_72h',    'buyer.status = converted'),
    -- buyer_onboarding
    ('buyer_onboarding', 1, 1440,  'buyer_onboarding_d1',          NULL),
    ('buyer_onboarding', 2, 10080, 'buyer_onboarding_d7_upsell',   NULL),
    ('buyer_onboarding', 3, 43200, 'buyer_onboarding_d30_referral', NULL)
  ) AS v(seq_name, position, delay_minutes, event_key, exit_condition)
 WHERE seq.name = v.seq_name
ON CONFLICT (sequence_id, position) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- ASSERTS
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_keys int; v_tpls int; v_seqs int; v_steps int;
BEGIN
  SELECT count(*) INTO v_keys  FROM public.flipbook_comm_event_keys;
  SELECT count(*) INTO v_tpls  FROM public.flipbook_comm_templates;
  SELECT count(*) INTO v_seqs  FROM public.flipbook_comm_sequences;
  SELECT count(*) INTO v_steps FROM public.flipbook_comm_sequence_steps;

  IF v_keys < 8 OR v_tpls < 8 OR v_seqs < 2 OR v_steps < 7 THEN
    RAISE EXCEPTION 'ASSERT FAIL · event_keys=% templates=% sequences=% steps=%',
      v_keys, v_tpls, v_seqs, v_steps;
  END IF;

  RAISE NOTICE '✅ Seeds OK · % event_keys · % templates · % sequences · % steps',
    v_keys, v_tpls, v_seqs, v_steps;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
