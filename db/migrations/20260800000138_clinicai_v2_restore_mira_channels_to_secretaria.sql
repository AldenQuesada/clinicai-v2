-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-138 · clinicai-v2 · restore Mira channels → Secretaria     ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Reverte a classificação dos 3 canais "Mira/admin" pra inbox da           ║
-- ║ Secretaria. Decisão Alden 2026-05-07: esses números devem aparecer no    ║
-- ║ fluxo operacional /secretaria, não ficar isolados como b2b/mira.         ║
-- ║                                                                          ║
-- ║ Canais corrigidos:                                                       ║
-- ║   ba402890-... · 5544998782003  · Canal auxiliar (a confirmar uso)       ║
-- ║   8f33e269-... · 5544998787673  · Mira (onboarding + parceiros B2B)      ║
-- ║   42bc681f-... · 5544991681891  · Mira Marci                             ║
-- ║                                                                          ║
-- ║ Antes (mig 136):                                                         ║
-- ║   ba402890 · default_context_type='mira_admin' · inbox_role='b2b'        ║
-- ║   8f33e269 · default_context_type='mira_b2b'   · inbox_role='b2b'        ║
-- ║   42bc681f · default_context_type='mira_b2b'   · inbox_role='b2b'        ║
-- ║                                                                          ║
-- ║ Depois (mig 138):                                                        ║
-- ║   3× default_context_type='secretaria_general' · inbox_role='secretaria' ║
-- ║                                                                          ║
-- ║ Aplicado manualmente em prod 2026-05-07 · validação observada:           ║
-- ║   target_numbers_found = 3                                               ║
-- ║   target_numbers_now_secretaria = 3                                      ║
-- ║   target_conversations_total = 6                                         ║
-- ║   target_conversations_now_secretaria = 6                                ║
-- ║   active_or_paused_now_enter_secretaria_dash = 4                         ║
-- ║   archived_now_secretaria_but_still_archived = 2                         ║
-- ║   final_decision =                                                       ║
-- ║     PASS_TARGET_NUMBERS_AND_CONVERSATIONS_ARE_SECRETARIA                 ║
-- ║                                                                          ║
-- ║ Regras desta migration:                                                  ║
-- ║   - Idempotente · UPDATE só onde valor diverge do alvo.                  ║
-- ║   - Preserva status das conversas (NÃO reativa archived).                ║
-- ║   - Não toca em wa_number_id (canal continua o mesmo).                   ║
-- ║   - deleted_at IS NULL nas conversas pra evitar tocar em soft-deleted.   ║
-- ║   - metadata.reclassified_to_secretaria_inbox = timestamp pra audit.     ║
-- ║   - Sanity final · RAISE WARNING (não exception) · não bloqueia apply    ║
-- ║     em ambientes parcialmente diferentes (dev/staging).                  ║
-- ║                                                                          ║
-- ║ ADR-029 / GOLD-STANDARD aplicáveis:                                      ║
-- ║   - DO block guarded · CTE target_numbers · UPDATE same-value-safe       ║
-- ║   - NOTIFY pgrst final · pode rodar múltiplas vezes sem efeito colateral ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. UPDATE wa_numbers · 3 alvos · só quando valor diverge
-- ═══════════════════════════════════════════════════════════════════════════

WITH target_numbers AS (
  SELECT id FROM (VALUES
    ('ba402890-409c-40e0-974b-f56cedb872f8'::uuid),
    ('8f33e269-b1c4-4d3d-8e5b-3a11f8adf7db'::uuid),
    ('42bc681f-e73c-435a-a8f7-1bc45c0460ea'::uuid)
  ) AS t(id)
)
UPDATE public.wa_numbers w
   SET inbox_role           = 'secretaria',
       default_context_type = 'secretaria_general',
       updated_at           = now()
  FROM target_numbers t
 WHERE w.id = t.id
   AND (
     w.inbox_role           IS DISTINCT FROM 'secretaria'
     OR w.default_context_type IS DISTINCT FROM 'secretaria_general'
   );

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. UPDATE wa_conversations · só convs vinculadas aos 3 wa_numbers, não
--    soft-deletadas, e só quando inbox_role/context_type divergem do alvo.
--    Status preservado (NÃO reativa archived · isso é responsabilidade do
--    saveOutbound canônico via MessageRepository, commit 38e6e16).
-- ═══════════════════════════════════════════════════════════════════════════

