-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ Mig 800-90 · clinicai-v2 · Legacy data migration (Camada 12b)             ║
-- ║                                                                            ║
-- ║ Copia dados REAIS (excluindo testes) de legacy_2026_04_28.X pra public.X. ║
-- ║                                                                            ║
-- ║ Achado em 2026-04-30 via divergence_report (mig 85):                      ║
-- ║   - 323 leads reais (de 345) · 22 testes filtrados                         ║
-- ║   - 1 paciente real (Adilso) · 2 testes filtrados                          ║
-- ║   - 0 orcamentos reais (1 era teste · "(teste orcamento share)")           ║
-- ║                                                                            ║
-- ║ Filtros de teste (espelhados em ambas migrations):                         ║
-- ║   name ILIKE 'TEST%' OR name ILIKE 'Smoke%' OR name ILIKE 'Teste%'         ║
-- ║   OR name = 'Legacy Path' OR name = 'Para A'                               ║
-- ║   OR phone LIKE '554451777135%' (sintetic phones de smoke tests)           ║
-- ║                                                                            ║
-- ║ Idempotente · ON CONFLICT (id) DO NOTHING. Pode ser re-executada.          ║
-- ║                                                                            ║
-- ║ Campos legacy NAO em v2 vao pra metadata jsonb · NUNCA descartados.        ║
-- ║                                                                            ║
-- ║ Pos-execucao, divergence_report() deve mostrar:                            ║
-- ║   leads:    legacy_active 323 vs current_active >= 323 (status: ok)        ║
-- ║   patients: legacy_active 1   vs current_active >= 1   (status: ok)        ║
-- ║   orcamentos: ainda 1 vs 0 (esperado · era teste, nao migrado)             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── 1. Migrate leads · 323 reais (de 345 total) ─────────────────────────────

INSERT INTO public.leads (
  id, clinic_id, name, phone, email, cpf, rg, birth_date, idade,
  phase, phase_updated_at, phase_updated_by, phase_origin,
  source, source_type, source_quiz_id, funnel, ai_persona,
  temperature, priority, lead_score, day_bucket, channel_mode,
  assigned_to, is_in_recovery, lost_reason, lost_at, lost_by,
  queixas_faciais, metadata,
  wa_opt_in, last_contacted_at, last_response_at,
  created_at, updated_at, deleted_at
)
SELECT
  id,
  clinic_id,
  COALESCE(name, ''),
  COALESCE(phone, ''),
  email,
  cpf,
  rg,
  CASE
    -- legacy.birth_date eh text · v2 espera date · cast defensivo
    WHEN birth_date ~ '^\d{4}-\d{2}-\d{2}$' THEN birth_date::date
    ELSE NULL
  END,
  idade,
  COALESCE(phase, 'lead'),
  phase_updated_at,
  phase_updated_by,
  phase_origin,
  COALESCE(source, 'manual'),
  COALESCE(source_type, 'manual'),
  source_quiz_id,
  COALESCE(funnel, 'procedimentos'),
  COALESCE(ai_persona, 'onboarder'),
  COALESCE(temperature, 'warm'),
  COALESCE(priority, 'normal'),
  COALESCE(lead_score, 0),
  day_bucket,
  COALESCE(channel_mode, 'whatsapp'),
  assigned_to,
  COALESCE(is_in_recovery, false),
  lost_reason,
  lost_at,
  lost_by,
  COALESCE(queixas_faciais, '[]'::jsonb),
  -- metadata: junta `data` legacy + colunas extras nao-canonicas em v2
  jsonb_strip_nulls(jsonb_build_object(
    'data',                COALESCE(data, '{}'::jsonb),
    'legacy_status',       status,
    'legacy_is_active',    is_active,
    'conversation_status', conversation_status,
    'tipo',                tipo,
    'cnpj',                cnpj,
    'convenio',            convenio,
    'cor',                 cor,
    'sexo',                sexo,
    'estado_civil',        estado_civil,
    'profissao',           profissao,
    'endereco',            endereco,
    'origem',              origem,
    'tags_clinica',        tags_clinica,
    'queixas_corporais',   queixas_corporais,
    'tags_legacy',         tags,
    'migrated_at',         now(),
    'migrated_from',       'legacy_2026_04_28.leads'
  )),
  COALESCE(wa_opt_in, true),
  last_contacted_at,
  last_response_at,
  COALESCE(created_at, now()),
  COALESCE(updated_at, now()),
  deleted_at
FROM legacy_2026_04_28.leads
WHERE deleted_at IS NULL
  AND NOT (
       name ILIKE 'TEST%'
    OR name ILIKE 'Smoke%'
    OR name ILIKE 'Teste%'
    OR name = 'Legacy Path'
    OR name = 'Para A'
    OR phone LIKE '554451777135%'
  )
ON CONFLICT (id) DO NOTHING;

-- ── 2. Migrate patient · Adilso ─────────────────────────────────────────────

