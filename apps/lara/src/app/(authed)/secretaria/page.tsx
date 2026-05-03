'use client';

/**
 * /secretaria · Mig 91 · Inbox dedicada da clinica (numero da secretaria).
 *
 * Difere de /conversas em:
 *   - useConversations({ inbox: 'secretaria' }) · so conversas de wa_numbers
 *     com inbox_role='secretaria' (inbound direto + handoffs).
 *   - LeadInfoPanel inboxRole='secretaria' · oculta AgentPauseSection,
 *     NextActions IA e botao Passar pra Secretaria (nao faz sentido aqui).
 *   - Sem useCopilot (zero token Anthropic).
 *   - Sem KPIs Lara · mostra "Handoffs hoje" + "Inbound direto" + "Aguardando".
 *
 * Reusa: ConversationList, MessageArea, LeadInfoPanel, ConfirmModal,
 *        useConversations, useMessages, useClinicMembers, usePresence,
 *        useKeyboardShortcuts.
 */

import { useState, useEffect } from 'react';
import { ensureRoleDefaults } from '@/hooks/useNotificationSettings';
import { ConversationList } from '../conversas/components/ConversationList';
import { MessageArea } from '../conversas/components/MessageArea';
import { LeadInfoPanel } from '../conversas/components/LeadInfoPanel';
import { ConfirmModal } from '../conversas/components/ConfirmModal';
import { AskDoctorModal } from '../conversas/components/AskDoctorModal';
import { useConversations, updateTabTitle } from '../conversas/hooks/useConversations';
import { useMessages } from '../conversas/hooks/useMessages';
import { useClinicMembers } from '../conversas/hooks/useClinicMembers';
import { usePresence } from '../conversas/hooks/usePresence';
import { useKeyboardShortcuts } from '../conversas/hooks/useKeyboardShortcuts';
import {
  Search,
  RefreshCw,
  ArrowUpDown,
  Filter,
  CheckCircle,
  Archive,
  AlertCircle,
  Clock,
  Stethoscope,
  Inbox,
  CircleDot,
  CheckCheck,
} from 'lucide-react';