WITH target_numbers AS (
  SELECT id FROM (VALUES
    ('ba402890-409c-40e0-974b-f56cedb872f8'::uuid),
    ('8f33e269-b1c4-4d3d-8e5b-3a11f8adf7db'::uuid),
    ('42bc681f-e73c-435a-a8f7-1bc45c0460ea'::uuid)
  ) AS t(id)
)
UPDATE public.wa_conversations c
   SET inbox_role   = 'secretaria',
       context_type = 'secretaria_general',
       updated_at   = now(),
       metadata     = COALESCE(c.metadata, '{}'::jsonb)
                      || jsonb_build_object(
                           'reclassified_to_secretaria_inbox',
                           jsonb_build_object(
                             'at',           now(),
                             'migration',    '20260800000138',
                             'from_inbox_role',   c.inbox_role,
                             'from_context_type', c.context_type
                           )
                         )
  FROM target_numbers t
 WHERE c.wa_number_id = t.id
   AND c.deleted_at IS NULL
   AND (
     c.inbox_role   IS DISTINCT FROM 'secretaria'
     OR c.context_type IS DISTINCT FROM 'secretaria_general'
   );

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Sanity check final (regra GOLD #7) · RAISE WARNING (não exception)
--    Não bloqueia apply em ambientes onde algum wa_number ainda não foi
--    propagado · só sinaliza divergência.
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_targets uuid[] := ARRAY[
    'ba402890-409c-40e0-974b-f56cedb872f8'::uuid,
    '8f33e269-b1c4-4d3d-8e5b-3a11f8adf7db'::uuid,
    '42bc681f-e73c-435a-a8f7-1bc45c0460ea'::uuid
  ];
  v_numbers_found       int;
  v_numbers_inbox_ok    int;
  v_numbers_context_ok  int;
  v_convs_total         int;
  v_convs_inbox_ok      int;
  v_convs_context_ok    int;
BEGIN
  -- 4.1 · 3 wa_numbers existem
  SELECT count(*) INTO v_numbers_found
    FROM public.wa_numbers
   WHERE id = ANY(v_targets);
  IF v_numbers_found < 3 THEN
    RAISE WARNING '[mig 138 sanity] esperava 3 wa_numbers alvo, encontrou %', v_numbers_found;
  END IF;

  -- 4.2 · 3 wa_numbers em inbox_role='secretaria'
  SELECT count(*) INTO v_numbers_inbox_ok
    FROM public.wa_numbers
   WHERE id = ANY(v_targets)
     AND inbox_role = 'secretaria';
  IF v_numbers_inbox_ok < v_numbers_found THEN
    RAISE WARNING '[mig 138 sanity] %/% wa_numbers alvo em inbox_role=secretaria',
      v_numbers_inbox_ok, v_numbers_found;
  END IF;

  -- 4.3 · 3 wa_numbers em default_context_type='secretaria_general'
  SELECT count(*) INTO v_numbers_context_ok
    FROM public.wa_numbers
   WHERE id = ANY(v_targets)
     AND default_context_type = 'secretaria_general';
  IF v_numbers_context_ok < v_numbers_found THEN
    RAISE WARNING '[mig 138 sanity] %/% wa_numbers alvo em default_context_type=secretaria_general',
      v_numbers_context_ok, v_numbers_found;
  END IF;

  -- 4.4 · conversas dos 3 wa_numbers (não soft-deletadas)
  SELECT count(*) INTO v_convs_total
    FROM public.wa_conversations
   WHERE wa_number_id = ANY(v_targets)
     AND deleted_at IS NULL;

  IF v_convs_total > 0 THEN
    -- 4.5 · todas em inbox_role='secretaria'
    SELECT count(*) INTO v_convs_inbox_ok
      FROM public.wa_conversations
     WHERE wa_number_id = ANY(v_targets)
       AND deleted_at IS NULL
       AND inbox_role = 'secretaria';
    IF v_convs_inbox_ok < v_convs_total THEN
      RAISE WARNING '[mig 138 sanity] %/% conversas alvo em inbox_role=secretaria',
        v_convs_inbox_ok, v_convs_total;
    END IF;

    -- 4.6 · todas em context_type='secretaria_general'
    SELECT count(*) INTO v_convs_context_ok
      FROM public.wa_conversations
     WHERE wa_number_id = ANY(v_targets)
       AND deleted_at IS NULL
       AND context_type = 'secretaria_general';
    IF v_convs_context_ok < v_convs_total THEN
      RAISE WARNING '[mig 138 sanity] %/% conversas alvo em context_type=secretaria_general',
        v_convs_context_ok, v_convs_total;
    END IF;
  END IF;

  RAISE NOTICE
    '[mig 138] sanity ok · numbers=% (%/% inbox, %/% ctx) · convs=% (%/% inbox, %/% ctx)',
    v_numbers_found,
    v_numbers_inbox_ok, v_numbers_found,
    v_numbers_context_ok, v_numbers_found,
    v_convs_total,
    v_convs_inbox_ok, v_convs_total,
    v_convs_context_ok, v_convs_total;
END
$sanity$;

COMMIT;
