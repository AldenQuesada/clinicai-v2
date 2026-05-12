-- ============================================================================
-- Migration 174 · clinicai-v2 · COMMERCIAL RECOVERY WORKFLOW (DRY-RUN)
-- ============================================================================
--
-- Propósito (CRM_PHASE_2RC.1):
--   Camada de workflow interno sobre commercial_recovery_queue_view (mig 172):
--     - `commercial_recovery_workflow_items` · estado persistente por item
--       (stage, priority override, assigned_to, next_action, notes, suggested_message)
--     - `commercial_recovery_events` · audit trail (1 row por evento)
--     - 7 RPCs SECURITY DEFINER · gate role owner/admin/receptionist
--     - 1 view `commercial_recovery_workflow_view` · join queue_view + workflow_items
--
--   ZERO envio WhatsApp · ZERO row em wa_outbox · ZERO automação.
--   `suggested_message` é texto gerado por regra estática SQL · nunca enviado.
--
-- Estado seguro pós-apply:
--   - 2 tabelas novas vazias
--   - 7 RPCs criadas
--   - 1 view criada
--   - Zero alteração em perdidos/appointments/orcamentos/leads/wa_outbox
--   - Zero alteração em cron · worker 71 segue OFF
--
-- Rollback: down DROP TABLE CASCADE + DROP RPCs + DROP VIEW (seguro · dados não
-- existem em tabelas-fonte).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABELA · commercial_recovery_workflow_items
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.commercial_recovery_workflow_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL,
  source_type       text NOT NULL,
  source_id         uuid NOT NULL,
  lead_id           uuid,
  appointment_id    uuid,
  orcamento_id      uuid,

  -- Workflow state
  stage             text NOT NULL DEFAULT 'novo',
  priority          text NOT NULL DEFAULT 'media',
  assigned_to       uuid,
  next_action_type  text,
  next_action_at    timestamptz,
  last_note         text,
  suggested_message text,
  status            text NOT NULL DEFAULT 'aberto',

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  archived_at       timestamptz,

  CONSTRAINT chk_recovery_workflow_source_type CHECK (
    source_type IN ('lead_lost','appointment_cancelled','appointment_no_show','orcamento_frio')
  ),
  CONSTRAINT chk_recovery_workflow_stage CHECK (
    stage IN ('novo','em_analise','primeira_tentativa','aguardando_resposta',
              'retorno_agendado','recuperado','descartado','arquivado')
  ),
  CONSTRAINT chk_recovery_workflow_priority CHECK (
    priority IN ('baixa','media','alta','urgente')
  ),
  CONSTRAINT chk_recovery_workflow_status CHECK (
    status IN ('aberto','recuperado','descartado','arquivado')
  ),
  CONSTRAINT chk_recovery_workflow_next_action CHECK (
    next_action_type IS NULL OR next_action_type IN (
      'ligar','enviar_whatsapp_quando_liberado','agendar_retorno',
      'revisar_orcamento','marcar_descartado','reativar_lead','observar'
    )
  )
);

