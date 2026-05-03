/**
 * SecretariaQuickActions · 4 botões grandes no painel direito.
 *
 * Roadmap A2 + iteração contextual: os botões MUDAM conforme o status
 * do appointment / fase do lead. Reagendar só aparece quando há agendamento;
 * Confirmar só quando aguardando confirmação; Pré-consulta quando confirmado;
 * Pós-procedimento quando finalizado.
 *
 * Mapeamento (decidido com Alden):
 *   sem appointment / lead novo → Oferecer horários · Valores · Endereço · Pedir Dra
 *   aguardando_confirmacao      → Confirmar · Reagendar · Endereço · Pedir Dra
 *   confirmado / pre_consulta   → Pré-consulta · Endereço · Reagendar · Pedir Dra
 *   cancelado / no_show         → Reagendar · Valores · Endereço · Pedir Dra
 *   finalizado                  → Pós-procedimento · Marcar retoque · Valores · Pedir Dra
 *   paciente recorrente         → Marcar retoque · Valores · Pré-consulta · Pedir Dra
 */

'use client';

import {
  CheckCircle,
  CalendarClock,
  CalendarPlus,
  DollarSign,
  HelpCircle,
  MapPin,
  Sparkles,
  Heart,
} from 'lucide-react';

interface QuickAction {
  id: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  template: (firstName: string) => string;
  color: string;
}

const ACTIONS: Record<string, QuickAction> = {
  oferecer_horarios: {
    id: 'oferecer_horarios',
    icon: CalendarPlus,
    label: 'Oferecer horários',
    template: (n) =>
      `Olá, ${n || '[nome]'}! 🌿 Para [PROCEDIMENTO/CONSULTA] tenho disponibilidade em: [DATA1] · [DATA2] · [DATA3]. Qual fica melhor pra você?`,
    color: '#F59E0B',
  },
  confirmar: {
    id: 'confirmar',
    icon: CheckCircle,
    label: 'Confirmar',
    template: (n) =>
      `Olá, ${n || '[nome]'}! Confirmando seu agendamento [DATA] às [HORÁRIO] com a Dra. Mirian. Posso confirmar sua presença? 🌿`,
    color: '#10B981',
  },
  reagendar: {
    id: 'reagendar',
    icon: CalendarClock,
    label: 'Reagendar',
    template: (n) =>
      `${n || 'Olá'}, vamos reagendar seu horário? Tenho disponibilidade em: [DATA1] · [DATA2] · [DATA3]. Qual fica melhor? 📅`,
    color: '#F59E0B',
  },
  valores: {
    id: 'valores',
    icon: DollarSign,
    label: 'Valores',
    template: (n) =>
      `${n || 'Olá'}, sobre os valores de [PROCEDIMENTO]:\n\n• Avaliação inicial: R$ [VALOR]\n• Aplicação: a partir de R$ [VALOR]\n\nFormas de pagamento: PIX, cartão (até [X]x sem juros) ou boleto. 💛`,
    color: '#C9A96E',
  },
  endereco: {
    id: 'endereco',
    icon: MapPin,
    label: 'Endereço',
    template: (n) =>
      `${n || 'Olá'}! Nosso endereço é [ENDEREÇO COMPLETO]. Localização no Maps: [LINK]. Estacionamento: [INFO]. Qualquer coisa me chama! 📍`,
    color: '#93C5FD',
  },
  pre_consulta: {
    id: 'pre_consulta',
    icon: Sparkles,
    label: 'Pré-consulta',
    template: (n) =>
      `${n || 'Olá'}! Algumas orientações pra sua consulta:\n\n• Jejum: [TEMPO]\n• Levar acompanhante: [SIM/NÃO]\n• Documentos: RG · cartão SUS · exames anteriores\n• Pode usar maquiagem leve\n\nQualquer dúvida me avise! 🌿`,
    color: '#A894C9',
  },
  pos_procedimento: {
    id: 'pos_procedimento',
    icon: Heart,
    label: 'Pós-procedimento',
    template: (n) =>
      `${n || 'Querida'}, parabéns pela escolha! 💛 Cuidados pós-procedimento:\n\n• Próximas 48h: [CUIDADOS]\n• Evite: [LISTA]\n• Próximo retorno: [DATA]\n\nQualquer reação ou dúvida me chame imediatamente.`,
    color: '#10B981',
  },
  marcar_retoque: {
    id: 'marcar_retoque',
    icon: CalendarPlus,
    label: 'Marcar retoque',
    template: (n) =>
      `${n || 'Olá'}! Está na hora do seu retoque 🌿 A Dra. Mirian tem disponibilidade em: [DATA1] · [DATA2] · [DATA3]. Qual fica melhor pra você?`,
    color: '#C9A96E',
  },
  pedir_dra: {
    id: 'pedir_dra',
    icon: HelpCircle,
    label: 'Pedir ajuda da Dra.',
    template: () => '',
    color: '#A894C9',
  },
};

