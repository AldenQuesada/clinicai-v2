-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ DOWN · Migration 800-13 · drop wa_pro_* RPCs (uuid)                      ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Reverte a auditoria D1: dropa as 9 sobrecargas (p_clinic_id uuid).       ║
-- ║                                                                          ║
-- ║ Atencao:                                                                 ║
-- ║   - NAO afeta as versoes legadas (p_phone text) que podem existir em     ║
-- ║     prod (clinic-dashboard). DROP FUNCTION com assinatura especifica e   ║
-- ║     idempotente nesse sentido.                                           ║
-- ║   - Apos rodar este down, os crons em apps/mira voltam a usar o         ║
-- ║     fallback `tryRpcText` (retorna null) → fallback TS de cada route.    ║
-- ║     Garanta que o fallback ainda funciona antes de aplicar.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

DROP FUNCTION IF EXISTS public.wa_pro_daily_digest(uuid);
DROP FUNCTION IF EXISTS public.wa_pro_evening_digest(uuid);
DROP FUNCTION IF EXISTS public.wa_pro_birthday_alerts(uuid);
DROP FUNCTION IF EXISTS public.wa_pro_anomaly_check(uuid);
DROP FUNCTION IF EXISTS public.wa_pro_inactivity_radar(uuid);
DROP FUNCTION IF EXISTS public.wa_pro_pre_consult_alerts(uuid);
DROP FUNCTION IF EXISTS public.wa_pro_followup_suggestions(uuid);
DROP FUNCTION IF EXISTS public.wa_pro_weekly_roundup(uuid);
DROP FUNCTION IF EXISTS public.wa_pro_task_reminders(uuid);

NOTIFY pgrst, 'reload schema';

COMMIT;
