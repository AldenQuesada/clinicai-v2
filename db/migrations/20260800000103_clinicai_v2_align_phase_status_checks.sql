-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 103 · clinicai-v2 · alinhar CHECK constraints com TS enums     ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug 2026-05-03: TS enums.ts declarava 7 phases + 13 statuses, mas        ║
-- ║ DB ATIVO so aceitava 4 phases + 11 statuses. Codigo TS aspiracional      ║
-- ║ · paths como 'reagendado', 'compareceu', 'pre_consulta' nunca rodavam   ║
-- ║ porque DB rejeitaria INSERT.                                              ║
-- ║                                                                          ║
-- ║ Origem: refactor 2026-04-28 criou schema legacy_2026_04_28 (cópia)       ║
-- ║ com versao ampla, mas public.leads/appointments ficaram com versao       ║
-- ║ enxuta antiga. Migration 60-65 do refactor nunca atualizou os CHECKs.   ║
-- ║                                                                          ║
-- ║ Fix: amplia CHECKs em public.leads.phase + appointments.status pra      ║
-- ║ bater com TS. lost_from_phase + lost_consistency ajustados pra incluir  ║
-- ║ 'reagendado' e 'compareceu' (consistencia · paciente que veio mas se   ║
-- ║ perdeu no follow-up tem lost_from_phase='compareceu').                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS chk_leads_phase;
ALTER TABLE public.leads ADD CONSTRAINT chk_leads_phase
  CHECK (phase = ANY (ARRAY['lead', 'agendado', 'reagendado', 'compareceu', 'paciente', 'orcamento', 'perdido']));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS chk_leads_lost_from_phase;
ALTER TABLE public.leads ADD CONSTRAINT chk_leads_lost_from_phase
  CHECK (lost_from_phase IS NULL OR lost_from_phase = ANY (
    ARRAY['lead', 'agendado', 'reagendado', 'compareceu', 'paciente', 'orcamento']
  ));

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS chk_leads_lost_consistency;
ALTER TABLE public.leads ADD CONSTRAINT chk_leads_lost_consistency
  CHECK (
    (lifecycle_status <> 'perdido') OR (
      lifecycle_status = 'perdido'
      AND lost_reason IS NOT NULL
      AND length(TRIM(BOTH FROM lost_reason)) > 0
      AND lost_from_phase IS NOT NULL
      AND lost_from_phase = ANY (ARRAY['lead', 'agendado', 'reagendado', 'compareceu', 'paciente', 'orcamento'])
      AND lost_at IS NOT NULL
    )
  );

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS chk_appt_status;
ALTER TABLE public.appointments ADD CONSTRAINT chk_appt_status
  CHECK (status = ANY (
    ARRAY['agendado', 'aguardando_confirmacao', 'confirmado', 'pre_consulta',
          'aguardando', 'na_clinica', 'em_consulta', 'em_atendimento',
          'finalizado', 'remarcado', 'cancelado', 'no_show', 'bloqueado']
  ));
