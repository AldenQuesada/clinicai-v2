-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-33 · clinicai-v2 · Triggers auto voucher status (P1+P2)   ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: fechar gap "purchased/scheduled sem automacao" ║
-- ║ do project_b2b_pending. Hoje ninguem atualiza voucher.status quando a   ║
-- ║ convidada agenda/comparece/paga · attribution.converted_at fica vazio · ║
-- ║ funil de conversao B2B nao fecha sozinho.                                ║
-- ║                                                                          ║
-- ║ Triggers em `appointments` que cascateiam pra `b2b_vouchers`            ║
-- ║ via match `appointments.patient_phone` ↔ `b2b_attributions.lead_phone`. ║
-- ║                                                                          ║
-- ║ Mapeamento status (cravado da fonte clinic-dashboard mig 0805):         ║
-- ║   appointments.status                              voucher.status        ║
-- ║   ──────────────────────                           ─────────────         ║
-- ║   'agendado','aguardando_confirmacao','confirmado' → 'scheduled'         ║
-- ║   'finalizado'                                     → 'redeemed'          ║
-- ║   'finalizado' + payment_status='pago'             → 'purchased'         ║
-- ║                                                                          ║
-- ║ Guard de progressao · so avanca, nunca volta:                            ║
-- ║   issued < delivered < opened < scheduled < redeemed < purchased         ║
-- ║                                                                          ║
-- ║ Guard de exclusividade · ignora vouchers expired/cancelled.              ║
-- ║                                                                          ║
-- ║ Atribuicao tambem atualiza:                                              ║
-- ║   - b2b_attributions.first_appointment_id/at quando scheduled             ║
-- ║   - .scheduled_at, .attended_at, .converted_at + revenue_brl              ║
-- ║                                                                          ║
-- ║ Decisao "purchased": APENAS payment_status='pago' (parcial NAO conta).   ║
-- ║ Pode mudar depois pra incluir 'parcial' se Alden decidir.                ║
-- ║                                                                          ║
-- ║ no_show / cancelado (pergunta Alden 2026-04-26):                         ║
-- ║   - Voucher MANTEM 'scheduled' (continua valido pra reagendamento)      ║
-- ║   - attribution.status = 'no_show' ou 'cancelled'                       ║
-- ║   - Funnel calcula taxa direto: WHERE scheduled_at IS NOT NULL         ║
-- ║       AND status IN ('no_show','cancelled')                            ║
-- ║                                                                          ║
-- ║ Idempotencia: trigger pode rodar varias vezes na mesma row sem corromper ║
-- ║ dados (compara status atual antes de updateir · skip se ja avancou).     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- Helper · ordena status pra guard de progressao
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._b2b_voucher_status_rank(p_status text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE p_status
    WHEN 'issued'    THEN 1
    WHEN 'delivered' THEN 2
    WHEN 'opened'    THEN 3
    WHEN 'scheduled' THEN 4
    WHEN 'redeemed'  THEN 5
    WHEN 'purchased' THEN 6
    -- expired/cancelled fora da progressao normal
    WHEN 'expired'   THEN 99
    WHEN 'cancelled' THEN 99
    ELSE 0
  END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- Trigger function · sincroniza voucher.status + attribution
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._b2b_sync_voucher_from_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_phone_clean    text;
  v_target_status  text;
  v_attr           record;
  v_voucher_id     uuid;
  v_voucher_status text;
  v_revenue        numeric;
BEGIN
  -- Pega phone limpo do appointment (so digitos · evita match fail)
  v_phone_clean := regexp_replace(COALESCE(NEW.patient_phone, ''), '\D', '', 'g');
  IF length(v_phone_clean) < 10 THEN
    RETURN NEW;
  END IF;

  -- Match attribution por phone (lead_phone limpo · last8 robusto)
  SELECT a.id, a.voucher_id, a.clinic_id
    INTO v_attr
    FROM public.b2b_attributions a
   WHERE right(regexp_replace(COALESCE(a.lead_phone, ''), '\D', '', 'g'), 8)
       = right(v_phone_clean, 8)
     AND a.voucher_id IS NOT NULL
   ORDER BY a.created_at DESC
   LIMIT 1;

  IF v_attr.id IS NULL THEN
    -- Sem attribution · convidada nao veio de parceria B2B
    RETURN NEW;
  END IF;

  -- ═══ Branch 1 · no_show / cancelado · so atualiza attribution.status ═══
  -- Voucher fica em 'scheduled' (voucher continua valido · pode reagendar).
  -- Funnel calcula taxa de no-show e cancel direto da attribution depois.
  IF NEW.status = 'no_show' THEN
    UPDATE public.b2b_attributions
       SET status = 'no_show',
           updated_at = now()
     WHERE id = v_attr.id;
    RETURN NEW;
  ELSIF NEW.status = 'cancelado' THEN
    UPDATE public.b2b_attributions
       SET status = 'cancelled',
           updated_at = now()
     WHERE id = v_attr.id;
    RETURN NEW;
  END IF;

  -- Mapeia appointment.status → target voucher.status (progressao normal)
  IF NEW.status IN ('agendado', 'aguardando_confirmacao', 'confirmado') THEN
    v_target_status := 'scheduled';
  ELSIF NEW.status = 'finalizado' THEN
    -- payment_status='pago' (decisao Alden 2026-04-26 · parcial NAO conta)
    IF NEW.payment_status = 'pago' THEN
      v_target_status := 'purchased';
    ELSE
      v_target_status := 'redeemed';
    END IF;
  ELSE
    -- pre_consulta / na_clinica / em_consulta / em_atendimento / remarcado /
    -- bloqueado · skip (estados intermediarios sem semantica de funnel)
    RETURN NEW;
  END IF;

  -- Pega status atual do voucher (guard progressao)
  SELECT status INTO v_voucher_status
    FROM public.b2b_vouchers
   WHERE id = v_attr.voucher_id;

  IF v_voucher_status IS NULL THEN
    RETURN NEW; -- voucher_id orfao · skip
  END IF;

  -- Skip se voucher ja esta em estado avancado ou bloqueado (expired/cancelled)
  IF public._b2b_voucher_status_rank(v_voucher_status) >= public._b2b_voucher_status_rank(v_target_status)
     OR v_voucher_status IN ('expired', 'cancelled') THEN
    RETURN NEW;
  END IF;

  -- ═══ UPDATE voucher.status ═══
  UPDATE public.b2b_vouchers
     SET status = v_target_status,
         updated_at = now()
   WHERE id = v_attr.voucher_id;

  -- ═══ UPDATE b2b_attributions ═══
  -- Soma valor pago do appointment (pagamentos jsonb · soma valor)
  v_revenue := COALESCE((
    SELECT SUM(COALESCE((p->>'valor')::numeric, 0))
      FROM jsonb_array_elements(COALESCE(NEW.pagamentos, '[]'::jsonb)) p
  ), 0);

  IF v_target_status = 'scheduled' THEN
    UPDATE public.b2b_attributions
       SET first_appointment_id = COALESCE(first_appointment_id, NEW.id::text),
           first_appointment_at = COALESCE(first_appointment_at, NEW.created_at),
           scheduled_at         = COALESCE(scheduled_at, now()),
           status               = 'scheduled',
           updated_at           = now()
     WHERE id = v_attr.id;
  ELSIF v_target_status = 'redeemed' THEN
    UPDATE public.b2b_attributions
       SET attended_at = COALESCE(attended_at, now()),
           status      = 'attended',
           updated_at  = now()
     WHERE id = v_attr.id;
  ELSIF v_target_status = 'purchased' THEN
    UPDATE public.b2b_attributions
       SET attended_at             = COALESCE(attended_at, now()),
           converted_at            = now(),
           converted_appointment_id = NEW.id::text,
           converted_amount_brl    = v_revenue,
           revenue_brl             = COALESCE(revenue_brl, 0) + v_revenue,
           status                  = 'converted',
           updated_at              = now()
     WHERE id = v_attr.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._b2b_sync_voucher_from_appointment() IS
  'Trigger function · sincroniza b2b_vouchers.status + b2b_attributions a partir de appointments lifecycle (mig 800-33).';

-- ═══════════════════════════════════════════════════════════════════════
-- Triggers · INSERT (novo agendamento) + UPDATE (status muda)
-- ═══════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_appt_voucher_sync_ins ON public.appointments;
CREATE TRIGGER trg_appt_voucher_sync_ins
AFTER INSERT ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public._b2b_sync_voucher_from_appointment();

DROP TRIGGER IF EXISTS trg_appt_voucher_sync_upd ON public.appointments;
CREATE TRIGGER trg_appt_voucher_sync_upd
AFTER UPDATE OF status, payment_status ON public.appointments
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.payment_status IS DISTINCT FROM NEW.payment_status)
EXECUTE FUNCTION public._b2b_sync_voucher_from_appointment();

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERTS
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_appt_voucher_sync_ins') THEN
    RAISE EXCEPTION 'ASSERT FAIL: trigger ins nao criado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_appt_voucher_sync_upd') THEN
    RAISE EXCEPTION 'ASSERT FAIL: trigger upd nao criado';
  END IF;
  RAISE NOTICE '✅ Mig 800-33 OK · 2 triggers ativos em appointments';
END $$;

COMMIT;
