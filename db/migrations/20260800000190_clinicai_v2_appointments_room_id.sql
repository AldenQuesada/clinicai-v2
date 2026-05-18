-- =============================================================================
-- CRM_PARITY_R1 · Migration 190 · appointments.room_id FK
-- =============================================================================
--
-- Contexto:
--   Audit 1×1 gap M-04 / D-15 ("seletor de sala no form v2" + "FK room_id
--   ausente"). v2 atualmente só tem `appointments.room_idx integer NULL`
--   (carry-over do legado, index-based · frágil). Sem FK semântica para
--   `clinic_rooms`.
--
-- Esta migration adiciona FK opcional `room_id uuid` → `clinic_rooms(id)`.
-- ON DELETE SET NULL (sala apagada não derruba appointment).
--
-- ⚠️ NÃO faz backfill de room_idx → room_id. Backfill é Round 5
-- (parity-r5-backfills-e2e-hardening) após:
--   - confirmar mapeamento estável legado index → uuid
--   - validar sample manualmente
--   - smoke test em staging
--
-- `room_idx` permanece em paralelo (deprecated). Será dropado só em Round 7
-- (legacy freeze) após 90 dias de operação dual-write.
--
-- Index:
--   Index parcial em room_id WHERE NOT NULL · queries "conflito de sala"
--   ganham eficiência.
--
-- O que esta migration NÃO toca:
--   - RLS policies (permanecem)
--   - room_idx (preservado para backwards compat)
--   - appointment_finalize / appointment_attend / hard gate (mig 167)
--   - cron / wa_outbox / edge / worker
--   - GRANTs
--
-- Apply: somente após autorização explícita.
-- Rollback: down migration drop column + index.

BEGIN;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS room_id uuid NULL
    REFERENCES public.clinic_rooms(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_room_id
  ON public.appointments (room_id)
  WHERE room_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_room_date
  ON public.appointments (room_id, scheduled_date)
  WHERE room_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.appointments.room_id IS
  'CRM_PARITY_R1 · FK opcional para clinic_rooms · substitui room_idx legacy gradualmente. NULL durante deprecation period (backfill em Round 5, freeze em Round 7).';

COMMIT;
