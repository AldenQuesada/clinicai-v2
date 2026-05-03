-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 104 · clinicai-v2 · drop trigger zumbi vpi_detect_*           ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug 2026-05-03 (continuacao): mig 95 dropou vpi_celebrations CASCADE,  ║
-- ║ mas a trigger _vpi_detect_celebration_consent eh em wa_messages (nao   ║
-- ║ vpi_celebrations) · CASCADE nao a derrubou. Trigger continua ativa e   ║
-- ║ tenta UPDATE public.vpi_celebrations SET consent_asked_at... toda vez ║
-- ║ que chega inbound com content em ('sim','pode','claro','libero',etc).  ║
-- ║                                                                          ║
-- ║ Sintoma especifico: Fatima Haupt respondeu "Sim" para confirmacao      ║
-- ║ de consulta · webhook chamou saveInbound → trigger AFTER INSERT        ║
-- ║ falhou com "column consent_asked_at does not exist" → INSERT rolled    ║
-- ║ back · last_message_text='Sim' bumped antes pelo Cloud webhook (ainda  ║
-- ║ sem abort logic na epoca) · ficou orfao.                                ║
-- ║                                                                          ║
-- ║ Fix:                                                                     ║
-- ║   1. Drop trigger trg_vpi_detect_celebration_consent (sim/pode/claro)  ║
-- ║   2. Drop trigger trg_vpi_detect_reaction (emojis ❤️🎉🙏✨)              ║
-- ║   3. Drop functions correspondentes                                     ║
-- ║                                                                          ║
-- ║ Lesson learned (3a vez): DROP TABLE CASCADE nao derruba triggers em    ║
-- ║ OUTRAS tabelas que referenciam a tabela dropada no body. Pre-DROP      ║
-- ║ varrer pg_proc.prosrc ILIKE '%nome_tabela%'.                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_vpi_detect_celebration_consent ON public.wa_messages;
DROP TRIGGER IF EXISTS trg_vpi_detect_reaction              ON public.wa_messages;
DROP FUNCTION IF EXISTS public._vpi_detect_celebration_consent() CASCADE;
DROP FUNCTION IF EXISTS public._vpi_detect_reaction()             CASCADE;

-- Backfill da Fatima · "Sim" perdido no incidente 2026-05-03 14:51 UTC.
-- Conv c153ffab... ja tem last_message_text='Sim' bumped pelo webhook · sincroniza wa_messages.
INSERT INTO public.wa_messages (
  id, clinic_id, conversation_id, phone, direction, sender,
  content, content_type, status, channel, sent_at, created_at
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'c153ffab-d334-4f15-828c-2e9783cd33a1'::uuid,
  '5544999098861',
  'inbound',
  'user',
  'Sim',
  'text',
  'received',
  'evolution',
  '2026-05-03T14:51:40.858+00:00'::timestamptz,
  '2026-05-03T14:51:40.858+00:00'::timestamptz
WHERE NOT EXISTS (
  SELECT 1 FROM public.wa_messages
  WHERE conversation_id = 'c153ffab-d334-4f15-828c-2e9783cd33a1'::uuid
    AND content = 'Sim'
    AND direction = 'inbound'
);
