-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-90 · clinicai-v2 · _sdr_clinic_id() wrapper               ║
-- ║   (consertar 91 RPCs quebradas silenciosamente em prod)                 ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug descoberto 2026-04-30: tab Pessoas em /configuracoes mostra lista   ║
-- ║   vazia de profissionais. Causa: RPC `wa_pro_list_numbers` chama        ║
-- ║   `_sdr_clinic_id()` que NAO existe em prod · `data: error` retornado,  ║
-- ║   repo cai no `return []` defensivo, UI exibe vazio.                    ║
-- ║                                                                          ║
-- ║ Escopo do estrago: 91 RPCs legacy referenciam `_sdr_clinic_id()`        ║
-- ║   (cashflow_*, sdr_*, wa_pro_*, b2b_activities_*, leads_*, pluggy_*,    ║
-- ║   ofx_*). Todas falham silentemente · features parecem fantasmas.       ║
-- ║                                                                          ║
-- ║ Mig 800-77 (app_clinic_id_canonical) endureceu `app_clinic_id()` mas    ║
-- ║   nao tocou em `_sdr_clinic_id()`. Provavelmente foi dropada por        ║
-- ║   refactor antigo sem migrar callers.                                   ║
-- ║                                                                          ║
-- ║ Fix: cria `_sdr_clinic_id()` como wrapper de `app_clinic_id()` ·        ║
-- ║   single source of truth. Restaura comportamento esperado das 91 RPCs   ║
-- ║   sem tocar em cada uma. Refactor pode acontecer dia · isso aqui pode   ║
-- ║   ficar permanente como compat shim.                                    ║
-- ║                                                                          ║
-- ║ GOLD #3 (search_path), #5 (.down), #7 (sanity check), #10 (NOTIFY).     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

CREATE OR REPLACE FUNCTION public._sdr_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT public.app_clinic_id();
$$;

COMMENT ON FUNCTION public._sdr_clinic_id() IS
  'Compat shim · delega pra app_clinic_id() (canonical desde mig 800-77). '
  'Existe pra desbloquear ~91 RPCs legacy (cashflow, sdr, wa_pro, b2b_activities, '
  'leads, pluggy, ofx) que ficaram pra tras quando _sdr_clinic_id foi removida. '
  'Mig 800-90 (2026-04-30).';

-- Mesmo grant pattern de app_clinic_id (helper de identidade · seguro)
GRANT EXECUTE ON FUNCTION public._sdr_clinic_id()
  TO anon, authenticated, service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- ASSERTS · sanity
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_exists boolean;
  v_resolves uuid;
  v_app_id uuid;
BEGIN
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='_sdr_clinic_id')
    INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION '_sdr_clinic_id nao foi criada';
  END IF;

  -- Sanity · resolve para mesmo valor que app_clinic_id (em sessao sem GUC,
  -- ambos caem no fallback first-clinic).
  SELECT public._sdr_clinic_id() INTO v_resolves;
  SELECT public.app_clinic_id() INTO v_app_id;
  IF v_resolves IS DISTINCT FROM v_app_id THEN
    RAISE EXCEPTION 'sanity: _sdr_clinic_id (%) DIVERGE de app_clinic_id (%)', v_resolves, v_app_id;
  END IF;

  RAISE NOTICE 'Migration 800-90 OK · _sdr_clinic_id wrapper destrava 91 RPCs legacy';
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
