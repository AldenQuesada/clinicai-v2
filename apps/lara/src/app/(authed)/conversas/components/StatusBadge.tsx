/**
 * StatusBadge · mostra Fase do lead + Status do appointment no painel direito.
 *
 * Útil pra secretaria entender em 1 olhar onde o paciente está no fluxo:
 *   - Lead novo? → "Sem agendamento ainda"
 *   - Aguardando confirmação? → preparar pra confirmar
 *   - Confirmado? → preparar pré-consulta
 *   - Finalizado? → seguir pós-procedimento
 */

'use client';

import { Calendar, AlertCircle, CheckCircle, Clock, Star } from 'lucide-react';

// CRM_PHASE_2H.1 (2026-05-12) · phases canônicas pós-Fase 1C:
//   lead, agendado, paciente, orcamento
// Phases derrogadas removidas: reagendado/compareceu (no-op de phase pós-Fase 1C),
// perdido (virou lifecycle_status via rota dedicada lead_lost).
const PHASE_LABELS: Record<string, string> = {
  lead: 'Lead novo',
  agendado: 'Agendado',
  paciente: 'Paciente',
  orcamento: 'Orçamento aberto',
};

// CRM_PHASE_2H.1 · `pre_consulta`/`em_consulta` removidos (zumbis não-canônicos).
const STATUS_LABELS: Record<string, string> = {
  agendado: 'Agendado',
  aguardando_confirmacao: 'Aguardando confirmação',
  confirmado: 'Confirmado',
  aguardando: 'Na sala de espera',
  na_clinica: 'Na clínica',
  em_atendimento: 'Em atendimento',
  finalizado: 'Finalizado',
  remarcado: 'Remarcado',
  cancelado: 'Cancelado',
  no_show: 'Não compareceu', // label PT do enum no_show
  bloqueado: 'Bloqueado',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = {
  agendado: { bg: 'rgba(96,165,250,0.10)', text: '#93C5FD', icon: Calendar },
  aguardando_confirmacao: { bg: 'rgba(245,158,11,0.12)', text: '#FCD34D', icon: AlertCircle },
  confirmado: { bg: 'rgba(16,185,129,0.10)', text: '#6EE7B7', icon: CheckCircle },
  aguardando: { bg: 'rgba(168,148,201,0.12)', text: '#A894C9', icon: Clock },
  na_clinica: { bg: 'rgba(168,148,201,0.12)', text: '#A894C9', icon: Clock },
  em_atendimento: { bg: 'rgba(168,148,201,0.12)', text: '#A894C9', icon: Clock },
  finalizado: { bg: 'rgba(201,169,110,0.12)', text: '#C9A96E', icon: Star },
  remarcado: { bg: 'rgba(245,158,11,0.10)', text: '#FCD34D', icon: Calendar },
  cancelado: { bg: 'rgba(239,68,68,0.10)', text: '#FCA5A5', icon: AlertCircle },
  no_show: { bg: 'rgba(239,68,68,0.10)', text: '#FCA5A5', icon: AlertCircle },
  bloqueado: { bg: 'rgba(122,113,101,0.15)', text: 'rgba(245,240,232,0.55)', icon: AlertCircle },
};

interface Props {
  phase: string | null | undefined;
  appointmentStatus: string | null | undefined;
}

export function StatusBadge({ phase, appointmentStatus }: Props) {
  const status = appointmentStatus || null;
  const phaseLabel = phase ? PHASE_LABELS[phase] || phase : null;
  const statusMeta = status ? STATUS_COLORS[status] : null;
  const Icon = statusMeta?.icon || Calendar;
  const statusLabel = status ? STATUS_LABELS[status] || status : null;

  return (
    <div className="space-y-1.5">
      {phaseLabel && (
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[hsl(var(--muted-foreground))] uppercase tracking-[0.16em]" style={{ fontSize: '8.5px' }}>
            Fase
          </span>
          <span className="font-display text-[13px] text-[hsl(var(--foreground))]">{phaseLabel}</span>
        </div>
      )}
      {statusLabel && statusMeta && (
        <div
          className="rounded-md px-2.5 py-1.5 flex items-center gap-2"
          style={{ background: statusMeta.bg, border: `1px solid ${statusMeta.text}33` }}
        >
          <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
          <span
            className="font-meta uppercase tracking-[0.10em]"
            style={{ fontSize: '10px', fontWeight: 600, color: statusMeta.text }}
          >
            {statusLabel}
          </span>
        </div>
      )}
    </div>
  );
}
