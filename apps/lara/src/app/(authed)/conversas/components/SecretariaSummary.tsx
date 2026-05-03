/**
 * SecretariaSummary · resumo IA da conv (1-2 linhas) no topo do chat.
 *
 * Roadmap A1 · secretaria entende contexto em 2s sem ler 50 mensagens.
 * Cache em wa_conversations.ai_secretaria_summary · re-gera quando >30min.
 */

'use client';

import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';

interface Props {
  conversationId: string | null;
  /** Recarrega quando muda · ex: msg nova entrou */
  refreshKey?: string | number;
}

export function SecretariaSummary({ conversationId, refreshKey }: Props) {
  const [summary, setSummary] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [cached, setCached] = useState(false);

  async function fetchSummary(force = false) {
    if (!conversationId) {
      setSummary('');
      return;
    }
    setIsLoading(true);
    try {
      const url = `/api/conversations/${conversationId}/summary${force ? '?force=true' : ''}`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        setSummary(data.summary || '');
        setCached(data.cached === true);
      }
    } catch {
      // silencioso · summary é decoração
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchSummary(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, refreshKey]);

  if (!conversationId) return null;
  if (!summary && !isLoading) return null;

  return (
    <div
      className="px-4 py-2 border-b border-white/[0.06] flex items-start gap-2.5"
      style={{
        background: 'rgba(168, 148, 201, 0.06)',
      }}
    >
      <Sparkles
        className="w-3.5 h-3.5 mt-0.5 shrink-0"
        strokeWidth={1.5}
        style={{ color: '#A894C9' }}
      />
      <div className="flex-1 min-w-0">
        {isLoading && !summary ? (
          <div className="h-3 w-2/3 rounded bg-white/[0.04] animate-pulse" />
        ) : (
          <p className="text-[12px] text-[hsl(var(--foreground))] leading-snug">
            {summary}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => fetchSummary(true)}
        disabled={isLoading}
        title={cached ? 'Atualizar resumo' : 'Resumo gerado agora'}
        className="shrink-0 p-1 rounded transition-colors text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-white/[0.04] disabled:opacity-50"
      >
        <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
      </button>
    </div>
  );
}
