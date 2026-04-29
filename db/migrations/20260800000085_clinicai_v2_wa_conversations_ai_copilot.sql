-- ─────────────────────────────────────────────────────────────────────
-- Sprint B · 2026-04-29 · /conversas Copiloto AI (W-01 + W-02 + W-03)
-- ─────────────────────────────────────────────────────────────────────
-- Adiciona cache server-side do output do copiloto AI (Anthropic Opus 4.7):
--   - summary: TLDR do lead (1 linha)
--   - next_actions: 3 acoes sugeridas
--   - smart_replies: 3 chips clicaveis acima do textarea
--
-- Cacheado em wa_conversations.ai_copilot (jsonb) com timestamp em
-- ai_copilot_at. Re-gera quando: (a) nunca gerou, (b) >10min desde ultimo,
-- ou (c) >=5 mensagens novas desde ai_copilot_at.
--
-- Idempotente · safe re-run.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS ai_copilot jsonb,
  ADD COLUMN IF NOT EXISTS ai_copilot_at timestamptz;

-- Index pra acelerar lookup do cache (raras vezes seleciona, mas barato)
CREATE INDEX IF NOT EXISTS wa_conversations_ai_copilot_at_idx
  ON public.wa_conversations(ai_copilot_at)
  WHERE ai_copilot IS NOT NULL;

-- PostgREST refresh
NOTIFY pgrst, 'reload schema';
