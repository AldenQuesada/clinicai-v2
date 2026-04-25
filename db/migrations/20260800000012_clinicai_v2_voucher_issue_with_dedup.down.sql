-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ DOWN · Migration 800-12 · drop b2b_voucher_issue_with_dedup              ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Reverte para o comportamento pre-fix F5: handlers caem de volta ao RPC  ║
-- ║ legacy `b2b_voucher_issue` (sem dedup transactional · race possivel).   ║
-- ║                                                                          ║
-- ║ NAO toca em b2b_voucher_issue (legacy continua intacto).                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP FUNCTION IF EXISTS public.b2b_voucher_issue_with_dedup(jsonb);

NOTIFY pgrst, 'reload schema';
