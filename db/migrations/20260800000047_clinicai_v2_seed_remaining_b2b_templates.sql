-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-47 · seed dos 6 templates B2B faltando                    ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-27: auditoria mostrou 6 event_keys catalogados sem ║
-- ║ template. Esta mig cobre TODOS · executa contrato canonico.             ║
-- ║                                                                          ║
-- ║ Cobre:                                                                   ║
-- ║   - partnership_paused (gap 1)                                           ║
-- ║   - partnership_reactivated (gap 2)                                      ║
-- ║   - voucher_opened (gap 3 · partner notification)                        ║
-- ║   - voucher_expired_partner (gap 4 · template parte do fix)              ║
-- ║   - voucher_cap_reached (gap 5 · alerta admin · cap nao bloqueia mais)   ║
-- ║   - quarterly_checkin (gap 6)                                            ║
-- ║                                                                          ║
-- ║ admin_application_received template ja existe · gap 11 e handler-side.  ║
-- ║                                                                          ║
-- ║ Idempotente · ON CONFLICT DO NOTHING.                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

INSERT INTO public.b2b_comm_templates
  (clinic_id, event_key, channel, recipient_role, sender_instance, text_template, is_active, priority, notes)
SELECT c.id, v.event_key, 'text', v.recipient_role, v.sender_instance,
       v.text_template, true, 100, 'Draft inicial mig 800-47 · admin edita no editor'
  FROM public.clinics c
 CROSS JOIN (VALUES
  -- Gap 1 · partnership_paused
  ('partnership_paused', 'partner', 'mira',
   E'Oi {parceira_first}, ainda tô aqui 💛\n\nVi que sua parceria entrou em pausa por agora. Sem cobrança · às vezes a estação pede um respiro mesmo.\n\nQuando quiser reativar é só me chamar. A {clinica_nome} continua com a porta aberta.\n\n— Mira'),
  -- Gap 2 · partnership_reactivated
  ('partnership_reactivated', 'partner', 'mira',
   E'Que bom te ver de volta, {parceira_first}! ✨\n\nSua parceria voltou ao ativo. Já estou pronta pra emitir vouchers e acompanhar suas indicações de novo.\n\nManda *voucher pra Maria 5544...* quando quiser começar.\n\n— Mira'),
  -- Gap 3 · voucher_opened (parceira é avisada quando convidada abre)
  ('voucher_opened', 'partner', 'mira',
   E'{parceira_first}, *{convidada}* abriu o voucher 👀\n\nÉ o primeiro sinal de interesse. Próximos passos dela: agendar avaliação. Te aviso quando rolar.'),
  -- Gap 4 · voucher_expired_partner (parceira sabe que não usou)
  ('voucher_expired_partner', 'partner', 'mira',
   E'{parceira_first}, o voucher de *{convidada}* expirou sem uso 📭\n\nAconteceu · parte do jogo. Se ela ainda quiser, peça pra me mandar mensagem que eu emito de novo (cap mensal permitindo).'),
  -- Gap 5 · voucher_cap_reached (alerta admin · cap virou guia 2026-04-27)
  ('voucher_cap_reached', 'admin', 'mira',
   E'⚠️ *Cap mensal atingido*\n\nA {parceira_nome} acabou de chegar em {voucher_monthly_cap}/{voucher_monthly_cap} vouchers este mês. A Mira NÃO bloqueia · ela continua emitindo se a parceira pedir, só te avisa.\n\nVer painel: /partnerships/{partnership_id}'),
  -- Gap 6 · quarterly_checkin
  ('quarterly_checkin', 'partner', 'mira',
   E'Oi {parceira_first}, passou um trimestre desde nossa última conversa 🌿\n\nFica o convite pra um café virtual ou presencial · queremos ouvir como tá sendo a parceria do seu lado, o que tá funcionando, o que dá pra ajustar.\n\nMe responde aqui um horário que te encaixa essa semana.\n\n— Mirian')
) AS v(event_key, recipient_role, sender_instance, text_template)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERT · 6 templates novos
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.b2b_comm_templates
   WHERE notes LIKE '%mig 800-47%';
  IF v_count < 6 THEN
    RAISE EXCEPTION 'ASSERT FAIL: esperado 6 templates novos, achados %', v_count;
  END IF;
  RAISE NOTICE '✅ Mig 800-47 OK · % templates seedados', v_count;
END $$;

COMMIT;
