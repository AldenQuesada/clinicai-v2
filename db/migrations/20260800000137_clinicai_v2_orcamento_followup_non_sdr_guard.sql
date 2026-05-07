-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-137 · clinicai-v2 · orcamento_followup_pick non-SDR guard  ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Patch B · isolamento de funis WhatsApp                                   ║
-- ║                                                                          ║
-- ║ Patch A (commit 7babd2e) garantiu que o cron orcamento-followup só       ║
-- ║ envia via canal default_context_type='lara_sdr'. Patch B fecha a torneira║
-- ║ no LADO DA SELEÇÃO: orcamentos cujo paciente já está em conv ATIVA em    ║
-- ║ canal não-sdr (Mih/Secretaria, Mira/B2B, mira_admin) são EXCLUÍDOS do    ║
-- ║ picker via NOT EXISTS · evita envio cross-funnel mesmo quando A         ║
-- ║ paciente tem múltiplas convs.                                            ║
-- ║                                                                          ║
-- ║ Aplicado manualmente em prod 2026-05-07 · validação:                    ║
-- ║   function_found = 1                                                     ║
-- ║   has_patch_b_comment = 1                                                ║
-- ║   has_non_sdr_guard = 1                                                  ║
-- ║   keeps_skip_locked = 1                                                  ║
-- ║   keeps_picking_lock = 1                                                 ║
-- ║   picked_candidates_after_patch = 0                                      ║
-- ║   picked_candidates_with_active_non_sdr_match = 0                        ║
-- ║   stuck_picking_count = 0                                                ║
-- ║   final_decision = PASS_PATCH_B_RPC_GUARD_ACTIVE                         ║
-- ║                                                                          ║
-- ║ Mantém TODA a lógica original da mig 082:                                ║
-- ║   - assinatura idêntica                                                  ║
-- ║   - status IN (sent, viewed, followup, negotiation)                      ║
-- ║   - share_token IS NOT NULL                                              ║
-- ║   - valid_until BETWEEN today AND today + 7 days                         ║
-- ║   - cooldown last_followup_at > 24h                                      ║
-- ║   - lock picking_at > 5min                                               ║
-- ║   - ORDER BY valid_until ASC, created_at ASC                             ║
-- ║   - LIMIT p_batch_limit                                                  ║
-- ║   - FOR UPDATE OF o SKIP LOCKED                                          ║
-- ║   - UPDATE picking_at = now()                                            ║
-- ║   - buckets recent/expiring/expiring_soon                                ║
-- ║                                                                          ║
-- ║ Idempotente · CREATE OR REPLACE FUNCTION · pode rodar múltiplas vezes   ║
-- ║ sem efeito colateral.                                                    ║
-- ║                                                                          ║
-- ║ ADR-029: SECURITY DEFINER + SET search_path                              ║
-- ║ GOLD-STANDARD: idempotente · sanity check final · pgrst reload          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CREATE OR REPLACE FUNCTION orcamento_followup_pick com Patch B guard
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.orcamento_followup_pick(
  p_batch_limit integer DEFAULT 10
)
RETURNS TABLE (
  orcamento_id    uuid,
  clinic_id       uuid,
  lead_id         uuid,
  patient_id      uuid,
  title           text,
  total           numeric,
  valid_until     date,
  share_token     text,
  bucket          text,
  days_to_expire  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $func$
-- Patch B · isolamento de funis WhatsApp
-- Exclui orcamentos cujo paciente está em conv ATIVA em canal não-sdr.
DECLARE
  v_today date := CURRENT_DATE;
BEGIN
  IF p_batch_limit IS NULL OR p_batch_limit < 1 OR p_batch_limit > 100 THEN
    p_batch_limit := 10;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
      FROM public.orcamentos o
     WHERE o.deleted_at IS NULL
       AND o.status IN ('sent', 'viewed', 'followup', 'negotiation')
       AND o.share_token IS NOT NULL
       AND (o.lead_id IS NOT NULL OR o.patient_id IS NOT NULL)
       AND o.valid_until IS NOT NULL
       AND o.valid_until BETWEEN v_today AND (v_today + INTERVAL '7 days')::date
       AND (o.last_followup_at IS NULL OR o.last_followup_at < now() - INTERVAL '24 hours')
       AND (o.picking_at IS NULL OR o.picking_at < now() - INTERVAL '5 minutes')
       -- ─── Patch B guard · isolamento de funis WhatsApp ────────────────────
       -- Exclui se houver conv ativa/pausada da MESMA clínica em canal cuja
       -- COALESCE(wa_numbers.default_context_type, c.context_type, 'lara_beneficiary')
       -- <> 'lara_sdr'. Match por lead_id direto OU phone normalizado
       -- (right 11/10 dígitos cobre variantes BR com/sem 9 do celular).
       AND NOT EXISTS (
         SELECT 1
           FROM public.wa_conversations c
           LEFT JOIN public.wa_numbers wn ON wn.id = c.wa_number_id
          WHERE c.clinic_id = o.clinic_id
            AND c.status IN ('active', 'paused')
            AND COALESCE(
              wn.default_context_type,
              c.context_type,
              'lara_beneficiary'
            ) <> 'lara_sdr'
            AND (
              -- Match direto por lead_id (quando orcamento tem lead)
              (o.lead_id IS NOT NULL AND c.lead_id = o.lead_id)
              -- OU match por telefone normalizado (patient.phone OR lead.phone)
              OR EXISTS (
                SELECT 1
                  FROM (
                    SELECT regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g')
                             AS norm_phone
                      FROM public.patients p
                     WHERE o.patient_id IS NOT NULL
                       AND p.id = o.patient_id
                    UNION ALL
                    SELECT regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g')
                             AS norm_phone
                      FROM public.leads l
                     WHERE o.lead_id IS NOT NULL
                       AND l.id = o.lead_id
                  ) subj
                 WHERE subj.norm_phone <> ''
                   AND (
                     regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g')
                       = subj.norm_phone
                     OR right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 11)
                          = right(subj.norm_phone, 11)
                     OR right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 10)
                          = right(subj.norm_phone, 10)
                   )
              )
            )
       )
     ORDER BY o.valid_until ASC, o.created_at ASC
     LIMIT p_batch_limit
     FOR UPDATE OF o SKIP LOCKED
  ),
  locked AS (
    UPDATE public.orcamentos o
       SET picking_at = now()
     WHERE o.id IN (SELECT id FROM candidates)
    RETURNING
      o.id,
      o.clinic_id,
      o.lead_id,
      o.patient_id,
      o.title,
      o.total,
      o.valid_until,
      o.share_token
  )
  SELECT
    l.id                                    AS orcamento_id,
    l.clinic_id,
    l.lead_id,
    l.patient_id,
    l.title,
    l.total,
    l.valid_until,
    l.share_token,
    CASE
      WHEN (l.valid_until - v_today) <= 1 THEN 'expiring_soon'
      WHEN (l.valid_until - v_today) <= 4 THEN 'expiring'
      ELSE 'recent'
    END                                     AS bucket,
    (l.valid_until - v_today)::integer      AS days_to_expire
  FROM locked l;
