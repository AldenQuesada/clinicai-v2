'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
import { Send, Loader, UserCircle, AlertTriangle, RotateCw, X, StickyNote, Check, CheckCheck } from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import { CopilotSummary } from './CopilotSummary';
import { SmartReplies } from './SmartReplies';
import { QuickTemplatesDropdown } from './QuickTemplatesDropdown';
import { useQuickTemplates, type QuickTemplate } from '../hooks/useQuickTemplates';
import { useClinicInfo } from '../hooks/useClinicInfo';
import type { Conversation } from '../hooks/useConversations';
import type { Message } from '../hooks/useMessages';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Aplica substituicoes de variaveis num body de template (W-09 · SC-02).
 * Variaveis suportadas: nome (1o nome), telefone, clinica, responsavel,
 * procedimento, valor. Variaveis desconhecidas viram `[CHAVE]` em maiusculas
 * pra atendente preencher manualmente.
 */
function applyTemplateVariables(
  body: string,
  ctx: {
    leadName: string | null;
    phone: string | null;
    clinicName: string;
    responsavel: string;
    procedimento: string | null;
  },
): string {
  const firstName = (ctx.leadName || '').trim().split(/\s+/)[0] || '';
  return body.replace(/\{(\w+)\}/g, (_match, rawKey: string) => {
    const key = rawKey.toLowerCase();
    switch (key) {
      case 'nome':
        return firstName || '[NOME]';
      case 'telefone':
        return ctx.phone || '[TELEFONE]';
      case 'clinica':
        return ctx.clinicName || '[CLINICA]';
      case 'responsavel':
        return ctx.responsavel || '[RESPONSAVEL]';
      case 'procedimento':
        return ctx.procedimento || '[PROCEDIMENTO]';
      case 'valor':
        return '[VALOR]';
      default:
        return `[${key.toUpperCase()}]`;
    }
  });
}

// Sprint C · SC-05 (P-09) · agrupa msgs por dia (Hoje/Ontem/dd/mm)
type GroupedMessages = Array<{ label: string; messages: Message[] }>;
function groupMessagesByDay(messages: Message[]): GroupedMessages {
  const groups = new Map<string, Message[]>();
  const labelByKey = new Map<string, string>();

  for (const msg of messages) {
    const d = new Date(msg.createdAt);
    if (!Number.isFinite(d.getTime())) continue;
    const key = format(d, 'yyyy-MM-dd');
    let label: string;
    if (isToday(d)) label = 'Hoje';
    else if (isYesterday(d)) label = 'Ontem';
    else label = format(d, "d 'de' MMMM", { locale: ptBR });
    labelByKey.set(key, label);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(msg);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, msgs]) => ({ label: labelByKey.get(key) ?? key, messages: msgs }));
}

