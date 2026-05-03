/**
 * NextAppointmentCard · próximo agendamento do lead inline no painel direito.
 *
 * Roadmap A5 · evita secretaria trocar pra /crm/agenda só pra confirmar
 * data/hora do paciente que tá no chat.
 */

'use client';

import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';

interface AppointmentItem {
  id: string;
  scheduled_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  procedure: string;
  professional: string;
  status: string;
  consult_type: string | null;
}

interface Props {
  leadId: string | null;
  /** Callback opcional · expoe o status do proximo appointment (ou null) pro caller */
  onStatusChange?: (status: string | null) => void;
}

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'Montserrat, sans-serif',
  fontSize: '8.5px',
  fontWeight: 500,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: 'rgba(245, 240, 232, 0.45)',
};

function formatDate(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const hhmm = time.slice(0, 5);

  if (dt.getTime() === today.getTime()) return `Hoje · ${hhmm}`;
  if (dt.getTime() === tomorrow.getTime()) return `Amanhã · ${hhmm}`;

  const weekday = dt.toLocaleDateString('pt-BR', { weekday: 'long' });
  const day = dt.getDate();
  const month = dt.toLocaleDateString('pt-BR', { month: 'short' });
  return `${weekday.slice(0, 3)} ${day} ${month} · ${hhmm}`;
}

export function NextAppointmentCard({ leadId, onStatusChange }: Props) {
  const [next, setNext] = useState<AppointmentItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!leadId) {
      setNext(null);
      onStatusChange?.(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/leads/${leadId}/appointments?upcoming=true`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => {
        if (cancelled) return;
        const items: AppointmentItem[] = data.items || [];
        const first = items[0] || null;
        setNext(first);
        onStatusChange?.(first?.status ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setNext(null);
          onStatusChange?.(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  if (!leadId) return null;

  return (
    <div className="px-5 py-4 border-b border-white/[0.06]">
      <div className="flex items-center gap-2 mb-2.5">
        <Calendar className="w-3 h-3 text-[hsl(var(--muted-foreground))] opacity-60" strokeWidth={1.5} />
        <span style={SECTION_LABEL_STYLE}>Próximo agendamento</span>
      </div>
      {isLoading ? (
        <div className="h-9 rounded-md bg-white/[0.02] animate-pulse" />
      ) : next ? (
        <div
          className="rounded-md px-3 py-2"
          style={{
            background: 'rgba(201, 169, 110, 0.08)',
            border: '1px solid rgba(201, 169, 110, 0.20)',
          }}
        >
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="font-meta uppercase tracking-[0.16em]"
              style={{ fontSize: '9.5px', fontWeight: 600, color: '#C9A96E' }}
            >
              {formatDate(next.scheduled_date, next.start_time)}
            </span>
          </div>
          <div className="text-[12px] text-[hsl(var(--foreground))] mt-1 truncate">
            {next.procedure}
          </div>
          {next.professional && (
            <div className="text-[10.5px] text-[hsl(var(--muted-foreground))] mt-0.5 truncate">
              com {next.professional}
            </div>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))] italic font-display opacity-70">
          Sem agendamento futuro
        </p>
      )}
    </div>
  );
}
