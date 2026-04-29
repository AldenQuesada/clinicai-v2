/**
 * useLeadEvents (SA-07 / W-07) · busca timeline de eventos do lead atrelado
 * a uma conversa. Faz fetch em /api/conversations/[id]/events e cacheia
 * em state local · refetcha quando conversationId muda.
 *
 * Empty/erro nunca crasha · retorna array vazio. Componente decide o
 * empty state.
 */

import { useState, useEffect } from 'react';

export interface TimelineEvent {
  id: string;
  type: 'phase_change';
  from: string | null;
  to: string;
  by_user: string | null;
  created_at: string;
  meta: {
    origin: string;
    reason: string | null;
    triggered_by: string | null;
  };
}

export function useLeadEvents(conversationId: string | null) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}/events`);
        if (!res.ok) {
          if (!cancelled) setEvents([]);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setEvents(Array.isArray(json?.events) ? json.events : []);
        }
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return { events, isLoading };
}
