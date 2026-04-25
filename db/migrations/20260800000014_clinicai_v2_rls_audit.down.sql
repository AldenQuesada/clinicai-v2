-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Rollback 800-14 · clinicai-v2 · RLS audit corrective                    ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Reverte mig 800-14 · restaura policies USING (true) das migs originais  ║
-- ║   800-02, 800-06, 800-11.                                                ║
-- ║                                                                          ║
-- ║ ATENCAO: rollback recria anti-padrão proibido pelo ADR-029. Só rode em  ║
-- ║   emergência se a aplicação parar de funcionar pós-800-14.              ║
-- ║                                                                          ║
-- ║ Não restauramos REVOKE pra anon nas tabelas 4/5 (defense-in-depth pode   ║
-- ║   ficar permanente · não tem porque permitir anon ler nada disso).      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 1 · mira_conversation_state · restaura policy aberta
DROP POLICY IF EXISTS "mira_state_service_only" ON public.mira_conversation_state;
CREATE POLICY "mira_state_service_only" ON public.mira_conversation_state
  FOR ALL USING (true) WITH CHECK (true);

-- Restaura grants permissivos pre-800-14 (mig 800-02 nao tinha REVOKE explicito)
GRANT ALL ON public.mira_conversation_state TO service_role;

-- 2 · b2b_voucher_dispatch_queue · restaura policy aberta
DROP POLICY IF EXISTS tenant_isolation_select_b2b_dispatch_queue ON public.b2b_voucher_dispatch_queue;
DROP POLICY IF EXISTS tenant_isolation_insert_b2b_dispatch_queue ON public.b2b_voucher_dispatch_queue;
DROP POLICY IF EXISTS tenant_isolation_update_b2b_dispatch_queue ON public.b2b_voucher_dispatch_queue;
DROP POLICY IF EXISTS tenant_isolation_delete_b2b_dispatch_queue ON public.b2b_voucher_dispatch_queue;

CREATE POLICY "b2b_dispatch_queue_service_only" ON public.b2b_voucher_dispatch_queue
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.b2b_voucher_dispatch_queue TO service_role;

-- 3 · webhook_processing_queue · restaura policy aberta
DROP POLICY IF EXISTS tenant_isolation_select_webhook_queue ON public.webhook_processing_queue;
DROP POLICY IF EXISTS tenant_isolation_insert_webhook_queue ON public.webhook_processing_queue;
DROP POLICY IF EXISTS tenant_isolation_update_webhook_queue ON public.webhook_processing_queue;
DROP POLICY IF EXISTS tenant_isolation_delete_webhook_queue ON public.webhook_processing_queue;

CREATE POLICY "webhook_queue_service_only" ON public.webhook_processing_queue
  FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.webhook_processing_queue TO service_role;

-- 4/5 · inbox_notifications + _ai_budget · NÃO desfazemos os REVOKE FROM anon
-- (defense-in-depth permanente · safe).

NOTIFY pgrst, 'reload schema';
