'use client';

import { Send, Loader, UserCircle, AlertTriangle, RotateCw, X } from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import { CopilotSummary } from './CopilotSummary';
import { SmartReplies } from './SmartReplies';
import type { Conversation } from '../hooks/useConversations';
import type { Message } from '../hooks/useMessages';
import { format } from 'date-fns';

interface MessageAreaProps {
  selectedConversation: Conversation | null;
  messages: Message[];
  isLoadingMessages: boolean;
  newMessage: string;
  onNewMessageChange: (val: string) => void;
  onSendMessage: () => void;
  /** P-06: retentar uma msg que falhou */
  onRetryMessage?: (tempId: string) => void;
  /** P-06: descartar uma msg que falhou */
  onDiscardMessage?: (tempId: string) => void;
  sendStatus: 'idle' | 'sending' | 'error';
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  /** Sprint B · W-02: TLDR do lead no topo */
  copilotSummary?: string;
  copilotSummaryLoading?: boolean;
  copilotSummaryError?: string | null;
  copilotGeneratedAt?: string;
  copilotCached?: boolean;
  /** Sprint B · W-03: 3 chips clicaveis acima do textarea */
  copilotSmartReplies?: string[];
  onRefreshCopilot?: () => void;
}

export function MessageArea({
  selectedConversation,
  messages,
  isLoadingMessages,
  newMessage,
  onNewMessageChange,
  onSendMessage,
  onRetryMessage,
  onDiscardMessage,
  sendStatus,
  messagesEndRef,
  copilotSummary = '',
  copilotSummaryLoading = false,
  copilotSummaryError = null,
  copilotGeneratedAt = '',
  copilotCached = false,
  copilotSmartReplies = [],
  onRefreshCopilot,
}: MessageAreaProps) {
  if (!selectedConversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[hsl(var(--chat-bg))]">
        <p className="text-[hsl(var(--muted-foreground))]">Selecione uma conversa para começar</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[hsl(var(--chat-bg))] relative h-full">
      {/* Header */}
      <div className="h-[72px] border-b border-[hsl(var(--chat-border))] flex items-center px-6 gap-3 shrink-0">
        <UserCircle className="h-10 w-10 text-[hsl(var(--muted-foreground))]" />
        <div>
          <h2 className="font-medium text-sm text-[hsl(var(--foreground))]">{selectedConversation.lead_name}</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{selectedConversation.phone}</p>
        </div>
      </div>

      {/* Sprint B · W-02: Copiloto AI · TLDR do lead */}
      {onRefreshCopilot && (
        <CopilotSummary
          summary={copilotSummary}
          isLoading={copilotSummaryLoading}
          error={copilotSummaryError}
          generatedAt={copilotGeneratedAt}
          cached={copilotCached}
          onRefresh={onRefreshCopilot}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {isLoadingMessages ? (
          <div className="text-center text-[hsl(var(--muted-foreground))] text-sm">Carregando mensagens...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-[hsl(var(--muted-foreground))] text-sm mt-10">Nenhuma mensagem ainda.</div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.sender === 'user';
            const isFailed = msg.failed === true;
            return (
              <div key={msg.id} className={`flex ${isUser ? 'justify-start' : 'justify-end'} ${isFailed ? 'flex-col items-end' : ''}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 transition-colors ${
                  isFailed
                    ? 'bg-[hsl(var(--danger))]/10 border border-[hsl(var(--danger))]/40 text-[hsl(var(--foreground))] rounded-tr-sm'
                    : isUser
                      ? 'bg-[hsl(var(--chat-msg-user))] text-[hsl(var(--chat-msg-user-text))] rounded-tl-sm'
                      : 'bg-[hsl(var(--chat-msg-bot))] text-[hsl(var(--chat-msg-bot-text))] rounded-tr-sm'
                }`}>
                  <div className={`text-[12px] font-bold mb-1 pb-0.5 ${
                    isFailed
                      ? 'text-[hsl(var(--danger))]'
                      : isUser
                        ? 'text-[hsl(var(--accent))]'
                        : 'text-[hsl(var(--success))]'
                  }`}>
                    {isFailed ? (
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Falha ao enviar
                      </span>
                    ) : isUser
                      ? (selectedConversation.lead_name || 'Paciente')
                      : (msg.isManual ? 'Atendente Humano 👩‍⚕️' : 'Lara 🤖')
                    }
                  </div>
                  {msg.type === 'image' && msg.mediaUrl && (
                    <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="block w-full mb-2 cursor-pointer transition-transform hover:opacity-90 mt-1">
                      <img src={msg.mediaUrl} alt="Mídia" className="rounded-xl w-full h-auto object-contain" />
                    </a>
                  )}
                  {msg.type === 'audio' && msg.mediaUrl && (
                    <div className="mb-1">
                      <AudioPlayer src={msg.mediaUrl} isUser={isUser} />
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  <div className="flex items-center justify-end gap-1 mt-1 block">
                    {msg.isManual && !isUser && !isFailed && <span className="text-[10px] opacity-70">Humano</span>}
                    <span className="text-[10px] opacity-70">{format(new Date(msg.createdAt), 'HH:mm')}</span>
                  </div>
                </div>
                {isFailed && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      type="button"
                      onClick={() => onRetryMessage?.(msg.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/25 transition-colors border border-[hsl(var(--primary))]/30"
                    >
                      <RotateCw className="w-3 h-3" /> Tentar de novo
                    </button>
                    <button
                      type="button"
                      onClick={() => onDiscardMessage?.(msg.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/5 text-[hsl(var(--muted-foreground))] hover:bg-white/10 hover:text-[hsl(var(--foreground))] transition-colors border border-[hsl(var(--chat-border))]"
                    >
                      <X className="w-3 h-3" /> Descartar
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className="p-4 border-t border-[hsl(var(--chat-border))] shrink-0 bg-[hsl(var(--chat-bg))]">
        {selectedConversation.ai_enabled && (
           <div className="mb-2 text-xs text-[hsl(var(--primary))] flex items-center justify-center bg-[hsl(var(--primary))]/10 py-1 rounded-md">
             A Inteligência Artificial está ativa nesta conversa. Ao enviar mensagem, ela será pausada por 30m.
           </div>
        )}

        {/* Sprint B · W-03: smart replies acima do textarea */}
        <SmartReplies
          replies={copilotSmartReplies}
          isLoading={copilotSummaryLoading}
          onPick={(text) => onNewMessageChange(text)}
        />

        <div className="flex items-end gap-3 rounded-lg border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-2 focus-within:ring-1 ring-[hsl(var(--ring))]">
          <textarea
            value={newMessage}
            onChange={(e) => onNewMessageChange(e.target.value)}
            placeholder="Digite sua mensagem (Pausa a IA)..."
            className="flex-1 bg-transparent border-none focus:outline-none resize-none min-h-[44px] max-h-32 text-sm p-2 scrollbar-thin text-[hsl(var(--foreground))]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSendMessage();
              }
            }}
          />
          <button
            onClick={onSendMessage}
            disabled={!newMessage.trim() || sendStatus === 'sending'}
            className="h-10 w-10 shrink-0 bg-[hsl(var(--primary))] hover:opacity-90 text-[hsl(var(--primary-foreground))] rounded-full flex items-center justify-center disabled:opacity-50 transition-opacity"
          >
            {sendStatus === 'sending' ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
