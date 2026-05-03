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
import { ConversationList } from '../conversas/components/ConversationList';
import { MessageArea } from '../conversas/components/MessageArea';
import { LeadInfoPanel } from '../conversas/components/LeadInfoPanel';
import { ConfirmModal } from '../conversas/components/ConfirmModal';
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
  ArrowRightLeft,
  UserCheck,
  Clock,
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
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [filteredCount, setFilteredCount] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [hasAdvFiltersActive, setHasAdvFiltersActive] = useState(false);
  const [activeTab, setActiveTab] = useState('Todas');
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

  // KPIs derivados local · evita 2a chamada de API
  const handoffsHoje = (() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return conversations.filter((c) => {
      if (!c.handoff_to_secretaria_at) return false;
      return new Date(c.handoff_to_secretaria_at) >= todayStart;
    }).length;
  })();
  const inboundDireto = conversations.filter((c) => !c.handoff_to_secretaria_at).length;
  const aguardando = conversations.filter((c) => c.is_urgent).length;

  useEffect(() => {
    updateTabTitle(aguardando);
  }, [aguardando]);

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

        {/* ZONA CENTRAL · KPIs especificos da Secretaria */}
        <div className="flex-1 border-b border-white/[0.06] flex items-center justify-center px-12 min-w-0">
          <div className="flex items-center gap-2">
            {[
              {
                id: 'handoffs',
                icon: ArrowRightLeft,
                label: 'Handoffs hoje',
                value: handoffsHoje,
                color: 'primary',
                title: 'Leads que a Lara passou pra secretaria hoje',
              },
              {
                id: 'inbound',
                icon: UserCheck,
                label: 'Inbound direto',
                value: inboundDireto,
                color: 'accent',
                title: 'Leads que chegaram direto no numero da clinica (sem Lara)',
              },
              {
                id: 'aguardando',
                icon: Clock,
                label: 'Aguardando você',
                value: aguardando,
                color: 'warning',
                title: 'Conversas urgentes (>5min sem resposta)',
              },
            ].map((k, idx) => {
              const Icon = k.icon;
              const colorVar = `hsl(var(--${k.color}))`;
              return (
                <div
                  key={k.id}
                  title={k.title}
                  className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-200 ease-out hover:-translate-y-[3px] hover:bg-white/[0.03]"
                  style={{ marginLeft: idx === 0 ? 0 : 4 }}
                >
                  <div
                    className="p-1.5 rounded-md transition-colors"
                    style={{
                      background: `${colorVar.replace(')', ' / 0.10)')}`,
                      color: colorVar,
                    }}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.5} />
                  </div>
                  <div className="text-left">
                    <p className="font-meta text-[9px] text-[hsl(var(--muted-foreground))] uppercase whitespace-nowrap group-hover:text-[hsl(var(--foreground))] transition-colors">
                      {k.label}
                    </p>
                    <p
                      className="font-display text-2xl leading-none mt-0.5 tabular-nums"
                      style={{
                        color: k.value > 0 ? colorVar : 'hsl(var(--foreground))',
                      }}
                    >
                      {k.value}
                    </p>
                  </div>
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
          conversations={conversations}
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
          onActiveTabChange={setActiveTab}
          onlineUsers={inboxOnline}
          me={me}
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
        />
      </div>

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
