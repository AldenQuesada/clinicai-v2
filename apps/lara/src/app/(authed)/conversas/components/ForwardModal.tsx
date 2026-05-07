'use client';

/**
 * ForwardModal · 2026-05-07 · Encaminhar mensagem texto pra outra conversa.
 *
 * MVP A · só texto:
 *   · só renderiza se msg.content tem texto útil (caller filtra)
 *   · POST /api/conversations/{targetId}/messages com body {content}
 *   · NÃO encaminha payload (contato), mídia, vCard, ou qualquer JSON cru
 *   · NÃO usa reply_to_message_id (forward ≠ reply)
 *
 * Fluxo:
 *   1. Lista de conversas filtrada por busca (nome/phone/último texto)
 *   2. Click numa conversa → tela de confirmação "Encaminhar pra X?"
 *   3. "Sim" → POST → fecha modal · "Voltar" → volta pra lista
 *
 * Reusa `conversations` carregadas pelo page.tsx (props) · zero endpoint novo.
 *
 * Não permite encaminhar pra mesma conversa de origem (sourceConversationId
 * === target.conversation_id) · evita loop de feedback no UI.
 */

import { useMemo, useState } from 'react';
import { Forward, X, Search, Send, AlertTriangle, Loader, ArrowLeft, User, Image as ImageIcon, Mic } from 'lucide-react';
import type { Conversation } from '../hooks/useConversations';
import type { Message } from '../hooks/useMessages';
import { getConversationDisplayName, formatPhoneBR } from '../lib/displayName';
import { isContactPayload, type ContactPayloadShape } from './MessageArea';

/**
 * Body que o modal envia pro POST · 4 modos mutuamente exclusivos:
 *   · texto: { content }
 *   · contato (Onda B+C): { content, payload }
 *   · imagem (Onda D1 · 2026-05-07): { forward_from_message_id }
 *   · áudio (Onda E1 · 2026-05-07): { forward_from_message_id }
 *     Server resolve original via getById · client NUNCA envia
 *     mediaPath/signed URL/payload pra mídia.
 */
type ForwardBody = {
  content?: string;
  payload?: unknown;
  forward_from_message_id?: string;
};

/**
 * Forward B (2026-05-07) · build do body do POST · texto-only OU contato OU
 * imagem. Backend valida tudo upstream (clinic_id, type, media existe).
 */
function buildForwardBody(
  msg: Message,
  sourceConversationId: string | null,
): ForwardBody {
  // Forward D1/E1 · imagem ou áudio · server resolve via id interno · zero
  // leak de path/URL. Mesma forma de body · server diferencia por
  // original.contentType.
  if ((msg.type === 'image' || msg.type === 'audio') && msg.id) {
    return { forward_from_message_id: msg.id };
  }
  if (isContactPayload(msg.payload)) {
    const c: ContactPayloadShape = msg.payload;
    const name = c.name || 'Sem nome';
    const phone = c.display_phone || c.phone || c.wa_id || 'Sem telefone';
    const content = `👤 Contato compartilhado\nNome: ${name}\nTelefone: ${phone}`;
    const forwarded_from: Record<string, string> = { message_id: msg.id };
    if (msg.providerMsgId) forwarded_from.provider_msg_id = msg.providerMsgId;
    if (sourceConversationId) forwarded_from.conversation_id = sourceConversationId;
    const payload = {
      kind: 'contact' as const,
      name: c.name ?? null,
      phone: c.phone ?? null,
      display_phone: c.display_phone ?? null,
      wa_id: c.wa_id ?? null,
      source: c.source,
      forwarded_from,
    };
    return { content, payload };
  }
  return { content: msg.content };
}

interface ForwardModalProps {
  /** Mensagem alvo do forward · caller já validou que tem content útil. */
  message: Message;
  /** Lista de conversas disponíveis · vem do hook useConversations da page. */
  conversations: Conversation[];
  /** ID da conv de origem · usado pra bloquear forward pra mesma conv. */
  sourceConversationId: string | null;
  onClose: () => void;
  /**
   * Caller faz o POST com o body já montado (content / contact-payload /
   * forward_from_message_id pra imagem). Retorna `true` em sucesso, `false`
   * em falha. Modal mostra erro local sem fechar quando false.
   */
  onConfirmForward: (
    targetConversationId: string,
    body: ForwardBody,
  ) => Promise<boolean>;
}

