-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-24 · clinicai-v2 · b2b_comm_templates SEQUENCIAS           ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: organizar templates de comunicacao em          ║
-- ║ sequencias nomeadas com ordem manual (drag-drop).                        ║
-- ║                                                                          ║
-- ║ Ex.: sequencia "Onboarding · 5 mensagens" agrupa 5 templates com ordem  ║
-- ║ definida, e cada um dispara apos o anterior (delay/cron continua sendo  ║
-- ║ o gatilho real · sequencia eh organizacional + visual).                  ║
-- ║                                                                          ║
-- ║ Esta mig adiciona:                                                       ║
-- ║   1. Colunas sequence_name (text NULL) + sequence_order (int NOT NULL    ║
-- ║      DEFAULT 0) em b2b_comm_templates                                    ║
-- ║   2. Index parcial pra ordenacao rapida quando sequence_name IS NOT NULL ║
-- ║   3. RPC b2b_comm_template_reorder(p_id, p_new_order) · move 1 template ║
-- ║      pra nova posicao dentro da mesma sequencia, fazendo shift dos       ║
-- ║      vizinhos (modelo "remove + insert").                                ║
-- ║   4. RPC b2b_comm_template_assign_sequence(p_id, p_sequence_name) ·     ║
-- ║      atribui ou desatribui template de uma sequencia · ja calcula        ║
-- ║      proximo sequence_order livre.                                       ║
-- ║                                                                          ║
-- ║ Audiencia: authenticated (RLS scoped clinic_id ja existe da mig 0509).  ║
-- ║ Tabela b2b_comm_templates vem do clinic-dashboard mig 0509.             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── Colunas novas ──────────────────────────────────────────────────────
ALTER TABLE public.b2b_comm_templates
  ADD COLUMN IF NOT EXISTS sequence_name  text NULL;

ALTER TABLE public.b2b_comm_templates
  ADD COLUMN IF NOT EXISTS sequence_order int  NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.b2b_comm_templates.sequence_name IS
  'Nome da sequencia organizacional (ex.: "Onboarding · 5 mensagens"). NULL = template solto. Mig 800-24.';
COMMENT ON COLUMN public.b2b_comm_templates.sequence_order IS
  'Posicao (0-based) dentro da sequencia. Reordenavel via b2b_comm_template_reorder. Mig 800-24.';

-- ── Index parcial pra listagem ordenada ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_b2b_comm_templates_sequence
  ON public.b2b_comm_templates (clinic_id, sequence_name, sequence_order)
  WHERE sequence_name IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC: b2b_comm_template_reorder
