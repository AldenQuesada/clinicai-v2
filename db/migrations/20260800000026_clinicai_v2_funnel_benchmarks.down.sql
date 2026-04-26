-- Rollback mig 800-26 · b2b_funnel_benchmarks
BEGIN;

DROP FUNCTION IF EXISTS public.b2b_funnel_benchmark_upsert(jsonb);
DROP FUNCTION IF EXISTS public.b2b_funnel_benchmark_list();

DROP POLICY IF EXISTS "b2b_funnel_benchmarks_tenant" ON public.b2b_funnel_benchmarks;
DROP TABLE IF EXISTS public.b2b_funnel_benchmarks;

COMMIT;
