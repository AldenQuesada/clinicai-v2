-- Tabelas `flipbook_comm_sequences`, `flipbook_comm_sequence_steps` e
-- `flipbook_comm_dispatches` · motor declarativo de sequências de WhatsApp.
--
-- Modelo:
--   sequences      = "Recuperação de carrinho", "Onboarding pós-compra"
--   sequence_steps = passos ordenados (delay + event_key + condição opcional)
--   dispatches     = log idempotente (1 buyer × 1 step = 1 linha)
--
-- Trigger: edge `flipbook-sequences-tick` (cron 15min) varre buyers com
-- status='charge_created' (lead recovery) ou 'converted' (buyer onboarding),
-- compara com steps da sua sequência, e enfileira dispatches due.
--
-- Idempotência: UNIQUE(buyer_id, sequence_id, step_id). Re-execução do tick
-- não duplica dispatches.
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- flipbook_comm_sequences · agrupa steps em jornadas
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flipbook_comm_sequences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,
  trigger_status  text NOT NULL
                  CHECK (trigger_status IN ('charge_created','converted','abandoned')),
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS flipbook_comm_sequences_set_updated_at ON public.flipbook_comm_sequences;
CREATE TRIGGER flipbook_comm_sequences_set_updated_at
  BEFORE UPDATE ON public.flipbook_comm_sequences
  FOR EACH ROW EXECUTE FUNCTION public._flipbook_commerce_set_updated_at();

ALTER TABLE public.flipbook_comm_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flipbook_comm_sequences_authed_all ON public.flipbook_comm_sequences;
CREATE POLICY flipbook_comm_sequences_authed_all
  ON public.flipbook_comm_sequences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- flipbook_comm_sequence_steps · passos individuais de cada sequência
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flipbook_comm_sequence_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id     uuid NOT NULL REFERENCES public.flipbook_comm_sequences(id) ON DELETE CASCADE,
  position        integer NOT NULL,
  delay_minutes   integer NOT NULL CHECK (delay_minutes >= 0),
  event_key       text NOT NULL REFERENCES public.flipbook_comm_event_keys(key) ON UPDATE CASCADE,

  -- exit_condition: SQL fragment opcional avaliado pelo edge antes de despachar.
  -- Se evalua TRUE pro buyer atual, o step é skipped (ex: "buyer ja converteu").
  -- Default NULL = sempre dispara.
  -- Linguagem suportada (parser simples no edge): "buyer.status = converted"
  exit_condition  text,

  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (sequence_id, position)
);

CREATE INDEX IF NOT EXISTS flipbook_comm_sequence_steps_seq_pos_idx
  ON public.flipbook_comm_sequence_steps (sequence_id, position);

DROP TRIGGER IF EXISTS flipbook_comm_sequence_steps_set_updated_at ON public.flipbook_comm_sequence_steps;
CREATE TRIGGER flipbook_comm_sequence_steps_set_updated_at
  BEFORE UPDATE ON public.flipbook_comm_sequence_steps
  FOR EACH ROW EXECUTE FUNCTION public._flipbook_commerce_set_updated_at();

ALTER TABLE public.flipbook_comm_sequence_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flipbook_comm_sequence_steps_authed_all ON public.flipbook_comm_sequence_steps;
CREATE POLICY flipbook_comm_sequence_steps_authed_all
  ON public.flipbook_comm_sequence_steps
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- flipbook_comm_dispatches · log idempotente de mensagens enviadas
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flipbook_comm_dispatches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  buyer_id        uuid NOT NULL REFERENCES public.flipbook_buyers(id) ON DELETE CASCADE,
  sequence_id     uuid REFERENCES public.flipbook_comm_sequences(id) ON DELETE SET NULL,
  step_id         uuid REFERENCES public.flipbook_comm_sequence_steps(id) ON DELETE SET NULL,

  event_key       text NOT NULL REFERENCES public.flipbook_comm_event_keys(key) ON UPDATE CASCADE,
  channel         text NOT NULL DEFAULT 'whatsapp',

  rendered_body   text,                 -- snapshot do body após placeholder resolution
  variables_used  jsonb NOT NULL DEFAULT '{}'::jsonb,

  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','skipped','failed')),
  scheduled_for   timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  error_text      text,

  -- Provider response (Evolution API)
  provider_id     text,                 -- message_id da Evolution
  provider_status text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Idempotência: 1 dispatch por (buyer × step). Steps sequenciais reutilizam buyer.
-- Dispatches transacionais (sem step_id) não são bloqueados por unique.
CREATE UNIQUE INDEX IF NOT EXISTS flipbook_comm_dispatches_buyer_step_unique
  ON public.flipbook_comm_dispatches (buyer_id, step_id)
  WHERE step_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS flipbook_comm_dispatches_status_scheduled_idx
  ON public.flipbook_comm_dispatches (status, scheduled_for)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS flipbook_comm_dispatches_buyer_idx
  ON public.flipbook_comm_dispatches (buyer_id, created_at DESC);

DROP TRIGGER IF EXISTS flipbook_comm_dispatches_set_updated_at ON public.flipbook_comm_dispatches;
CREATE TRIGGER flipbook_comm_dispatches_set_updated_at
  BEFORE UPDATE ON public.flipbook_comm_dispatches
  FOR EACH ROW EXECUTE FUNCTION public._flipbook_commerce_set_updated_at();

ALTER TABLE public.flipbook_comm_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flipbook_comm_dispatches_authed_read ON public.flipbook_comm_dispatches;
CREATE POLICY flipbook_comm_dispatches_authed_read
  ON public.flipbook_comm_dispatches
  FOR SELECT TO authenticated USING (true);

-- Mutations só via service_role (edge functions).

COMMIT;
NOTIFY pgrst, 'reload schema';
