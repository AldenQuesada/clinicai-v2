-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-136 · clinicai-v2 · wa_numbers.default_context_type +     ║
-- ║                     backfill context_type por canal                      ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Estende o discriminador de contexto (mig 001) de 3 → 6 valores e amarra ║
-- ║ cada wa_number ao seu context_type canônico via nova coluna             ║
-- ║ default_context_type. Trigger fn_wa_conversations_inbox_role_sync       ║
-- ║ passa a sincronizar context_type junto com inbox_role.                  ║
-- ║                                                                          ║
-- ║ Antes (mig 001): context_type IN (mira_b2b, mira_admin, lara_beneficiary)║
-- ║ Depois (mig 136): + lara_sdr, secretaria_patient, secretaria_general    ║
-- ║                                                                          ║
-- ║ Mapping wa_number → default_context_type (validado em produção          ║
-- ║ 2026-05-07):                                                             ║
-- ║   ead8a6f9-... · Mih · Secretaria      → secretaria_patient             ║
-- ║   2685f8c1-... · Lara Cloud 88773      → lara_sdr                       ║
-- ║   8f33e269-... · Mira mira-mirian 7673 → mira_b2b                       ║
-- ║   ba402890-... · Canal Mirian admin    → mira_admin                     ║
-- ║   42bc681f-... · Mira Marci            → mira_b2b                       ║
-- ║                                                                          ║
-- ║ Aplicado manualmente em prod 2026-05-07. Validações observadas:         ║
-- ║   number_defaults_ok = 5                                                 ║
-- ║   number_defaults_mismatch = 0                                           ║
-- ║   total_mismatches = 0                                                   ║
-- ║   total_still_lara_beneficiary_on_target_numbers = 0                    ║
-- ║   Conversations backfilled:                                              ║
-- ║     Secretaria: 73 active + 6 archived                                   ║
-- ║     Lara:       55 active + 4 archived + 1 closed                        ║
-- ║     Mira:        4 active + 2 archived                                   ║
-- ║                                                                          ║
-- ║ Idempotente · DROP/ADD CONSTRAINT IF EXISTS · ADD COLUMN IF NOT EXISTS · ║
-- ║ DO block guarded · CREATE OR REPLACE FUNCTION · UPDATE same-value-safe.║
-- ║                                                                          ║
-- ║ ADR-029: SECURITY DEFINER + SET search_path · trigger function          ║
-- ║ GOLD-STANDARD: idempotente · sanity check final · pgrst reload          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Expand CHECK constraint em wa_conversations.context_type
--    (mig 001 originalmente nomeou _chk · alguns ambientes podem ter _check
--    se o manual apply usou nome alternativo · drop ambos pra defensiva)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.wa_conversations
  DROP CONSTRAINT IF EXISTS wa_conversations_context_type_chk;
ALTER TABLE public.wa_conversations
  DROP CONSTRAINT IF EXISTS wa_conversations_context_type_check;

