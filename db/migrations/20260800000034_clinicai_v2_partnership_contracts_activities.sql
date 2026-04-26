-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-34 · clinicai-v2 · Contrato + Atividades de parceria      ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26 (#8 da lista de roadmap):                        ║
-- ║   "Assinatura de contrato e plano de atividades"                         ║
-- ║                                                                          ║
-- ║ Escopo desta mig (fundacao):                                             ║
-- ║   1. Tabela b2b_partnership_contracts                                    ║
-- ║      - 1 contrato ativo por parceria (UNIQUE partnership_id)            ║
-- ║      - signed_at, terms_version, file_path (storage), signature_data    ║
-- ║      - admin marca como assinado · upload de PDF opcional                ║
-- ║   2. Tabela b2b_partnership_activities                                   ║
-- ║      - Plano de atividades (monthly_meeting, content_post, event, etc)  ║
-- ║      - due_date + completed_at + notes + kind                           ║
-- ║      - 1:N por parceria · timeline chronologica                         ║
-- ║   3. 6 RPCs (3 por tabela) · list/upsert/delete                          ║
-- ║                                                                          ║
-- ║ Fora desta mig (TODO fase 2):                                            ║
-- ║   - Workflow de assinatura digital (Clicksign/FreeSign integration)     ║
-- ║   - Geracao automatica de PDF a partir de template                       ║
-- ║   - Cron de lembrete de atividades vencidas                             ║
-- ║                                                                          ║
-- ║ Padroes seguidos (mesmo rigor das migs anteriores):                      ║
-- ║   - SECURITY DEFINER + search_path locked                                ║
-- ║   - clinic_id via _sdr_clinic_id() · nunca literal                       ║
-- ║   - RLS via app_clinic_id() (FORCE RLS)                                  ║
-- ║   - GRANT EXECUTE TO authenticated · zero anon                           ║
-- ║   - Down migration drop tudo                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. TABELA · b2b_partnership_contracts
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.b2b_partnership_contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  partnership_id  uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,

  -- Status do contrato
  -- 'draft'    · esboco · sem signed_at
  -- 'sent'     · enviado pra parceira (assinatura digital pendente)
  -- 'signed'   · assinado · signed_at populado
  -- 'expired'  · venceu · contract_expiry_date < now()
  -- 'cancelled'· cancelado/rescindido manualmente
  status          text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'signed', 'expired', 'cancelled')),

  -- Versao dos termos (legal team controla)
  terms_version   text DEFAULT 'v1',

  -- Datas
  sent_at         timestamptz,
  signed_at       timestamptz,
  expiry_date     date,

  -- Storage do PDF (opcional · admin pode upload)
  file_path       text,
  file_size_bytes bigint,

  -- Dados da assinatura (futuro · Clicksign callback popular)
  -- Estrutura esperada: { signer_name, signer_email, signer_cpf,
  --                      provider, provider_id, signed_ip, signed_user_agent }
  signature_data  jsonb,

  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- 1 contrato por parceria · admin upserta o existente
  CONSTRAINT uniq_b2b_contract_partnership UNIQUE (partnership_id)
);

CREATE INDEX IF NOT EXISTS idx_b2b_contracts_clinic
  ON public.b2b_partnership_contracts (clinic_id);

CREATE INDEX IF NOT EXISTS idx_b2b_contracts_status
  ON public.b2b_partnership_contracts (clinic_id, status);

ALTER TABLE public.b2b_partnership_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_partnership_contracts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_b2b_contracts_select ON public.b2b_partnership_contracts;
CREATE POLICY p_b2b_contracts_select
  ON public.b2b_partnership_contracts
  FOR SELECT
  USING (clinic_id = public.app_clinic_id());

-- INSERT/UPDATE/DELETE so via RPC SECURITY DEFINER · nunca direto.

