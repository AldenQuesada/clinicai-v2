import { useState, useEffect, useCallback, useRef } from 'react';
import { readNotificationSettings } from '@/hooks/useNotificationSettings';

export interface Conversation {
  conversation_id: string;
  phone: string;
  lead_name: string;
  lead_id: string;
  status: string;
  ai_enabled: boolean;
  ai_paused_until: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  is_urgent: boolean;
  phase: string | null;
  funnel: string | null;
  lead_score: number;
  tags: string[];
  queixas: string[];
  channel?: 'cloud' | 'legacy' | string;
}

export const playNotificationSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        const playTone = (freq: number, startTime: number, duration: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, startTime);
            
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05); // attack
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration); // decay
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start(startTime);
            osc.stop(startTime + duration + 0.1);
        };
        
        const now = ctx.currentTime;
        // WhatsApp like dual tone pop
        playTone(600, now, 0.15);
        playTone(800, now + 0.1, 0.25);
    } catch (e) {
        // Ignora erros caso o navegador bloqueie autoplay
    }
};

export const sendBrowserNotification = (title: string, body: string, onClick?: () => void) => {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'clinicai-inbox' });
    if (onClick) n.onclick = onClick;
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'clinicai-inbox' });
        if (onClick) n.onclick = onClick;
      }
    });
  }
};

export const updateTabTitle = (conversations: Conversation[]) => {
  const pending = conversations.filter(c => c.is_urgent || (!c.ai_enabled && !c.is_urgent)).length;
  document.title = pending > 0 ? `(${pending}) Central de Atendimento` : 'ClinicAI';
};

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'resolved' | 'dra'>('active');
  const selectedIdRef = useRef<string | null>(null);
  const prevDataRef = useRef<Conversation[]>([]);
  const prevStatusRef = useRef(statusFilter);

  // Mantém o ID selecionado sem causar re-render
  useEffect(() => {
    selectedIdRef.current = selectedConversation?.conversation_id || null;
  }, [selectedConversation]);

  // Permission gating moveu pro NotificationPermissionBanner · evita prompt
  // automatico no mount (browsers modernos bloqueiam sem user gesture).

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations?status=${statusFilter}`);
      if (res.ok) {
        const data: Conversation[] = await res.json();
        
        // Atualiza Título da Aba
        updateTabTitle(data);
        
        // Verifica Novas Mensagens / Notificações
        // SÓ verifica se NÃO houve troca de aba de status (filtro principal)
        const isTabChange = prevStatusRef.current !== statusFilter;
        prevStatusRef.current = statusFilter;

        let hasNewActivity = false;
        let isUrgent = false;
        let notifyName = '';
        let notifyText = '';

        if (!isTabChange && prevDataRef.current.length > 0) {
          data.forEach(conv => {
            const prev = prevDataRef.current.find(p => p.conversation_id === conv.conversation_id);
            // Notifica APENAS se a mensagem mudou E o timestamp é mais recente que o anterior
            if (prev && conv.last_message_at !== prev.last_message_at && conv.last_message_text !== prev.last_message_text) {
               // Verifica se a mensagem é realmente do lead (evita notificar msg do sistema/humano se quiser ser rigoroso)
               hasNewActivity = true;
               if (conv.is_urgent) {
                 isUrgent = true;
               }
               notifyName = conv.lead_name || conv.phone;
               notifyText = conv.last_message_text || '';
            }
          });
        }
        
        if (hasNewActivity) {
          const prefs = readNotificationSettings();
          if (prefs.enabled) {
            if (prefs.sound) playNotificationSound();

            // Urgente sempre notifica · regular respeita onlyWhenHidden
            const shouldNotify = isUrgent || (prefs.onlyWhenHidden ? document.hidden : true);
            if (shouldNotify) {
               sendBrowserNotification(
                 isUrgent ? `🚨 URGENTE: ${notifyName}` : `Nova mensagem de ${notifyName}`,
                 notifyText,
                 () => {
                   window.focus();
                   const triggered = data.find(c => (c.lead_name || c.phone) === notifyName);
                   if (triggered) {
                     setSelectedConversation(triggered);
                   }
                 }
               );
            }
          }
        }
        
        prevDataRef.current = data;
        setConversations(data);
        
        // Atualiza APENAS os metadados da conversa selecionada (ex: last_message_text)
        // sem trocar a referência do objeto — evita re-mount do useMessages
        if (selectedIdRef.current) {
          const updated = data.find(c => c.conversation_id === selectedIdRef.current);
          if (updated) {
            setSelectedConversation(prev => {
              if (!prev) return updated;
              
              // Verifica se algo mudou
              const hasChanged = 
                prev.last_message_text !== updated.last_message_text ||
                prev.last_message_at !== updated.last_message_at ||
                prev.ai_enabled !== updated.ai_enabled ||
                prev.ai_paused_until !== updated.ai_paused_until ||
                prev.lead_name !== updated.lead_name ||
                prev.funnel !== updated.funnel ||
                prev.phase !== updated.phase ||
                JSON.stringify(prev.tags) !== JSON.stringify(updated.tags) ||
                JSON.stringify(prev.queixas) !== JSON.stringify(updated.queixas);

              if (hasChanged) {
                console.log(`[useConversations] Atualizando conversa selecionada:`, {
                  id: updated.conversation_id,
                  funnel: updated.funnel,
                  msg: updated.last_message_text?.substring(0, 20)
                });
                return updated;
              }
              return prev;
            });
          }
        }
      }
    } catch (e) {
      console.error('Error fetching conversations:', e);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]); // Depende apenas do statusFilter

  useEffect(() => {
    // 1. Carga inicial
    fetchConversations();

    // 2. SSE com reconnect automatico · backoff exponencial
    //    1s → 2s → 4s → 8s → 16s → 30s (cap) · reset em sucesso (onmessage).
    //    Se browser nao suporta ou falha definitivamente, polling 30s segura.
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let stopped = false;
    const MAX_BACKOFF_MS = 30000;

    function scheduleReconnect() {
      if (stopped) return;
      reconnectAttempt += 1;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt - 1), MAX_BACKOFF_MS);
      if (typeof console !== 'undefined') {
        console.info(
          `[SSE] reconnect attempt ${reconnectAttempt} em ${delay}ms`,
        );
      }
      reconnectTimer = setTimeout(connect, delay);
    }

    function connect() {
      if (stopped) return;
      try {
        eventSource = new EventSource('/api/conversations/sse');
        eventSource.onmessage = () => {
          // SSE entregou evento · conexao saudavel · reseta backoff
          reconnectAttempt = 0;
          fetchConversations();
        };
        eventSource.onopen = () => {
          // Conectou com sucesso · reseta contador de tentativas
          reconnectAttempt = 0;
        };
        eventSource.onerror = () => {
          // Browser detectou erro · fecha e reagenda
          eventSource?.close();
          eventSource = null;
          scheduleReconnect();
        };
      } catch {
        // SSE nao suportado · agenda reconnect (vai falhar de novo
        // mas nao trava) · polling 30s vai cobrir mesmo assim
        scheduleReconnect();
      }
    }

    connect();

    // 3. Fallback: polling relaxado a cada 30s · cobre caso SSE estar morto
    const interval = setInterval(fetchConversations, 30000);

    return () => {
      stopped = true;
      clearInterval(interval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [fetchConversations]);

  return {
    conversations,
    isLoading,
    selectedConversation,
    setSelectedConversation,
    statusFilter,
    setStatusFilter,
    refreshConversations: fetchConversations
  };
}