-- Move template `p_id` pra `p_new_order` dentro da mesma sequencia.
-- Faz shift dos vizinhos pra manter ordem contigua sem buracos.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_comm_template_reorder(
  p_id        uuid,
  p_new_order int
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid    uuid := public.app_clinic_id();
  v_seq    text;
  v_old    int;
  v_max    int;
  v_target int;
BEGIN
  IF v_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;
  IF p_id IS NULL OR p_new_order IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_args');
  END IF;

  -- Captura sequencia + ordem atual
  SELECT sequence_name, sequence_order
    INTO v_seq, v_old
    FROM public.b2b_comm_templates
   WHERE id = p_id
     AND clinic_id = v_cid;

  IF v_seq IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_sequence');
  END IF;

  -- Limita p_new_order ao range valido [0..count-1]
  SELECT COALESCE(MAX(sequence_order), 0) INTO v_max
    FROM public.b2b_comm_templates
   WHERE clinic_id = v_cid
     AND sequence_name = v_seq;

  v_target := GREATEST(0, LEAST(p_new_order, v_max));
  IF v_target = v_old THEN
    RETURN jsonb_build_object('ok', true, 'sequence_name', v_seq,
                              'old_order', v_old, 'new_order', v_old, 'noop', true);
  END IF;

  -- Shift dos vizinhos: se desce (old < target) decrementa intermediarios;
  -- se sobe (old > target) incrementa intermediarios.
  IF v_target > v_old THEN
    UPDATE public.b2b_comm_templates
       SET sequence_order = sequence_order - 1
     WHERE clinic_id = v_cid
       AND sequence_name = v_seq
       AND sequence_order > v_old
       AND sequence_order <= v_target
       AND id <> p_id;
  ELSE
    UPDATE public.b2b_comm_templates
       SET sequence_order = sequence_order + 1
     WHERE clinic_id = v_cid
       AND sequence_name = v_seq
       AND sequence_order >= v_target
       AND sequence_order < v_old
       AND id <> p_id;
  END IF;

  -- Coloca o alvo na posicao final
  UPDATE public.b2b_comm_templates
     SET sequence_order = v_target
   WHERE id = p_id
     AND clinic_id = v_cid;

  RETURN jsonb_build_object(
    'ok',            true,
    'sequence_name', v_seq,
    'old_order',     v_old,
    'new_order',     v_target
  );
END $$;

COMMENT ON FUNCTION public.b2b_comm_template_reorder(uuid, int) IS
  'Move 1 template pra nova posicao dentro da mesma sequencia · shift de vizinhos · mig 800-24.';

GRANT EXECUTE ON FUNCTION public.b2b_comm_template_reorder(uuid, int) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC: b2b_comm_template_assign_sequence
-- Atribui template a uma sequencia (vai pro fim da fila) ou desatribui
-- passando p_sequence_name = NULL.
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_comm_template_assign_sequence(
  p_id            uuid,
  p_sequence_name text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid       uuid := public.app_clinic_id();
  v_old_seq   text;
  v_old_order int;
  v_next      int := 0;
  v_target    text;
BEGIN
  IF v_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;
  IF p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_args');
  END IF;

  -- Normaliza nome (trim + NULL pra string vazia)
  v_target := NULLIF(btrim(p_sequence_name), '');

  SELECT sequence_name, sequence_order
    INTO v_old_seq, v_old_order
    FROM public.b2b_comm_templates
   WHERE id = p_id
     AND clinic_id = v_cid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Compacta sequencia antiga (preenche o buraco deixado)
  IF v_old_seq IS NOT NULL THEN
    UPDATE public.b2b_comm_templates
       SET sequence_order = sequence_order - 1
     WHERE clinic_id = v_cid
       AND sequence_name = v_old_seq
       AND sequence_order > v_old_order
       AND id <> p_id;
  END IF;

  -- Calcula proxima posicao na sequencia destino
  IF v_target IS NOT NULL THEN
    SELECT COALESCE(MAX(sequence_order), -1) + 1 INTO v_next
      FROM public.b2b_comm_templates
     WHERE clinic_id = v_cid
       AND sequence_name = v_target;
  END IF;

  UPDATE public.b2b_comm_templates
     SET sequence_name  = v_target,
         sequence_order = COALESCE(v_next, 0)
   WHERE id = p_id
     AND clinic_id = v_cid;

  RETURN jsonb_build_object(
    'ok',            true,
    'sequence_name', v_target,
    'sequence_order', COALESCE(v_next, 0),
    'previous',      v_old_seq
  );
END $$;

COMMENT ON FUNCTION public.b2b_comm_template_assign_sequence(uuid, text) IS
  'Atribui template a sequencia (vai pro fim) ou desatribui (NULL) · compacta sequencia antiga · mig 800-24.';

GRANT EXECUTE ON FUNCTION public.b2b_comm_template_assign_sequence(uuid, text) TO authenticated;

-- ─── ASSERTS ──────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='b2b_comm_templates'
       AND column_name='sequence_name'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: coluna sequence_name nao existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='b2b_comm_templates'
       AND column_name='sequence_order'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: coluna sequence_order nao existe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE relname='idx_b2b_comm_templates_sequence' AND relkind='i'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: index idx_b2b_comm_templates_sequence nao existe';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_comm_template_reorder') THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_comm_template_reorder nao existe';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='b2b_comm_template_assign_sequence') THEN
    RAISE EXCEPTION 'ASSERT FAIL: RPC b2b_comm_template_assign_sequence nao existe';
  END IF;

  RAISE NOTICE '✅ Mig 800-24 OK — b2b_comm_templates sequencias prontas';
END $$;

COMMIT;
