-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-44 · clinicai-v2 · monthly_report template alinhado       ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ O template DB monthly_report tinha vars especulativas (opened,          ║
-- ║ scheduled, attended, rank_position, etc) que o cron mira-monthly-       ║
-- ║ partner-feedback nao calcula. Resultado: cron usava texto hardcoded.    ║
-- ║                                                                          ║
-- ║ Esta mig UPDATE o template pra usar somente vars que MonthlyConversionRow║
-- ║ entrega (RPC b2b_partner_conversion_monthly_all):                       ║
-- ║   {parceira_first} {parceira_name} {period_label} {is_image_partner_emoji}║
-- ║   {issued} {purchased} {conv_pct} {issued_prev} {conv_pct_prev}        ║
-- ║   {delta_issued_label} {delta_conv_label}                               ║
-- ║                                                                          ║
-- ║ Cron passa agora a usar template DB (zero hardcode).                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

UPDATE public.b2b_comm_templates
   SET text_template = E'Olá! Resumo da parceria em *{period_label}* 📊\n\n*{parceira_name}*{is_image_partner_emoji}\n\n🎟 Vouchers emitidos: *{issued}*\nvs mês anterior: {delta_issued_label}\n\n💰 Conversão total: *{conv_pct}%*\n{purchased} virou compra de {issued} emitidos\nvs mês anterior: {delta_conv_label}\n\nObrigada pela parceria 💛',
       updated_at = now(),
       notes = COALESCE(notes, '') || ' · alinhado mig 800-44'
 WHERE event_key = 'monthly_report'
   AND partnership_id IS NULL;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.b2b_comm_templates
   WHERE event_key='monthly_report' AND notes LIKE '%mig 800-44%';
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ASSERT FAIL: monthly_report nao foi atualizado';
  END IF;
  RAISE NOTICE '✅ Mig 800-44 OK · % template(s) monthly_report alinhado(s)', v_count;
END $$;

COMMIT;
