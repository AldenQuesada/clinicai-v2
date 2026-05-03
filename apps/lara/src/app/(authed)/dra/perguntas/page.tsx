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
import { Sparkles, RotateCw, CheckCircle, MessageSquare, Clock, Eye, EyeOff } from 'lucide-react';

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

interface MirrorMsg {
  id: string;
  direction: 'inbound' | 'outbound';
  sender: string;
  content: string;
  content_type: string;
  sent_at: string;
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
  // Mirror conversa · keyed por conversation_id · lazy load on demand
  const [mirrorOpen, setMirrorOpen] = useState<Record<string, boolean>>({});
  const [mirrorMsgs, setMirrorMsgs] = useState<Record<string, MirrorMsg[]>>({});
  const [mirrorLoading, setMirrorLoading] = useState<Record<string, boolean>>({});

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

  async function toggleMirror(conversationId: string) {
    const isOpen = !!mirrorOpen[conversationId];
    setMirrorOpen((p) => ({ ...p, [conversationId]: !isOpen }));
    if (!isOpen && !mirrorMsgs[conversationId]) {
      setMirrorLoading((p) => ({ ...p, [conversationId]: true }));
      try {
        const r = await fetch(`/api/dra/conversations/${conversationId}/messages`);
        if (r.ok) {
          const data = await r.json();
          setMirrorMsgs((p) => ({ ...p, [conversationId]: data.messages || [] }));
        }
      } finally {
        setMirrorLoading((p) => ({ ...p, [conversationId]: false }));
      }
    }
  }

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

            {/* Contexto · ultimas msgs do paciente · resumo IA */}
            {q.context_snapshot && (
              <details className="px-4 py-2 border-b border-white/[0.06] group">
                <summary className="text-[11px] text-[hsl(var(--muted-foreground))] cursor-pointer hover:text-[hsl(var(--foreground))] flex items-center gap-1.5">
                  <span className="text-[9.5px] uppercase tracking-[0.18em]">Resumo da conversa</span>
                  <span className="text-[9px] opacity-50 group-open:hidden">(toque para ver)</span>
                </summary>
                <pre className="text-[11.5px] text-[hsl(var(--muted-foreground))] mt-2 whitespace-pre-wrap leading-relaxed font-sans">
                  {q.context_snapshot}
                </pre>
              </details>
            )}

            {/* Espelho da conversa inteira · read-only · gated em owner/admin
                · zero envio pra paciente · soh leitura. */}
            <div className="border-b border-white/[0.06]">
              <button
                type="button"
                onClick={() => toggleMirror(q.conversation_id)}
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-left"
              >
                <span className="flex items-center gap-1.5">
                  {mirrorOpen[q.conversation_id] ? (
                    <EyeOff className="w-3 h-3 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
                  ) : (
                    <Eye className="w-3 h-3 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
                  )}
                  <span className="text-[9.5px] uppercase tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                    {mirrorOpen[q.conversation_id] ? 'Esconder conversa inteira' : 'Ver conversa inteira'}
                  </span>
                </span>
                <span className="text-[9px] text-[hsl(var(--muted-foreground))] opacity-60">
                  somente leitura
                </span>
              </button>
              {mirrorOpen[q.conversation_id] && (
                <div className="px-4 py-3 bg-black/[0.15] max-h-80 overflow-y-auto custom-scrollbar">
                  {mirrorLoading[q.conversation_id] ? (
                    <div className="text-center py-4 text-[11px] text-[hsl(var(--muted-foreground))]">
                      Carregando histórico…
                    </div>
                  ) : (mirrorMsgs[q.conversation_id]?.length ?? 0) === 0 ? (
                    <div className="text-center py-4 text-[11px] text-[hsl(var(--muted-foreground))]">
                      Sem mensagens.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {(mirrorMsgs[q.conversation_id] || []).map((m) => {
                        const isPatient = m.direction === 'inbound';
                        return (
                          <div
                            key={m.id}
                            className={`flex ${isPatient ? 'justify-start' : 'justify-end'}`}
                          >
                            <div
                              className="max-w-[85%] rounded-lg px-3 py-2 text-[12.5px] leading-snug break-words"
                              style={{
                                background: isPatient ? 'rgba(255,255,255,0.04)' : 'rgba(201,169,110,0.10)',
                                border: `1px solid ${isPatient ? 'rgba(255,255,255,0.06)' : 'rgba(201,169,110,0.18)'}`,
                              }}
                            >
                              <p className="whitespace-pre-wrap text-[hsl(var(--foreground))]">
                                {m.content_type === 'audio' && (m.content || '').startsWith('[audio')
                                  ? '🎙 áudio (sem transcrição)'
                                  : m.content_type === 'image'
                                  ? `🖼 ${m.content || 'imagem'}`
                                  : m.content_type === 'document'
                                  ? `📎 ${m.content || 'documento'}`
                                  : m.content}
                              </p>
                              <p className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1 opacity-70">
                                {new Date(m.sent_at).toLocaleString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                                {' · '}
                                {isPatient ? 'paciente' : m.sender}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

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
                <CheckCircle className="w-4 h-4" strokeWidth={2} />
                {sending === q.id ? 'Resolvendo…' : 'Resolvida · enviar pra Luciana'}
              </button>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))] text-center mt-2 opacity-70">
                Sai da sua fila e a Luciana recebe a resposta no chat
              </p>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
