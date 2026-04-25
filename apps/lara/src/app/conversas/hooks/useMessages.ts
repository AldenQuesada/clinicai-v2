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
}

export function useMessages(conversationId: string | null) {
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
            isManual: msg.sender === 'humano'
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

    // Polling leve a cada 3 segundos APENAS para checar se há mensagens novas
    // Isso é muito leve pois busca apenas 1 conversa específica
    const interval = setInterval(() => {
      fetchMessages(conversationId, true); // silent = true, sem loading spinner
    }, 3000);

    return () => clearInterval(interval);
  }, [conversationId, fetchMessages]);

  const sendMessage = async (overrideContent?: string) => {
    const content = overrideContent || newMessage.trim();
    if (!conversationId || !content) return;
    
    if (!overrideContent) {
      setNewMessage('');
    }
    setSendStatus('sending');

    // Otimismo: adiciona a mensagem na tela instantaneamente
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      content,
      sender: 'assistant',
      createdAt: new Date().toISOString(),
      type: 'text',
      isManual: true
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(scrollToBottom, 100);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        setSendStatus('idle');
        // Recarrega para pegar o ID real do servidor
        fetchMessages(conversationId, true);
      } else {
        setSendStatus('error');
      }
    } catch {
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
    messagesEndRef,
    sendStatus
  };
}
