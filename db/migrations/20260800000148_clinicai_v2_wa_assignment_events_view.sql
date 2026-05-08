-- =============================================================================
-- 20260800000148_clinicai_v2_wa_assignment_events_view.sql
-- Versiona view semantica criada manualmente em prod 2026-05-08:
--   public.wa_conversation_assignment_events_view
-- =============================================================================
--
-- Contexto:
-- Trigger generica trg_audit_wa_conversations (AFTER INSERT/UPDATE/DELETE)
-- ja grava em audit_wa_conversations · campos assigned_to/assigned_at sao
-- capturados em changed_fields, old_data, new_data, actor_user_id, audit_at.
--
-- Decisao arquitetural:
-- NAO criar tabela nova. Manter audit_wa_conversations como log bruto.
-- Versionar view canonica semantica POR CIMA · rotula transicoes
-- (assigned/returned/reassigned/profile_changed/updated) e resolve buckets
-- de owner (secretaria/alden/mirian/luciana/responsavel).
--
-- View criada manualmente em prod · esta migration reproduz EXATAMENTE
-- (auditado via pg_views/information_schema 2026-05-08):
--   - 21 colunas · ordem preservada
--   - UUID regex validation antes de cast (evita ::uuid em strings invalidas)
--   - Owner resolution: NULL=secretaria · UUID Alden · UUID Mirian · LIKE
--     %luciana% · ELSE 'responsavel'
--   - assignment_action: 5 buckets em ordem fixa
--
-- Estado em prod (validado · spec do user):
--   assigned        secretaria → alden       2
--   assigned        secretaria → mirian      9
--   profile_changed luciana    → luciana     1
--   returned        alden      → secretaria  2
--   returned        mirian     → secretaria  8
--
-- ⚠️  CREATE OR REPLACE VIEW · idempotente · safe rerun.
-- Aplicacao manual em prod (gold-standard pra views · convencao mig 126-147).
-- =============================================================================

