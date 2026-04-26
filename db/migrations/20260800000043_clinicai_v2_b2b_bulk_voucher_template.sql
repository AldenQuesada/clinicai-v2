-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-43 · clinicai-v2 · bulk_voucher_enqueued template          ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: zero hardcode · b2b-bulk-voucher-confirm       ║
-- ║ handler tinha texto hardcoded ("Confirmado, X! Vou disparar os N..."). ║
-- ║                                                                          ║
-- ║ Cria event_key + template DB:                                            ║
-- ║   - bucket=parceiros · group=Voucher · ciclo                             ║
-- ║   - vars: parceira_first, count, schedule_msg, painel_parceira          ║
-- ║                                                                          ║
-- ║ Idempotente · ON CONFLICT DO NOTHING.                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Cataloga event_key
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO public.b2b_comm_event_keys
  (clinic_id, key, label, bucket, group_label, recipient_role, trigger_desc, is_system, sort_order)
SELECT c.id,
  'bulk_voucher_enqueued',
  'Lote de vouchers enfileirado',
  'parceiros',
  'Voucher · ciclo',
  'partner',
  'parceira confirmou lote · N vouchers serao despachados',
  true,
  37
  FROM public.clinics c
ON CONFLICT (clinic_id, key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Template default
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO public.b2b_comm_templates
  (clinic_id, event_key, channel, recipient_role, sender_instance, text_template, is_active, priority, notes)
SELECT c.id,
  'bulk_voucher_enqueued',
  'text',
  'partner',
  'mira',
  E'Confirmado, *{parceira_first}*! 🎁\n\nVou disparar os *{count} vouchers* {schedule_msg}.\n\nObrigada pela confiança 💛\n\nAcompanha tudo no seu painel:\n{painel_parceira}',
  true,
  100,
  'Draft inicial mig 800-43 · admin edita no editor'
  FROM public.clinics c
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.b2b_comm_event_keys WHERE key='bulk_voucher_enqueued') THEN
    RAISE EXCEPTION 'ASSERT FAIL: event_key bulk_voucher_enqueued nao seedado';
  END IF;
  RAISE NOTICE '✅ Mig 800-43 OK · bulk_voucher_enqueued event_key + template';
END $$;

COMMIT;