-- Unique active row por (clinic_id, source_type, source_id) · soft-archive
-- libera reabertura de novo item
CREATE UNIQUE INDEX IF NOT EXISTS uniq_recovery_workflow_active
  ON public.commercial_recovery_workflow_items (clinic_id, source_type, source_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_recovery_workflow_clinic
  ON public.commercial_recovery_workflow_items (clinic_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recovery_workflow_assigned
  ON public.commercial_recovery_workflow_items (assigned_to) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recovery_workflow_next_action
  ON public.commercial_recovery_workflow_items (next_action_at)
  WHERE archived_at IS NULL AND next_action_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recovery_workflow_stage
  ON public.commercial_recovery_workflow_items (clinic_id, stage)
  WHERE archived_at IS NULL;

COMMENT ON TABLE public.commercial_recovery_workflow_items IS
  'Mig 174 (CRM_PHASE_2RC.1) · workflow interno (stage/priority/assigned/next_action) '
  'por item de recuperação. Una row ATIVA por (clinic_id, source_type, source_id). '
  'Soft-archive libera nova abertura.';

ALTER TABLE public.commercial_recovery_workflow_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY recovery_workflow_select ON public.commercial_recovery_workflow_items
  FOR SELECT TO authenticated
  USING (clinic_id::text = COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'clinic_id', ''));

CREATE POLICY recovery_workflow_service ON public.commercial_recovery_workflow_items
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

GRANT SELECT ON public.commercial_recovery_workflow_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.commercial_recovery_workflow_items TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. TABELA · commercial_recovery_events (audit trail)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.commercial_recovery_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL,
  recovery_id  uuid NOT NULL REFERENCES public.commercial_recovery_workflow_items(id) ON DELETE CASCADE,
  event_type   text NOT NULL,
  note         text,
  actor_id     uuid,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_recovery_event_type CHECK (
    event_type IN ('created','stage_changed','priority_changed','assigned',
                   'next_action_set','note_added','suggested_message_generated',
                   'recovered','discarded','archived','reopened')
  )
);

CREATE INDEX IF NOT EXISTS idx_recovery_events_recovery
  ON public.commercial_recovery_events (recovery_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_events_clinic
  ON public.commercial_recovery_events (clinic_id, created_at DESC);

COMMENT ON TABLE public.commercial_recovery_events IS
  'Mig 174 (CRM_PHASE_2RC.1) · audit trail · 1 row por evento de workflow.';

ALTER TABLE public.commercial_recovery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY recovery_events_select ON public.commercial_recovery_events
  FOR SELECT TO authenticated
  USING (clinic_id::text = COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'clinic_id', ''));

CREATE POLICY recovery_events_service ON public.commercial_recovery_events
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
  WITH CHECK ((auth.jwt() ->> 'role'::text) = 'service_role'::text);

GRANT SELECT ON public.commercial_recovery_events TO authenticated;
GRANT SELECT, INSERT ON public.commercial_recovery_events TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. HELPER · _recovery_workflow_role_ok() · gate interno
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._recovery_workflow_role_ok()
RETURNS boolean
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'app_role', '');
  RETURN v_role IN ('owner','admin','receptionist');
END $$;

COMMENT ON FUNCTION public._recovery_workflow_role_ok() IS
  'Mig 174 · helper interno · valida role canônica do CRM workflow.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. HELPER · _recovery_workflow_clinic_id() · resolve tenant
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._recovery_workflow_clinic_id()
RETURNS uuid
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_cid text;
BEGIN
  v_cid := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'clinic_id', '');
  IF v_cid = '' THEN RETURN NULL; END IF;
  RETURN v_cid::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RPC · commercial_recovery_workflow_suggest_message
