-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-41 · clinicai-v2 · b2b_comm_event_keys (catalog editavel) ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: zero estrutura rigida · catalogo de event_keys ║
-- ║ vira tabela editavel · UI permite criar/editar/remover sem mig.         ║
-- ║                                                                          ║
-- ║ ANTES: RPC b2b_comm_events_catalog() retornava JSONB hardcoded com 18   ║
-- ║ event_keys em 4 groups. Adicionar evento novo precisava mig + deploy.   ║
-- ║                                                                          ║
-- ║ DEPOIS:                                                                  ║
-- ║   1. Tabela b2b_comm_event_keys · linhas editaveis                      ║
-- ║   2. Seed dos 18 atuais marcados is_system=true (nao deletaveis na UI) ║
-- ║   3. RPC b2b_comm_events_catalog() agora le da tabela (shape preservado)║
-- ║   4. RPCs upsert/delete pra UI                                          ║
-- ║   5. Adiciona campo `bucket` (parceiros/convidadas/admin) que vira      ║
-- ║      filtro principal no rail visual.                                    ║
-- ║                                                                          ║
-- ║ Bucket = string livre · UI sugere parceiros/convidadas/admin mas        ║
-- ║ permite custom (ex: experimentos A/B). Sem CHECK constraint.            ║
-- ║                                                                          ║
-- ║ recipient_role tambem fica string livre · CHECK constraint REMOVIDA em  ║
-- ║ b2b_comm_templates pra permitir 'admin' e roles custom de testes.       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- Tabela · b2b_comm_event_keys
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.b2b_comm_event_keys (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL DEFAULT public._default_clinic_id(),
  key             text        NOT NULL,
  label           text        NOT NULL,
  bucket          text        NOT NULL DEFAULT 'parceiros',
  group_label     text        NOT NULL DEFAULT 'Outros',
  recipient_role  text        NOT NULL DEFAULT 'partner',
  trigger_desc    text        NULL,
  is_system       boolean     NOT NULL DEFAULT false,
  is_active       boolean     NOT NULL DEFAULT true,
  sort_order      integer     NOT NULL DEFAULT 100,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2b_comm_event_keys_clinic_key_uniq UNIQUE (clinic_id, key)
);

COMMENT ON TABLE public.b2b_comm_event_keys IS
  'Catalogo de event_keys disponiveis · editavel via UI (mig 800-41). bucket=parceiros|convidadas|admin (string livre · UI sugere mas permite custom).';

CREATE INDEX IF NOT EXISTS idx_b2b_comm_event_keys_bucket
  ON public.b2b_comm_event_keys (clinic_id, bucket, sort_order);

