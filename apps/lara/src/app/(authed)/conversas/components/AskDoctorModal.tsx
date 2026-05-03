/**
 * AskDoctorModal · secretaria envia pergunta pra Dra. com IA gerando contexto.
 *
 * Sprint 1 do roadmap /secretaria · resolve "secretaria sobe na sala da Dra.
 * a cada 30min".
 *
 * UX otimizada pra perfil idoso:
 *   - Modal grande · 1 tela
 *   - Pergunta simples ("o que você quer perguntar pra Dra.?")
 *   - Botão grande "Enviar pra Dra."
 *   - Confirmacao visual · "Pergunta enviada · você verá a resposta aqui"
 */

'use client';

import { useState } from 'react';
import { X, Send, HelpCircle, Loader } from 'lucide-react';

interface Props {
  conversationId: string;
  leadFirstName?: string;
  onClose: () => void;
  onSent?: () => void;
}

export function AskDoctorModal({ conversationId, leadFirstName, onClose, onSent }: Props) {
  const [question, setQuestion] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    const q = question.trim();
    if (!q || sending) return;
    setSending(true);
    try {
      const r = await fetch('/api/secretaria/ask-doctor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, question: q }),
      });
      if (r.ok) {
        setSent(true);
        onSent?.();
        // Auto-fecha em 2s
        setTimeout(onClose, 2000);
      } else {
        const data = await r.json().catch(() => ({}));
        alert(`Falha: ${data.error || r.status}`);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg overflow-hidden shadow-2xl"
        style={{ background: 'hsl(var(--chat-panel-bg))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between border-b border-white/[0.08]"
          style={{ background: 'rgba(168, 148, 201, 0.08)' }}
        >
          <div className="flex items-center gap-2.5">
            <HelpCircle className="w-5 h-5" strokeWidth={1.5} style={{ color: '#A894C9' }} />
            <h2 className="font-display text-[16px] text-[hsl(var(--foreground))]">
              Perguntar pra <em className="italic" style={{ color: '#A894C9' }}>Dra. Mirian</em>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        {sent ? (
          <div className="p-8 text-center">
            <div
              className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'rgba(16, 185, 129, 0.15)' }}
            >
              <svg
                className="w-8 h-8"
                fill="none"
                stroke="#10B981"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-display text-[16px] text-[hsl(var(--foreground))] mb-1">
              Pergunta enviada!
            </p>
            <p className="text-[12px] text-[hsl(var(--muted-foreground))] italic font-display">
              A resposta vai aparecer aqui no chat assim que a Dra. responder.
            </p>
          </div>
        ) : (
          <div className="p-5">
            <p className="text-[12px] text-[hsl(var(--muted-foreground))] mb-3 leading-relaxed">
              Escreva o que você quer saber pra responder
              {leadFirstName ? ` ${leadFirstName}` : ' o paciente'}. A Dra. vai
              responder do celular dela com uma sugestão pronta · você só edita
              e envia.
            </p>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ex: Quanto custa o procedimento de Smooth Eyes?"
              rows={5}
              autoFocus
              className="w-full bg-white/[0.02] border border-white/[0.06] rounded-md p-3 text-[14px] text-[hsl(var(--foreground))] focus:outline-none focus:border-[#A894C9]/40 focus:ring-1 focus:ring-[#A894C9]/20 leading-relaxed resize-none"
            />
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-md text-[13px] font-medium border border-white/[0.08] text-[hsl(var(--muted-foreground))] hover:bg-white/[0.04]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!question.trim() || sending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-md text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: '#A894C9', color: 'white' }}
              >
                {sending ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" strokeWidth={2} />
                    Enviando…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" strokeWidth={2} />
                    Enviar pra Dra.
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