INSERT INTO public.patients (
  id, clinic_id, name, phone, email, cpf, rg, birth_date, sex,
  address_json, status, assigned_to, notes,
  total_procedures, total_revenue, first_procedure_at, last_procedure_at,
  source_lead_phase_at, source_lead_meta,
  created_at, updated_at, deleted_at
)
SELECT
  id,
  -- tenantId era TEXT (uuid serializado) · clinic_id era uuid mas as vezes
  -- staleness · prefere clinic_id se nao-NULL, senao cast tenantId.
  COALESCE(clinic_id, tenantId::uuid),
  name,
  phone,
  email,
  NULL, -- legacy nao tem cpf em patients
  rg,
  birth_date,
  sex,
  address_json,
  COALESCE(status, 'active'),
  assigned_to,
  notes,
  COALESCE("totalProcedures", 0),
  COALESCE("totalRevenue", 0)::numeric(12,2),
  -- timestamps legacy sao "without time zone" · cast pra "with time zone" UTC
  CASE
    WHEN "firstProcedureAt" IS NOT NULL
    THEN "firstProcedureAt" AT TIME ZONE 'UTC'
    ELSE NULL
  END,
  CASE
    WHEN "lastProcedureAt" IS NOT NULL
    THEN "lastProcedureAt" AT TIME ZONE 'UTC'
    ELSE NULL
  END,
  NULL, -- source_lead_phase_at · sem equivalente legacy
  jsonb_build_object(
    'lead_id_legacy',   lead_id::text,
    'tenantId_legacy',  tenantId,
    'migrated_at',      now(),
    'migrated_from',    'legacy_2026_04_28.patients'
  ),
  -- timestamps legacy createdAt/updatedAt sao "without time zone"
  CASE
    WHEN "createdAt" IS NOT NULL
    THEN "createdAt" AT TIME ZONE 'UTC'
    ELSE now()
  END,
  CASE
    WHEN "updatedAt" IS NOT NULL
    THEN "updatedAt" AT TIME ZONE 'UTC'
    ELSE now()
  END,
  deleted_at
FROM legacy_2026_04_28.patients
WHERE deleted_at IS NULL
  AND NOT (
       name ILIKE 'TEST%'
    OR name ILIKE 'Teste%'
    OR phone LIKE '554451777135%'
  )
ON CONFLICT (id) DO NOTHING;

-- ── 3. Sanity check pos-migration ───────────────────────────────────────────

DO $$
DECLARE
  v_leads_diff INT;
  v_patients_diff INT;
  v_legacy_real_leads INT;
  v_legacy_real_patients INT;
BEGIN
  -- Conta reais legacy (deve bater com expectativa)
  SELECT COUNT(*) INTO v_legacy_real_leads
  FROM legacy_2026_04_28.leads
  WHERE deleted_at IS NULL
    AND NOT (
         name ILIKE 'TEST%'
      OR name ILIKE 'Smoke%'
      OR name ILIKE 'Teste%'
      OR name = 'Legacy Path'
      OR name = 'Para A'
      OR phone LIKE '554451777135%'
    );

  SELECT COUNT(*) INTO v_legacy_real_patients
  FROM legacy_2026_04_28.patients
  WHERE deleted_at IS NULL
    AND NOT (
         name ILIKE 'TEST%'
      OR name ILIKE 'Teste%'
      OR phone LIKE '554451777135%'
    );

  -- Conta divergencia atual (esperado: 0 ou positivo · v2 tem >= legacy reais)
  SELECT v_legacy_real_leads - (
    SELECT COUNT(*) FROM public.leads
    WHERE deleted_at IS NULL
      AND id IN (SELECT id FROM legacy_2026_04_28.leads
                 WHERE deleted_at IS NULL
                 AND NOT (
                      name ILIKE 'TEST%'
                   OR name ILIKE 'Smoke%'
                   OR name ILIKE 'Teste%'
                   OR name = 'Legacy Path'
                   OR name = 'Para A'
                   OR phone LIKE '554451777135%'
                 ))
  ) INTO v_leads_diff;

  SELECT v_legacy_real_patients - (
    SELECT COUNT(*) FROM public.patients
    WHERE deleted_at IS NULL
      AND id IN (SELECT id FROM legacy_2026_04_28.patients
                 WHERE deleted_at IS NULL
                 AND NOT (
                      name ILIKE 'TEST%'
                   OR name ILIKE 'Teste%'
                   OR phone LIKE '554451777135%'
                 ))
  ) INTO v_patients_diff;

  RAISE NOTICE 'Migration sanity:';
  RAISE NOTICE '  legacy real leads: %', v_legacy_real_leads;
  RAISE NOTICE '  leads gap (legacy real - migrated): %', v_leads_diff;
  RAISE NOTICE '  legacy real patients: %', v_legacy_real_patients;
  RAISE NOTICE '  patients gap: %', v_patients_diff;

  IF v_leads_diff > 0 THEN
    RAISE WARNING 'Algums leads reais nao foram migrados (diff=%) · investigar', v_leads_diff;
  END IF;
  IF v_patients_diff > 0 THEN
    RAISE WARNING 'Algums patients reais nao foram migrados (diff=%) · investigar', v_patients_diff;
  END IF;
END;
$$;

COMMIT;
