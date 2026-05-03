-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 96 · clinicai-v2 · inbox_role='b2b' · desencruzar Mira vs Lara ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Audit 2026-05-03: 3 wa_numbers da Mira/B2B estavam marcados 'sdr' por    ║
-- ║ engano · 4 conversations de parceiros B2B (Flavia, Léo, Marct, Osvaldo)  ║
-- ║ apareciam em /conversas (Lara) erradamente.                              ║
-- ║                                                                          ║
-- ║ Estende CHECK constraint pra aceitar 'b2b' e atualiza os 3 nº + convs.   ║
-- ║                                                                          ║
-- ║ Pos-fix:                                                                 ║
-- ║   - /conversas (sdr)        : so leads Lara via Cloud API (554499588773) ║
-- ║   - /secretaria (secretaria): pacientes via Mih (5544991622986)         ║
-- ║   - app Mira /partnerships  : convs b2b (filtro app proprio)             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.wa_numbers DROP CONSTRAINT IF EXISTS wa_numbers_inbox_role_check;
ALTER TABLE public.wa_numbers ADD CONSTRAINT wa_numbers_inbox_role_check
  CHECK (inbox_role IN ('sdr', 'secretaria', 'b2b'));

ALTER TABLE public.wa_conversations DROP CONSTRAINT IF EXISTS wa_conversations_inbox_role_check;
ALTER TABLE public.wa_conversations ADD CONSTRAINT wa_conversations_inbox_role_check
  CHECK (inbox_role IN ('sdr', 'secretaria', 'b2b'));

-- Update os 3 wa_numbers Mira/B2B
UPDATE public.wa_numbers SET inbox_role = 'b2b', updated_at = now()
 WHERE id IN (
   '42bc681f-e73c-435a-a8f7-1bc45c0460ea',  -- Mira Marci (5544991681891)
   'ba402890-409c-40e0-974b-f56cedb872f8',  -- Canal auxiliar (5544998782003)
   '8f33e269-b1c4-4d3d-8e5b-3a11f8adf7db'   -- Mira onboarding + B2B (5544998787673)
 );

-- Sync wa_conversations existentes (trigger so dispara quando wa_number_id muda,
-- nao quando wa_numbers.inbox_role muda · UPDATE manual aqui)
UPDATE public.wa_conversations SET inbox_role = 'b2b'
 WHERE wa_number_id IN (
   '42bc681f-e73c-435a-a8f7-1bc45c0460ea',
   'ba402890-409c-40e0-974b-f56cedb872f8',
   '8f33e269-b1c4-4d3d-8e5b-3a11f8adf7db'
 );
