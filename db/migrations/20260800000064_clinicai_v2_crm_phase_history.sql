-- ============================================================================
-- Onda 4 · CRM Core · Tabela PHASE_HISTORY (canonical schema v2)
-- ============================================================================
--
-- ⚠️ CLEAN-SLATE SCHEMA · ver header de mig 60. Audit trail (443 rows
--    hoje) deve ser preservado: backfill via INSERT INTO public.phase_history
--    (clinic_id, lead_id, ...) SELECT _default_clinic_id(), lead_id, ...
--    FROM public.phase_history_legacy.
--
-- Auditoria 2026-04-27 flagou:
--  - 443 transicoes registradas no legado (rico audit trail · manter formato)
--  - 11 colunas · todas pertinentes
--  - RLS via subquery em leads · funciona, mas custosa. Vamos simplificar
--    com clinic_id direto (denormalizado · vale por consulta rapida).
--  - Esta tabela cresce indefinidamente · particionar por mes no futuro
--    se passar de 100k rows. Hoje deixar simples.
--
-- Decisoes desta migration:
--  1. Adicionado `clinic_id` denormalizado (mais barato pra RLS).
--  2. Adicionado `actor_id uuid` (renomeacao mais clara que `changed_by`).
--  3. CHECK no `to_phase` valido (matriz canonica).
--  4. RLS via clinic_id direto · nao via subquery em leads.
--  5. Sem FK pra leads (lead pode ter sido hard-deleted; manter audit
--     mesmo assim · ON DELETE SET NULL).
--
-- Dependencias: leads (mig 60).

BEGIN;

-- ── 1. Tabela phase_history ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.phase_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL DEFAULT public._default_clinic_id(),
  lead_id         uuid        NULL,
  -- ^ NULL allowed · lead pode ser hard-deleted no futuro · audit fica.

  from_phase      text        NULL,
  from_status     text        NULL,
  to_phase        text        NOT NULL,
  to_status       text        NULL,

  origin          text        NOT NULL,
  -- auto_transition | manual_override | rule | bulk_move | import | webhook

  triggered_by    text        NULL, -- 'user' | 'trigger:appt' | 'cron' | 'webhook:lara' | etc

  actor_id        uuid        NULL, -- auth.uid() do operador (NULL se trigger)
  reason          text        NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT phase_history_clinic_id_fkey
    FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE,
  CONSTRAINT phase_history_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL
);

-- ── 2. CHECK constraints ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ph_to_phase') THEN
    ALTER TABLE public.phase_history ADD CONSTRAINT chk_ph_to_phase
      CHECK (to_phase = ANY (ARRAY['lead','agendado','reagendado','compareceu','paciente','orcamento','perdido']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ph_from_phase') THEN
    ALTER TABLE public.phase_history ADD CONSTRAINT chk_ph_from_phase
      CHECK (from_phase IS NULL OR from_phase = ANY (ARRAY['lead','agendado','reagendado','compareceu','paciente','orcamento','perdido']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ph_origin') THEN
    ALTER TABLE public.phase_history ADD CONSTRAINT chk_ph_origin
      CHECK (origin = ANY (ARRAY['auto_transition','manual_override','rule','bulk_move','import','webhook','rpc']));
  END IF;
END $$;

-- ── 3. Indexes estrategicos ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ph_clinic_created
  ON public.phase_history (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ph_lead_created
  ON public.phase_history (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ph_origin_created
  ON public.phase_history (origin, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ph_to_phase
  ON public.phase_history (clinic_id, to_phase, created_at DESC);

-- ── 4. RLS ENABLED + policies tenant-scoped ─────────────────────────────────
ALTER TABLE public.phase_history ENABLE ROW LEVEL SECURITY;

-- SELECT: clinic + qualquer role autorizado (audit visivel pra time)
DROP POLICY IF EXISTS phase_history_select ON public.phase_history;
CREATE POLICY phase_history_select ON public.phase_history
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND public.app_role() = ANY (ARRAY['owner','admin','receptionist','therapist','viewer'])
  );

-- INSERT: clinic + role com permissao
DROP POLICY IF EXISTS phase_history_insert ON public.phase_history;
CREATE POLICY phase_history_insert ON public.phase_history
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() = ANY (ARRAY['owner','admin','receptionist','therapist'])
  );

-- UPDATE/DELETE PROIBIDOS pra audit imutavel · so service_role pode
-- (sem policy = nao passa · service_role bypassa).
-- Nao criar policies UPDATE/DELETE intencionalmente.

-- ── 5. Grants minimos ───────────────────────────────────────────────────────
REVOKE ALL ON public.phase_history FROM anon, public;
GRANT SELECT, INSERT ON public.phase_history TO authenticated;
GRANT ALL ON public.phase_history TO service_role;

-- ── 6. Comments ─────────────────────────────────────────────────────────────
COMMENT ON TABLE public.phase_history IS
  'CRM core · audit trail imutavel das transicoes de leads.phase. UPDATE/DELETE proibidos pra authenticated (so service_role). Insert append-only.';
COMMENT ON COLUMN public.phase_history.origin IS
  'Categoria da transicao: auto_transition (trigger appt), manual_override (UI), rule (sdr_evaluate_rules), bulk_move (admin lote), import, webhook (lara/b2b/vpi), rpc (chamada direta).';
COMMENT ON COLUMN public.phase_history.triggered_by IS
  'String descritiva do gatilho. Convencao: user | trigger:<nome> | cron | webhook:<source> | rpc:<nome>.';
COMMENT ON COLUMN public.phase_history.actor_id IS
  'auth.uid() do operador humano. NULL quando triggered_by inicia com trigger:/cron/webhook:.';

NOTIFY pgrst, 'reload schema';

-- ── 7. SANITY CHECK ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_rls boolean;
  v_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='phase_history' AND relnamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'sanity: public.phase_history nao existe';
  END IF;

  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE relname='phase_history' AND relnamespace='public'::regnamespace;
  IF NOT v_rls THEN RAISE EXCEPTION 'sanity: RLS nao habilitada em phase_history'; END IF;

  -- Esperamos 2 policies: SELECT + INSERT (sem UPDATE/DELETE pra audit)
  SELECT count(*) INTO v_count FROM pg_policies WHERE schemaname='public' AND tablename='phase_history';
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'sanity: phase_history com % policies, esperado exatamente 2 (SELECT+INSERT)', v_count;
  END IF;

  -- Garantir que NAO existe policy UPDATE/DELETE (audit imutavel)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='phase_history' AND cmd IN ('UPDATE','DELETE')) THEN
    RAISE EXCEPTION 'sanity: phase_history tem policy UPDATE/DELETE (deveria ser audit imutavel)';
  END IF;

  RAISE NOTICE 'mig 20260800000064 · phase_history OK';
END $$;

COMMIT;
