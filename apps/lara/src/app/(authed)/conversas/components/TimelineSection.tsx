/**
 * TimelineSection (SA-07 / W-07) · lista scrollavel dos eventos recentes
 * do lead. Fonte: useLeadEvents (phase_history via API).
 *
 * Cada item: icone + descricao curta + tempo relativo ("ha 5 min").
 * Empty state grace · degrade quando sem eventos. UI dark luxo HSL
 * tokens · espelha o resto do LeadInfoPanel.
 */

import { History, ArrowRight, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { JSX } from 'react';
import { useLeadEvents, type TimelineEvent } from '../hooks/useLeadEvents';

function formatPhaseLabel(phase: string | null): string {
  if (!phase) return '—';
  // Passa por: "qualified" → "Qualified" · capitaliza primeira letra
  // sem traduzir · phase enum cru pra evitar mismatch silencioso.
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function formatRelative(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return '';
  }
}

function EventRow({ event }: { event: TimelineEvent }): JSX.Element {
  const fromLabel = formatPhaseLabel(event.from);
  const toLabel = formatPhaseLabel(event.to);
  const relative = formatRelative(event.created_at);

  // Dica do origem · "manual" = humano forcou · "auto/rpc" = sistema · etc.
  const originLabel = (() => {
    switch (event.meta.origin) {
      case 'manual_override': return 'manual';
      case 'auto_transition': return 'auto';
      case 'rpc': return 'sistema';
      case 'rule': return 'regra';
      case 'webhook': return 'webhook';
      case 'bulk_move': return 'bulk';
      case 'import': return 'import';
      default: return event.meta.origin;
    }
  })();

  return (
    <li className="flex items-start gap-3 py-2.5 border-b border-[hsl(var(--chat-border))] last:border-b-0">
      <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-[hsl(var(--accent))]/15 border border-[hsl(var(--accent))]/20 flex items-center justify-center">
        <ArrowRight className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[hsl(var(--foreground))] leading-snug">
          <span className="text-[hsl(var(--muted-foreground))]">Fase:</span>{' '}
          <span className="font-medium">{fromLabel}</span>{' '}
          <ArrowRight className="inline w-3 h-3 align-text-bottom text-[hsl(var(--muted-foreground))]" />{' '}
          <span className="font-medium text-[hsl(var(--primary))]">{toLabel}</span>
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
          <Clock className="w-2.5 h-2.5" />
          <span>{relative}</span>
          <span aria-hidden>·</span>
          <span>{originLabel}</span>
        </div>
        {event.meta.reason && (
          <p className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))] italic truncate">
            “{event.meta.reason}”
          </p>
        )}
      </div>
    </li>
  );
}

interface TimelineSectionProps {
  conversationId: string | null;
}

export function TimelineSection({ conversationId }: TimelineSectionProps): JSX.Element {
  const { events, isLoading } = useLeadEvents(conversationId);

  return (
    <div>
      <h4 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider flex items-center gap-2 mb-3">
        <History className="w-3 h-3" /> Linha do Tempo
      </h4>
      <div className="bg-[hsl(var(--chat-bg))] rounded-lg border border-[hsl(var(--chat-border))] px-3 max-h-64 overflow-y-auto custom-scrollbar">
        {isLoading && events.length === 0 ? (
          <p className="py-3 text-xs text-[hsl(var(--muted-foreground))]">Carregando eventos...</p>
        ) : events.length === 0 ? (
          <p className="py-3 text-xs text-[hsl(var(--muted-foreground))]">
            Sem eventos registrados ainda.
          </p>
        ) : (
          <ul>
            {events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
