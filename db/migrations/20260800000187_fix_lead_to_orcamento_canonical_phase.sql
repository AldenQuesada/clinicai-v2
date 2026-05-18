-- ============================================================================
-- Migration 187 · clinicai-v2 · fix lead_to_orcamento canonical phase
-- ============================================================================
--
-- Propósito: alinhar RPC public.lead_to_orcamento ao modelo canônico Phase 1C
-- (mig 150 retroapply). A RPC original (mig 65) gateia phase='compareceu', mas
-- 'compareceu' foi removido de chk_leads_phase pela mig 150 (contrato v2:
-- phase ∈ {lead, agendado, paciente, orcamento}). Resultado: a RPC virou
-- código morto em produção · qualquer submit em /crm/orcamentos/novo retorna
-- illegal_transition e o spec E2E lead-to-orcamento foi marcado como
-- BLOQUEADO_BACKEND.
--
-- Esta migration:
--   1. Substitui o gate phase='compareceu' por phase IN ('lead', 'agendado')
--      no modelo canônico v2.
--   2. Adiciona gate explícito lifecycle_status='ativo' (bloqueia perdido,
--      arquivado, recuperacao).
--   3. Devolve erro controlado quando phase='orcamento' (já existe orçamento)
--      ou phase='paciente' (não duplicar via fluxo errado · futura RPC
--      patient_to_orcamento).
--   4. REMOVE o soft-delete operacional (`UPDATE leads SET deleted_at = now()`)
--      — em Phase 1C o sinal operacional é phase + lifecycle_status; manter
--      deleted_at libera o lead pra continuar visível na crm_operational_view
--      com mesa_operacional='orcamento' (a view filtra deleted_at IS NULL).
--   5. Atualiza COMMENT pra refletir contrato canônico.
--
-- Idempotente: usa CREATE OR REPLACE FUNCTION. Não toca dados existentes.
-- Não altera CHECK constraints. Não cria/dropa colunas. Não muda assinatura
-- da função (callers em mig 151 appointment_finalize + apps/lara TS continuam
-- válidos sem alteração).
--
-- Rollback: re-aplicar mig 65 pra restaurar gate 'compareceu' (não recomendado
-- · vide audit doc).
--
-- Validation SQL (rodar manualmente após apply):
--   1. SELECT to_regprocedure('public.lead_to_orcamento(uuid,numeric,jsonb,numeric,text,text,date)');
--      → deve retornar OID válido (não NULL)
--   2. SELECT prosrc FROM pg_proc WHERE oid =
--      to_regprocedure('public.lead_to_orcamento(uuid,numeric,jsonb,numeric,text,text,date)')
--      → deve conter 'phase IN' e NÃO conter 'compareceu' (modulo comentários)
--   3. SELECT grantee, privilege_type FROM information_schema.routine_privileges
--      WHERE specific_schema='public' AND routine_name='lead_to_orcamento'
--      ORDER BY grantee;
--      → authenticated EXECUTE · service_role EXECUTE
--   4. Smoke (apenas com fixture E2E, fora de prod operacional):
--      a. INSERT lead com phase='lead' lifecycle='ativo' → permite
--      b. INSERT lead com phase='agendado' lifecycle='ativo' → permite
--      c. UPDATE lead phase='orcamento' → bloqueia com already_in_orcamento
--      d. UPDATE lead lifecycle='perdido' → bloqueia com lifecycle_locked
--      Em nenhum caso a coluna deleted_at deve ser tocada pela RPC.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.lead_to_orcamento(
  p_lead_id     uuid,
  p_subtotal    numeric,
  p_items       jsonb,
  p_discount    numeric  DEFAULT 0,
  p_notes       text     DEFAULT NULL,
  p_title       text     DEFAULT NULL,
  p_valid_until date     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid;
  v_lead      public.leads%ROWTYPE;
  v_orc_id    uuid;
  v_total     numeric(12,2);
BEGIN
  -- 1. JWT clinic context (multi-tenant gate canônico)
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  -- 2. Payload validation
  IF p_subtotal IS NULL OR p_subtotal < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_subtotal');
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_items',
      'hint', 'Esperado jsonb array'
    );
  END IF;

  -- 3. Lock lead pessimista (deleted_at IS NULL preserva proteção contra
  --    UUIDs já tombados via cleanup defensivo, NÃO é sinal operacional)
  SELECT * INTO v_lead
    FROM public.leads
   WHERE id = p_lead_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_not_found_or_deleted');
  END IF;

  -- 4. Lifecycle gate canônico v2 · apenas leads ativos podem emitir orçamento.
  --    Perdido/arquivado/recuperacao são estados terminais ou pendentes que
  --    exigem fluxo próprio (lead_unarchive, lead_recover, etc).
  IF v_lead.lifecycle_status <> 'ativo' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'lifecycle_locked',
      'lifecycle_status', v_lead.lifecycle_status,
      'hint',
        'Lead nao pode emitir orcamento enquanto lifecycle_status != ativo. '
        || 'Use lead_unarchive ou lead_recover antes.'
    );
  END IF;

  -- 5. Phase gate canônico v2 · modelo {lead, agendado, paciente, orcamento}.
  --    Permite: lead, agendado (fluxos esperados de emissão)
  --    Erro controlado: orcamento (já emitido · idempotência defensiva),
  --                     paciente (futuro patient_to_orcamento)
  IF v_lead.phase = 'orcamento' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'already_in_orcamento',
      'from_phase', v_lead.phase,
      'hint',
        'Lead ja esta em phase=orcamento. Para emitir novo orcamento, '
        || 'fluxo de recuperacao ou aprovacao do orcamento atual primeiro.'
    );
  END IF;

  IF v_lead.phase = 'paciente' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'phase_paciente_unsupported',
      'from_phase', v_lead.phase,
      'hint',
        'Paciente recorrente nao usa lead_to_orcamento (futura RPC '
        || 'patient_to_orcamento). Em /crm/orcamentos/novo, abra a ficha '
        || 'do paciente e emita o orcamento a partir dali.'
    );
  END IF;

  IF v_lead.phase NOT IN ('lead', 'agendado') THEN
    -- Defesa contra qualquer phase fora da CHECK canônica (não deveria
    -- acontecer com chk_leads_phase ativo, mas guarda explícita pro caso
    -- de drift futuro · facilita debug)
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'illegal_transition',
      'from_phase', v_lead.phase,
      'hint',
        'lead_to_orcamento aceita phase IN (lead, agendado). '
        || 'Phase atual fora do contrato canonico v2.'
    );
  END IF;

  v_total := GREATEST(0, p_subtotal - COALESCE(p_discount, 0));

  -- 6. Cria orçamento (modelo single-table v2 · lead_id setado · patient_id
  --    NULL · CHECK XOR ok)
  INSERT INTO public.orcamentos (
    clinic_id, lead_id, patient_id,
    title, notes, items, subtotal, discount, total,
    status, valid_until, created_by
  ) VALUES (
    v_clinic_id, v_lead.id, NULL,
    p_title, p_notes, p_items,
    p_subtotal, COALESCE(p_discount, 0), v_total,
    'draft', p_valid_until, auth.uid()
  )
  RETURNING id INTO v_orc_id;

  -- 7. Atualiza phase=orcamento na lead. SEM tocar deleted_at: Phase 1C
  --    canon eh phase + lifecycle_status; deleted_at fica exclusivo pra
  --    exclusao real (LGPD, fixture cleanup). A view crm_operational_view
  --    filtra deleted_at IS NULL e ja deriva mesa_operacional='orcamento'
  --    a partir do JOIN com orcamentos ativos.
  UPDATE public.leads
     SET phase            = 'orcamento',
         phase_updated_at = now(),
         phase_updated_by = auth.uid(),
         phase_origin     = 'rpc',
         updated_at       = now()
   WHERE id = v_lead.id;

  -- 8. Audit · phase_history canônico
  INSERT INTO public.phase_history (
    clinic_id, lead_id, from_phase, to_phase, origin, triggered_by, actor_id, reason
  ) VALUES (
    v_clinic_id, v_lead.id, v_lead.phase, 'orcamento', 'rpc',
    'rpc:lead_to_orcamento', auth.uid(),
    'orcamento_id=' || v_orc_id::text
  );

  RETURN jsonb_build_object(
    'ok', true,
    'orcamento_id', v_orc_id,
    'lead_id', v_lead.id,
    'total', v_total
  );
