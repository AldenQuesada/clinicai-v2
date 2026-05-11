-- ============================================================================
-- FASE 2D.2 · POST-APPLY VALIDATION · appt_upsert / appt_sync_batch canon
-- ============================================================================
-- Rode estas queries APÓS o apply da mig 153 e cole os outputs no chat.
-- Todas SELECT (zero mutação · exceto blocos 9/10 que são SMOKE com fixture).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-1 · Defs atuais das 3 funções
-- ─────────────────────────────────────────────────────────────────────────────
SELECT pg_get_functiondef('public.appt_upsert(jsonb)'::regprocedure)        AS appt_upsert_def;
SELECT pg_get_functiondef('public.appt_sync_batch(jsonb)'::regprocedure)    AS appt_sync_batch_def;
SELECT pg_get_functiondef('public._appt_upsert_one(jsonb, uuid)'::regprocedure) AS _appt_upsert_one_def;

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-2 · appt_upsert NÃO menciona colunas legadas
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.proname,
  position('patient_name'      IN pg_get_functiondef(p.oid)) > 0 AS mentions_patient_name,
  position('patient_phone'     IN pg_get_functiondef(p.oid)) > 0 AS mentions_patient_phone,
  position('professional_idx'  IN pg_get_functiondef(p.oid)) > 0 AS mentions_professional_idx,
  position('room_idx'          IN pg_get_functiondef(p.oid)) > 0 AS mentions_room_idx,
  position('subject_name'      IN pg_get_functiondef(p.oid)) > 0 AS mentions_subject_name,
  position('subject_phone'     IN pg_get_functiondef(p.oid)) > 0 AS mentions_subject_phone,
  position('professional_id'   IN pg_get_functiondef(p.oid)) > 0 AS mentions_professional_id
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('appt_upsert','appt_sync_batch','_appt_upsert_one')
ORDER BY p.proname;
-- Esperado:
--   mentions_patient_name      = false
--   mentions_patient_phone     = false
--   mentions_professional_idx  = false
--   mentions_room_idx          = false
--   mentions_subject_name      = true
--   mentions_subject_phone     = true
--   mentions_professional_id   = true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-3 · GRANTs preservados após CREATE OR REPLACE
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  n.nspname AS schema,
  p.proname AS function,
  pg_get_userbyid(a.acl[i].grantee) AS grantee,
  a.acl[i].privilege_type AS privilege
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN LATERAL aclexplode(p.proacl) a(acl) ON true
WHERE n.nspname='public'
  AND p.proname IN ('appt_upsert','appt_sync_batch','_appt_upsert_one')
ORDER BY p.proname, grantee;
-- Esperado para appt_upsert e appt_sync_batch:
--   grantees authenticated, service_role (EXECUTE)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-4 · Tracker registra mig 153
-- ─────────────────────────────────────────────────────────────────────────────
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version = '20260800000153';

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-5 · Distribuição atual de appointments (baseline)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT status, count(*) AS total
FROM public.appointments
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY total DESC;

SELECT count(*) AS total_active
FROM public.appointments
WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SMOKE TESTS (rodar APENAS com lead/patient de teste interno)
-- ─────────────────────────────────────────────────────────────────────────────

-- VAL-6 · Smoke negativo · payload mínimo faltando deve retornar erro tipado
-- (NÃO grava nada · função aborta antes do INSERT)
SELECT public.appt_upsert(jsonb_build_object(
  'id', gen_random_uuid()::text
)) AS smoke_missing_subject_name;
-- Esperado: { ok:false, error:'subject_name_required' }

-- VAL-7 · Smoke negativo · pacienteId inexistente
SELECT public.appt_upsert(jsonb_build_object(
  'id', gen_random_uuid()::text,
  'pacienteNome', 'Smoke Test',
  'pacienteId',   gen_random_uuid()::text,    -- UUID aleatório · não existe
  'data',         (CURRENT_DATE + interval '1 day')::date::text,
  'horaInicio',   '10:00',
  'horaFim',      '11:00',
  'procedimento', 'smoke'
)) AS smoke_invalid_subject;
-- Esperado: { ok:false, error:'invalid_lead_or_patient_id' }

-- VAL-8 · Smoke negativo · end <= start
SELECT public.appt_upsert(jsonb_build_object(
  'id', gen_random_uuid()::text,
  'pacienteNome', 'Smoke Test',
  'data',         (CURRENT_DATE + interval '1 day')::date::text,
  'horaInicio',   '11:00',
  'horaFim',      '10:00',
  'procedimento', 'smoke',
  'status',       'bloqueado'      -- bloqueado dispensa subject
)) AS smoke_end_before_start;
-- Esperado: { ok:false, error:'end_time_must_be_after_start_time' }

-- VAL-9 · Smoke positivo · INSERT real com fixture interno
-- ⚠️ ATENÇÃO: usar lead de teste interno conhecido (ex: Alden Teste Manual
-- lead_id = ce4a01ae-581e-434c-a291-4316617c8727 se ainda existir).
-- Substitua <LEAD_ID> antes de rodar.
/*
SELECT public.appt_upsert(jsonb_build_object(
  'id',             gen_random_uuid()::text,
  'pacienteNome',   'Smoke Test 153',
  'pacienteId',     '<LEAD_ID>',
  'pacientePhone',  '5544988888888',
  'data',           (CURRENT_DATE + interval '7 days')::date::text,
  'horaInicio',     '09:00',
  'horaFim',        '10:00',
  'procedimento',   'smoke procedure',
  'status',         'agendado',
  'origem',         'smoke_153'
)) AS smoke_insert;
-- Esperado: { ok:true, id:'<uuid>', id_remapped:false, action:'inserted' }
*/

-- VAL-10 · Confirmar smoke row gravado com schema canon
-- ⚠️ Substituir <SMOKE_ID> pelo id retornado pela VAL-9
/*
SELECT id, lead_id, patient_id, subject_name, subject_phone,
       professional_id, professional_name, scheduled_date, start_time, end_time,
       procedure_name, status, origem, created_at
FROM public.appointments
WHERE id = '<SMOKE_ID>';
-- Esperado:
--   subject_name='Smoke Test 153'
--   subject_phone='5544988888888'
--   lead_id NOT NULL (se LEAD_ID era lead) OU patient_id NOT NULL
--   status='agendado'
--   origem='smoke_153'
*/

-- VAL-11 · Limpar fixture (UPDATE soft-delete · não DELETE real)
-- ⚠️ Substituir <SMOKE_ID>
/*
UPDATE public.appointments
   SET deleted_at = now()
 WHERE id = '<SMOKE_ID>'
   AND origem = 'smoke_153';
*/

-- VAL-12 · Smoke id_remapped · id legacy não-UUID
/*
SELECT public.appt_upsert(jsonb_build_object(
  'id',             'appt_legacy_test_153',
  'pacienteNome',   'Smoke Remap',
  'pacienteId',     '<LEAD_ID>',
  'data',           (CURRENT_DATE + interval '7 days')::date::text,
  'horaInicio',     '11:00',
  'horaFim',        '12:00',
  'procedimento',   'smoke remap',
  'status',         'agendado',
  'origem',         'smoke_153_remap'
)) AS smoke_remap;
-- Esperado: { ok:true, id:'<uuid>', id_remapped:true, id_legacy_input:'appt_legacy_test_153', action:'inserted' }
-- Limpar depois com mesmo padrão da VAL-11
*/
