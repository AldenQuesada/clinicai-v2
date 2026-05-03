'use client';

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { Send, Loader, User, AlertTriangle, RotateCw, X, StickyNote, Check, CheckCheck, Sparkles, RefreshCw, Paperclip, Mic, FileText, Download } from 'lucide-react';
import { AudioPlayer } from './AudioPlayer';
import { CopilotSummary } from './CopilotSummary';
import { SecretariaSummary } from './SecretariaSummary';
import { SmartReplies } from './SmartReplies';
import { SecretariaQuickActions } from './SecretariaQuickActions';
import { QuickTemplatesDropdown } from './QuickTemplatesDropdown';
import { PresenceLine } from './PresenceLine';
import { MediaPreviewBar } from './MediaPreviewBar';
import { useClinicMembers } from '../hooks/useClinicMembers';
import { usePresence } from '../hooks/usePresence';
import { useMediaUpload, formatFileSize } from '../hooks/useMediaUpload';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { encodeFileToMp3 } from '../hooks/useMp3Encoder';
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

  // P-07 · upload de midia (paperclip + drag&drop + audio recorder)
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isTranscoding, setIsTranscoding] = useState(false);
  const dragCounterRef = useRef(0);
  const {
    staged,
    error: mediaError,
    isSending: isMediaSending,
    progress: mediaProgress,
    stageFile,
    clear: clearMedia,
    send: sendMedia,
  } = useMediaUpload({
    conversationId: selectedConversation?.conversation_id ?? null,
    onSent: () => {
      onNewMessageChange('');
    },
  });
  // Recorder grava webm/opus (Chrome) · transcoda pra mp3 antes do stage
  // (Meta Cloud API rejeita webm · mp3 e voice note nativa pra paciente).
  const audioRecorder = useAudioRecorder(async (file) => {
    setIsTranscoding(true);
    try {
      const isWebm = (file.type || '').toLowerCase().includes('webm');
      const finalFile = isWebm ? await encodeFileToMp3(file) : file;
      stageFile(finalFile);
    } catch (e) {
      console.error('[MessageArea] transcode webm→mp3 falhou:', e);
      // Fallback · stageia o webm bruto · server fara fallback document
      stageFile(file);
    } finally {
      setIsTranscoding(false);
    }
  });

  // P-12 Fase 3+4 · presence conversation-level + typing indicator
  const { me, clinicId, findById } = useClinicMembers();
  const myMember = me ? findById(me) : null;
  const presenceUser = me && myMember
    ? {
        user_id: me,
        full_name: myMember.fullName || 'Você',
        avatar_url: myMember.avatarUrl,
      }
    : null;
  const convChannelKey =
    clinicId && selectedConversation
      ? `clinic-${clinicId}:conversation-${selectedConversation.conversation_id}`
      : null;
  const { onlineUsers: convOnline, sendTyping } = usePresence({
    channelKey: convChannelKey,
    user: presenceUser,
    trackTyping: true,
  });

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
    // P-12 Fase 4 · typing indicator · só quando há conteúdo (vazio = parou)
    // e nao em modo nota (nota nao e "msg pro paciente")
    if (!isNoteMode) {
      sendTyping(val.trim().length > 0);
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
      sendTyping(false); // P-12 Fase 4 · stop typing antes de enviar
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
    <div className="flex-1 flex flex-col bg-[hsl(var(--chat-bg))] relative h-full min-w-0">
      {/* Header · v2 · avatar minimal + nome/phone + barra divisora + summary inline */}
      {(() => {
        const phoneOnly = !selectedConversation.lead_name ||
          selectedConversation.lead_name === selectedConversation.phone ||
          /^\d+$/.test(selectedConversation.lead_name);
        const initial = phoneOnly ? '?' : (selectedConversation.lead_name || '?').trim().charAt(0).toUpperCase();
        return (
          <div className="h-16 border-b border-white/[0.06] flex items-stretch px-5 shrink-0">
            {/* Avatar minimal · circulo translucido com inicial em Cormorant gold */}
            <div className="flex items-center gap-3 shrink-0 pr-4">
              <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                <span className="font-display text-[14px] text-[hsl(var(--primary))] italic leading-none">{initial}</span>
              </div>
              <div className="min-w-0">
                {phoneOnly ? (
                  <>
                    <p className="text-[9px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em] leading-tight">Sem nome</p>
                    <p className="text-[12.5px] text-[hsl(var(--foreground))] tabular-nums font-mono mt-0.5 leading-tight">{selectedConversation.phone}</p>
                  </>
                ) : (
                  <>
                    <h2 className="font-display text-[15px] text-[hsl(var(--foreground))] leading-tight truncate max-w-[180px]">{selectedConversation.lead_name}</h2>
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] tabular-nums font-mono opacity-70 mt-0.5 leading-tight">{selectedConversation.phone}</p>
                  </>
                )}
                {/* P-12 Fase 3+4 · "X vendo · Y digitando..." */}
                <PresenceLine online={convOnline} me={me} />
              </div>
            </div>
            {/* Barra fina vertical divisoria */}
            <div className="w-px bg-white/[0.06] my-3" />
            {/* Sumario do copiloto AI inline · estetica editorial flipbook */}
            {onRefreshCopilot && (
              <div className="flex items-center flex-1 pl-4 pr-2 gap-2.5 min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--primary))] shrink-0 mt-[1px]" strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  {copilotSummaryError ? (
                    <span className="text-[11px] text-[hsl(var(--danger))] inline-flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3" strokeWidth={1.5} />
                      <span className="truncate">{copilotSummaryError}</span>
                    </span>
                  ) : copilotSummaryLoading && !copilotSummary ? (
                    <span className="text-[12px] text-[hsl(var(--muted-foreground))] italic font-display opacity-80">
                      Lara analisando o lead...
                    </span>
                  ) : (
                    <span className="copilot-prose text-[12.5px] text-[hsl(var(--foreground))]/95 leading-snug line-clamp-2 block">
                      {copilotSummary}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onRefreshCopilot}
                  disabled={copilotSummaryLoading}
                  title={
                    copilotCached && copilotGeneratedAt
                      ? `Cache de ${new Date(copilotGeneratedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · clique pra regenerar`
                      : 'Regenerar análise'
                  }
                  className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors disabled:opacity-50 shrink-0 self-center"
                >
                  <RefreshCw className={`w-3 h-3 ${copilotSummaryLoading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* AssumeReleaseBar removido 2026-04-30 · controle de pausa concentrado
          no AgentPauseSection do painel direito (fonte unica de verdade) ·
          chat ganha mais espaco vertical pras mensagens. */}

      {/* Roadmap A1 · resumo IA no topo (so /secretaria · zero token Lara) */}
      {selectedConversation?.inbox_role === 'secretaria' && (
        <SecretariaSummary
          conversationId={selectedConversation.conversation_id}
          refreshKey={selectedConversation.last_message_at ?? ''}
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
                        <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="block mb-2 cursor-pointer transition-opacity hover:opacity-85 mt-1" style={{ maxWidth: 280 }}>
                          <img src={msg.mediaUrl} alt="Mídia" className="rounded-xl w-full h-auto object-contain" style={{ maxHeight: 320 }} />
                        </a>
                      )}
                      {msg.type === 'audio' && msg.mediaUrl && (
                        <div className="mb-1">
                          <AudioPlayer src={msg.mediaUrl} isUser={isUser} />
                        </div>
                      )}
                      {/* P-07 · render document (PDF/DOC/etc) · card com download */}
                      {msg.type === 'document' && msg.mediaUrl && (
                        <a
                          href={msg.mediaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2.5 px-3 py-2.5 mb-2 rounded-md bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.1] transition-colors group"
                          style={{ maxWidth: 280 }}
                        >
                          <div className="w-9 h-9 rounded bg-white/[0.06] flex items-center justify-center shrink-0">
                            <FileText className="w-4.5 h-4.5 opacity-80" strokeWidth={1.5} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] truncate">
                              {msg.mediaUrl.split('/').pop()?.replace(/^[a-f0-9-]+\./, 'arquivo.') || 'documento'}
                            </p>
                            <p className="font-meta text-[8.5px] uppercase tracking-[0.15em] opacity-60 mt-0.5">
                              Documento
                            </p>
                          </div>
                          <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-70 transition-opacity shrink-0" strokeWidth={1.5} />
                        </a>
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

      {/* Input Box · com drag&drop (P-07) */}
      <div
        className={`p-4 border-t border-[hsl(var(--chat-border))] shrink-0 relative transition-colors ${
          isNoteMode ? 'bg-[#FBBF24]/5' : 'bg-[hsl(var(--chat-bg))]'
        } ${isDragging ? 'ring-2 ring-[hsl(var(--primary))] ring-inset bg-[hsl(var(--primary))]/[0.04]' : ''}`}
        onDragEnter={(e) => {
          if (isNoteMode) return;
          e.preventDefault();
          dragCounterRef.current += 1;
          if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
        }}
        onDragOver={(e) => {
          if (isNoteMode) return;
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDragLeave={() => {
          dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
          if (dragCounterRef.current === 0) setIsDragging(false);
        }}
        onDrop={(e) => {
          if (isNoteMode) return;
          e.preventDefault();
          dragCounterRef.current = 0;
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) stageFile(file);
        }}
      >
        {/* Linha "Lara ativa · pausa 30min" REMOVIDA · agora vive na AssumeReleaseBar acima */}
        {isNoteMode && (
          <div className="mb-2 text-xs text-[#FBBF24] flex items-center justify-center bg-[#FBBF24]/10 py-1 rounded-md gap-1.5">
            <StickyNote className="w-3 h-3" />
            <strong>Modo nota interna</strong> · esta mensagem NÃO será enviada ao paciente, só atendentes veem.
          </div>
        )}

        {/* P-07 · preview da midia staged */}
        {staged && (
          <MediaPreviewBar
            staged={staged}
            isSending={isMediaSending}
            progress={mediaProgress}
            onClear={clearMedia}
          />
        )}

        {/* P-07 · erro de upload/envio */}
        {mediaError && !staged && (
          <div className="mb-2 text-[11px] text-[hsl(var(--danger))] flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--danger))]/[0.08] border border-[hsl(var(--danger))]/[0.2]">
            <AlertTriangle className="w-3 h-3 shrink-0" strokeWidth={2} />
            <span className="truncate">{mediaError}</span>
          </div>
        )}

        {/* P-07 · erro do MediaRecorder (mic bloqueado, browser nao suporta, etc) */}
        {audioRecorder.error && (
          <div className="mb-2 text-[11px] text-[hsl(var(--danger))] flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[hsl(var(--danger))]/[0.08] border border-[hsl(var(--danger))]/[0.2]">
            <AlertTriangle className="w-3 h-3 shrink-0" strokeWidth={2} />
            <span className="truncate">Microfone: {audioRecorder.error}</span>
          </div>
        )}

        {/* P-07 · convertendo audio (webm → mp3) · acontece entre stop() e stage */}
        {isTranscoding && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-md bg-[hsl(var(--primary))]/[0.06] border border-[hsl(var(--primary))]/[0.2]">
            <Loader className="w-3 h-3 text-[hsl(var(--primary))] animate-spin shrink-0" />
            <span className="font-meta uppercase text-[10px] tracking-[0.18em] text-[hsl(var(--primary))]">
              Convertendo áudio...
            </span>
          </div>
        )}

        {/* P-07 · gravando audio · feedback hold-to-record */}
        {audioRecorder.isRecording && (
          <div className="mb-2 flex items-center gap-3 px-3 py-2 rounded-md bg-[hsl(var(--danger))]/[0.08] border border-[hsl(var(--danger))]/[0.25]">
            <span className="inline-flex w-2 h-2 rounded-full bg-[hsl(var(--danger))] animate-pulse shrink-0" />
            <span className="font-meta uppercase text-[10px] tracking-[0.18em] text-[hsl(var(--danger))]">Gravando</span>
            <span className="font-mono tabular-nums text-[11px] text-[hsl(var(--foreground))]">
              {String(Math.floor(audioRecorder.duration / 60)).padStart(2, '0')}:{String(audioRecorder.duration % 60).padStart(2, '0')}
            </span>
            <span className="flex-1 text-[10.5px] text-[hsl(var(--muted-foreground))] italic font-display">
              Solte o botão pra enviar · arraste pra fora pra cancelar
            </span>
          </div>
        )}

        {/* Roadmap A2 · botões de ação rápida pra secretaria (zero digitação)
            Aparece so em conv com inbox_role='secretaria' · /conversas (Lara)
            mantém SmartReplies IA tradicional. */}
        {selectedConversation?.inbox_role === 'secretaria' ? (
          <SecretariaQuickActions
            leadFirstName={(selectedConversation?.lead_name || '').split(/\s+/)[0]}
            onPick={(text) => onNewMessageChange(text)}
          />
        ) : (
          /* Sprint B · W-03: smart replies acima do textarea (Lara IA) */
          <SmartReplies
            replies={copilotSmartReplies}
            isLoading={copilotSummaryLoading}
            onPick={(text) => onNewMessageChange(text)}
          />
        )}

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

        {/* P-07 · file input invisible · acionado pelo paperclip */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) stageFile(f);
            // reset value pra permitir re-anexar mesmo arquivo
            if (e.target) e.target.value = '';
          }}
        />

        <div className={`flex items-end gap-2 rounded-lg border p-2 focus-within:ring-1 ${
          isNoteMode
            ? 'border-[#FBBF24]/40 bg-[#FBBF24]/5 ring-[#FBBF24]/40'
            : 'border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] ring-[hsl(var(--ring))]'
        }`}>
          {/* P-07 · paperclip · file picker (escondido em modo nota) */}
          {!isNoteMode && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!!staged || isMediaSending}
              title="Anexar imagem · áudio · PDF"
              className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-colors bg-transparent text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--primary))]/[0.08] hover:text-[hsl(var(--primary))] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Paperclip className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}

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
                : staged
                  ? 'Adicione uma legenda (opcional)...'
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
              // P-07 · com staged, Enter envia midia
              if (staged && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendTyping(false);
                sendMedia(newMessage);
                return;
              }
              handleKeyDown(e);
            }}
          />

          {/* P-07 · botão Mic · hold-to-record (só quando nada staged + textarea vazio + nao nota) */}
          {!isNoteMode && !staged && !newMessage.trim() && (
            <button
              type="button"
              title="Mantenha pressionado pra gravar áudio"
              onMouseDown={(e) => {
                e.preventDefault();
                audioRecorder.start();
              }}
              onMouseUp={() => audioRecorder.stop()}
              onMouseLeave={() => {
                if (audioRecorder.isRecording) audioRecorder.cancel();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                audioRecorder.start();
              }}
              onTouchEnd={() => audioRecorder.stop()}
              onTouchCancel={() => audioRecorder.cancel()}
              className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                audioRecorder.isRecording
                  ? 'bg-[hsl(var(--danger))] text-white animate-pulse'
                  : 'bg-transparent text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--primary))]/[0.08] hover:text-[hsl(var(--primary))]'
              }`}
            >
              <Mic className="w-4 h-4" strokeWidth={1.5} />
            </button>
          )}

          <button
            onClick={() => {
              if (isNoteMode) {
                if (newMessage.trim() && onSendInternalNote) {
                  onSendInternalNote(newMessage.trim());
                  onNewMessageChange('');
                  setIsNoteMode(false);
                }
              } else if (staged) {
                // P-07 · envia midia (caption opcional do textarea)
                sendTyping(false);
                sendMedia(newMessage);
              } else {
                sendTyping(false); // P-12 Fase 4 · stop typing
                onSendMessage();
              }
            }}
            disabled={
              isMediaSending ||
              (staged ? false : !newMessage.trim()) ||
              sendStatus === 'sending'
            }
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