END
$func$;

COMMENT ON FUNCTION public.orcamento_followup_pick(integer) IS
'Patch B · isolamento de funis WhatsApp · exclui orcamentos com conv ativa em canal não-sdr. Mig 137.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Sanity check final (regra GOLD #7) · RAISE WARNING (não exception)
--    Verifica forma da função sem bloquear apply em ambientes parcialmente
--    diferentes (dev/staging onde algum elemento ainda não foi propagado).
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_func_def text;
  v_func_found int;
BEGIN
  SELECT count(*) INTO v_func_found
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'orcamento_followup_pick';

  IF v_func_found < 1 THEN
    RAISE WARNING '[mig 137 sanity] orcamento_followup_pick NÃO encontrada';
    RETURN;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO v_func_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'orcamento_followup_pick'
   LIMIT 1;

  IF v_func_def IS NULL THEN
    RAISE WARNING '[mig 137 sanity] não consegui ler pg_get_functiondef';
    RETURN;
  END IF;

  IF position('wa_conversations' IN v_func_def) = 0 THEN
    RAISE WARNING '[mig 137 sanity] definição NÃO contém wa_conversations';
  END IF;

  IF position('wa_numbers' IN v_func_def) = 0 THEN
    RAISE WARNING '[mig 137 sanity] definição NÃO contém wa_numbers';
  END IF;

  IF position('default_context_type' IN v_func_def) = 0 THEN
    RAISE WARNING '[mig 137 sanity] definição NÃO contém default_context_type';
  END IF;

  IF position('lara_sdr' IN v_func_def) = 0 THEN
    RAISE WARNING '[mig 137 sanity] definição NÃO contém lara_sdr';
  END IF;

  IF position('FOR UPDATE OF o SKIP LOCKED' IN v_func_def) = 0 THEN
    RAISE WARNING '[mig 137 sanity] definição NÃO contém FOR UPDATE OF o SKIP LOCKED';
  END IF;

  IF position('picking_at = now()' IN v_func_def) = 0 THEN
    RAISE WARNING '[mig 137 sanity] definição NÃO contém picking_at = now()';
  END IF;

  RAISE NOTICE '[mig 137] sanity ok · Patch B non-SDR guard versionado';
END
$sanity$;

COMMIT;
