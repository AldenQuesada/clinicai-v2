-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-30 · clinicai-v2 · wa_numbers dedup + UNIQUE constraint    ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: "removo a Marci, sistema fala acesso removido   ║
-- ║                          mas ela continua la · nao atualiza nada"        ║
-- ║                                                                          ║
-- ║ Causa raiz cravada (debug DB):                                           ║
-- ║   Tabela wa_numbers nao tinha UNIQUE em (clinic_id, phone, prof_id).    ║
-- ║   RPC wa_pro_register_number usava ON CONFLICT DO NOTHING mas como nao  ║
-- ║   havia constraint, cada cadastro criava nova row · 2 rows ativas com   ║
-- ║   mesmo phone+professional_id. Resultado:                                ║
-- ║     - delete desativava UMA · listing mostrava a outra ainda ativa      ║
-- ║     - edit atualizava UMA · listing podia mostrar a outra (antiga)      ║
-- ║                                                                          ║
-- ║ Fix em 3 etapas:                                                         ║
-- ║   1. Dedup · mantem a mais recente (max created_at) por chave           ║
-- ║      composta · DELETE hard das antigas (audit fica preservado pq      ║
-- ║      tabelas de log usam wa_number_id por uuid antigo · ja sao        ║
-- ║      orfaos historicos sem impacto)                                    ║
-- ║   2. UNIQUE INDEX partial em (clinic_id, phone, professional_id)       ║
-- ║      WHERE number_type='professional_private' · agora ON CONFLICT       ║
-- ║      do RPC funciona e UPDATE eh acionado                              ║
-- ║   3. ASSERT zero duplicatas pos-mig                                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Dedup · mantem 1 row por (clinic_id, phone, professional_id) ·
--    prefere is_active=true depois maior created_at
-- ═══════════════════════════════════════════════════════════════════════
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY clinic_id, phone, professional_id
      ORDER BY is_active DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM public.wa_numbers
  WHERE number_type = 'professional_private'
)
DELETE FROM public.wa_numbers
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ═══════════════════════════════════════════════════════════════════════
-- 2. UNIQUE INDEX partial · so pra professional_private (admins/canais
--    podem ter outros tipos sem conflitar)
-- ═══════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wa_numbers_pro_phone
  ON public.wa_numbers (clinic_id, phone, professional_id)
  WHERE number_type = 'professional_private';

COMMENT ON INDEX public.uniq_wa_numbers_pro_phone IS
  'UNIQUE em (clinic_id, phone, professional_id) so pra professional_private · habilita ON CONFLICT do wa_pro_register_number (mig 800-30).';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. ASSERT · zero duplicatas pos-mig
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_dups int;
BEGIN
  SELECT COUNT(*) INTO v_dups
  FROM (
    SELECT clinic_id, phone, professional_id
    FROM public.wa_numbers
    WHERE number_type = 'professional_private'
    GROUP BY clinic_id, phone, professional_id
    HAVING COUNT(*) > 1
  ) t;
  IF v_dups > 0 THEN
    RAISE EXCEPTION 'ASSERT FAIL: % duplicatas restantes pos-dedup', v_dups;
  END IF;
  RAISE NOTICE '✅ Mig 800-30 OK · wa_numbers deduplicado + UNIQUE INDEX criado';
END $$;

COMMIT;
