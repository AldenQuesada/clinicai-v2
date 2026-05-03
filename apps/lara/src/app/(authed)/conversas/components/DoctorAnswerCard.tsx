/**
 * DoctorAnswerCard · card destacado quando há resposta da Dra. pendente
 * pra essa conv. Aparece acima do textarea na /secretaria.
 *
 * Sprint 1 do roadmap · ciclo completo:
 *   1. Secretaria pergunta · status='pending'
 *   2. Dra. responde · status='answered'
 *   3. Card aparece com resposta · botão "Usar resposta" → preenche textarea
 *      e marca status='used'
 *   4. Botão "Já respondi" → status='discarded' (Dra. ajudou mas secretaria
 *      improvisou outra coisa)
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sparkles, Check, X, Copy } from 'lucide-react';

interface Question {
  id: string;
  question: string;
  final_answer: string | null;
  suggested_answer: string | null;
  status: string;
  asked_at: string;
  answered_at: string | null;
}

interface Props {
  conversationId: string | null;
  refreshKey?: string | number;
  onUseAnswer: (text: string) => void;
}

export function DoctorAnswerCard({ conversationId, refreshKey, onUseAnswer }: Props) {
  const [pending, setPending] = useState<Question | null>(null);

  const fetchPending = useCallback(async () => {
    if (!conversationId) return;
    try {
      const r = await fetch(`/api/secretaria/ask-doctor?conversation_id=${conversationId}`);
      if (r.ok) {
        const data = await r.json();
        const items: Question[] = data.items || [];
        // Pega a mais recente que ainda não foi usada/descartada
        const next = items.find((q) => q.status === 'answered') ?? null;
        setPending(next);
      }
    } catch {
      /* silencioso */
    }
  }, [conversationId]);

  useEffect(() => {
    fetchPending();
    // Polling a cada 15s · resposta da Dra. aparece sozinha
    const t = setInterval(fetchPending, 15000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, refreshKey]);

  async function markStatus(status: 'used' | 'discarded') {
    if (!pending) return;
    try {
      await fetch(`/api/dra/questions/${pending.id}/answer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch {
      /* silencioso */
    }
    setPending(null);
  }

  if (!pending || !pending.final_answer) return null;

  return (
    <div
      className="mb-2 rounded-md overflow-hidden border"
      style={{
        background: 'rgba(168, 148, 201, 0.08)',
        borderColor: 'rgba(168, 148, 201, 0.30)',
      }}
    >
      <div
        className="px-3 py-2 flex items-center gap-2 border-b"
        style={{
          background: 'rgba(168, 148, 201, 0.10)',
          borderColor: 'rgba(168, 148, 201, 0.20)',
        }}
      >
        <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} style={{ color: '#A894C9' }} />
        <span
          className="font-meta uppercase tracking-[0.18em]"
          style={{ fontSize: '9.5px', fontWeight: 600, color: '#A894C9' }}
        >
          Dra. Mirian respondeu · use como referência
        </span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-[12.5px] text-[hsl(var(--foreground))] leading-relaxed whitespace-pre-wrap">
          {pending.final_answer}
        </p>
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => {
              onUseAnswer(pending.final_answer || '');
              markStatus('used');
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-all hover:opacity-90"
            style={{ background: '#A894C9', color: 'white' }}
          >
            <Copy className="w-3 h-3" strokeWidth={2} />
            Usar resposta
          </button>
          <button
            type="button"
            onClick={() => markStatus('discarded')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] text-[hsl(var(--muted-foreground))] border border-white/[0.08] hover:bg-white/[0.04]"
          >
            <X className="w-3 h-3" strokeWidth={2} />
            Já respondi
          </button>
        </div>
      </div>
    </div>
  );
}
