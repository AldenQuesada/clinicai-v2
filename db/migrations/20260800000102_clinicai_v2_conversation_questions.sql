-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 102 · clinicai-v2 · Consultoria Mirian inline                  ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Sprint 1 do roadmap /secretaria · resolve "secretaria sobe na sala da   ║
-- ║ Dra. a cada 30min pra tirar dúvida".                                    ║
-- ║                                                                          ║
-- ║ Fluxo:                                                                   ║
-- ║   1. Secretaria clica "Pedir ajuda da Dra." em conv aberta              ║
-- ║   2. IA gera contexto + sugere resposta (cache numa pergunta)           ║
-- ║   3. Dra. abre /dra/perguntas (mobile) · ve fila pendente               ║
-- ║   4. Dra. responde · final_answer salva                                  ║
-- ║   5. Secretaria recebe notif · card destacado no chat com resposta      ║
-- ║   6. Secretaria edita ou envia direto                                    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS public.conversation_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,

  asked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  asked_at timestamptz NOT NULL DEFAULT now(),
  question text NOT NULL,

  -- Snapshot do contexto na hora da pergunta (3 ultimas msgs + perfil do lead)
  -- evita query pesada na hora da Dra. responder · imutavel apos criar
  context_snapshot text,

  -- IA sugere resposta logo na criacao · Dra. edita ou aprova
  suggested_answer text,
  suggested_at timestamptz,

  answered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  answered_at timestamptz,
  final_answer text,

  -- 'pending' (aguarda Dra) · 'answered' (Dra respondeu, secretaria nao usou)
  -- 'used' (secretaria enviou pro paciente) · 'discarded' (secretaria descartou)
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'answered', 'used', 'discarded')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_q_status_clinic
  ON public.conversation_questions (clinic_id, status, asked_at DESC);

CREATE INDEX IF NOT EXISTS idx_conv_q_conversation
  ON public.conversation_questions (conversation_id, created_at DESC);

ALTER TABLE public.conversation_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conv_q_select_own_clinic ON public.conversation_questions;
CREATE POLICY conv_q_select_own_clinic ON public.conversation_questions FOR SELECT
  TO authenticated USING (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS conv_q_insert_own_clinic ON public.conversation_questions;
CREATE POLICY conv_q_insert_own_clinic ON public.conversation_questions FOR INSERT
  TO authenticated WITH CHECK (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS conv_q_update_own_clinic ON public.conversation_questions;
CREATE POLICY conv_q_update_own_clinic ON public.conversation_questions FOR UPDATE
  TO authenticated USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT, UPDATE ON public.conversation_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_questions TO service_role;
