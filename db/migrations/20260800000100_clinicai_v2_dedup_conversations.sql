-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 100 · clinicai-v2 · dedup wa_conversations + UNIQUE guard      ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug 2026-05-03: usuario reportou "msg sai em 2 conversas" (Lara +       ║
-- ║ Secretaria) E "abro Lara, some da Secretaria".                          ║
-- ║                                                                          ║
-- ║ Root cause: 5 pacientes tinham 2 conversations cada com mesmo nº fisico ║
-- ║ mas em 2 phone variants (com e sem o 9 apos DDD · brasil mobile):       ║
-- ║   - 554498787673 (12c) e 5544998787673 (13c) sao o MESMO numero         ║
-- ║   - findActiveByPhoneVariants retornava ora uma ora outra · msg caia    ║
-- ║     em uma, UI mostrava a outra defasada                                ║
-- ║                                                                          ║
-- ║ Fix:                                                                     ║
-- ║   1. Merge das 5 dupes (winner = mais msgs · loser drop)                ║
-- ║      - Move wa_messages, inbox_notifications, wa_outbox refs            ║
-- ║      - DELETE losers · 7 convs deletadas                                ║
-- ║   2. UNIQUE INDEX em (clinic_id, last-8-digits-do-phone)                ║
-- ║      - Previne novas dupes · Postgres bloqueia INSERT duplicado         ║
-- ║      - Index parcial WHERE phone IS NOT NULL                            ║
-- ║                                                                          ║
-- ║ Aplicado in-place em prod 2026-05-03 antes desta mig oficial.           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_conv_clinic_phone_last8
  ON public.wa_conversations (clinic_id, (right(regexp_replace(phone, '\D', '', 'g'), 8)))
  WHERE phone IS NOT NULL;

COMMENT ON INDEX public.uq_wa_conv_clinic_phone_last8 IS
  'Mig 100 · previne 2 convs pro mesmo paciente em phone variants distintos (com/sem 9 apos DDD). Match por last 8 digits · scope clinic_id (multi-tenant safe).';