ALTER TABLE public.wa_conversations
  ADD CONSTRAINT wa_conversations_context_type_check
  CHECK (context_type IN (
    'lara_sdr',
    'lara_beneficiary',
    'secretaria_patient',
    'secretaria_general',
    'mira_b2b',
    'mira_admin'
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ADD COLUMN wa_numbers.default_context_type · cada número declara seu
--    context_type canônico. NULL = legacy/unset · trigger usa fallback.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.wa_numbers
  ADD COLUMN IF NOT EXISTS default_context_type text;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CHECK constraint em wa_numbers.default_context_type · DO block guarded
-- ═══════════════════════════════════════════════════════════════════════════

DO $check_wa_numbers$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wa_numbers'::regclass
      AND conname = 'wa_numbers_default_context_type_check'
  ) THEN
    ALTER TABLE public.wa_numbers
      ADD CONSTRAINT wa_numbers_default_context_type_check
      CHECK (default_context_type IS NULL OR default_context_type IN (
        'lara_sdr',
        'lara_beneficiary',
        'secretaria_patient',
        'secretaria_general',
        'mira_b2b',
        'mira_admin'
      ));
  END IF;
END
$check_wa_numbers$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Backfill wa_numbers conhecidos · UPDATE same-value-safe (idempotente)
--    IDs hardcoded · documentados no header desta mig.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.wa_numbers
   SET default_context_type = 'secretaria_patient'
 WHERE id = 'ead8a6f9-6e0e-4a89-8268-155392794f69'::uuid;

UPDATE public.wa_numbers
   SET default_context_type = 'lara_sdr'
 WHERE id = '2685f8c1-e324-4639-ac8d-f1eef5c990dc'::uuid;

UPDATE public.wa_numbers
   SET default_context_type = 'mira_b2b'
 WHERE id = '8f33e269-b1c4-4d3d-8e5b-3a11f8adf7db'::uuid;

UPDATE public.wa_numbers
   SET default_context_type = 'mira_admin'
 WHERE id = 'ba402890-409c-40e0-974b-f56cedb872f8'::uuid;

UPDATE public.wa_numbers
   SET default_context_type = 'mira_b2b'
 WHERE id = '42bc681f-e73c-435a-a8f7-1bc45c0460ea'::uuid;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. UPDATE trigger function fn_wa_conversations_inbox_role_sync
--    Antes: só sincronizava inbox_role. Agora: inbox_role + context_type.
--    Trigger binding (BEFORE INSERT / etc) NÃO é alterado · só o body.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_wa_conversations_inbox_role_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $func$
DECLARE
  v_inbox_role            text;
  v_default_context_type  text;
BEGIN
  IF NEW.wa_number_id IS NOT NULL THEN
    SELECT inbox_role, default_context_type
      INTO v_inbox_role, v_default_context_type
      FROM public.wa_numbers
     WHERE id = NEW.wa_number_id
       AND clinic_id = NEW.clinic_id
     LIMIT 1;

    -- inbox_role do wa_numbers vence (denorm canônico)
    IF v_inbox_role IS NOT NULL THEN
      NEW.inbox_role := v_inbox_role;
    END IF;

    -- context_type do wa_numbers.default_context_type vence quando setado.
    -- Quando NULL no wa_numbers (legacy unset), preserva NEW.context_type
    -- existente · não sobrescreve com NULL.
    IF v_default_context_type IS NOT NULL THEN
      NEW.context_type := v_default_context_type;
    END IF;
  ELSE
    -- Compatibilidade legacy · conv sem wa_number_id (pré mig 91 ou
    -- caller que ainda não popula). Mantém sane defaults pra não falhar
    -- CHECK constraint nem quebrar UI que depende de inbox_role/context_type.
    NEW.inbox_role := COALESCE(NEW.inbox_role, 'sdr');
    NEW.context_type := COALESCE(NEW.context_type, 'lara_beneficiary');
  END IF;

  RETURN NEW;
END
$func$;

COMMENT ON FUNCTION public.fn_wa_conversations_inbox_role_sync() IS
'Trigger denorm · sincroniza wa_conversations.inbox_role + context_type a partir de wa_numbers.inbox_role/default_context_type. Mig 136.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Backfill wa_conversations existentes · só convs nos 5 wa_numbers
--    conhecidos · só quando context_type='lara_beneficiary' (default mig
--    001) · target = default_context_type novo do canal.
-- ═══════════════════════════════════════════════════════════════════════════

-- Secretaria · ead8a6f9 → secretaria_patient
UPDATE public.wa_conversations
   SET context_type = 'secretaria_patient'
 WHERE wa_number_id = 'ead8a6f9-6e0e-4a89-8268-155392794f69'::uuid
   AND context_type = 'lara_beneficiary';

-- Lara Cloud · 2685f8c1 → lara_sdr
UPDATE public.wa_conversations
   SET context_type = 'lara_sdr'
 WHERE wa_number_id = '2685f8c1-e324-4639-ac8d-f1eef5c990dc'::uuid
   AND context_type = 'lara_beneficiary';

-- Mira mira-mirian · 8f33e269 → mira_b2b
UPDATE public.wa_conversations
   SET context_type = 'mira_b2b'
 WHERE wa_number_id = '8f33e269-b1c4-4d3d-8e5b-3a11f8adf7db'::uuid
   AND context_type = 'lara_beneficiary';

-- Canal Mirian admin · ba402890 → mira_admin
UPDATE public.wa_conversations
   SET context_type = 'mira_admin'
 WHERE wa_number_id = 'ba402890-409c-40e0-974b-f56cedb872f8'::uuid
   AND context_type = 'lara_beneficiary';

-- Mira Marci · 42bc681f → mira_b2b
UPDATE public.wa_conversations
   SET context_type = 'mira_b2b'
 WHERE wa_number_id = '42bc681f-e73c-435a-a8f7-1bc45c0460ea'::uuid
   AND context_type = 'lara_beneficiary';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Sanity check final (regra GOLD #7)
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_check_check       int;
  v_column_exists     int;
  v_constraint_check  int;
  v_numbers_backfill  int;
  v_func_exists       int;
  v_still_default     int;
BEGIN
  -- CHECK wa_conversations.context_type expandido
  SELECT count(*) INTO v_check_check
    FROM pg_constraint
   WHERE conrelid = 'public.wa_conversations'::regclass
     AND conname  = 'wa_conversations_context_type_check';
  IF v_check_check < 1 THEN
    RAISE EXCEPTION '[mig 136 sanity] CHECK wa_conversations_context_type_check ausente';
  END IF;

  -- Coluna wa_numbers.default_context_type criada
  SELECT count(*) INTO v_column_exists
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'wa_numbers'
     AND column_name  = 'default_context_type';
  IF v_column_exists < 1 THEN
    RAISE EXCEPTION '[mig 136 sanity] coluna wa_numbers.default_context_type ausente';
  END IF;

  -- CHECK wa_numbers.default_context_type criado
  SELECT count(*) INTO v_constraint_check
    FROM pg_constraint
   WHERE conrelid = 'public.wa_numbers'::regclass
     AND conname  = 'wa_numbers_default_context_type_check';
  IF v_constraint_check < 1 THEN
    RAISE EXCEPTION '[mig 136 sanity] CHECK wa_numbers_default_context_type_check ausente';
  END IF;

  -- 5 wa_numbers backfilled
  SELECT count(*) INTO v_numbers_backfill
    FROM public.wa_numbers
   WHERE id IN (
     'ead8a6f9-6e0e-4a89-8268-155392794f69'::uuid,
     '2685f8c1-e324-4639-ac8d-f1eef5c990dc'::uuid,
     '8f33e269-b1c4-4d3d-8e5b-3a11f8adf7db'::uuid,
     'ba402890-409c-40e0-974b-f56cedb872f8'::uuid,
     '42bc681f-e73c-435a-a8f7-1bc45c0460ea'::uuid
   )
     AND default_context_type IS NOT NULL;
  IF v_numbers_backfill < 5 THEN
    RAISE WARNING '[mig 136 sanity] esperava 5 wa_numbers com default_context_type, achou %', v_numbers_backfill;
  END IF;

  -- Função trigger existe
  SELECT count(*) INTO v_func_exists
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_wa_conversations_inbox_role_sync';
  IF v_func_exists < 1 THEN
    RAISE EXCEPTION '[mig 136 sanity] fn_wa_conversations_inbox_role_sync ausente';
  END IF;

  -- Zero conversas residuais com lara_beneficiary nos 5 wa_numbers target
  SELECT count(*) INTO v_still_default
    FROM public.wa_conversations
   WHERE context_type = 'lara_beneficiary'
     AND wa_number_id IN (
       'ead8a6f9-6e0e-4a89-8268-155392794f69'::uuid,
       '2685f8c1-e324-4639-ac8d-f1eef5c990dc'::uuid,
       '8f33e269-b1c4-4d3d-8e5b-3a11f8adf7db'::uuid,
       'ba402890-409c-40e0-974b-f56cedb872f8'::uuid,
       '42bc681f-e73c-435a-a8f7-1bc45c0460ea'::uuid
     );
  IF v_still_default > 0 THEN
    RAISE WARNING '[mig 136 sanity] % convs ainda em lara_beneficiary nos 5 numbers target', v_still_default;
  END IF;

  RAISE NOTICE '[mig 136] sanity ok · 5 numbers backfilled · trigger atualizada · CHECK expandido';
END
$sanity$;

COMMIT;
