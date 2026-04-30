-- Reverte mig 800-90 · DELETE rows que tem metadata.migrated_from = legacy_2026_04_28.X
-- ⚠️ DESTRUTIVO · use somente se migration corrompeu dados v2 e voce quer
-- voltar ao baseline. Backup snapshot RECOMENDADO antes.
BEGIN;

DELETE FROM public.patients
  WHERE source_lead_meta->>'migrated_from' = 'legacy_2026_04_28.patients';

DELETE FROM public.leads
  WHERE metadata->>'migrated_from' = 'legacy_2026_04_28.leads';

COMMIT;