/**
 * Decide quais 4 botoes mostrar baseado em phase + appointmentStatus.
 * Sempre inclui 'pedir_dra' no final (escape hatch universal).
 */
function pickActions(
  phase: string | null | undefined,
  appointmentStatus: string | null | undefined,
): QuickAction[] {
  const inProgress = ['aguardando', 'na_clinica', 'em_consulta', 'em_atendimento', 'pre_consulta'].includes(
    appointmentStatus || '',
  );
  const aguardandoConf = appointmentStatus === 'aguardando_confirmacao';
  const confirmado = appointmentStatus === 'confirmado';
  const cancelOrNoShow = ['cancelado', 'no_show', 'remarcado'].includes(appointmentStatus || '');
  const finalizado = appointmentStatus === 'finalizado';
  const semAppt = !appointmentStatus;
  const paciente = phase === 'paciente';

  if (paciente && finalizado) {
    return [ACTIONS.pos_procedimento, ACTIONS.marcar_retoque, ACTIONS.valores, ACTIONS.pedir_dra];
  }
  if (finalizado) {
    return [ACTIONS.pos_procedimento, ACTIONS.marcar_retoque, ACTIONS.valores, ACTIONS.pedir_dra];
  }
  if (paciente) {
    return [ACTIONS.marcar_retoque, ACTIONS.valores, ACTIONS.pre_consulta, ACTIONS.pedir_dra];
  }
  if (aguardandoConf) {
    return [ACTIONS.confirmar, ACTIONS.reagendar, ACTIONS.endereco, ACTIONS.pedir_dra];
  }
  if (confirmado || inProgress) {
    return [ACTIONS.pre_consulta, ACTIONS.endereco, ACTIONS.reagendar, ACTIONS.pedir_dra];
  }
  if (cancelOrNoShow) {
    return [ACTIONS.reagendar, ACTIONS.valores, ACTIONS.endereco, ACTIONS.pedir_dra];
  }
  // Default · lead novo / sem appointment
  if (semAppt) {
    return [ACTIONS.oferecer_horarios, ACTIONS.valores, ACTIONS.endereco, ACTIONS.pedir_dra];
  }
  // Fallback genérico
  return [ACTIONS.oferecer_horarios, ACTIONS.valores, ACTIONS.endereco, ACTIONS.pedir_dra];
}

interface Props {
  leadFirstName?: string;
  phase?: string | null;
  appointmentStatus?: string | null;
  onPick: (template: string) => void;
  onAskDoctor?: () => void;
}

export function SecretariaQuickActions({
  leadFirstName,
  phase,
  appointmentStatus,
  onPick,
  onAskDoctor,
}: Props) {
  const actions = pickActions(phase, appointmentStatus);
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {actions.map((a) => {
        const Icon = a.icon;
        const isAskDoctor = a.id === 'pedir_dra';
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              if (isAskDoctor && onAskDoctor) onAskDoctor();
              else onPick(a.template(leadFirstName || ''));
            }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-md text-left transition-all hover:opacity-90 group"
            style={{
              background: `${a.color}14`,
              border: `1px solid ${a.color}33`,
              color: a.color,
            }}
            title={a.label}
          >
            <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            <span
              className="font-meta uppercase truncate"
              style={{ fontSize: '10px', letterSpacing: '0.08em', fontWeight: 600 }}
            >
              {a.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