export default function SecretariaPage() {
  // Mig 91 · inbox='secretaria' · filtra wa_conversations.inbox_role='secretaria'
  const {
    conversations,
    isLoading: isLoadingConversations,
    isLoadingMore,
    hasMore,
    selectedConversation,
    setSelectedConversation,
    statusFilter,
    setStatusFilter,
    refreshConversations,
    loadMore,
    lastSseEventAtRef,
  } = useConversations({ inbox: 'secretaria' });

  const [isLeadPanelExpanded, setIsLeadPanelExpanded] = useState(false);
  const [showAskDoctor, setShowAskDoctor] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [filteredCount, setFilteredCount] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [hasAdvFiltersActive, setHasAdvFiltersActive] = useState(false);
  // 6 KPIs clicaveis numa linha:
  //   ESCOPO  · todos | abertas | resolvidas (lente de status)
  //   OPERACAO · aguardando | urgente | dra (fila de trabalho)
  // Default = aguardando (fila operacional da Luciana visivel direto)
  type KpiId = 'todos' | 'abertas' | 'resolvidas' | 'aguardando' | 'urgente' | 'dra';
  const [activeKpi, setActiveKpi] = useState<KpiId>('aguardando');
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  } | null>(null);

  const {
    messages,
    isLoading: isLoadingMessages,
    newMessage,
    setNewMessage,
    sendMessage,
    sendInternalNote,
    retryMessage,
    discardMessage,
    sendStatus,
    messagesEndRef,
  } = useMessages(selectedConversation?.conversation_id || null, { lastSseEventAtRef });

  const { members: _members, me, clinicId, findById } = useClinicMembers();
  const myMember = me ? findById(me) : null;
  const presenceUser = me && myMember
    ? {
        user_id: me,
        full_name: myMember.fullName || 'Você',
        avatar_url: myMember.avatarUrl,
      }
    : null;
  const inboxChannelKey = clinicId ? `clinic-${clinicId}:secretaria` : null;
  const { onlineUsers: inboxOnline } = usePresence({
    channelKey: inboxChannelKey,
    user: presenceUser,
  });

  const refreshAll = async () => {
    await refreshConversations();
  };

  // ─────────────────────────────────────────────────────────────────────
  // KPIs clicaveis · 3 buckets operacionais da secretaria
  // ─────────────────────────────────────────────────────────────────────
  // Aguardando: paciente foi o ultimo a falar (last_message == last_lead_msg)
  // Urgente:    conv com flag is_urgent (tag URGENTE detectada por palavras
  //             chave no banco) · alinhado 1:1 com a tag visivel no painel
  //             direito · tempo de espera (>30min) NAO entra aqui · vive no
  //             badge ⏱ separado por conv item.
  // Dra:        conv com pergunta pendente da Consultoria Mirian
  //             (statusFilter='dra' carrega via API uma lista separada)
  const isPatientWaiting = (c: typeof conversations[number]) => {
    if (!c.last_lead_msg || !c.last_message_at) return false;
    return c.last_message_at === c.last_lead_msg;
  };
  const isUrgent = (c: typeof conversations[number]) => c.is_urgent;

  // Counts dos 6 KPIs · derivados local · zero fetch extra (exceto Dra · ver abaixo)
  const abertasCount = conversations.filter((c) => c.status === 'active').length;
  const resolvidasCount = conversations.filter((c) => c.status === 'resolved').length;
  const todosCount = abertasCount + resolvidasCount; // E2 · sem arquivadas
  const aguardandoCount = conversations.filter(
    (c) => c.status === 'active' && isPatientWaiting(c),
  ).length;
  const urgenteCount = conversations.filter(
    (c) => c.status === 'active' && isUrgent(c),
  ).length;

  // Dra · pendentes vem de conversation_questions · fetch leve a cada 30s.
  // conversationIds usado pra filtrar a lista quando KPI Dra ativo (espelho).
  const [draPending, setDraPending] = useState<{
    count: number;
    conversation_ids: string[];
  }>({ count: 0, conversation_ids: [] });
  useEffect(() => {
    let alive = true;
    const fetchDra = async () => {
      try {
        const r = await fetch('/api/secretaria/dra-pending');
        if (!r.ok) return;
        const data = await r.json();
        if (!alive) return;
        setDraPending({
          count: typeof data?.count === 'number' ? data.count : 0,
          conversation_ids: Array.isArray(data?.conversation_ids) ? data.conversation_ids : [],
        });
      } catch {
        /* silent */
      }
    };
    fetchDra();
    const id = setInterval(fetchDra, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const draCount = draPending.count;

  // Tab title mostra urgentes como sinal mais forte de pendencia
  useEffect(() => {
    updateTabTitle(urgenteCount);
  }, [urgenteCount]);

  // ─────────────────────────────────────────────────────────────────────
  // Mapping KPI → props legacy (statusFilter + activeTab) que a
  // ConversationList consome internamente. Mantém compat sem rework.
  //
  //   todos       → statusFilter='active' (simplificacao · API nao tem 'all')
  //   abertas     → statusFilter='active'
  //   resolvidas  → statusFilter='resolved'
  //   aguardando  → statusFilter='active' + activeTab='Aguardando'
  //   urgente     → statusFilter='active' + activeTab='Urgentes'
  //   dra         → statusFilter='active' + filtro local por conv_id (espelho)
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeKpi === 'resolvidas') setStatusFilter('resolved');
    else setStatusFilter('active');
  }, [activeKpi, setStatusFilter]);

  const activeTab =
    activeKpi === 'aguardando' ? 'Aguardando'
    : activeKpi === 'urgente' ? 'Urgentes'
    : 'Todas';

  // Filtro local pro KPI Dra · mostra so conversas com pergunta pendente
  // (espelho · conv permanece em scope=Abertas, nao muda status no DB)
  const filteredConversations = activeKpi === 'dra'
    ? conversations.filter((c) => draPending.conversation_ids.includes(c.conversation_id))
    : conversations;

  // Override defaults pra perfil sénior · onlyWhenHidden=false · idempotente
  // (não sobrescreve se user já mexeu nas prefs)
  useEffect(() => {
    ensureRoleDefaults('secretaria');
  }, []);

  useEffect(() => {
    if (selectedConversation?.conversation_id) {
      setIsLeadPanelExpanded(true);
    } else {
      setIsLeadPanelExpanded(false);
    }
  }, [selectedConversation?.conversation_id]);

  const handleAction = async (action: 'assume' | 'resolve' | 'archive' | 'transfer') => {
    if (!selectedConversation?.conversation_id) return;
    const cid = selectedConversation.conversation_id;

    if (action === 'resolve') {
      setModalConfig({
        isOpen: true,
        title: 'Resolver Conversa',
        description:
          'Marcar conversa como resolvida? Ela sai da lista de pendências.',
        confirmText: 'Resolver',
        onConfirm: async () => {
          await fetch(`/api/conversations/${cid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'resolved' }),
          });
          setSelectedConversation(null);
          setModalConfig(null);
        },
      });
    } else if (action === 'archive') {
      setModalConfig({
        isOpen: true,
        title: 'Arquivar Conversa',
        description:
          'Arquivar essa conversa? Ela volta caso o paciente mande nova mensagem.',
        confirmText: 'Arquivar',
        onConfirm: async () => {
          await fetch(`/api/conversations/${cid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'archived' }),
          });
          setSelectedConversation(null);
          setModalConfig(null);
        },
      });
    }
    // 'assume' e 'transfer' nao fazem sentido na inbox secretaria (ja e humano)
  };

  const isModalOpen = !!modalConfig?.isOpen;
  useKeyboardShortcuts({
    conversations,
    selectedConversation,
    setSelectedConversation,
    dispatchAction: handleAction,
    disabled: isModalOpen,
  });

  return (
    <div className="flex flex-col h-full w-full bg-[hsl(var(--chat-bg))]">
      {/* Topbar · 3 zonas (mirror /conversas com KPIs especificos da secretaria) */}
      <div className="h-16 bg-[hsl(var(--chat-panel-bg))] flex shrink-0 z-10 relative">
        {/* ZONA ESQUERDA · busca + filtros + sort + refresh */}
        <div className="w-80 shrink-0 border-b border-r border-white/[0.06] flex items-center gap-2 px-4">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
            <input
              placeholder="Buscar conversas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.02] border border-white/[0.04] rounded-md py-1.5 pl-8 pr-12 text-[12px] focus:outline-none focus:border-[hsl(var(--primary))]/40 focus:ring-1 focus:ring-[hsl(var(--primary))]/20 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 transition-colors"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[hsl(var(--muted-foreground))] tabular-nums opacity-70 pointer-events-none">
              {filteredCount}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            title="Filtros avancados"
            className={`p-1.5 rounded-md transition-all shrink-0 cursor-pointer ${
              showFilters || hasAdvFiltersActive
                ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/[0.12] ring-1 ring-[hsl(var(--primary))]/30'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/[0.08]'
            }`}
          >
            <Filter className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setSortOrder((p) => (p === 'newest' ? 'oldest' : 'newest'))}
            title="Inverter ordem"
            className={`p-1.5 rounded-md transition-all shrink-0 cursor-pointer ${
              sortOrder === 'oldest'
                ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/[0.12] ring-1 ring-[hsl(var(--primary))]/30'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/[0.08]'
            }`}
          >
            <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={refreshAll}
            title="Atualizar conversas"
            className="p-1.5 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/[0.08] transition-all shrink-0 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {/* ZONA CENTRAL · 6 KPIs CLICAVEIS numa linha
            ESCOPO: Todos · Abertas · Resolvidas (lente de status)
            FILA:   Aguardando · Urgente · Dra (operacional)
            Separador visual entre os 2 grupos. */}
        <div className="flex-1 border-b border-white/[0.06] flex items-center justify-center px-6 min-w-0">
          <div className="flex items-center gap-1.5">
            {([
              // ── Grupo ESCOPO (cinza/discreto) ──
              {
                id: 'todos' as const,
                icon: Inbox,
                label: 'Todos',
                value: todosCount,
                color: 'foreground',
                title: 'Todas as conversas (Abertas + Resolvidas) · sem arquivadas',
                group: 'escopo' as const,
              },
              {
                id: 'abertas' as const,
                icon: CircleDot,
                label: 'Abertas',
                value: abertasCount,
                color: 'primary',
                title: 'Conversas ativas · em andamento',
                group: 'escopo' as const,
              },
              {
                id: 'resolvidas' as const,
                icon: CheckCheck,
                label: 'Resolvidas',
                value: resolvidasCount,
                color: 'success',
                title: 'Conversas marcadas como resolvidas (indice = Resolvidas / Todos)',
                group: 'escopo' as const,
              },
              // ── Grupo FILA (colorido) ──
              {
                id: 'aguardando' as const,
                icon: Clock,
                label: 'Aguardando',
                value: aguardandoCount,
                color: 'warning',
                title: 'Paciente foi o ultimo a falar · fila pra Luciana cuidar',
                group: 'fila' as const,
              },
              {
                id: 'urgente' as const,
                icon: AlertCircle,
                label: 'Urgente',
                value: urgenteCount,
                color: 'destructive',
                title: 'Conversas com tag URGENTE (palavra-chave detectada)',
                group: 'fila' as const,
              },
              {
                id: 'dra' as const,
                icon: Stethoscope,
                label: 'Dra',
                value: draCount,
                color: 'accent',
                title: 'Perguntas que a secretaria transferiu pra Dra Mirian responder',
                group: 'fila' as const,
              },
            ]).map((k, idx, arr) => {
              const Icon = k.icon;
              const colorVar = `hsl(var(--${k.color}))`;
              const isActive = activeKpi === k.id;
              const prev = arr[idx - 1];
              const showDivider = !!prev && prev.group !== k.group;
              return (
                <div key={k.id} className="flex items-center gap-1.5">
                  {showDivider && (
                    <div className="w-px h-8 bg-white/[0.08] mx-1" aria-hidden="true" />
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveKpi(k.id)}
                    title={k.title}
                    className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-200 ease-out cursor-pointer ${
                      isActive
                        ? '-translate-y-[1px]'
                        : 'hover:-translate-y-[2px] hover:bg-white/[0.03]'
                    }`}
                    style={{
                      background: isActive ? colorVar.replace(')', ' / 0.10)') : undefined,
                      boxShadow: isActive
                        ? `inset 0 0 0 1px ${colorVar.replace(')', ' / 0.35)')}`
                        : undefined,
                    }}
                  >
                    <div
                      className="p-1 rounded-md transition-colors shrink-0"
                      style={{
                        background: colorVar.replace(')', ' / 0.10)'),
                        color: colorVar,
                      }}
                    >
                      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </div>
                    <div className="text-left">
                      <p
                        className="font-meta text-[8.5px] uppercase whitespace-nowrap transition-colors"
                        style={{
                          color: isActive ? colorVar : undefined,
                          letterSpacing: '0.08em',
                        }}
                      >
                        {k.label}
                      </p>
                      <p
                        className="font-display text-xl leading-none mt-0.5 tabular-nums"
                        style={{
                          color: k.value > 0 ? colorVar : 'hsl(var(--foreground))',
                        }}
                      >
                        {k.value}
                      </p>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ZONA DIREITA · sobre painel direito */}
        {isLeadPanelExpanded ? (
          <div className="w-80 shrink-0 border-b border-l border-white/[0.06] flex items-center px-3 gap-1">
            {selectedConversation ? (
              <>
                <button
                  type="button"
                  onClick={() => handleAction('resolve')}
                  title="Resolver conversa"
                  className="p-1.5 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/10 transition-colors cursor-pointer shrink-0"
                >
                  <CheckCircle className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => handleAction('archive')}
                  title="Arquivar conversa"
                  className="p-1.5 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/10 transition-colors cursor-pointer shrink-0"
                >
                  <Archive className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <div className="w-px h-5 bg-white/[0.06] mx-1 shrink-0" />
              </>
            ) : null}
            <span className="font-display text-[14px] text-[hsl(var(--foreground))] flex-1 truncate">
              Inbox da <em className="text-[hsl(var(--primary))] not-italic font-display italic">secretaria</em>
            </span>
            <button
              type="button"
              onClick={() => setIsLeadPanelExpanded(false)}
              title="Esconder painel"
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] text-lg cursor-pointer leading-none w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.04] shrink-0"
            >
              ×
            </button>
          </div>
        ) : (
          <div
            onClick={() => setIsLeadPanelExpanded(true)}
            title="Mostrar painel"
            className="w-14 shrink-0 border-b border-l border-white/[0.06] flex items-center justify-center cursor-pointer hover:bg-white/[0.04] transition-colors"
          >
            <span className="text-[hsl(var(--muted-foreground))] text-lg leading-none">‹</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ConversationList
          conversations={filteredConversations}
          selectedConversation={selectedConversation}
          isLoading={isLoadingConversations}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onSelectConversation={setSelectedConversation}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortOrder={sortOrder}
          onFilteredCountChange={setFilteredCount}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((v) => !v)}
          onAdvancedFiltersActiveChange={setHasAdvFiltersActive}
          activeTab={activeTab}
          onActiveTabChange={(tab) => {
            // Guard · simplifiedTabs nao expoe sub-filtros, mas mantém sync
            if (tab === 'Aguardando') setActiveKpi('aguardando');
            else if (tab === 'Urgentes') setActiveKpi('urgente');
            else setActiveKpi('abertas');
          }}
          onlineUsers={inboxOnline}
          me={me}
          simplifiedTabs
        />

        <MessageArea
          selectedConversation={selectedConversation}
          messages={messages}
          isLoadingMessages={isLoadingMessages}
          newMessage={newMessage}
          onNewMessageChange={setNewMessage}
          onSendMessage={sendMessage}
          onRetryMessage={retryMessage}
          onDiscardMessage={discardMessage}
          sendStatus={sendStatus}
          messagesEndRef={messagesEndRef}
          copilotSummary=""
          copilotSummaryLoading={false}
          copilotSummaryError={null}
          copilotGeneratedAt=""
          copilotCached={false}
          copilotSmartReplies={[]}
          onRefreshCopilot={() => {}}
          onSendInternalNote={sendInternalNote}
        />

        <LeadInfoPanel
          selectedConversation={selectedConversation}
          isExpanded={isLeadPanelExpanded}
          onToggleExpand={() => setIsLeadPanelExpanded(!isLeadPanelExpanded)}
          onAction={handleAction}
          onStatusChange={refreshAll}
          inboxRole="secretaria"
          onPickQuickAction={(text) => setNewMessage(text)}
          onAskDoctor={() => setShowAskDoctor(true)}
        />
      </div>

      {/* Sprint 1 · Modal pra perguntar pra Dra. Mirian · acionado pelo
          botao no painel direito (LeadInfoPanel zona BAIXO FIXA) */}
      {showAskDoctor && selectedConversation && (
        <AskDoctorModal
          conversationId={selectedConversation.conversation_id}
          leadFirstName={(selectedConversation.lead_name || '').split(/\s+/)[0]}
          onClose={() => setShowAskDoctor(false)}
        />
      )}

      {modalConfig && (
        <ConfirmModal
          isOpen={modalConfig.isOpen}
          title={modalConfig.title}
          description={modalConfig.description}
          confirmText={modalConfig.confirmText}
          cancelText={modalConfig.cancelText}
          onConfirm={modalConfig.onConfirm}
          onCancel={() => setModalConfig(null)}
        />
      )}
    </div>
  );
}
