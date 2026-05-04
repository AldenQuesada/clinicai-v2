-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 109 · clinicai-v2 · drop UNIQUE legacy phone_active            ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug 2026-05-04: msg do Alden (5544998787673) pra Lara (554499588773)    ║
-- ║ não criava conv. Diagnose: conversations.create() retornava null por    ║
-- ║ duplicate key violation no UNIQUE legacy:                                ║
-- ║   idx_wa_conv_phone_active · UNIQUE (clinic_id, phone) WHERE status=active║
-- ║                                                                          ║
-- ║ Conv da926b5c já existia (clinic, phone='5544998787673', Mih, active).   ║
-- ║ Tentar criar (clinic, phone='5544998787673', Lara, active) batia no     ║
-- ║ UNIQUE legacy · INSERT rejeitado · webhook retornava null silencioso.   ║
-- ║                                                                          ║
-- ║ Mig 101 já criou UNIQUE correto incluindo wa_number_id no scope:        ║
-- ║   uq_wa_conv_clinic_phone_wn_last8 · (clinic, wa_number_id, last8 phone)║
-- ║                                                                          ║
-- ║ Esse permite 2 convs (Mih + Lara) pro mesmo paciente. MAS o legacy nao  ║
-- ║ foi dropado · ainda blocking.                                            ║
-- ║                                                                          ║
-- ║ Esta mig dropa o legacy. UNIQUE per-channel (mig 101) continua ativo.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP INDEX IF EXISTS public.idx_wa_conv_phone_active;
NOTIFY pgrst, 'reload schema';
