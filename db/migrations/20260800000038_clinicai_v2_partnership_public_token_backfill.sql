-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-36 · clinicai-v2 · Backfill public_token nas existentes   ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: ONDA 1 · garantir que TODAS partnerships tenham║
-- ║ public_token (lookup chave de /parceiro/[token] · pagina publica do      ║
-- ║ painel da parceira). Mig 800-XX anterior criou coluna + trigger          ║
-- ║ trg_b2b_ensure_public_token + index UNIQUE parcial.                      ║
-- ║                                                                          ║
-- ║ Sintoma: 1 partnership ("Moinho", status=paused) ficou com NULL por ter ║
-- ║ sido criada antes da trigger ou via path que bypassou trigger.           ║
-- ║                                                                          ║
-- ║ Fix: UPDATE com WHERE NULL · trigger BEFORE UPDATE preenche se houver,   ║
-- ║ mas tambem fazemos call explicita a _b2b_gen_public_token() para         ║
-- ║ garantir cobertura mesmo se trigger so roda em INSERT.                   ║
-- ║                                                                          ║
-- ║ Idempotente · pode rodar varias vezes sem efeito colateral (so update    ║
-- ║ rows com NULL).                                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- Backfill · forca _b2b_gen_public_token() onde NULL
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_row record;
  v_token text;
  v_try int;
BEGIN
  FOR v_row IN
    SELECT id, name FROM public.b2b_partnerships WHERE public_token IS NULL
  LOOP
    v_try := 0;
    LOOP
      v_try := v_try + 1;
      v_token := public._b2b_gen_public_token();
      BEGIN
        UPDATE public.b2b_partnerships
           SET public_token = v_token,
               updated_at = now()
         WHERE id = v_row.id;
        RAISE NOTICE '  · backfill % → token=%', v_row.name, substr(v_token, 1, 8) || '...';
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        IF v_try > 5 THEN
          RAISE EXCEPTION 'Falha gerar token unico para % apos 5 tentativas', v_row.name;
        END IF;
        -- retry · tentar gerar token novo
      END;
    END LOOP;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERT · zero rows com NULL apos backfill
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_null_count int;
BEGIN
  SELECT count(*) INTO v_null_count
    FROM public.b2b_partnerships
   WHERE public_token IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'ASSERT FAIL: ainda % partnerships com public_token NULL', v_null_count;
  END IF;
  RAISE NOTICE '✅ Mig 800-36 OK · backfill public_token completo';
END $$;

COMMIT;