--    Gera texto sugerido por regra estática SQL (pure read · sem side-effect).
--    NUNCA envia · UI mostra pra atendente copiar.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commercial_recovery_workflow_suggest_message(
  p_source_type text,
  p_display_name text,
  p_reason text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_name text;
  v_reason_lc text;
BEGIN
  v_name := COALESCE(NULLIF(trim(p_display_name), ''), 'tudo bem');
  v_reason_lc := lower(COALESCE(p_reason, ''));

  -- no_show
  IF p_source_type = 'appointment_no_show' THEN
    RETURN 'Oi, ' || v_name || '. Vi que você não conseguiu comparecer ao horário. '
        || 'Quer que eu veja uma nova opção para você?';
  END IF;

  -- cancelado
  IF p_source_type = 'appointment_cancelled' THEN
    RETURN 'Oi, ' || v_name || '. Tudo bem? Posso te ajudar a encontrar outro '
        || 'horário mais confortável?';
  END IF;

  -- orçamento frio
  IF p_source_type = 'orcamento_frio' THEN
    RETURN 'Oi, ' || v_name || '. Vi seu orçamento aqui. Posso te mostrar alternativas '
        || 'por etapas ou ajustar para caber melhor agora?';
  END IF;

  -- lead_lost (perdido) · variantes por motivo
  IF p_source_type = 'lead_lost' THEN
    IF v_reason_lc LIKE '%preco%' OR v_reason_lc LIKE '%preço%' OR v_reason_lc LIKE '%valor%' THEN
      RETURN 'Oi, ' || v_name || '. Entendo sua dúvida. Posso te mostrar uma alternativa '
          || 'por etapas para caber melhor agora?';
    ELSIF v_reason_lc LIKE '%sem resposta%' OR v_reason_lc LIKE '%não respond%' OR v_reason_lc LIKE '%nao respond%' THEN
      RETURN 'Oi, ' || v_name || '. Sumimos por aqui · ainda dá pra te ajudar hoje. '
          || 'Quer que eu confira uma agenda boa pra você?';
    ELSE
      RETURN 'Oi, ' || v_name || '. Posso retomar nossa conversa? Quero te ajudar a '
          || 'achar o melhor caminho.';
    END IF;
  END IF;

  -- fallback
  RETURN 'Oi, ' || v_name || '. Posso retomar nossa conversa?';
END $$;

COMMENT ON FUNCTION public.commercial_recovery_workflow_suggest_message(text, text, text) IS
  'Mig 174 (CRM_PHASE_2RC.1) · gera texto sugerido estático por regra SQL. '
  'IMMUTABLE · pure read · zero side-effect · UI mostra para atendente copiar. '
  'NUNCA dispara envio · NUNCA grava em wa_outbox.';

GRANT EXECUTE ON FUNCTION public.commercial_recovery_workflow_suggest_message(text, text, text)
  TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RPC · create_or_get
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commercial_recovery_workflow_create_or_get(
  p_source_type     text,
  p_source_id       uuid,
  p_lead_id         uuid DEFAULT NULL,
  p_appointment_id  uuid DEFAULT NULL,
  p_orcamento_id    uuid DEFAULT NULL,
  p_priority        text DEFAULT 'media'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_clinic uuid;
  v_row    public.commercial_recovery_workflow_items%ROWTYPE;
  v_existed boolean := false;
BEGIN
  IF NOT public._recovery_workflow_role_ok() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role');
  END IF;
  v_clinic := public._recovery_workflow_clinic_id();
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_clinic_id');
  END IF;
  IF p_source_type NOT IN ('lead_lost','appointment_cancelled','appointment_no_show','orcamento_frio') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_source_type');
  END IF;
  IF p_priority NOT IN ('baixa','media','alta','urgente') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_priority');
  END IF;

  SELECT * INTO v_row FROM public.commercial_recovery_workflow_items
   WHERE clinic_id = v_clinic
     AND source_type = p_source_type
     AND source_id = p_source_id
     AND archived_at IS NULL;

  IF FOUND THEN
    v_existed := true;
  ELSE
    INSERT INTO public.commercial_recovery_workflow_items
      (clinic_id, source_type, source_id, lead_id, appointment_id, orcamento_id, priority)
    VALUES
      (v_clinic, p_source_type, p_source_id, p_lead_id, p_appointment_id, p_orcamento_id, p_priority)
    RETURNING * INTO v_row;

    INSERT INTO public.commercial_recovery_events
      (clinic_id, recovery_id, event_type, note, actor_id, metadata)
    VALUES
      (v_clinic, v_row.id, 'created', NULL,
       (auth.uid())::uuid,
       jsonb_build_object('source_type', p_source_type, 'priority', p_priority));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'existed', v_existed,
    'stage', v_row.stage,
    'priority', v_row.priority,
    'status', v_row.status
  );
END $$;

GRANT EXECUTE ON FUNCTION public.commercial_recovery_workflow_create_or_get(text,uuid,uuid,uuid,uuid,text)
  TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. RPC · update_stage
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commercial_recovery_workflow_update_stage(
  p_id    uuid,
  p_stage text,
  p_note  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_clinic uuid;
  v_row    public.commercial_recovery_workflow_items%ROWTYPE;
  v_prev   text;
BEGIN
  IF NOT public._recovery_workflow_role_ok() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role');
  END IF;
  v_clinic := public._recovery_workflow_clinic_id();
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_clinic_id');
  END IF;
  IF p_stage NOT IN ('novo','em_analise','primeira_tentativa','aguardando_resposta',
                     'retorno_agendado','recuperado','descartado','arquivado') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_stage');
  END IF;

  SELECT * INTO v_row FROM public.commercial_recovery_workflow_items
   WHERE id = p_id AND clinic_id = v_clinic AND archived_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'recovery_not_found');
  END IF;
  v_prev := v_row.stage;
  IF v_prev = p_stage THEN
    RETURN jsonb_build_object('ok', true, 'idempotent_skip', true, 'id', p_id);
  END IF;

  UPDATE public.commercial_recovery_workflow_items
     SET stage = p_stage,
         updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.commercial_recovery_events
    (clinic_id, recovery_id, event_type, note, actor_id, metadata)
  VALUES
    (v_clinic, p_id, 'stage_changed', p_note, (auth.uid())::uuid,
     jsonb_build_object('from', v_prev, 'to', p_stage));

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'stage', p_stage);
END $$;