END $$;

COMMENT ON FUNCTION public.lead_to_orcamento(uuid, numeric, jsonb, numeric, text, text, date) IS
  'Emite orçamento e marca lead.phase=orcamento. Phase 1C canonical: aceita '
  'phase IN (lead, agendado) + lifecycle_status=ativo. Erros controlados pra '
  'phase=orcamento (already_in_orcamento), phase=paciente '
  '(phase_paciente_unsupported), lifecycle != ativo (lifecycle_locked). '
  'NAO faz soft-delete · view crm_operational_view filtra por phase + '
  'lifecycle_status (deleted_at preservado pra exclusao real). '
  'Substitui gate phase=compareceu da mig 65 (removido por mig 150 contrato v2).';

-- Re-afirma grants (CREATE OR REPLACE preserva mas explícito é mais defensivo)
GRANT EXECUTE ON FUNCTION public.lead_to_orcamento(uuid, numeric, jsonb, numeric, text, text, date)
  TO authenticated, service_role;

COMMIT;

-- ============================================================================
-- FIM da migration 187 · lead_to_orcamento canonical phase fix
--
-- Próximos passos pendentes (escopo separado, não nesta mig):
--   - lead_to_paciente / appointment_attend / lead_lost: mesma classe de
--     dead-code via gate 'compareceu' ou matriz transição inconsistente com
--     contrato v2. Auditoria separada · sem fix aqui.
--   - _lead_phase_transition_allowed (mig 65 linha 50): matriz ainda referencia
--     compareceu/reagendado/perdido como phases. Não afeta lead_to_orcamento
--     diretamente (esta mig não chama a matriz), mas precisa ser saneada
--     antes de mexer nas outras RPCs.
--   - patient_to_orcamento: criar RPC dedicada pra fluxo paciente → novo
--     orcamento (separado do lead → orcamento).
-- ============================================================================
