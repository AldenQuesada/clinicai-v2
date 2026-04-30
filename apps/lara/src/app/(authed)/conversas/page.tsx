'use client';

import { useState, useEffect } from 'react';
import { ConversationList } from './components/ConversationList';
import { MessageArea } from './components/MessageArea';
import { LeadInfoPanel } from './components/LeadInfoPanel';
import { ConfirmModal } from './components/ConfirmModal';
import { NewConversationModal } from './components/NewConversationModal';
import { useConversations, updateTabTitle } from './hooks/useConversations';
import { useMessages } from './hooks/useMessages';
import { useInsights } from './hooks/useInsights';
import { useClinicInfo } from './hooks/useClinicInfo';
import { useCopilot } from './hooks/useCopilot';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useClinicMembers } from './hooks/useClinicMembers';
import { usePresence } from './hooks/usePresence';
import { AlertCircle, Clock, MessageCircle, CheckCircle2, RefreshCw, UserPlus, Search, MessageSquarePlus, ArrowUpDown, Filter, CheckCircle, Archive, Stethoscope } from 'lucide-react';

export default function ChatPage() {
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
  } = useConversations();

  // Polish 2026-04-30 · painel direito colapsado por default · expande
  // automaticamente quando uma conversa e selecionada (ao trocar tambem).
  // Se user fechar via x, fica fechado ate trocar de conversa.
  const [isLeadPanelExpanded, setIsLeadPanelExpanded] = useState(false);
  const [isNewConvOpen, setIsNewConvOpen] = useState(false);

  // Polish 2026-04-30 · busca + sort + filter lifted da ConversationList pro
  // topbar global · libera ~120px na sidebar pra mais conversas visiveis
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

  // P-03/P-04: insights globais do clinic · independente do filtro ativo.
  // Substitui calculos filter() do array (que zeravam ao trocar de aba).
  const { insights, refresh: refreshInsights } = useInsights();

  // P-08: nome da responsavel pro transfer (multi-tenant) · evita "Dra. Mirian"
  // hardcoded · le de clinics.settings.responsible_name (jsonb).
  const { displayResponsible } = useClinicInfo();

  // P-12 Fase 3 · presença inbox-level · avatares dos atendentes online
  const { members, me, clinicId, findById } = useClinicMembers();
  const myMember = me ? findById(me) : null;
  const presenceUser = me && myMember
    ? {
        user_id: me,
        full_name: myMember.fullName || 'Você',
        avatar_url: myMember.avatarUrl,
      }
    : null;
  const inboxChannelKey = clinicId ? `clinic-${clinicId}:inbox` : null;
  const { onlineUsers: inboxOnline } = usePresence({
    channelKey: inboxChannelKey,
    user: presenceUser,
  });

  // Sprint B (W-01 + W-02 + W-03): copiloto AI · 1 chamada Anthropic ·
  // summary, next_actions, smart_replies em 1 hook.
  const {
    copilot,
    isLoading: isCopilotLoading,
    error: copilotError,
    refresh: refreshCopilot,
  } = useCopilot(selectedConversation?.conversation_id || null);

  // Wrapper · em mutacoes (assume/resolve/archive/transfer + new conv) refresh
  // tanto a lista quanto os insights pra UI ficar consistente sem esperar 30s.
  const refreshAll = async () => {
    await Promise.all([refreshConversations(), refreshInsights()]);
  };

  // Tab title reativo a insights · "(N) Central de Atendimento"
  useEffect(() => {
    updateTabTitle(insights.urgentes + insights.aguardando);
  }, [insights.urgentes, insights.aguardando]);

  // Polish 2026-04-30 · auto-expand do painel direito ao selecionar conversa
  // (e auto-colapsar ao desselecionar). Watcher do conversation_id · evita
  // re-trigger em mudancas de metadata (last_message_at, etc) na mesma conv.
  useEffect(() => {
    if (selectedConversation?.conversation_id) {
      setIsLeadPanelExpanded(true);
    } else {
      setIsLeadPanelExpanded(false);
    }
  }, [selectedConversation?.conversation_id]);

  const handleSendMessage = () => {
    if (selectedConversation) {
      // Calcula 30 minutos a partir de agora para o visual ser instantâneo
      const pauseUntil = new Date(Date.now() + 30 * 60000).toISOString();
      setSelectedConversation(prev => prev ? { 
        ...prev, 
        ai_enabled: false,
        ai_paused_until: pauseUntil 
      } : prev);
    }
    sendMessage();
  };

  const handleAction = async (action: 'assume' | 'resolve' | 'archive' | 'transfer') => {
    if (!selectedConversation?.conversation_id) return;
    const cid = selectedConversation.conversation_id;

    if (action === 'assume') {
      const res = await fetch(`/api/conversations/${cid}/assume`, { method: 'POST' });
      const data = await res.json();
      setSelectedConversation(prev => prev ? { 
        ...prev, 
        ai_enabled: false, 
        ai_paused_until: data.pauseStatus?.ai_paused_until || prev.ai_paused_until 
      } : prev);
    } 
    else if (action === 'resolve') {
      setModalConfig({
        isOpen: true,
        title: 'Resolver Conversa',
        description: 'Tem certeza que deseja marcar essa conversa como resolvida? Ela sairá da lista de pendências.',
        confirmText: 'Resolver',
        onConfirm: async () => {
          await fetch(`/api/conversations/${cid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'resolved' })
          });
          setSelectedConversation(null);
          setModalConfig(null);
        }
      });
    }
    else if (action === 'archive') {
      setModalConfig({
        isOpen: true,
        title: 'Arquivar Conversa',
        description: 'Deseja arquivar essa conversa? Ela sairá da lista atual, mas voltará caso o paciente mande nova mensagem.',
        confirmText: 'Arquivar',
        onConfirm: async () => {
          await fetch(`/api/conversations/${cid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'archived' })
          });
          setSelectedConversation(null);
          setModalConfig(null);
        }
      });
    }
    else if (action === 'transfer') {
      const responsavel = displayResponsible(); // P-08 · ex: "Dra. Mirian", "Dr. Carlos", "a doutora"
      setModalConfig({
        isOpen: true,
        title: `Transferir para ${responsavel}`,
        description: `Deseja transferir este lead para ${responsavel}? A inteligência artificial será pausada e o paciente será avisado automaticamente.`,
        confirmText: 'Transferir',
        onConfirm: async () => {
          const res = await fetch(`/api/conversations/${cid}/assume`, { method: 'POST' });
          const data = await res.json();

          // Marca status como 'dra' no banco
          await fetch(`/api/conversations/${cid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'dra' })
          });

          await sendMessage(`Entendi! Vou encaminhar sua conversa para ${responsavel}. Ela vai entrar em contato com você em breve!`);

          setSelectedConversation(prev => prev ? {
            ...prev,
            ai_enabled: false,
            status: 'dra',
            ai_paused_until: data.pauseStatus?.ai_paused_until || prev.ai_paused_until
          } : prev);
          setModalConfig(null);
        }
      });
    }
  };

  // P-15 · Atalhos de teclado (j/k navegar · r resolver · a assumir)
  // Desabilitado quando modal aberto pra nao competir com Enter/Esc.
  const isModalOpen = !!modalConfig?.isOpen || isNewConvOpen;
  useKeyboardShortcuts({
    conversations,
    selectedConversation,
    setSelectedConversation,
    dispatchAction: handleAction,
    disabled: isModalOpen,
  });

  // P-03/P-04: KPIs vem do useInsights global · nao calculados do array filtrado
  const { urgentes, aguardando, laraAtiva, resolvidosHoje, novosLeads } = insights;

  return (
    <div className="flex flex-col h-full w-full bg-[hsl(var(--chat-bg))]">
      {/* Topbar · 3 zonas alinhadas com as colunas (sidebar | chat | painel) ·
          libera as laterais pra busca + Perfil do lead, KPIs ficam enquadrados
          dentro da area central (proposta user 2026-04-30) */}
      <div className="h-16 bg-[hsl(var(--chat-panel-bg))] flex shrink-0 z-10 relative">
        {/* ZONA ESQUERDA · sobre sidebar (w-80) · busca + count + sort + new */}
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
          {/* Icone-buttons da topbar zona esquerda · hover forte com bg + ring + cursor */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            title="Filtros avancados (funil/tag/periodo)"
            className={`p-1.5 rounded-md transition-all shrink-0 cursor-pointer ${
              showFilters || hasAdvFiltersActive
                ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/[0.12] ring-1 ring-[hsl(var(--primary))]/30'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/[0.08] hover:ring-1 hover:ring-[hsl(var(--primary))]/20'
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
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/[0.08] hover:ring-1 hover:ring-[hsl(var(--primary))]/20'
            }`}
          >
            <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => setIsNewConvOpen(true)}
            title="Nova conversa manual"
            className="p-1.5 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/[0.08] hover:ring-1 hover:ring-[hsl(var(--primary))]/20 transition-all shrink-0 cursor-pointer"
          >
            <MessageSquarePlus className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={refreshAll}
            title="Atualizar conversas e KPIs"
            className="p-1.5 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/[0.08] hover:ring-1 hover:ring-[hsl(var(--primary))]/20 transition-all shrink-0 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {/* ZONA CENTRAL · sobre chat (flex-1) · KPIs CLICAVEIS centralizados.
            px-12 generoso pra nao invadir as zonas laterais. Cada KPI filtra
            a lista quando clicado (cursor-pointer + hover translate + ring) */}
        <div className="flex-1 border-b border-white/[0.06] flex items-center justify-center px-12 min-w-0">

        <div className="flex items-center gap-2">
          {(() => {
            const isActive = (tabName: string) =>
              statusFilter === 'active' && activeTab === tabName;
            const isResolvedActive = statusFilter === 'resolved';
            const kpis = [
              {
                id: 'novos',
                icon: UserPlus,
                label: 'Novos leads',
                value: novosLeads,
                color: 'primary',
                accent: novosLeads > 0,
                active: false, // novos leads nao tem filtro 1:1, click leva pra Todas
                title: 'Contatos novos cadastrados hoje · clique pra ver todas as conversas abertas',
                onClick: () => {
                  setStatusFilter('active');
                  setActiveTab('Todas');
                },
              },
              {
                id: 'urgentes',
                icon: AlertCircle,
                label: 'Urgentes',
                value: urgentes,
                color: 'danger',
                accent: urgentes > 0,
                active: isActive('Urgentes'),
                title: 'Conversas urgentes · clique pra filtrar',
                onClick: () => {
                  setStatusFilter('active');
                  setActiveTab('Urgentes');
                },
              },
              {
                id: 'aguardando',
                icon: Clock,
                label: 'Aguardando você',
                value: aguardando,
                color: 'warning',
                accent: true,
                active: isActive('Aguardando'),
                title: 'Aguardando você responder · clique pra filtrar',
                onClick: () => {
                  setStatusFilter('active');
                  setActiveTab('Aguardando');
                },
              },
              {
                id: 'lara',
                icon: MessageCircle,
                label: 'Lara ativa',
                value: laraAtiva,
                color: 'primary',
                accent: true,
                active: isActive('Lara Ativa'),
                title: 'Lara conduzindo · clique pra filtrar',
                onClick: () => {
                  setStatusFilter('active');
                  setActiveTab('Lara Ativa');
                },
              },
              {
                id: 'resolvidos',
                icon: CheckCircle2,
                label: 'Resolvidos hoje',
                value: resolvidosHoje,
                color: 'success',
                accent: true,
                active: isResolvedActive,
                title: 'Resolvidos hoje · clique pra ver a aba Feitas',
                onClick: () => {
                  setStatusFilter('resolved');
                },
              },
            ];

            return kpis.map((k, idx) => {
              const Icon = k.icon;
              const colorVar = `hsl(var(--${k.color}))`;
              return (
                <button
                  key={k.id}
                  type="button"
                  title={k.title}
                  onClick={k.onClick}
                  className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200 ease-out hover:-translate-y-[3px] hover:shadow-luxury-sm ${
                    k.active
                      ? 'bg-[hsl(var(--primary))]/[0.06] ring-1 ring-[hsl(var(--primary))]/40'
                      : 'hover:bg-white/[0.03]'
                  }`}
                  style={{ marginLeft: idx === 0 ? 0 : 4 }}
                >
                  <div
                    className="p-1.5 rounded-md transition-colors"
                    style={{
                      background: k.accent ? `${colorVar.replace(')', ' / 0.10)').replace('hsl', 'hsl')}` : 'rgba(255,255,255,0.03)',
                      color: k.accent ? colorVar : 'hsl(var(--muted-foreground))',
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
                        color: k.accent && k.value > 0 ? colorVar : 'hsl(var(--foreground))',
                      }}
                    >
                      {k.value}
                    </p>
                  </div>
                </button>
              );
            });
          })()}
        </div>

        {/* Refresh button moveu pra topbar zona esquerda (junto com Filter/Sort/New)
            · zona central agora e EXCLUSIVA dos KPIs · sem competir por espaco */}
        </div>

        {/* ZONA DIREITA · sobre painel direito · sincroniza largura com
            isLeadPanelExpanded (w-80 expandido / w-14 colapsado).
            Quando expandido + selectedConversation: 3 action buttons
            (Resolver/Arquivar/Transferir) + titulo + close */}
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
                <button
                  type="button"
                  onClick={() => handleAction('transfer')}
                  title={`Transferir para ${displayResponsible()}`}
                  className="p-1.5 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/10 transition-colors cursor-pointer shrink-0"
                >
                  <Stethoscope className="w-4 h-4" strokeWidth={1.5} />
                </button>
                <div className="w-px h-5 bg-white/[0.06] mx-1 shrink-0" />
              </>
            ) : null}
            <span className="font-display text-[14px] text-[hsl(var(--foreground))] flex-1 truncate">
              Perfil do <em className="text-[hsl(var(--primary))] not-italic font-display italic">lead</em>
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
        {/* 1. Coluna Esquerda: Lista de contatos */}
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
          footerHint={
            !isModalOpen ? (
              <span>
                <span className="text-[hsl(var(--foreground))]">j/k</span> navegar
                <span className="mx-1.5 opacity-40">·</span>
                <span className="text-[hsl(var(--foreground))]">r</span> resolver
                <span className="mx-1.5 opacity-40">·</span>
                <span className="text-[hsl(var(--foreground))]">a</span> assumir
              </span>
            ) : undefined
          }
        />

        {/* 2. Coluna Central: Chat */}
        <MessageArea
          selectedConversation={selectedConversation}
          messages={messages}
          isLoadingMessages={isLoadingMessages}
          newMessage={newMessage}
          onNewMessageChange={setNewMessage}
          onSendMessage={handleSendMessage}
          onRetryMessage={retryMessage}
          onDiscardMessage={discardMessage}
          sendStatus={sendStatus}
          messagesEndRef={messagesEndRef}
          copilotSummary={copilot?.summary || ''}
          copilotSummaryLoading={isCopilotLoading}
          copilotSummaryError={copilotError}
          copilotGeneratedAt={copilot?.generated_at || ''}
          copilotCached={copilot?.cached ?? false}
          copilotSmartReplies={copilot?.smart_replies || []}
          onRefreshCopilot={() => refreshCopilot(true)}
          onSendInternalNote={sendInternalNote}
        />

        {/* 3. Coluna Direita: Informacoes e Controle de Pausa */}
        <LeadInfoPanel
          selectedConversation={selectedConversation}
          isExpanded={isLeadPanelExpanded}
          onToggleExpand={() => setIsLeadPanelExpanded(!isLeadPanelExpanded)}
          onAction={handleAction}
          onStatusChange={refreshAll}
          responsavelLabel={displayResponsible()}
          copilotActions={copilot?.next_actions || []}
          copilotActionsLoading={isCopilotLoading}
          onPickAction={(action) => {
            // Sprint B · W-01: click em next action preenche textarea
            // com template "{verb} {target}" pra atendente editar e enviar.
            setNewMessage(`${action.verb} ${action.target}`);
          }}
        />
      </div>

      {/* Modal de Confirmação Premium */}
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

      {/* Modal Nova Conversa Manual */}
      {isNewConvOpen && (
        <NewConversationModal
          onClose={() => setIsNewConvOpen(false)}
          onCreated={async (convId) => {
            setIsNewConvOpen(false);
            // Refresh lista + insights · busca a conversa nova
            await refreshAll();
            // Aguarda 1 tick pra state atualizar e seleciona
            setTimeout(() => {
              const found = conversations.find(c => c.conversation_id === convId);
              if (found) setSelectedConversation(found);
            }, 200);
          }}
        />
      )}
    </div>
  );
}