COMMENT ON TABLE public.b2b_partnership_contracts IS
  'Contrato ativo por parceria B2B · assinatura, vigencia, PDF (mig 800-34).';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. TABELA · b2b_partnership_activities
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.b2b_partnership_activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  partnership_id  uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,

  -- Tipo de atividade
  -- 'monthly_meeting'  · alinhamento mensal
  -- 'content_post'     · post agendado pela parceira
  -- 'event'            · evento conjunto
  -- 'voucher_review'   · revisao de combos
  -- 'training'         · capacitacao da equipe da parceira
  -- 'feedback_session' · coleta de feedback presencial
  -- 'custom'           · livre (usar 'title' pra detalhar)
  kind            text NOT NULL DEFAULT 'custom'
    CHECK (kind IN ('monthly_meeting', 'content_post', 'event', 'voucher_review',
                    'training', 'feedback_session', 'custom')),

  title           text NOT NULL,

  -- Status: 'pending' · 'completed' · 'cancelled'
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled')),

  due_date        date,
  completed_at    timestamptz,

  -- Quem deve fazer · 'clinic' (Mira faz) · 'partner' (parceira faz) · 'both'
  responsible     text DEFAULT 'clinic'
    CHECK (responsible IN ('clinic', 'partner', 'both')),

  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_activities_partnership
  ON public.b2b_partnership_activities (partnership_id, due_date);

CREATE INDEX IF NOT EXISTS idx_b2b_activities_clinic_status
  ON public.b2b_partnership_activities (clinic_id, status, due_date);

ALTER TABLE public.b2b_partnership_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_partnership_activities FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_b2b_activities_select ON public.b2b_partnership_activities;
CREATE POLICY p_b2b_activities_select
  ON public.b2b_partnership_activities
  FOR SELECT
  USING (clinic_id = public.app_clinic_id());

