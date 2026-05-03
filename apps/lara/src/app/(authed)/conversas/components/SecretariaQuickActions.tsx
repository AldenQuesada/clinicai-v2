/**
 * SecretariaQuickActions · 4 botões grandes acima do textarea pra ações
 * rápidas da secretaria (perfil idoso · zero digitação).
 *
 * Roadmap A2 · cada click preenche o textarea com template editável ·
 * secretaria personaliza nome/data e envia.
 *
 * Aparece SO em conv com inbox_role='secretaria'. SDR (Lara) tem outras
 * ferramentas (smart_replies IA, NextActions, etc).
 */

'use client';

import { CheckCircle, CalendarClock, DollarSign, HelpCircle } from 'lucide-react';

interface QuickAction {
  id: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  template: (firstName: string) => string;
  color: string;
}

const ACTIONS: QuickAction[] = [
  {
    id: 'confirmar',
    icon: CheckCircle,
    label: 'Confirmar agendamento',
    template: (n) =>
      `Olá, ${n || '[nome]'}! Confirmando seu agendamento [DATA] às [HORÁRIO] com a Dra. Mirian. Posso confirmar sua presença? 🌿`,
    color: '#10B981',
  },
  {
    id: 'reagendar',
    icon: CalendarClock,
    label: 'Reagendar',
    template: (n) =>
      `Olá, ${n || '[nome]'}! Vamos reagendar seu horário? Tenho disponibilidade em: [DATA1] · [DATA2] · [DATA3]. Qual fica melhor pra você? 📅`,
    color: '#F59E0B',
  },
  {
    id: 'valores',
    icon: DollarSign,
    label: 'Enviar valores',
    template: (n) =>
      `${n || 'Olá'}, sobre os valores do procedimento [PROCEDIMENTO]:\n\n• Avaliação inicial: R$ [VALOR]\n• Aplicação: a partir de R$ [VALOR]\n\nFormas de pagamento: PIX, cartão (até [X]x sem juros) ou boleto. 💛`,
    color: '#C9A96E',
  },
  {
    id: 'ajuda',
    icon: HelpCircle,
    label: 'Pedir ajuda da Dra.',
    template: () =>
      `[Em breve · Consultoria com a Dra. Mirian inline. Por enquanto, anote sua dúvida e me chame pessoalmente.]`,
    color: '#A894C9',
  },
];

interface Props {
  leadFirstName?: string;
  onPick: (template: string) => void;
  onAskDoctor?: () => void;
}

export function SecretariaQuickActions({ leadFirstName, onPick, onAskDoctor }: Props) {
  return (
    <div className="mb-2 grid grid-cols-2 gap-1.5">
      {ACTIONS.map((a) => {
        const Icon = a.icon;
        const isAskDoctor = a.id === 'ajuda';
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
              style={{
                fontSize: '10px',
                letterSpacing: '0.08em',
                fontWeight: 600,
              }}
            >
              {a.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