GRANT EXECUTE ON FUNCTION public.commercial_recovery_workflow_update_stage(uuid,text,text)
  TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. RPC · update_priority
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commercial_recovery_workflow_update_priority(
  p_id       uuid,
  p_priority text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_clinic uuid;
  v_prev   text;
BEGIN
  IF NOT public._recovery_workflow_role_ok() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role');
  END IF;
  v_clinic := public._recovery_workflow_clinic_id();
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_clinic_id');
  END IF;
  IF p_priority NOT IN ('baixa','media','alta','urgente') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_priority');
  END IF;

  SELECT priority INTO v_prev FROM public.commercial_recovery_workflow_items
   WHERE id = p_id AND clinic_id = v_clinic AND archived_at IS NULL;
  IF v_prev IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'recovery_not_found');
  END IF;
  IF v_prev = p_priority THEN
    RETURN jsonb_build_object('ok', true, 'idempotent_skip', true, 'id', p_id);
  END IF;

  UPDATE public.commercial_recovery_workflow_items
     SET priority = p_priority,
         updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.commercial_recovery_events
    (clinic_id, recovery_id, event_type, actor_id, metadata)
  VALUES
    (v_clinic, p_id, 'priority_changed', (auth.uid())::uuid,
     jsonb_build_object('from', v_prev, 'to', p_priority));

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'priority', p_priority);
END $$;

GRANT EXECUTE ON FUNCTION public.commercial_recovery_workflow_update_priority(uuid,text)
  TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. RPC · set_next_action
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commercial_recovery_workflow_set_next_action(
  p_id          uuid,
  p_action_type text,
  p_at          timestamptz,
  p_assigned_to uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_clinic uuid;
  v_exists boolean;
BEGIN
  IF NOT public._recovery_workflow_role_ok() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role');
  END IF;
  v_clinic := public._recovery_workflow_clinic_id();
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_clinic_id');
  END IF;
  IF p_action_type IS NOT NULL AND p_action_type NOT IN (
    'ligar','enviar_whatsapp_quando_liberado','agendar_retorno',
    'revisar_orcamento','marcar_descartado','reativar_lead','observar'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action_type');
  END IF;

  SELECT true INTO v_exists FROM public.commercial_recovery_workflow_items
   WHERE id = p_id AND clinic_id = v_clinic AND archived_at IS NULL;
  IF v_exists IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'recovery_not_found');
  END IF;

  UPDATE public.commercial_recovery_workflow_items
     SET next_action_type = p_action_type,
         next_action_at   = p_at,
         assigned_to      = COALESCE(p_assigned_to, assigned_to),
         updated_at       = now()
   WHERE id = p_id;

  INSERT INTO public.commercial_recovery_events
    (clinic_id, recovery_id, event_type, actor_id, metadata)
  VALUES
    (v_clinic, p_id, 'next_action_set', (auth.uid())::uuid,
     jsonb_build_object('action_type', p_action_type, 'at', p_at,
                        'assigned_to', p_assigned_to));

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_id,
    'action_type', p_action_type,
    'at', p_at
  );