ALTER TABLE public.b2b_comm_event_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_b2b_event_keys_tenant ON public.b2b_comm_event_keys;
CREATE POLICY p_b2b_event_keys_tenant
  ON public.b2b_comm_event_keys
  USING (clinic_id = public.app_clinic_id())
  WITH CHECK (clinic_id = public.app_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_comm_event_keys TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- Seed · 18 event_keys atuais + 13 GAPs (port do catalog hardcoded)
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO public.b2b_comm_event_keys
  (clinic_id, key, label, bucket, group_label, recipient_role, trigger_desc, is_system, sort_order)
SELECT c.id, v.key, v.label, v.bucket, v.group_label, v.recipient_role, v.trigger_desc, true, v.sort_order
  FROM public.clinics c
 CROSS JOIN (VALUES
  -- ─── Bucket: parceiros ─────────────────────────────────────────────
  ('partnership_registered_light', 'Parceria cadastrada (acolhimento)', 'parceiros', 'Onboarding',         'partner', 'criada via voz ou painel',          10),
  ('partnership_welcome_text',     'Boas-vindas formal',                'parceiros', 'Onboarding',         'partner', 'admin manual',                       11),
  ('partnership_howto_explainer',  'Explicacao de como funciona',       'parceiros', 'Onboarding',         'partner', 'manual (admin dispatcha)',           12),
  ('partnership_activated',        'Parceria ativada',                  'parceiros', 'Onboarding',         'partner', 'INSERT/UPDATE status=active',        13),
  ('partnership_paused',           'Parceria pausada',                  'parceiros', 'Ciclo de vida',      'partner', 'status -> paused',                   20),
  ('partnership_reactivated',      'Parceria reativada',                'parceiros', 'Ciclo de vida',      'partner', 'paused -> active',                   21),
  ('partnership_closed',           'Parceria encerrada',                'parceiros', 'Ciclo de vida',      'partner', 'status -> closed',                   22),
  ('voucher_issued_partner',       'Voucher enviado (parceira)',        'parceiros', 'Voucher · ciclo',    'partner', 'INSERT b2b_vouchers',                30),
  ('voucher_opened',               'Voucher aberto pela convidada',     'parceiros', 'Voucher · ciclo',    'partner', 'status -> opened',                   31),
  ('voucher_scheduled',            'Voucher agendado',                  'parceiros', 'Voucher · ciclo',    'partner', 'status -> scheduled',                32),
  ('voucher_redeemed',             'Voucher utilizado',                 'parceiros', 'Voucher · ciclo',    'partner', 'convidada compareceu',               33),
  ('voucher_purchased',            'Voucher virou compra',              'parceiros', 'Voucher · ciclo',    'partner', 'procedimento pago',                  34),
  ('voucher_expired_partner',      'Voucher expirou sem uso',           'parceiros', 'Voucher · ciclo',    'partner', 'valid_until < now',                  35),
  ('voucher_cap_reached',          'Cap mensal atingido',               'parceiros', 'Voucher · ciclo',    'partner', 'cap mensal atingido',                36),
  ('referral_acknowledged',        'Indicacao recebida',                'parceiros', 'Indicacao',          'partner', 'b2b-refer-lead handler',             40),
  ('lead_first_budget',            'Convidada virou paciente',          'parceiros', 'Indicacao',          'partner', 'primeiro orcamento pago',            41),
  ('feedback_acknowledged',        'Feedback agradecido',               'parceiros', 'Relacionamento',     'partner', 'apos parceira responder NPS',        50),
  ('monthly_report',               'Relatorio mensal',                  'parceiros', 'Recorrentes',        'partner', 'cron dia 1',                         60),
  ('quarterly_checkin',            'Check-in trimestral',               'parceiros', 'Recorrentes',        'partner', 'cron trimestral',                    61),
  -- ─── Bucket: convidadas ────────────────────────────────────────────
  ('voucher_issued_beneficiary',   'Voucher enviado (convidada)',       'convidadas', 'Entrega',            'beneficiary', 'INSERT b2b_vouchers',           70),
  ('voucher_validity_reminder',    'Voucher expira em breve',           'convidadas', 'Ciclo de vida',      'beneficiary', 'D-3 antes valid_until',         71),
  ('voucher_no_show_recovery',     'Convidada faltou · re-agendar',     'convidadas', 'Ciclo de vida',      'beneficiary', 'appointment status=no_show',    72),
  ('voucher_post_attendance',      'Convidada compareceu · agradecimento', 'convidadas', 'Ciclo de vida',  'beneficiary', 'appointment status=finalizado', 73),
  ('voucher_post_purchase_upsell', 'Convidada comprou · upsell delicado', 'convidadas', 'Ciclo de vida',   'beneficiary', 'voucher_purchased + 7d',        74),
  -- ─── Bucket: admin (Mira -> Mirian) ────────────────────────────────
  ('admin_health_red_alert',       'Alerta · parceria em saude vermelha', 'admin', 'Alertas',              'admin', 'b2b_partnerships.health_color=red', 80),
  ('admin_cap_exceeded',           'Alerta · cap mensal estourado',     'admin', 'Alertas',                'admin', 'over_cap insight',                  81),
  ('admin_application_received',   'Alerta · candidatura nova',         'admin', 'Alertas',                'admin', 'b2b_partnership_applications insert', 82),
  ('admin_nps_excellent',          'Oportunidade · NPS excelente',      'admin', 'Alertas',                'admin', 'NPS >= 9',                          83),
  ('admin_high_impact',            'Oportunidade · parceria alto impacto', 'admin', 'Alertas',             'admin', 'voucher_purchased >= 10',           84),
  ('admin_daily_top_insight',      'Digest · top insight do dia',       'admin', 'Digest',                 'admin', 'cron diario',                       90),
  ('admin_activity_reminders',     'Digest · atividades pendentes 48h', 'admin', 'Digest',                 'admin', 'cron 09h SP',                       91),
  ('admin_monthly_partner_digest', 'Digest · feedback mensal de parcerias', 'admin', 'Digest',             'admin', 'cron dia 1',                        92)
) AS v(key, label, bucket, group_label, recipient_role, trigger_desc, sort_order)
ON CONFLICT (clinic_id, key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- Drop CHECK constraints rigidas em b2b_comm_templates
-- (recipient_role · channel) · permite valores custom em testes
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_con record;
BEGIN
  FOR v_con IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class c ON c.oid=con.conrelid
     WHERE c.relname='b2b_comm_templates'
       AND con.contype='c'
       AND pg_get_constraintdef(con.oid) ~* 'recipient_role|channel'
  LOOP
    EXECUTE format('ALTER TABLE public.b2b_comm_templates DROP CONSTRAINT %I', v_con.conname);
    RAISE NOTICE 'Dropped CHECK %', v_con.conname;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC · b2b_comm_events_catalog() · agora reads from table
-- Shape preservado: [{group, events:[{key, label, recipient, trigger, bucket}]}]
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_comm_events_catalog()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_result jsonb;
BEGIN
  IF v_cid IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT jsonb_agg(grp ORDER BY (grp->>'sort_order')::int)
    INTO v_result
    FROM (
      SELECT jsonb_build_object(
        'group',      group_label,
        'bucket',     bucket,
        'sort_order', min(sort_order),
        'events',     jsonb_agg(jsonb_build_object(
                        'key',       key,
                        'label',     label,
                        'recipient', recipient_role,
                        'trigger',   trigger_desc,
                        'bucket',    bucket,
                        'is_system', is_system
                      ) ORDER BY sort_order)
      ) AS grp
        FROM public.b2b_comm_event_keys
       WHERE clinic_id = v_cid AND is_active = true
       GROUP BY group_label, bucket
    ) g;

  RETURN COALESCE(v_result, '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_comm_events_catalog() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC · upsert event_key (UI cria/edita · "zero estrutura rigida")
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_comm_event_key_upsert(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_id uuid;
  v_existing_id uuid;
BEGIN
  IF v_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;

  SELECT id INTO v_existing_id
    FROM public.b2b_comm_event_keys
   WHERE clinic_id = v_cid AND key = (p_payload->>'key');

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.b2b_comm_event_keys
       SET label          = COALESCE(p_payload->>'label', label),
           bucket         = COALESCE(p_payload->>'bucket', bucket),
           group_label    = COALESCE(p_payload->>'group_label', group_label),
           recipient_role = COALESCE(p_payload->>'recipient_role', recipient_role),
           trigger_desc   = COALESCE(p_payload->>'trigger_desc', trigger_desc),
           is_active      = COALESCE((p_payload->>'is_active')::boolean, is_active),
           sort_order     = COALESCE((p_payload->>'sort_order')::int, sort_order),
           updated_at     = now()
     WHERE id = v_existing_id;
    v_id := v_existing_id;
  ELSE
    INSERT INTO public.b2b_comm_event_keys
      (clinic_id, key, label, bucket, group_label, recipient_role, trigger_desc, is_system, sort_order)
    VALUES
      (v_cid,
       p_payload->>'key',
       COALESCE(p_payload->>'label', p_payload->>'key'),
       COALESCE(p_payload->>'bucket', 'parceiros'),
       COALESCE(p_payload->>'group_label', 'Outros'),
       COALESCE(p_payload->>'recipient_role', 'partner'),
       p_payload->>'trigger_desc',
       false,
       COALESCE((p_payload->>'sort_order')::int, 100))
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_comm_event_key_upsert(jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- RPC · delete event_key (so user-created · is_system=false)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.b2b_comm_event_key_delete(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_cid uuid := public.app_clinic_id();
  v_deleted int;
BEGIN
  IF v_cid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic');
  END IF;

  -- System keys nao podem ser deletadas
  IF EXISTS (
    SELECT 1 FROM public.b2b_comm_event_keys
     WHERE clinic_id = v_cid AND key = p_key AND is_system = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'system_key_protected');
  END IF;

  DELETE FROM public.b2b_comm_event_keys
   WHERE clinic_id = v_cid AND key = p_key;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_comm_event_key_delete(text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERTS
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_seed_count int;
BEGIN
  SELECT count(*) INTO v_seed_count
    FROM public.b2b_comm_event_keys
   WHERE is_system = true;
  IF v_seed_count < 30 THEN
    RAISE EXCEPTION 'ASSERT FAIL: esperados >= 30 system keys, achados %', v_seed_count;
  END IF;
  RAISE NOTICE '✅ Mig 800-41 OK · % event_keys system seeded · catalog editavel pronto', v_seed_count;
END $$;

COMMIT;