// Sprint C · SC-01 (W-06) · icone delivery status (✓ ✓✓ azul WhatsApp-style)
function DeliveryStatusIcon({ status }: { status: Message['deliveryStatus'] }) {
  if (!status || status === 'sent') {
    return <Check className="w-3 h-3 inline-block opacity-50" aria-label="Enviado" />;
  }
  if (status === 'delivered') {
    return <CheckCheck className="w-3 h-3 inline-block opacity-50" aria-label="Entregue" />;
  }
  if (status === 'read') {
    return <CheckCheck className="w-3 h-3 inline-block text-[#34B7F1]" aria-label="Lido" />;
  }
  if (status === 'failed') {
    return <AlertTriangle className="w-3 h-3 inline-block text-[hsl(var(--danger))]" aria-label="Falhou" />;
  }
  return null;
}

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
  /** Sprint C · SC-03 (W-11): envia nota interna · cor amarela · so atendentes veem */
  onSendInternalNote?: (content: string) => void;
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
  onSendInternalNote,
}: MessageAreaProps) {
  // Sprint C · SC-03: toggle entre msg normal e nota interna
  const [isNoteMode, setIsNoteMode] = useState(false);

  // Sprint C · SC-05: agrupa msgs por dia (memo · evita recompute em re-render)
  const groupedMessages = useMemo<GroupedMessages>(
    () => groupMessagesByDay(messages),
    [messages],
  );

  // ─── Sprint C · SC-02 (W-09) · Quick Templates ──────────────────────────
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Query parsed do textarea quando aberto via "/". Cmd+T sem "/" = vazio (top).
  const dropdownQuery = useMemo(() => {
    if (!isDropdownOpen) return '';
    if (newMessage.startsWith('/')) {
      const rest = newMessage.slice(1);
      const m = rest.match(/^([^\s\n]*)/);
      return m?.[1] ?? '';
    }
    return '';
  }, [isDropdownOpen, newMessage]);

  const { templates: quickTemplates, isLoading: isQuickLoading } = useQuickTemplates(dropdownQuery);
  const { clinic, displayResponsible } = useClinicInfo();

  // Reset highlight quando lista filtrada muda · evita stale index out-of-bounds
  const safeHighlight =
    quickTemplates.length === 0 ? 0 : Math.min(highlightedIndex, quickTemplates.length - 1);

  const closeDropdown = useCallback(() => {
    setIsDropdownOpen(false);
    setHighlightedIndex(0);
  }, []);

  const pickTemplate = useCallback(
    (tpl: QuickTemplate) => {
      const filled = applyTemplateVariables(tpl.body || '', {
        leadName: selectedConversation?.lead_name ?? null,
        phone: selectedConversation?.phone ?? null,
        clinicName: clinic.name,
        responsavel: displayResponsible(),
        procedimento: selectedConversation?.funnel ?? null,
      });
      onNewMessageChange(filled);
      closeDropdown();
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [selectedConversation, clinic.name, displayResponsible, onNewMessageChange, closeDropdown],
  );

  const handleTextareaChange = (val: string) => {
    onNewMessageChange(val);
    if (val.startsWith('/')) {
      if (!isDropdownOpen) setIsDropdownOpen(true);
      setHighlightedIndex(0);
    } else if (isDropdownOpen && !val.startsWith('/')) {
      // user apagou a "/" · fecha (preserva texto · so esconde dropdown)
      closeDropdown();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Hotkey · Ctrl+T (Win/Linux) · Cmd+T (Mac) abre dropdown
    const isHotkey = (e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T');
    if (isHotkey) {
      e.preventDefault(); // bloqueia "nova aba" do browser
      setIsDropdownOpen(true);
      setHighlightedIndex(0);
      return;
    }

    if (isDropdownOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (quickTemplates.length === 0) return;
        setHighlightedIndex((i) => (i + 1) % quickTemplates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (quickTemplates.length === 0) return;
        setHighlightedIndex((i) => (i - 1 + quickTemplates.length) % quickTemplates.length);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const tpl = quickTemplates[safeHighlight];
        if (tpl) pickTemplate(tpl);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDropdown();
        return;
      }
    }

    // Fluxo normal · Enter envia (quando dropdown fechado)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  if (!selectedConversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[hsl(var(--chat-bg))]">
        <p className="text-[hsl(var(--muted-foreground))]">Selecione uma conversa para começar</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[hsl(var(--chat-bg))] relative h-full">
      {/* Header · v2 design contract */}
      <div className="h-16 border-b border-white/[0.06] flex items-center px-6 gap-3 shrink-0">
        <UserCircle className="h-9 w-9 text-[hsl(var(--muted-foreground))]" strokeWidth={1.25} />
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-[16px] text-[hsl(var(--foreground))] leading-tight truncate">{selectedConversation.lead_name}</h2>
          <p className="text-[10.5px] text-[hsl(var(--muted-foreground))] tabular-nums font-mono opacity-70 mt-0.5">{selectedConversation.phone}</p>
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
          groupedMessages.map((group) => (
            <div key={group.label} className="space-y-4">
              {/* SC-05: Separador de data */}
              <div className="flex items-center justify-center my-4">
                <div className="px-3 py-0.5 rounded-full bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  {group.label}
                </div>
              </div>

              {group.messages.map((msg) => {
                const isUser = msg.sender === 'user';
                const isFailed = msg.failed === true;
                const isNote = msg.internalNote === true;

                // SC-03: Nota interna · render full-width amarelo · centralizado
                if (isNote) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="max-w-[85%] rounded-lg px-4 py-2.5 bg-[#FBBF24]/10 border border-[#FBBF24]/30 text-[hsl(var(--foreground))]">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold mb-1 text-[#FBBF24]">
                          <StickyNote className="w-3 h-3" />
                          NOTA INTERNA · só atendentes veem
                          {isFailed && (
                            <span className="ml-2 text-[hsl(var(--danger))]">· falhou</span>
                          )}
                        </div>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed text-[hsl(var(--foreground))]">
                          {msg.content}
                        </p>
                        <div className="flex items-center justify-end gap-1 mt-1">
                          <span className="text-[10px] opacity-60">
                            {format(new Date(msg.createdAt), 'HH:mm')}
                          </span>
                        </div>
                        {isFailed && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <button
                              type="button"
                              onClick={() => onRetryMessage?.(msg.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/25 border border-[hsl(var(--primary))]/30"
                            >
                              <RotateCw className="w-3 h-3" /> Retry
                            </button>
                            <button
                              type="button"
                              onClick={() => onDiscardMessage?.(msg.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-white/5 text-[hsl(var(--muted-foreground))] hover:bg-white/10 border border-[hsl(var(--chat-border))]"
                            >
                              <X className="w-3 h-3" /> Descartar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

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
                        {/* SC-01: ✓ ✓✓ azul · so msgs assistant (outbound) · nao em failed */}
                        {!isUser && !isFailed && (
                          <span className="ml-0.5"><DeliveryStatusIcon status={msg.deliveryStatus} /></span>
                        )}
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
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <div className={`p-4 border-t border-[hsl(var(--chat-border))] shrink-0 relative ${
        isNoteMode ? 'bg-[#FBBF24]/5' : 'bg-[hsl(var(--chat-bg))]'
      }`}>
        {selectedConversation.ai_enabled && !isNoteMode && (
           <div className="mb-2 text-xs text-[hsl(var(--primary))] flex items-center justify-center bg-[hsl(var(--primary))]/10 py-1 rounded-md">
             A Inteligência Artificial está ativa nesta conversa. Ao enviar mensagem, ela será pausada por 30m.
           </div>
        )}
        {isNoteMode && (
          <div className="mb-2 text-xs text-[#FBBF24] flex items-center justify-center bg-[#FBBF24]/10 py-1 rounded-md gap-1.5">
            <StickyNote className="w-3 h-3" />
            <strong>Modo nota interna</strong> · esta mensagem NÃO será enviada ao paciente, só atendentes veem.
          </div>
        )}

        {/* Sprint B · W-03: smart replies acima do textarea */}
        <SmartReplies
          replies={copilotSmartReplies}
          isLoading={copilotSummaryLoading}
          onPick={(text) => onNewMessageChange(text)}
        />

        {/* Sprint C · SC-02 (W-09): quick templates dropdown · "/" ou Ctrl+T */}
        {isDropdownOpen && (
          <QuickTemplatesDropdown
            templates={quickTemplates}
            isLoading={isQuickLoading}
            highlightedIndex={safeHighlight}
            onHighlight={setHighlightedIndex}
            onPick={pickTemplate}
            onClose={closeDropdown}
          />
        )}

        <div className={`flex items-end gap-2 rounded-lg border p-2 focus-within:ring-1 ${
          isNoteMode
            ? 'border-[#FBBF24]/40 bg-[#FBBF24]/5 ring-[#FBBF24]/40'
            : 'border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] ring-[hsl(var(--ring))]'
        }`}>
          {/* SC-03: toggle modo nota interna */}
          {onSendInternalNote && (
            <button
              type="button"
              onClick={() => setIsNoteMode((v) => !v)}
              title={isNoteMode ? 'Voltar pra mensagem normal' : 'Escrever nota interna · só atendentes veem'}
              className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                isNoteMode
                  ? 'bg-[#FBBF24] text-[hsl(var(--bg-0,0_0%_4%))]'
                  : 'bg-transparent text-[hsl(var(--muted-foreground))] hover:bg-[#FBBF24]/15 hover:text-[#FBBF24]'
              }`}
            >
              <StickyNote className="w-4 h-4" />
            </button>
          )}
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => handleTextareaChange(e.target.value)}
            placeholder={
              isNoteMode
                ? 'Nota interna (não envia ao paciente)...'
                : 'Digite sua mensagem (Pausa a IA)...'
            }
            className="flex-1 bg-transparent border-none focus:outline-none resize-none min-h-[44px] max-h-32 text-sm p-2 scrollbar-thin text-[hsl(var(--foreground))]"
            onKeyDown={(e) => {
              // Modo nota interna · Enter envia nota em vez de msg normal
              if (isNoteMode && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (newMessage.trim() && onSendInternalNote) {
                  onSendInternalNote(newMessage.trim());
                  onNewMessageChange('');
                  setIsNoteMode(false); // sai do modo nota apos enviar
                }
                return;
              }
              handleKeyDown(e);
            }}
          />
          <button
            onClick={() => {
              if (isNoteMode) {
                if (newMessage.trim() && onSendInternalNote) {
                  onSendInternalNote(newMessage.trim());
                  onNewMessageChange('');
                  setIsNoteMode(false);
                }
              } else {
                onSendMessage();
              }
            }}
            disabled={!newMessage.trim() || sendStatus === 'sending'}
            className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center disabled:opacity-50 transition-opacity ${
              isNoteMode
                ? 'bg-[#FBBF24] text-[hsl(var(--bg-0,0_0%_4%))] hover:opacity-90'
                : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90'
            }`}
          >
            {sendStatus === 'sending' ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
