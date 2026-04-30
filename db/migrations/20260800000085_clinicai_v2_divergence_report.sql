-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ Mig 800-85 · clinicai-v2 · divergence_report() RPC                        ║
-- ║                                                                            ║
-- ║ Camada 12c · cron daily de soak monitoring. Compara counts entre           ║
-- ║ legacy_2026_04_28.X e public.X nas 4 tabelas migradas em 2026-04-28.       ║
-- ║                                                                            ║
-- ║ Retorna JSONB array de divergencias (vazio = ok). Cada elemento:           ║
-- ║   { table, legacy_total, legacy_active, current_total, current_active,    ║
-- ║     status, severity, message }                                            ║
-- ║                                                                            ║
-- ║ Performance: 8 COUNTs em paralelo via subqueries · O(rows) cada · OK pra   ║
-- ║ scale atual (Mirian · ~1k rows total). Se virar > 100k rows, cachear      ║
-- ║ com REFRESH MATERIALIZED VIEW daily.                                       ║
-- ║                                                                            ║
-- ║ Defensivo: se schema legacy nao existir (post-12d), retorna empty array    ║
-- ║ + status='legacy_dropped' · cron passa a ser no-op naturalmente.           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

BEGIN;

CREATE OR REPLACE FUNCTION public.divergence_report()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_legacy_exists BOOLEAN;
  v_results JSONB := '[]'::jsonb;
  v_table TEXT;
  v_tables TEXT[] := ARRAY['leads', 'patients', 'appointments', 'orcamentos'];
  v_legacy_total INT;
  v_legacy_active INT;
  v_current_total INT;
  v_current_active INT;
  v_diff INT;
  v_status TEXT;
  v_severity TEXT;
  v_message TEXT;
BEGIN
  -- 1. Verifica se schema legacy ainda existe (post-12d retorna empty)
  SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'legacy_2026_04_28')
    INTO v_legacy_exists;

  IF NOT v_legacy_exists THEN
    RETURN jsonb_build_object(
      'ran_at', now(),
      'status', 'legacy_dropped',
      'message', 'schema legacy_2026_04_28 nao existe · soak window encerrado'
    );
  END IF;

  -- 2. Loop pelas 4 tabelas
  FOREACH v_table IN ARRAY v_tables LOOP
    -- Total + active em legacy (defensivo · tabela pode nao existir)
    BEGIN
      EXECUTE format('SELECT COUNT(*)::INT FROM legacy_2026_04_28.%I', v_table) INTO v_legacy_total;
    EXCEPTION WHEN OTHERS THEN
      v_legacy_total := NULL;
    END;

    BEGIN
      EXECUTE format('SELECT COUNT(*)::INT FROM legacy_2026_04_28.%I WHERE deleted_at IS NULL', v_table)
        INTO v_legacy_active;
    EXCEPTION WHEN OTHERS THEN
      v_legacy_active := v_legacy_total;
    END;

    -- Total + active em public (sempre tem · sao tabelas canonicas v2)
    EXECUTE format('SELECT COUNT(*)::INT FROM public.%I', v_table) INTO v_current_total;
    EXECUTE format('SELECT COUNT(*)::INT FROM public.%I WHERE deleted_at IS NULL', v_table)
      INTO v_current_active;

    -- Heuristica de divergencia
    IF v_legacy_active IS NOT NULL AND v_current_active < v_legacy_active THEN
      v_diff := v_legacy_active - v_current_active;
      IF v_diff > 5 THEN
        v_status := 'divergent';
        v_severity := 'critical';
      ELSE
        v_status := 'divergent';
        v_severity := 'warning';
      END IF;
      v_message := format('v2 active (%s) < legacy active (%s) · perda de %s rows',
        v_current_active, v_legacy_active, v_diff);
    ELSE
      v_status := 'ok';
      v_severity := 'info';
      v_message := NULL;
    END IF;

    v_results := v_results || jsonb_build_object(
      'table', v_table,
      'legacy_total', v_legacy_total,
      'legacy_active', v_legacy_active,
      'current_total', v_current_total,
      'current_active', v_current_active,
      'status', v_status,
      'severity', v_severity,
      'message', v_message
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ran_at', now(),
    'status', 'completed',
    'results', v_results,
    'summary', jsonb_build_object(
      'total', jsonb_array_length(v_results),
      'ok', (SELECT COUNT(*) FROM jsonb_array_elements(v_results) e WHERE e->>'status' = 'ok'),
      'divergent', (SELECT COUNT(*) FROM jsonb_array_elements(v_results) e WHERE e->>'status' = 'divergent'),
      'critical', (SELECT COUNT(*) FROM jsonb_array_elements(v_results) e WHERE e->>'severity' = 'critical')
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.divergence_report() TO authenticated, service_role;

COMMENT ON FUNCTION public.divergence_report() IS
  'Camada 12c · soak monitoring. Retorna JSONB com counts comparados entre legacy_2026_04_28 e public. Usado pelo cron /api/cron/divergence-check + UI /admin/health.';

-- Sanity test
DO $$
DECLARE v_result JSONB;
BEGIN
  v_result := public.divergence_report();
  IF v_result->>'status' NOT IN ('completed', 'legacy_dropped') THEN
    RAISE EXCEPTION 'divergence_report sanity falhou: %', v_result;
  END IF;
END;
$$;

COMMIT;