END $$;

GRANT EXECUTE ON FUNCTION public.commercial_recovery_workflow_set_next_action(uuid,text,timestamptz,uuid)
  TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. RPC · add_note
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commercial_recovery_workflow_add_note(
  p_id   uuid,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_clinic uuid;
BEGIN
  IF NOT public._recovery_workflow_role_ok() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role');
  END IF;
  v_clinic := public._recovery_workflow_clinic_id();
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_clinic_id');
  END IF;
  IF p_note IS NULL OR length(trim(p_note)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'note_too_short');
  END IF;

  UPDATE public.commercial_recovery_workflow_items
     SET last_note = p_note,
         updated_at = now()
   WHERE id = p_id AND clinic_id = v_clinic AND archived_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'recovery_not_found');
  END IF;

  INSERT INTO public.commercial_recovery_events
    (clinic_id, recovery_id, event_type, note, actor_id)
  VALUES
    (v_clinic, p_id, 'note_added', trim(p_note), (auth.uid())::uuid);

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

GRANT EXECUTE ON FUNCTION public.commercial_recovery_workflow_add_note(uuid,text)
  TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. RPC · mark_recovered
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commercial_recovery_workflow_mark_recovered(
  p_id   uuid,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_clinic uuid;
  v_status text;
BEGIN
  IF NOT public._recovery_workflow_role_ok() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role');
  END IF;
  v_clinic := public._recovery_workflow_clinic_id();
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_clinic_id');
  END IF;

  SELECT status INTO v_status FROM public.commercial_recovery_workflow_items
   WHERE id = p_id AND clinic_id = v_clinic AND archived_at IS NULL;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'recovery_not_found');
  END IF;
  IF v_status = 'recuperado' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent_skip', true, 'id', p_id);
  END IF;

  UPDATE public.commercial_recovery_workflow_items
     SET status      = 'recuperado',
         stage       = 'recuperado',
         last_note   = COALESCE(p_note, last_note),
         updated_at  = now()
   WHERE id = p_id;

  INSERT INTO public.commercial_recovery_events
    (clinic_id, recovery_id, event_type, note, actor_id)
  VALUES
    (v_clinic, p_id, 'recovered', p_note, (auth.uid())::uuid);

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'status', 'recuperado');
END $$;

GRANT EXECUTE ON FUNCTION public.commercial_recovery_workflow_mark_recovered(uuid,text)
  TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. RPC · discard
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.commercial_recovery_workflow_discard(
  p_id     uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_clinic uuid;
  v_status text;
BEGIN
  IF NOT public._recovery_workflow_role_ok() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role');
  END IF;
  v_clinic := public._recovery_workflow_clinic_id();
  IF v_clinic IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_clinic_id');
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_too_short');
  END IF;

  SELECT status INTO v_status FROM public.commercial_recovery_workflow_items
   WHERE id = p_id AND clinic_id = v_clinic AND archived_at IS NULL;
  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'recovery_not_found');
  END IF;
  IF v_status = 'descartado' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent_skip', true, 'id', p_id);
  END IF;

  UPDATE public.commercial_recovery_workflow_items
     SET status     = 'descartado',
         stage      = 'descartado',
         last_note  = p_reason,
         updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.commercial_recovery_events
    (clinic_id, recovery_id, event_type, note, actor_id)
  VALUES
    (v_clinic, p_id, 'discarded', p_reason, (auth.uid())::uuid);

  RETURN jsonb_build_object('ok', true, 'id', p_id, 'status', 'descartado');