COMMENT ON TABLE public.b2b_partnership_activities IS
  'Plano de atividades por parceria B2B · timeline chronologica (mig 800-34).';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. RPCs · CONTRACTS
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_contract_get(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_row record;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;

  SELECT * INTO v_row
    FROM public.b2b_partnership_contracts
   WHERE partnership_id = p_partnership_id
     AND clinic_id = v_clinic_id;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'contract', null);
  END IF;

  RETURN jsonb_build_object('ok', true, 'contract', to_jsonb(v_row));
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_contract_get(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.b2b_contract_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_partnership_id uuid := (p_payload->>'partnership_id')::uuid;
  v_id uuid;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;
  IF v_partnership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_id_required');
  END IF;

  -- Confirma ownership da parceria
  IF NOT EXISTS (
    SELECT 1 FROM public.b2b_partnerships
     WHERE id = v_partnership_id AND clinic_id = v_clinic_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  INSERT INTO public.b2b_partnership_contracts (
    clinic_id, partnership_id, status, terms_version,
    sent_at, signed_at, expiry_date,
    file_path, file_size_bytes, signature_data, notes
  ) VALUES (
    v_clinic_id, v_partnership_id,
    COALESCE(p_payload->>'status', 'draft'),
    COALESCE(p_payload->>'terms_version', 'v1'),
    NULLIF(p_payload->>'sent_at', '')::timestamptz,
    NULLIF(p_payload->>'signed_at', '')::timestamptz,
    NULLIF(p_payload->>'expiry_date', '')::date,
    NULLIF(p_payload->>'file_path', ''),
    NULLIF(p_payload->>'file_size_bytes', '')::bigint,
    p_payload->'signature_data',
    NULLIF(p_payload->>'notes', '')
  )
  ON CONFLICT (partnership_id)
  DO UPDATE SET
    status          = EXCLUDED.status,
    terms_version   = COALESCE(EXCLUDED.terms_version, public.b2b_partnership_contracts.terms_version),
    sent_at         = COALESCE(EXCLUDED.sent_at, public.b2b_partnership_contracts.sent_at),
    signed_at       = COALESCE(EXCLUDED.signed_at, public.b2b_partnership_contracts.signed_at),
    expiry_date     = COALESCE(EXCLUDED.expiry_date, public.b2b_partnership_contracts.expiry_date),
    file_path       = COALESCE(EXCLUDED.file_path, public.b2b_partnership_contracts.file_path),
    file_size_bytes = COALESCE(EXCLUDED.file_size_bytes, public.b2b_partnership_contracts.file_size_bytes),
    signature_data  = COALESCE(EXCLUDED.signature_data, public.b2b_partnership_contracts.signature_data),
    notes           = COALESCE(EXCLUDED.notes, public.b2b_partnership_contracts.notes),
    updated_at      = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_contract_upsert(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.b2b_contract_delete(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_count int;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;

  DELETE FROM public.b2b_partnership_contracts
   WHERE partnership_id = p_partnership_id
     AND clinic_id = v_clinic_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_count);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_contract_delete(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. RPCs · ACTIVITIES
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_activities_list(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_result jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'kind', kind, 'title', title, 'status', status,
    'due_date', due_date, 'completed_at', completed_at,
    'responsible', responsible, 'notes', notes,
    'created_at', created_at, 'updated_at', updated_at
  ) ORDER BY due_date ASC NULLS LAST, created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM public.b2b_partnership_activities
  WHERE clinic_id = v_clinic_id
    AND partnership_id = p_partnership_id;

  RETURN jsonb_build_object('ok', true, 'activities', v_result);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_activities_list(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.b2b_activity_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_partnership_id uuid := (p_payload->>'partnership_id')::uuid;
  v_id uuid := NULLIF(p_payload->>'id', '')::uuid;
  v_title text := COALESCE(NULLIF(p_payload->>'title', ''), '');
  v_status text := COALESCE(p_payload->>'status', 'pending');
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;
  IF v_partnership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_id_required');
  END IF;
  IF length(v_title) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'title_required');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.b2b_partnerships
     WHERE id = v_partnership_id AND clinic_id = v_clinic_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_id IS NULL THEN
    -- INSERT novo
    INSERT INTO public.b2b_partnership_activities (
      clinic_id, partnership_id, kind, title, status,
      due_date, completed_at, responsible, notes
    ) VALUES (
      v_clinic_id, v_partnership_id,
      COALESCE(p_payload->>'kind', 'custom'),
      v_title,
      v_status,
      NULLIF(p_payload->>'due_date', '')::date,
      CASE WHEN v_status = 'completed' THEN now() ELSE NULL END,
      COALESCE(p_payload->>'responsible', 'clinic'),
      NULLIF(p_payload->>'notes', '')
    )
    RETURNING id INTO v_id;
  ELSE
    -- UPDATE existente · valida ownership
    UPDATE public.b2b_partnership_activities
       SET kind         = COALESCE(NULLIF(p_payload->>'kind', ''), kind),
           title        = COALESCE(NULLIF(p_payload->>'title', ''), title),
           status       = v_status,
           due_date     = NULLIF(p_payload->>'due_date', '')::date,
           completed_at = CASE
             WHEN v_status = 'completed' AND completed_at IS NULL THEN now()
             WHEN v_status <> 'completed' THEN NULL
             ELSE completed_at
           END,
           responsible  = COALESCE(NULLIF(p_payload->>'responsible', ''), responsible),
           notes        = NULLIF(p_payload->>'notes', ''),
           updated_at   = now()
     WHERE id = v_id
       AND clinic_id = v_clinic_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_forbidden');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_activity_upsert(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.b2b_activity_delete(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_count int;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;

  DELETE FROM public.b2b_partnership_activities
   WHERE id = p_id AND clinic_id = v_clinic_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_count);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_activity_delete(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERTS
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='b2b_partnership_contracts') THEN
    RAISE EXCEPTION 'ASSERT FAIL: tabela contracts nao criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='b2b_partnership_activities') THEN
    RAISE EXCEPTION 'ASSERT FAIL: tabela activities nao criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_contract_upsert') THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC contract_upsert nao criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_activity_upsert') THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC activity_upsert nao criada';
  END IF;
  RAISE NOTICE '✅ Mig 800-34 OK · 2 tabelas + 6 RPCs criadas';
END $$;

COMMIT;
