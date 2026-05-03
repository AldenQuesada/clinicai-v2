-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 101 · clinicai-v2 · conv UNIQUE por canal (wa_number)          ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug 2026-05-03: conv "rodava" entre /conversas (Lara) e /secretaria     ║
-- ║ conforme paciente/admin mandasse via Lara Cloud OU Mih.                  ║
-- ║                                                                          ║
-- ║ Root cause: UNIQUE INDEX (mig 100) era (clinic_id, last8) sem canal.    ║
-- ║ Forçava 1 conv por paciente · setWaNumber atualizava ela ao detectar    ║
-- ║ wa_number_id divergente · resultado: oscilação entre inboxes.           ║
-- ║                                                                          ║
-- ║ Fix:                                                                     ║
-- ║   - Drop UNIQUE antigo (clinic, last8)                                  ║
-- ║   - Cria UNIQUE (clinic, wa_number_id, last8) WHERE phone IS NOT NULL   ║
-- ║     AND wa_number_id IS NOT NULL                                         ║
-- ║   - Permite 2 convs pro mesmo paciente em canais diferentes             ║
-- ║   - resolveConversation scopeada por waNumberId no lookup               ║
-- ║                                                                          ║
-- ║ Aplicado in-place em prod.                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP INDEX IF EXISTS public.uq_wa_conv_clinic_phone_last8;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_conv_clinic_phone_wn_last8
  ON public.wa_conversations (
    clinic_id,
    wa_number_id,
    (right(regexp_replace(phone, '\D', '', 'g'), 8))
  )
  WHERE phone IS NOT NULL AND wa_number_id IS NOT NULL;

COMMENT ON INDEX public.uq_wa_conv_clinic_phone_wn_last8 IS
  'Mig 101 · 1 conv por (clinic, canal, paciente). Permite paciente ter convs separadas em Lara Cloud + Mih + outros wa_numbers · histórico não cruza.';
