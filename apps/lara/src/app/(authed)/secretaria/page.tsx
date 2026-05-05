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
import { DOCTOR_USER_ID, isDoctor } from '@/lib/clinic-profiles';
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
  // 5 KPIs canônicos (Alden 2026-05-05 · view wa_conversations_operational_view):
  //   Todos | Luciana | Mirian | Aguardando | Urgente
  // Default 'todos' pra Luciana/outros · 'mirian' pra Mirian (efeito abaixo).
  // Removidos: Retorno (sem estrutura no DB · regex frágil), Abertas/Resolvidas.
  type KpiId = 'todos' | 'luciana' | 'mirian' | 'aguardando' | 'urgente';
  const [activeKpi, setActiveKpi] = useState<KpiId>('todos');
  const [didApplyRoleKpi, setDidApplyRoleKpi] = useState(false);
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
  // 5 KPIs canônicos · view wa_conversations_operational_view é SoT
  // ─────────────────────────────────────────────────────────────────────
  //
  // Modelo (Alden 2026-05-05): apenas 2 donos operacionais neste dashboard.
  //
  //   Todos:      todas as conversas active+paused do dashboard
  //   Luciana:    operational_owner === 'luciana' OU is_luciana === true
  //   Mirian:     operational_owner === 'mirian'  OU is_dra === true
  //   Aguardando: is_aguardando (já exclui Mirian na view)
  //   Urgente:    is_urgente OU op_response_color ∈ {vermelho, critico}
  //
  // VOCÊ e MIRA não governam nada · view força is_voce/is_mira = false.
  // LARA aparece só como pill de estado da IA (não fila).

  const isOperational = (c: typeof conversations[number]) =>
    c.status === 'active' || c.status === 'paused';

  const isMirianConv = (c: typeof conversations[number]) =>
    c.is_dra === true || c.operational_owner === 'mirian';

  const isLucianaConv = (c: typeof conversations[number]) =>
    c.is_luciana === true || c.operational_owner === 'luciana';

  const isUrgenteConv = (c: typeof conversations[number]) =>
    c.is_urgente === true ||
    (typeof c.op_response_color === 'string' &&
      ['vermelho', 'critico'].includes(c.op_response_color));

  const todosCount = conversations.filter(isOperational).length;
  const lucianaCount = conversations.filter(
    (c) => isOperational(c) && isLucianaConv(c),
  ).length;
  const mirianCount = conversations.filter(
    (c) => isOperational(c) && isMirianConv(c),
  ).length;
  const aguardandoCount = conversations.filter(
    (c) => isOperational(c) && c.is_aguardando === true,
  ).length;
  const urgenteCount = conversations.filter(
    (c) => isOperational(c) && isUrgenteConv(c),
  ).length;

  // Tab title mostra urgentes como sinal mais forte de pendencia
  useEffect(() => {
    updateTabTitle(urgenteCount);
  }, [urgenteCount]);

  // ─────────────────────────────────────────────────────────────────────
  // Mapping KPI → ConversationList (statusFilter + activeTab + filtro local)
  // ─────────────────────────────────────────────────────────────────────
  //
  //   todos       → statusFilter='active' · activeTab='Todas'
  //   aguardando  → statusFilter='active' · activeTab='Aguardando'
  //   retorno     → statusFilter='active' · activeTab='Retorno' + filtro local
  //   urgente     → statusFilter='active' · activeTab='Todas' + filtro local
  //   dra         → statusFilter='active' · activeTab='Dra' + filtro local
  //
  // Filtros locais redundantes com activeTab são aplicados em
  // `filteredConversations` antes de mandar pra ConversationList · garante
  // que counts batam com lista visível mesmo se a tab não conseguir filtrar
  // sozinha (caso de Urgente agregado, que mistura Aguardando+Retorno+Dra).
  useEffect(() => {
    setStatusFilter('active');
  }, [activeKpi, setStatusFilter]);

  // Mapping KPI → activeTab (consumido pela ConversationList).
  const activeTab =
    activeKpi === 'aguardando' ? 'Aguardando'
    : activeKpi === 'urgente' ? 'Urgentes'
    : activeKpi === 'mirian' ? 'Dra'
    : activeKpi === 'luciana' ? 'Luciana'
    : 'Todas';

  // Filtro local · garante que lista visível bata com o count quando a tab
  // não é 1:1 (ex: 'mirian' usa tab 'Dra' que filtra por is_dra).
  const filteredConversations =
    activeKpi === 'mirian'
      ? conversations.filter((c) => isOperational(c) && isMirianConv(c))
      : activeKpi === 'luciana'
      ? conversations.filter((c) => isOperational(c) && isLucianaConv(c))
      : activeKpi === 'urgente'
      ? conversations.filter((c) => isOperational(c) && isUrgenteConv(c))
      : conversations;

  // Override defaults pra perfil sénior · onlyWhenHidden=false · idempotente
  // (não sobrescreve se user já mexeu nas prefs)
  useEffect(() => {
    ensureRoleDefaults('secretaria');
  }, []);

  // Default KPI por usuário · Mirian (DOCTOR_USER_ID) entra com KPI 'mirian'
  // já ativo · demais usuários (Luciana etc) ficam no 'todos' default.
  // Aplicado uma vez quando `me` resolve (usuário pode trocar de KPI depois
  // sem ser sobrescrito).
  useEffect(() => {
    if (didApplyRoleKpi || !me) return;
    if (isDoctor(me)) setActiveKpi('mirian');
    setDidApplyRoleKpi(true);
  }, [me, didApplyRoleKpi]);

  useEffect(() => {
    if (selectedConversation?.conversation_id) {
      setIsLeadPanelExpanded(true);
    } else {
      setIsLeadPanelExpanded(false);
    }
  }, [selectedConversation?.conversation_id]);

  const handleAction = async (
    action: 'assume' | 'resolve' | 'archive' | 'transfer' | 'devolver',
  ) => {
    if (!selectedConversation?.conversation_id) return;
    const cid = selectedConversation.conversation_id;

    if (action === 'resolve') {
      // 'resolved' fora do CHECK · usa 'archived' (mesmo path do botão Arquivar).
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
            body: JSON.stringify({ status: 'archived' }),
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
    } else if (action === 'transfer') {
      // Transferir para Dra (Caminho A · Alden 2026-05-05)
      // Pausa Lara via /assume + atribui à Mirian via /assign + msg auto.
      setModalConfig({
        isOpen: true,
        title: 'Transferir para Dra. Mirian',
        description:
          'Deseja transferir esta conversa para a Dra. Mirian? A conversa vai pra fila Dra · paciente é avisado.',
        confirmText: 'Transferir',
        onConfirm: async () => {
          await fetch(`/api/conversations/${cid}/assume`, { method: 'POST' });
          const assignRes = await fetch(`/api/conversations/${cid}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: DOCTOR_USER_ID }),
          });
          const assignData = await assignRes.json().catch(() => ({}));
          await sendMessage(
            'Vou encaminhar para a Dra. Mirian avaliar com carinho e já te retorno.',
          );
          setSelectedConversation((prev) =>
            prev
              ? {
                  ...prev,
                  ai_enabled: false,
                  assigned_to: DOCTOR_USER_ID,
                  assigned_at: assignData?.assigned_at || new Date().toISOString(),
                }
              : prev,
          );
          setModalConfig(null);
        },
      });
    } else if (action === 'devolver') {
      // Devolver para Secretária · DELETE /assign limpa assigned_to.
      setModalConfig({
        isOpen: true,
        title: 'Devolver para Secretária',
        description: 'Deseja devolver essa conversa para a fila da Secretária?',
        confirmText: 'Devolver',
        onConfirm: async () => {
          await fetch(`/api/conversations/${cid}/assign`, { method: 'DELETE' });
          setSelectedConversation((prev) =>
            prev ? { ...prev, assigned_to: null, assigned_at: null } : prev,
          );
          setModalConfig(null);
        },
      });
    }
    // 'assume' nao faz sentido na inbox secretaria (ja e humano)
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

        {/* ZONA CENTRAL · 5 KPIs CANÔNICOS · view operacional como SoT
            ESCOPO: Todos (visão geral)
            DONOS:  Luciana · Mirian (canônicos · únicos donos operacionais)
            FILA:   Aguardando · Urgente
            Removidos: Retorno (sem estrutura), Abertas/Resolvidas (legacy). */}
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
                title: 'Todas as conversas operacionais (Luciana + Mirian)',
                group: 'escopo' as const,
              },
              // ── Grupo DONO (canônico) ──
              {
                id: 'luciana' as const,
                icon: CircleDot,
                label: 'Luciana',
                value: lucianaCount,
                color: 'primary',
                title: 'Conversas operacionais da Secretaria (default · não atribuídas à Dra)',
                group: 'dono' as const,
              },
              {
                id: 'mirian' as const,
                icon: Stethoscope,
                label: 'Mirian',
                value: mirianCount,
                color: 'accent',
                title: 'Conversas transferidas pra Dra Mirian (assigned_to)',
                group: 'dono' as const,
              },
              // ── Grupo FILA (colorido) ──
              {
                id: 'aguardando' as const,
                icon: Clock,
                label: 'Aguardando',
                value: aguardandoCount,
                color: 'warning',
                title: 'Paciente esperando resposta humana · view canônica',
                group: 'fila' as const,
              },
              {
                id: 'urgente' as const,
                icon: AlertCircle,
                label: 'Urgente',
                value: urgenteCount,
                color: 'destructive',
                title: 'Alerta crítico · is_urgente da view (>5min sem resposta humana)',
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
            // Mapping canônico (Alden 2026-05-05 · view operacional):
            // Todos · Luciana · Mirian (Dra) · Aguardando · Urgente.
            if (tab === 'Aguardando') setActiveKpi('aguardando');
            else if (tab === 'Urgentes') setActiveKpi('urgente');
            else if (tab === 'Dra') setActiveKpi('mirian');
            else if (tab === 'Luciana') setActiveKpi('luciana');
            else setActiveKpi('todos');
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
