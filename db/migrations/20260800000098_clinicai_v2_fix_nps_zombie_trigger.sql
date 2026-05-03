-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 98 · clinicai-v2 · fix trigger zumbi nps_parse_inbound         ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug 2026-05-03: mig 95 dropou nps_responses como UNUSED em codigo,      ║
-- ║ MAS havia trigger trg_nps_parse_inbound em wa_messages chamando         ║
-- ║ public.nps_parse_inbound() que INSERT-ava na tabela dropada.            ║
-- ║                                                                          ║
-- ║ Sintoma: todas as mensagens inbound do webhook /whatsapp-evolution      ║
-- ║ falhavam silenciosamente (saveInbound retornava null por erro de       ║
-- ║ trigger AFTER INSERT). last_message_at atualizava (updateLastMessage    ║
-- ║ nao dispara trigger) mas wa_messages ficava sem o registro.            ║
-- ║                                                                          ║
-- ║ Fix:                                                                     ║
-- ║   1. Drop trigger zumbi (ja aplicado em prod 2026-05-03)                ║
-- ║   2. Re-criar nps_responses como tabela vazia · ainda referenciada      ║
-- ║      por 19 RPCs B2B (relatorios NPS) que dependem dela mesmo se a    ║
-- ║      feature NPS legacy nao roda mais. Schema minimalista compativel.  ║
-- ║                                                                          ║
-- ║ Lesson learned: antes de DROP TABLE, varrer pg_proc + pg_trigger pra    ║
-- ║ achar dependencias que nao aparecem em codigo TS.                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP TRIGGER IF EXISTS trg_nps_parse_inbound ON public.wa_messages;
DROP FUNCTION IF EXISTS public.nps_parse_inbound() CASCADE;

-- Re-cria nps_responses vazia · evita ERROR em 19 RPCs B2B que ainda
-- selecionam dela. Schema minimalista (compativel com queries legacy).
CREATE TABLE IF NOT EXISTS public.nps_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  phone         text,
  score         integer,
  comment       text,
  source        text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nps_responses_select_own_clinic ON public.nps_responses;
CREATE POLICY nps_responses_select_own_clinic ON public.nps_responses FOR SELECT
  TO authenticated USING (clinic_id = public.app_clinic_id());

GRANT SELECT ON public.nps_responses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.nps_responses TO service_role;
