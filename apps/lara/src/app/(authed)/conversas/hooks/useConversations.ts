import { useState, useEffect, useCallback, useRef } from 'react';
import { readNotificationSettings } from '@/hooks/useNotificationSettings';

export interface Conversation {
  /** Null para rows mirror-only · chat existe no Evolution Mih mas ainda
      não tem wa_conversations local (Commit 2 · 2026-05-06) */
  conversation_id: string | null;
  phone: string;
  /** Merge legacy: lead.name → display_name → phone (sempre non-null).
      Para fallback gracioso usar `getConversationDisplayName` em vez de ler
      direto este campo (que pode conter o telefone como fallback). */
  lead_name: string;
  /** wa_conversations.display_name puro (push_name do WhatsApp) · null se
      o paciente nunca enviou push_name. Source canônico pro helper de nome. */
  display_name: string | null;
  lead_id: string;
  status: string;
  ai_enabled: boolean;
  ai_paused_until: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
  /** ISO da última mensagem do paciente · usado pra calcular tempo de espera
      e fila "Aguardando" (paciente foi o último a falar) */
  last_lead_msg: string | null;
  is_urgent: boolean;
  phase: string | null;
  funnel: string | null;
  lead_score: number;
  tags: string[];
  queixas: string[];
  channel?: 'cloud' | 'legacy' | string;
  /** P-12 · profile id atribuido (null = sem atribuicao). */
  assigned_to?: string | null;
  /** P-12 · ISO do ultimo assign. */
  assigned_at?: string | null;
  /** Mig 91/96 · 'sdr' (Lara) · 'secretaria' · 'b2b' (Mira) · denorm de wa_numbers.inbox_role */
  inbox_role?: 'sdr' | 'secretaria' | 'b2b';
  /** Mig 91 · ISO do handoff Lara→Secretaria (NULL = sem handoff). */
  handoff_to_secretaria_at?: string | null;
  // ── SLA · performance da secretaria (server-computed em sla.ts) ──────────
  /** ISO da última mensagem do paciente (alias canônico de last_lead_msg) */
  last_patient_msg_at: string | null;
  /** ISO da última resposta humana válida (sender='humano' AND status≠'note') */
  last_human_reply_at: string | null;
  /** Texto da última resposta humana · usado pelo KPI Retorno
      (lib/returnPromises) pra detectar promessa de retorno · null se sem reply */
  last_human_reply_text: string | null;
  /** Paciente esperando resposta humana neste momento */
  waiting_human_response: boolean;
  /** Minutos desde last_patient_msg_at · null se !waiting */
  minutes_waiting: number | null;
  /** Cor pra renderizar no badge ⏱ · UI mapeia direto, não recalcula regra */
  response_color:
    | 'respondido'
    | 'verde'
    | 'amarelo'
    | 'vermelho'
    | 'critico'
    | 'atrasado_fixo'
    | 'antigo_parado';
  /** Se badge deve pulsar (true só pra amarelo, vermelho, critico) */
  should_pulse: boolean;
  /** Intensidade do pulso · 'none' | 'suave' | 'forte' */
  pulse_behavior: 'none' | 'suave' | 'forte';
  // ── View operacional canônica (Alden 2026-05-05) ───────────────────────
  // Single source of truth pra pills/filas · vem do enrichment server-side
  // em /api/conversations a partir de wa_conversations_operational_view.
  // Campos opcionais pra retrocompat · undefined em mensagens antigas até
  // a view ter sido aplicada.
  /** Dono operacional canônico · 'mirian' (Dra) ou 'luciana' (default) */
  operational_owner?: 'luciana' | 'mirian' | string | null;
  /** Label de exibição do dono ('Luciana' ou 'Mirian') */
  operational_owner_label?: string | null;
  /** True quando default (active conv) · NOT is_dra */
  is_luciana?: boolean;
  /** True quando assigned_to é Mirian · governa pill DRA + fila Mirian */
  is_dra?: boolean;
  /** Estado IA (não dono) · IA conduzindo conv não atribuída */
  is_lara?: boolean;
  /** Forçado false neste dashboard · não governa nada */
  is_voce?: boolean;
  /** Forçado false neste dashboard · não governa nada */
  is_mira?: boolean;
  /** inbox_role='secretaria' (canal · não dono) */
  is_secretaria?: boolean;
  /** SLA secretária · semanticamente equivale a waiting_human_response */
  is_aguardando?: boolean;
  /** Aguardando crítico · >5min sem resposta humana */
  is_urgente?: boolean;
  /** Versão da view do response_color · 'none'|'aguardando'|'vermelho'|'critico'.
      NÃO é o response_color da SLA secretária (esse fica em `response_color`
      acima · pode coexistir com valor diferente). Pills usam `is_urgente` */
  op_response_color?: 'none' | 'aguardando' | 'vermelho' | 'critico' | string;
  is_assigned?: boolean;
  assigned_to_name?: string | null;
  assigned_to_role?: string | null;
  /** Sinaliza se conv tem tag legada (pronto_agendar/perguntou_preco/...) ·
      apenas pra audit · não governa pill */
  has_legacy_operational_tag?: boolean;
  /** Timestamps derivados via msg_rollup · independem de last_message_at */
  last_inbound_msg?: string | null;
  last_human_msg?: string | null;
  last_lara_msg?: string | null;
  last_outbound_msg?: string | null;
  minutes_since_last_inbound?: number | null;
  // ── Espelho WhatsApp (Commit 2 · /secretaria via wa_chat_mirror) ────────
  /** True quando row vem do mirror sem wa_conversations correspondente */
  has_conversation?: boolean;
  /** JID do chat na Evolution (5544...@s.whatsapp.net | ...@g.us | ...@lid) */
  mirror_remote_jid?: string;
  mirror_remote_kind?: 'private' | 'group' | 'lid' | 'unknown';
  is_group?: boolean;
  is_lid?: boolean;
  unread_count?: number;
  last_message_type?: string | null;
  last_message_from_me?: boolean | null;
  /** Display resolvido pelo waterfall do helper (lead → conv → mirror) */
  display_name_resolved?: string;
  wa_number_id?: string;
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

/**
 * Atualiza titulo da aba com numero de pendentes.
 * P-04 (2026-04-29): aceita `pending` direto · geralmente
 * `insights.urgentes + insights.aguardando` do useInsights (global · nao
 * filtrado por aba). Antes era filter() do array, que zerava ao trocar de aba.
 */
export const updateTabTitle = (pending: number) => {
  document.title = pending > 0 ? `(${pending}) Central de Atendimento` : 'ClinicAI';
};

interface ListResponse {
  items: Conversation[];
  nextCursor: string | null;
}

const PAGE_SIZE = 50;

export function useConversations(opts?: { inbox?: 'sdr' | 'secretaria' }) {
  // Mig 91 · default 'sdr' (compat com /conversas existente).
  const inbox = opts?.inbox ?? 'sdr';
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'resolved' | 'dra'>('active');
  const selectedIdRef = useRef<string | null>(null);
  const prevDataRef = useRef<Conversation[]>([]);
  const prevStatusRef = useRef(statusFilter);
  const lastSseEventAtRef = useRef<number>(0);
  const cursorRef = useRef<string | null>(null);

  // Mantém o ID selecionado sem causar re-render
  useEffect(() => {
    selectedIdRef.current = selectedConversation?.conversation_id || null;
  }, [selectedConversation]);

  // Permission gating moveu pro NotificationPermissionBanner · evita prompt
  // automatico no mount (browsers modernos bloqueiam sem user gesture).

  const fetchConversations = useCallback(async () => {
    try {
      // P-02: refresh recarrega so a 1a pagina · cursor reseta
      const res = await fetch(
        `/api/conversations?status=${statusFilter}&limit=${PAGE_SIZE}&inbox=${inbox}`,
      );
      if (res.ok) {
        const payload: ListResponse = await res.json();
        const data = payload.items;
        cursorRef.current = payload.nextCursor;
        setHasMore(payload.nextCursor !== null);

        // P-04: tab title agora vem do useInsights (global) na page · removido daqui
        // pra nao dar valor errado ao trocar de aba (Resolvidas zera urgentes).

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
  }, [statusFilter, inbox]); // Mig 91 · re-fetch quando inbox muda

  /**
   * P-02: Carrega proxima pagina via cursor (last_message_at < cursor).
   * Append no array existente · sem mexer em selectedConversation.
   * No-op se !hasMore ou ja esta carregando.
   */
  const loadMore = useCallback(async () => {
    if (!cursorRef.current || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const url = `/api/conversations?status=${statusFilter}&limit=${PAGE_SIZE}&before=${encodeURIComponent(cursorRef.current)}&inbox=${inbox}`;
      const res = await fetch(url);
      if (res.ok) {
        const payload: ListResponse = await res.json();
        cursorRef.current = payload.nextCursor;
        setHasMore(payload.nextCursor !== null);
        // Append · dedupe por conversation_id (ou mirror_remote_jid pra rows
        // mirror-only do /secretaria · Commit 2). Cobre overlap em concurrent
        // updates · null-safe.
        setConversations(prev => {
          const dedupKey = (c: Conversation) =>
            c.conversation_id ?? c.mirror_remote_jid ?? '';
          const seen = new Set(prev.map(dedupKey).filter((k) => k !== ''));
          const fresh = payload.items.filter((c) => {
            const k = dedupKey(c);
            return k === '' ? true : !seen.has(k);
          });
          return [...prev, ...fresh];
        });
      }
    } catch (e) {
      console.error('Error loading more conversations:', e);
    } finally {
      setIsLoadingMore(false);
    }
  }, [statusFilter, isLoadingMore, inbox]);

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
          lastSseEventAtRef.current = Date.now();
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
    isLoadingMore,
    hasMore,
    selectedConversation,
    setSelectedConversation,
    statusFilter,
    setStatusFilter,
    refreshConversations: fetchConversations,
    loadMore,
    lastSseEventAtRef
  };
}