export function ForwardModal({
  message,
  conversations,
  sourceConversationId,
  onClose,
  onConfirmForward,
}: ForwardModalProps) {
  const [search, setSearch] = useState('');
  const [pickedTarget, setPickedTarget] = useState<Conversation | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forward B · detecta contato pra renderizar preview com nome+telefone.
  const contactSource = isContactPayload(message.payload) ? message.payload : null;
  // Forward D1 · detecta imagem pra renderizar thumbnail. mediaUrl aqui é
  // signed URL (TTL ~1h) · suficiente pro preview no modal · NUNCA enviado
  // ao backend (POST recebe só forward_from_message_id e server resolve path).
  const isImageSource = message.type === 'image' && !!message.mediaUrl;
  // Forward E1 (2026-05-07) · áudio · ícone + transcrição truncada como
  // preview · backend reusa branch mídia (sendAudioById/sendVoice).
  const isAudioSource = message.type === 'audio' && !!message.mediaUrl;
  const previewText = useMemo(() => {
    if (contactSource || isImageSource || isAudioSource) return ''; // previews específicos abaixo
    const text = (message.content || '').trim();
    if (!text) return '';
    return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  }, [message.content, contactSource, isImageSource, isAudioSource]);
  const imageCaption = useMemo(() => {
    if (!isImageSource) return '';
    const text = (message.content || '').trim();
    if (!text || text === '[imagem recebida]') return '';
    return text.length > 100 ? `${text.slice(0, 100)}…` : text;
  }, [message.content, isImageSource]);
  // E1 · transcrição limpa pra exibir como caption · skip placeholders genéricos
  // (`[audio recebido]`, `recebido`, `[áudio recebido — transcrição indisponível]`).
  const audioTranscript = useMemo(() => {
    if (!isAudioSource) return '';
    const raw = (message.content || '').trim();
    if (!raw) return '';
    if (
      raw === '[audio recebido]' ||
      raw === '[áudio recebido — transcrição indisponível]' ||
      raw === 'recebido' ||
      raw.startsWith('[áudio')
    ) {
      return '';
    }
    return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
  }, [message.content, isAudioSource]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations
      .filter((c) => c.conversation_id && c.conversation_id !== sourceConversationId)
      .filter((c) => {
        if (!q) return true;
        const name = (getConversationDisplayName(c) || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        const lastText = (c.last_message_text || '').toLowerCase();
        return name.includes(q) || phone.includes(q) || lastText.includes(q);
      });
  }, [conversations, search, sourceConversationId]);

  const handleConfirm = async () => {
    if (!pickedTarget?.conversation_id) return;
    setSending(true);
    setError(null);
    // Forward B · monta content (multi-linha pra contato) + payload (com
    // forwarded_from rastreando origem) ANTES do POST. Backend re-valida
    // shape (whitelist contact-only) · client/server zero confiança mútua.
    const buildBody = buildForwardBody(message, sourceConversationId);
    const ok = await onConfirmForward(pickedTarget.conversation_id, buildBody);
    setSending(false);
    if (ok) {
      onClose();
    } else {
      setError('Falha ao encaminhar · tente novamente');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[80vh] flex flex-col rounded-lg bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--chat-border))] shrink-0">
          {pickedTarget && (
            <button
              type="button"
              onClick={() => {
                setPickedTarget(null);
                setError(null);
              }}
              className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-white/[0.06] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              aria-label="Voltar"
              title="Voltar"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <Forward className="w-4 h-4 text-[hsl(var(--primary))] shrink-0" />
          <h3 className="font-display text-[15px] text-[hsl(var(--foreground))] flex-1">
            {pickedTarget ? 'Confirmar encaminhamento' : 'Encaminhar mensagem'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-white/[0.06] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            aria-label="Fechar"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preview da msg original (sempre visível). Forward B · contato.
            Forward D1 · imagem com thumbnail. Forward E1 · áudio com ícone
            + transcrição truncada. Texto comum mostra trecho. */}
        {isAudioSource ? (
          <div className="px-4 py-2.5 border-b border-[hsl(var(--chat-border))] bg-white/[0.02] shrink-0">
            <div className="font-meta uppercase text-[9.5px] tracking-[0.16em] opacity-60 mb-1.5 inline-flex items-center gap-1">
              <Mic className="w-3 h-3" strokeWidth={2} />
              Áudio
            </div>
            <p className="text-[13px] font-medium leading-snug">
              {audioTranscript || (
                <span className="opacity-70 italic font-normal">Mensagem de áudio</span>
              )}
            </p>
          </div>
        ) : isImageSource ? (
          <div className="px-4 py-2.5 border-b border-[hsl(var(--chat-border))] bg-white/[0.02] shrink-0">
            <div className="font-meta uppercase text-[9.5px] tracking-[0.16em] opacity-60 mb-1.5 inline-flex items-center gap-1">
              <ImageIcon className="w-3 h-3" strokeWidth={2} />
              Imagem
            </div>
            <img
              src={message.mediaUrl ?? undefined}
              alt="Pré-visualização"
              className="rounded-md max-h-40 w-auto object-contain border border-white/[0.08]"
              style={{ maxWidth: '100%' }}
            />
            {imageCaption && (
              <p className="mt-1.5 text-[12px] italic leading-snug text-[hsl(var(--foreground))]/80 break-words line-clamp-2">
                {imageCaption}
              </p>
            )}
          </div>
        ) : contactSource ? (
          <div className="px-4 py-2.5 border-b border-[hsl(var(--chat-border))] bg-white/[0.02] shrink-0">
            <div className="font-meta uppercase text-[9.5px] tracking-[0.16em] opacity-60 mb-1.5 inline-flex items-center gap-1">
              <User className="w-3 h-3" strokeWidth={2} />
              Contato compartilhado
            </div>
            <div className="text-[13px] font-semibold leading-snug break-words">
              {contactSource.name || (
                <span className="opacity-60 font-normal italic">Sem nome</span>
              )}
            </div>
            <div className="text-[12px] tabular-nums font-mono opacity-85 leading-snug break-words">
              {contactSource.display_phone ||
                contactSource.phone ||
                contactSource.wa_id || (
                  <span className="opacity-60 font-normal italic font-sans">Sem telefone</span>
                )}
            </div>
          </div>
        ) : previewText ? (
          <div className="px-4 py-2.5 border-b border-[hsl(var(--chat-border))] bg-white/[0.02] shrink-0">
            <div className="font-meta uppercase text-[9.5px] tracking-[0.16em] opacity-60 mb-1">
              Mensagem
            </div>
            <p className="text-[12.5px] italic leading-snug text-[hsl(var(--foreground))]/90 break-words line-clamp-3">
              {previewText}
            </p>
          </div>
        ) : null}

        {/* Step 2 · Confirmação */}
        {pickedTarget ? (
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
            <div className="px-3 py-3 rounded-md bg-white/[0.04] border border-white/[0.08]">
              <div className="font-meta uppercase text-[9.5px] tracking-[0.16em] opacity-60 mb-1">
                Encaminhar para
              </div>
              <div className="text-[14px] font-semibold leading-snug">
                {getConversationDisplayName(pickedTarget) || 'Sem nome'}
              </div>
              <div className="text-[12px] tabular-nums font-mono opacity-75 mt-0.5">
                {formatPhoneBR(pickedTarget.phone) || pickedTarget.phone}
              </div>
            </div>
            {error && (
              <div className="text-[11.5px] text-[hsl(var(--danger))] inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-[hsl(var(--danger))]/[0.08] border border-[hsl(var(--danger))]/[0.25]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                <span>{error}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPickedTarget(null);
                  setError(null);
                }}
                disabled={sending}
                className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-white/[0.04] hover:bg-white/[0.1] text-[hsl(var(--foreground))]/85 border border-white/[0.1] cursor-pointer disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={sending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 cursor-pointer disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <Loader className="w-3.5 h-3.5 animate-spin" />
                    Encaminhando…
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Encaminhar
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Step 1 · Busca + lista */}
            <div className="px-4 py-2.5 border-b border-[hsl(var(--chat-border))] shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--muted-foreground))] pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, telefone, texto…"
                  autoFocus
                  className="w-full pl-8 pr-3 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.1] text-[12.5px] text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:border-[hsl(var(--primary))]/[0.4]"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              {filtered.length === 0 ? (
                <div className="text-center text-[12px] text-[hsl(var(--muted-foreground))] py-8">
                  Nenhuma conversa encontrada
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map((c) => {
                    const name = getConversationDisplayName(c);
                    const phone = formatPhoneBR(c.phone) || c.phone;
                    return (
                      <li key={c.conversation_id ?? c.phone}>
                        <button
                          type="button"
                          onClick={() => setPickedTarget(c)}
                          className="w-full text-left px-3 py-2 rounded-md hover:bg-white/[0.06] transition-colors flex flex-col gap-0.5"
                        >
                          <div className="text-[13px] font-medium text-[hsl(var(--foreground))] leading-snug truncate">
                            {name || 'Sem nome'}
                          </div>
                          <div className="text-[11px] tabular-nums font-mono opacity-70 leading-snug">
                            {phone}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
