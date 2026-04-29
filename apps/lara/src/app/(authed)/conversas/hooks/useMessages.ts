import { useState, useEffect, useRef, useCallback } from 'react';
import { playNotificationSound } from './useConversations';

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  createdAt: string;
  type: string;
  mediaUrl?: string | null;
  isManual?: boolean;
  /** P-06 (2026-04-29): true quando sendMessage falhou · UI mostra botoes retry/descartar */
  failed?: boolean;
  /** Sprint C · SC-03 (W-11): nota interna · so atendentes veem · NAO envia ao paciente */
  internalNote?: boolean;
  /** Sprint C · SC-01 (W-06): status do envio Cloud API · ✓ ✓✓ azul */
  deliveryStatus?: 'sent' | 'delivered' | 'read' | 'failed' | null;
}

export function useMessages(
  conversationId: string | null,
  opts?: { lastSseEventAtRef?: React.MutableRefObject<number> }
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'error'>('idle');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const fetchMessages = useCallback(async (id: string, silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      if (res.ok) {
        const data = await res.json();
        
        // Deduplicação: usa Map pelo ID para garantir zero repetições
        const uniqueMap = new Map<string, Message>();
        data.forEach((msg: any) => {
          uniqueMap.set(msg.id, {
            id: msg.id,
            content: msg.content,
            sender: msg.direction === 'inbound' ? 'user' : 'assistant',
            createdAt: msg.sent_at,
            type: msg.content_type,
            mediaUrl: msg.media_url,
            isManual: msg.sender === 'humano',
            // Sprint C: campos podem vir undefined se mig 86 ainda nao aplicada
            internalNote: msg.internal_note === true,
            deliveryStatus: msg.delivery_status ?? null,
          });
        });
        
        const formatted = Array.from(uniqueMap.values());
        const newCount = formatted.length;
        
        // Só atualiza o state se tem conteúdo novo (evita re-render desnecessário)
        if (newCount !== lastCountRef.current || !silent) {
          
          // Se for polling silencioso, e já tínhamos msgs, e entrou 1 nova do paciente... apita imediato!
          if (silent && lastCountRef.current > 0 && newCount > lastCountRef.current) {
            const lastMsg = formatted[formatted.length - 1];
            if (lastMsg.sender === 'user') {
               playNotificationSound();
            }
          }
          
          setMessages(formatted);
          lastCountRef.current = newCount;
          if (newCount > 0) {
            setTimeout(scrollToBottom, 100);
            setTimeout(scrollToBottom, 600); // 2º empurrãozinho cobrindo o milissegundo de atraso das imagens carregarem!
          }
        }
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [scrollToBottom]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      lastCountRef.current = 0;
      return;
    }

    // Carga inicial
    fetchMessages(conversationId);

    // Polling adaptativo · SSE-aware
    // Se SSE entregou evento nos ultimos 30s, espaca polling pra 30s.
    // Se SSE silencioso (browser dormindo / rede caiu / server down), volta pra 3s.
    const sseRef = opts?.lastSseEventAtRef;
    let timeoutId: ReturnType<typeof setTimeout>;
    function tick() {
      fetchMessages(conversationId!, true); // silent = true, sem loading spinner
      const lastSse = sseRef?.current ?? 0;
      const sseAlive = lastSse > 0 && Date.now() - lastSse < 30000;
      const delay = sseAlive ? 30000 : 3000;
      timeoutId = setTimeout(tick, delay);
    }
    timeoutId = setTimeout(tick, 3000); // primeira passada em 3s

    return () => clearTimeout(timeoutId);
  }, [conversationId, fetchMessages, opts?.lastSseEventAtRef]);

  /**
   * Posta o conteudo no server. Retorna true se OK, false se falhou.
   * Marca a msg otimistica como `failed:true` em caso de erro · usuario decide
   * entre retry/descartar (P-06).
   */
  const postMessage = async (content: string, optimisticId: string): Promise<boolean> => {
    if (!conversationId) return false;
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        // Server confirmou · refetch traz o id real e remove o temp
        fetchMessages(conversationId, true);
        return true;
      }
    } catch {
      // network/abort · marca como failed abaixo
    }
    // Falha · marca a optimistic msg como failed (nao remove · usuario decide)
    setMessages(prev =>
      prev.map(m => (m.id === optimisticId ? { ...m, failed: true } : m))
    );
    return false;
  };

  const sendMessage = async (overrideContent?: string) => {
    const content = overrideContent || newMessage.trim();
    if (!conversationId || !content) return;

    if (!overrideContent) {
      setNewMessage('');
    }
    setSendStatus('sending');

    // Otimismo: adiciona a mensagem na tela instantaneamente
    const optimisticId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      content,
      sender: 'assistant',
      createdAt: new Date().toISOString(),
      type: 'text',
      isManual: true,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(scrollToBottom, 100);

    const ok = await postMessage(content, optimisticId);
    setSendStatus(ok ? 'idle' : 'error');
    setTimeout(() => setSendStatus('idle'), 3000);
  };

  /**
   * P-06: Retentativa de uma msg que falhou · localiza pelo id temp,
   * reseta o flag failed e faz POST de novo.
   */
  const retryMessage = async (tempId: string) => {
    if (!conversationId) return;
    const target = messages.find(m => m.id === tempId);
    if (!target) return;
    // Reseta visual · esconde botoes enquanto retenta
    setMessages(prev =>
      prev.map(m => (m.id === tempId ? { ...m, failed: false } : m))
    );
    setSendStatus('sending');
    const ok = await postMessage(target.content, tempId);
    setSendStatus(ok ? 'idle' : 'error');
    setTimeout(() => setSendStatus('idle'), 3000);
  };

  /**
   * P-06: Descarta uma msg que falhou · usuario escolheu desistir.
   */
  const discardMessage = (tempId: string) => {
    setMessages(prev => prev.filter(m => m.id !== tempId));
  };

  /**
   * Sprint C · SC-03 (W-11): Envia nota interna · NAO vai pro paciente.
   * Usa POST /messages com flag internal=true · UI renderiza amarelo.
   */
  const sendInternalNote = async (content: string) => {
    if (!conversationId || !content.trim()) return;
    setSendStatus('sending');

    // Otimismo: nota amarela aparece imediato
    const optimisticId = `temp-note-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      content: content.trim(),
      sender: 'assistant',
      createdAt: new Date().toISOString(),
      type: 'text',
      isManual: true,
      internalNote: true,
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(scrollToBottom, 100);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), internal: true }),
      });
      if (res.ok) {
        setSendStatus('idle');
        fetchMessages(conversationId, true);
      } else {
        // Marca falha · retry compartilha logica de sendMessage
        setMessages(prev =>
          prev.map(m => (m.id === optimisticId ? { ...m, failed: true } : m))
        );
        setSendStatus('error');
      }
    } catch {
      setMessages(prev =>
        prev.map(m => (m.id === optimisticId ? { ...m, failed: true } : m))
      );
      setSendStatus('error');
    }
    setTimeout(() => setSendStatus('idle'), 3000);
  };

  return {
    messages,
    isLoading,
    newMessage,
    setNewMessage,
    sendMessage,
    sendInternalNote,
    retryMessage,
    discardMessage,
    messagesEndRef,
    sendStatus,
  };
}