CREATE OR REPLACE VIEW public.wa_conversation_assignment_events_view AS
WITH assignment_audit AS (
  SELECT
    a.id AS audit_id,
    a.audit_at,
    a.operation,
    a.conversation_id,
    a.clinic_id,
    a.actor_user_id,
    a.actor_role,
    a.audit_reason,
    a.changed_fields,
    -- UUID regex valida antes do cast · evita erro em strings nao-uuid
    -- ('null', '', etc) que poderiam vir de jsonb mal-formatado.
    CASE
      WHEN (a.old_data ->> 'assigned_to') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN ((a.old_data ->> 'assigned_to'))::uuid
      ELSE NULL::uuid
    END AS from_assigned_to,
    CASE
      WHEN (a.new_data ->> 'assigned_to') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN ((a.new_data ->> 'assigned_to'))::uuid
      ELSE NULL::uuid
    END AS to_assigned_to,
    (a.old_data ->> 'assigned_at') AS old_assigned_at,
    (a.new_data ->> 'assigned_at') AS new_assigned_at,
    COALESCE((a.new_data ->> 'phone'), (a.old_data ->> 'phone')) AS phone,
    COALESCE((a.new_data ->> 'display_name'), (a.old_data ->> 'display_name')) AS display_name,
    COALESCE((a.new_data ->> 'status'), (a.old_data ->> 'status')) AS status
  FROM public.audit_wa_conversations a
  WHERE a.operation = 'UPDATE'
    AND a.changed_fields && ARRAY['assigned_to', 'assigned_at']
),
owner_resolved AS (
  SELECT
    aa.audit_id,
    aa.audit_at,
    aa.operation,
    aa.conversation_id,
    aa.clinic_id,
    aa.actor_user_id,
    aa.actor_role,
    aa.audit_reason,
    aa.changed_fields,
    aa.from_assigned_to,
    aa.to_assigned_to,
    aa.old_assigned_at,
    aa.new_assigned_at,
    aa.phone,
    aa.display_name,
    aa.status,
    NULLIF(TRIM(concat_ws(' ', old_p.first_name, old_p.last_name)), '') AS from_assigned_to_name,
    NULLIF(TRIM(concat_ws(' ', new_p.first_name, new_p.last_name)), '') AS to_assigned_to_name,
    CASE
      WHEN aa.from_assigned_to IS NULL THEN 'secretaria'
      WHEN aa.from_assigned_to = '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid THEN 'alden'
      WHEN aa.from_assigned_to = '20289f86-0895-403d-a19e-c24ac87e85a0'::uuid THEN 'mirian'
      WHEN lower(COALESCE(TRIM(concat_ws(' ', old_p.first_name, old_p.last_name)), '')) LIKE '%luciana%' THEN 'luciana'
      ELSE 'responsavel'
    END AS from_owner,
    CASE
      WHEN aa.to_assigned_to IS NULL THEN 'secretaria'
      WHEN aa.to_assigned_to = '06757b9f-2a03-43ae-bd37-28021eb6afeb'::uuid THEN 'alden'
      WHEN aa.to_assigned_to = '20289f86-0895-403d-a19e-c24ac87e85a0'::uuid THEN 'mirian'
      WHEN lower(COALESCE(TRIM(concat_ws(' ', new_p.first_name, new_p.last_name)), '')) LIKE '%luciana%' THEN 'luciana'
      ELSE 'responsavel'
    END AS to_owner
  FROM assignment_audit aa
    LEFT JOIN public.profiles old_p ON old_p.id = aa.from_assigned_to
    LEFT JOIN public.profiles new_p ON new_p.id = aa.to_assigned_to
),
classified AS (
  SELECT
    o.audit_id,
    o.audit_at,
    o.operation,
    o.conversation_id,
    o.clinic_id,
    o.actor_user_id,
    o.actor_role,
    o.audit_reason,
    o.changed_fields,
    o.from_assigned_to,
    o.to_assigned_to,
    o.old_assigned_at,
    o.new_assigned_at,
    o.phone,
    o.display_name,
    o.status,
    o.from_assigned_to_name,
    o.to_assigned_to_name,
    o.from_owner,
    o.to_owner,
    -- Ordem dos branches eh critica:
    -- 1. NULL→UUID = assigned
    -- 2. UUID→NULL = returned
    -- 3. UUID→UUID distinto AND mesmo owner bucket = profile_changed
    --    (ex: troca de profile do mesmo dono · raro · audit interno)
    -- 4. UUID→UUID distinto = reassigned (troca de dono)
    -- 5. fallback = updated (assigned_at sem mudar assigned_to · etc)
    CASE
      WHEN o.from_assigned_to IS NULL AND o.to_assigned_to IS NOT NULL THEN 'assigned'
      WHEN o.from_assigned_to IS NOT NULL AND o.to_assigned_to IS NULL THEN 'returned'
      WHEN o.from_assigned_to IS NOT NULL
        AND o.to_assigned_to IS NOT NULL
        AND o.from_assigned_to IS DISTINCT FROM o.to_assigned_to
        AND o.from_owner = o.to_owner THEN 'profile_changed'
      WHEN o.from_assigned_to IS NOT NULL
        AND o.to_assigned_to IS NOT NULL
        AND o.from_assigned_to IS DISTINCT FROM o.to_assigned_to THEN 'reassigned'
      ELSE 'updated'
    END AS assignment_action
  FROM owner_resolved o
)
SELECT
  audit_id,
  audit_at,
  operation,
  conversation_id,
  clinic_id,
  actor_user_id,
  actor_role,
  audit_reason,
  changed_fields,
  assignment_action,
  from_owner,
  from_assigned_to,
  from_assigned_to_name,
  to_owner,
  to_assigned_to,
  to_assigned_to_name,
  old_assigned_at,
  new_assigned_at,
  phone,
  display_name,
  status
FROM classified;

COMMENT ON VIEW public.wa_conversation_assignment_events_view IS
'Semantic read-only view over audit_wa_conversations for WhatsApp conversation assignment, return, reassignment and technical profile-change history.';

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- FIM · 20260800000148 · Aplicacao manual em prod ja realizada · este arquivo
-- versiona o estado atual + permite rerun idempotente em ambientes futuros.
-- =============================================================================