END $$;

GRANT EXECUTE ON FUNCTION public.commercial_recovery_workflow_discard(uuid,text)
  TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 13. VIEW · commercial_recovery_workflow_view
--    Junta queue_view (read-model fontes) com workflow_items (estado interno).
--    Workflow override > queue computed values.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.commercial_recovery_workflow_view AS
SELECT
  q.item_id,
  q.clinic_id,
  q.source_type,
  q.source_id,
  q.lead_id,
  q.patient_id,
  q.appointment_id,
  q.orcamento_id,
  q.display_name,
  q.phone_last4,
  q.reason,
  q.notes                                       AS source_notes,
  q.source_event_at,
  q.created_at                                  AS source_created_at,
  q.updated_at                                  AS source_updated_at,
  q.resolved_at,
  -- workflow state · pode ser null quando item não foi criado ainda
  w.id                                          AS workflow_id,
  COALESCE(w.stage, 'novo')                     AS stage,
  COALESCE(w.priority, q.priority)              AS priority,
  CASE
    WHEN w.status IS NOT NULL THEN w.status
    ELSE q.status
  END                                           AS status,
  w.assigned_to,
  w.next_action_type,
  w.next_action_at,
  w.last_note                                   AS workflow_note,
  w.suggested_message,
  w.updated_at                                  AS workflow_updated_at,
  w.archived_at                                 AS workflow_archived_at,
  CASE
    WHEN w.next_action_at IS NOT NULL AND w.next_action_at < now() THEN true
    ELSE false
  END                                           AS next_action_overdue
FROM public.commercial_recovery_queue_view q
LEFT JOIN public.commercial_recovery_workflow_items w
  ON  w.clinic_id   = q.clinic_id
  AND w.source_type = q.source_type
  AND w.source_id   = q.source_id
  AND w.archived_at IS NULL;

COMMENT ON VIEW public.commercial_recovery_workflow_view IS
  'Mig 174 (CRM_PHASE_2RC.1) · workflow_view = queue_view LEFT JOIN workflow_items. '
  'workflow override > queue computed defaults.';

GRANT SELECT ON public.commercial_recovery_workflow_view TO authenticated;
GRANT SELECT ON public.commercial_recovery_workflow_view TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- SANITY DO BLOCK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_table_ok boolean;
  v_events_ok boolean;
  v_view_ok boolean;
  v_rpcs_count integer;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='commercial_recovery_workflow_items')
    INTO v_table_ok;
  IF NOT v_table_ok THEN RAISE EXCEPTION 'sanity: workflow_items table não criada'; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='commercial_recovery_events')
    INTO v_events_ok;
  IF NOT v_events_ok THEN RAISE EXCEPTION 'sanity: recovery_events table não criada'; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='commercial_recovery_workflow_view')
    INTO v_view_ok;
  IF NOT v_view_ok THEN RAISE EXCEPTION 'sanity: workflow_view não criada'; END IF;

  SELECT count(*) INTO v_rpcs_count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN (
     'commercial_recovery_workflow_create_or_get',
     'commercial_recovery_workflow_update_stage',
     'commercial_recovery_workflow_update_priority',
     'commercial_recovery_workflow_set_next_action',
     'commercial_recovery_workflow_add_note',
     'commercial_recovery_workflow_mark_recovered',
     'commercial_recovery_workflow_discard',
     'commercial_recovery_workflow_suggest_message'
   );
  IF v_rpcs_count < 8 THEN
    RAISE EXCEPTION 'sanity: faltam RPCs · count=%', v_rpcs_count;
  END IF;

  RAISE NOTICE 'mig 174 · workflow tables (2) + view + 8 RPCs criados';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
