/**
 * SecretariaQuickActions · 4 botões grandes no painel direito.
 *
 * Roadmap A2 + iteração contextual: os botões MUDAM conforme o status
 * do appointment / fase do lead. Reagendar só aparece quando há agendamento;
 * Confirmar só quando aguardando confirmação; Pré-consulta quando confirmado;
 * Pós-procedimento quando finalizado.
 *
 * Mapeamento (decidido com Alden · CRM_PHASE_2H.1 sync com status canônicos):
 *   sem appointment / lead novo → Oferecer horários · Valores · Endereço · Pedir Dra
 *   aguardando_confirmacao      → Confirmar · Reagendar · Endereço · Pedir Dra
 *   confirmado / em_andamento   → Pré-consulta · Endereço · Reagendar · Pedir Dra
 *   cancelado / no_show         → Reagendar · Valores · Endereço · Pedir Dra
 *   finalizado                  → Pós-procedimento · Marcar retoque · Valores · Pedir Dra
 *   paciente recorrente         → Marcar retoque · Valores · Pré-consulta · Pedir Dra
 *
 * NB: `ACTIONS.pre_consulta` é o ID de um BOTÃO de UI (orientação pré-consulta),
 *     NÃO um appointment status. O status `pre_consulta` foi removido na 2H.1
 *     (zumbi não-canônico no DB).
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
    template: () =>
      'Consigo verificar os melhores horários para você. Você prefere atendimento no período da manhã ou da tarde?',
    color: '#F59E0B',
  },
  confirmar: {
    id: 'confirmar',
    icon: CheckCircle,
    label: 'Confirmar',
    template: () =>
      'Passando para confirmar seu horário. Está tudo certo para você comparecer?',
    color: '#10B981',
  },
  reagendar: {
    id: 'reagendar',
    icon: CalendarClock,
    label: 'Reagendar',
    template: () =>
      'Sem problema, conseguimos verificar uma nova opção de horário para você. Qual período fica melhor: manhã ou tarde?',
    color: '#F59E0B',
  },
  valores: {
    id: 'valores',
    icon: DollarSign,
    label: 'Valores',
    template: () =>
      'Te explico sim. Como o valor pode variar conforme a avaliação e a melhor indicação para o seu caso, vou confirmar direitinho com a equipe para te passar com clareza.',
    color: '#C9A96E',
  },
  endereco: {
    id: 'endereco',
    icon: MapPin,
    label: 'Endereço',
    template: () =>
      'Claro. Vou te enviar o endereço certinho da clínica por aqui para você vir com tranquilidade.',
    color: '#93C5FD',
  },
  pre_consulta: {
    id: 'pre_consulta',
    icon: Sparkles,
    label: 'Pré-consulta',
    template: () =>
      'Antes do seu atendimento, a orientação principal é vir com tranquilidade e, se tiver alguma dúvida ou informação importante sobre sua saúde, pode me mandar por aqui.',
    color: '#A894C9',
  },
  pos_procedimento: {
    id: 'pos_procedimento',
    icon: Heart,
    label: 'Pós-procedimento',
    template: () =>
      'Como você está se sentindo após o atendimento? Se tiver qualquer dúvida ou desconforto, me avise por aqui para orientarmos da forma correta.',
    color: '#10B981',
  },
  marcar_retoque: {
    id: 'marcar_retoque',
    icon: CalendarPlus,
    label: 'Marcar retoque',
    template: () =>
      'Podemos verificar a melhor data para sua revisão/retorno. Você prefere manhã ou tarde?',
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
  // CRM_PHASE_2H.1: `pre_consulta` e `em_consulta` removidos (zumbis · não-canônicos no DB).
  const inProgress = ['aguardando', 'na_clinica', 'em_atendimento'].includes(
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
