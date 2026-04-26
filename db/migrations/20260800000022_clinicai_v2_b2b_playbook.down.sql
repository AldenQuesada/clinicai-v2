-- Down 800-22 · clinicai-v2 · b2b_playbook
--
-- Drop em ordem inversa.
-- AVISO: dropar b2b_partnership_tasks/contents/metas perde os dados aplicados.
-- Em prod, considerar migrar antes de rodar este down.

BEGIN;

DROP FUNCTION IF EXISTS public.b2b_apply_playbook(uuid, text);

DROP TABLE IF EXISTS public.b2b_playbook_applications;
DROP TABLE IF EXISTS public.b2b_partnership_metas;
DROP TABLE IF EXISTS public.b2b_partnership_contents;
DROP TABLE IF EXISTS public.b2b_partnership_tasks;
DROP TABLE IF EXISTS public.b2b_playbook_templates;

COMMIT;
