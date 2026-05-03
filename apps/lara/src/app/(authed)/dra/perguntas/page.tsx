'use client';

/**
 * /dra/perguntas · interface mobile-first pra Dra. Mirian responder perguntas
 * que a secretaria não soube responder.
 *
 * UX otimizada:
 *   - Mobile-first (Dra. usa do celular dela)
 *   - 1 pergunta por vez (foco)
 *   - IA já preenche resposta sugerida · Dra. edita ou aprova
 *   - 1 click envia
 *   - Auto-pula pra próxima pergunta da fila
 *
 * Sprint 1 do roadmap /secretaria · resolve dor "secretaria sobe na sala
 * a cada 30min".
 */

import { useEffect, useState, useCallback } from 'react';
import { Sparkles, Send, RotateCw, CheckCircle, MessageSquare, Clock } from 'lucide-react';

interface Question {
  id: string;
  question: string;
  context_snapshot: string | null;
  suggested_answer: string | null;
  asked_at: string;
  status: string;
  conversation_id: string;
  lead_name: string | null;
  lead_phone: string | null;
}

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

export default function DraPerguntasPage() {
  const [items, setItems] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const fetchQuestions = useCallback(async () => {
    try {
      const r = await fetch('/api/dra/questions?status=pending');
      if (r.ok) {
        const data = await r.json();
        setItems(data.items || []);
        // Inicializa drafts com sugestão IA
        const drafts: Record<string, string> = {};
        for (const q of data.items || []) {
          drafts[q.id] = q.suggested_answer || '';
        }
        setEditing(drafts);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
    // Polling a cada 30s · perguntas novas aparecem sozinhas
    const t = setInterval(fetchQuestions, 30000);
    return () => clearInterval(t);
  }, [fetchQuestions]);

  async function handleSend(id: string) {
    const finalAnswer = (editing[id] || '').trim();
    if (!finalAnswer) {
      alert('Escreva uma resposta antes de enviar');
      return;
    }
    setSending(id);
    try {
      const r = await fetch(`/api/dra/questions/${id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_answer: finalAnswer }),
      });
      if (r.ok) {
        // Remove da lista local · próxima já aparece
        setItems((prev) => prev.filter((q) => q.id !== id));
      } else {
        const data = await r.json().catch(() => ({}));
        alert(`Falha: ${data.error || r.status}`);
      }
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))]">
      <header className="sticky top-0 bg-[hsl(var(--chat-panel-bg))] border-b border-white/[0.08] px-4 py-3 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-[18px] leading-none">
              Perguntas da <em className="text-[hsl(var(--primary))] font-display italic not-italic">secretaria</em>
            </h1>
            <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-1">
              {isLoading ? 'Carregando…' : `${items.length} aguardando resposta`}
            </p>
          </div>
          <button
            type="button"
            onClick={fetchQuestions}
            className="p-2 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/[0.08]"
            title="Atualizar"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-2xl mx-auto">
        {!isLoading && items.length === 0 && (
          <div className="text-center py-16">
            <CheckCircle className="w-12 h-12 mx-auto text-[hsl(var(--success))] opacity-50 mb-3" strokeWidth={1.5} />
            <p className="text-[14px] text-[hsl(var(--muted-foreground))] font-display italic">
              Sem perguntas pendentes 🌿
            </p>
          </div>
        )}

        {items.map((q) => (
          <div
            key={q.id}
            className="rounded-lg border border-white/[0.08] bg-[hsl(var(--chat-panel-bg))] overflow-hidden"
          >
            {/* Header · paciente + tempo */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-baseline justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-display text-[15px] truncate">
                  {q.lead_name || q.lead_phone || 'Paciente'}
                </p>
                {q.lead_phone && (
                  <p className="text-[10.5px] text-[hsl(var(--muted-foreground))] mt-0.5">
                    {q.lead_phone}
                  </p>
                )}
              </div>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wide flex items-center gap-1 shrink-0">
                <Clock className="w-3 h-3" strokeWidth={1.5} />
                {timeAgo(q.asked_at)}
              </span>
            </div>

            {/* Pergunta */}
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-1.5 mb-2">
                <MessageSquare className="w-3 h-3 text-[hsl(var(--muted-foreground))] opacity-60" strokeWidth={1.5} />
                <span className="text-[9.5px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                  Secretaria perguntou
                </span>
              </div>
              <p className="text-[14px] text-[hsl(var(--foreground))] leading-snug">
                {q.question}
              </p>
            </div>

            {/* Contexto · ultimas msgs do paciente */}
            {q.context_snapshot && (
              <details className="px-4 py-2 border-b border-white/[0.06] group">
                <summary className="text-[11px] text-[hsl(var(--muted-foreground))] cursor-pointer hover:text-[hsl(var(--foreground))] flex items-center gap-1.5">
                  <span className="text-[9.5px] uppercase tracking-[0.18em]">Contexto da conversa</span>
                  <span className="text-[9px] opacity-50 group-open:hidden">(toque para ver)</span>
                </summary>
                <pre className="text-[11.5px] text-[hsl(var(--muted-foreground))] mt-2 whitespace-pre-wrap leading-relaxed font-sans">
                  {q.context_snapshot}
                </pre>
              </details>
            )}

            {/* Resposta · IA pré-preencheu, Dra. edita */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: '#A894C9' }} />
                <span className="text-[9.5px] uppercase tracking-[0.18em]" style={{ color: '#A894C9' }}>
                  {q.suggested_answer ? 'Sugestão IA · edite e envie' : 'Sua resposta'}
                </span>
              </div>
              <textarea
                value={editing[q.id] ?? ''}
                onChange={(e) => setEditing((prev) => ({ ...prev, [q.id]: e.target.value }))}
                rows={5}
                placeholder={q.suggested_answer ? '' : 'Escreva a resposta pra Marcia enviar pro paciente…'}
                className="w-full bg-white/[0.02] border border-white/[0.06] rounded-md p-3 text-[14px] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))]/40 focus:ring-1 focus:ring-[hsl(var(--primary))]/20 leading-relaxed resize-none"
              />
              <button
                type="button"
                onClick={() => handleSend(q.id)}
                disabled={sending === q.id || !(editing[q.id] || '').trim()}
                className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md text-[14px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: '#C9A96E',
                  color: '#1A1814',
                }}
              >
                <Send className="w-4 h-4" strokeWidth={2} />
                {sending === q.id ? 'Enviando…' : 'Enviar pra secretaria'}
              </button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
