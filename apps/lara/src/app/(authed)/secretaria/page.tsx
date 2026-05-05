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
import { DOCTOR_USER_ID, isDoctor, isAssignedToDoctor } from '@/lib/clinic-profiles';
import {
  isReturnPending,
  isReturnCritical,
  minutesSince,
} from '../conversas/lib/returnPromises';
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
  // 5 KPIs operacionais (Alden 2026-05-05 · removidos Abertas+Resolvidas):
  //   Todos | Aguardando | Retorno | Urgente | Dra
  // Default 'todos' pra Luciana/outros · 'dra' pra Mirian (efeito abaixo).
  type KpiId = 'todos' | 'aguardando' | 'retorno' | 'urgente' | 'dra';
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
  // 5 KPIs operacionais · filas humanas reais · derivados local (zero fetch)
  // ─────────────────────────────────────────────────────────────────────
  //
  // Critérios canônicos (Alden 2026-05-05):
  //
  //   Todos:      status IN ('active','paused')
  //   Aguardando: waiting_human_response = true E !atribuída-à-Dra
  //               (server-side · single source of truth · sla.ts)
  //   Retorno:    promessa pendente (PROMISE_RE) E !atribuída-à-Dra
  //               (lib/returnPromises.ts · single source of truth)
  //   Urgente:    qualquer alerta vermelho/crítico em qualquer fila
  //               (a) Aguardando crítico (response_color ≥ vermelho)
  //               (b) Retorno crítico (≥ 7min sem resposta humana)
  //               (c) Dra crítica (≥ 15min desde assigned_at)
  //   Dra:        assigned_to = DOCTOR_USER_ID E status active/paused
  //
  // c.is_urgent (tag-based legacy) NÃO é mais critério · pode aparecer como
  // pill na conv mas não governa o KPI Urgente.

  const isOperational = (c: typeof conversations[number]) =>
    c.status === 'active' || c.status === 'paused';

  const isNotDoctor = (c: typeof conversations[number]) =>
    !isAssignedToDoctor(c.assigned_to ?? null);

  const isUrgenteAggregate = (c: typeof conversations[number]): boolean => {
    if (!isOperational(c)) return false;
    const isDra = isAssignedToDoctor(c.assigned_to ?? null);
    // (a) Aguardando crítico
    if (
      !isDra &&
      c.waiting_human_response &&
      ['vermelho', 'critico', 'atrasado_fixo', 'antigo_parado'].includes(
        c.response_color,
      )
    ) {
      return true;
    }
    // (b) Retorno crítico
    if (!isDra && isReturnCritical(c)) return true;
    // (c) Dra crítica (≥ 15min desde assigned_at · onset 'critico' do SLA Dra)
    if (isDra && c.assigned_at && minutesSince(c.assigned_at) >= 15) return true;
    return false;
  };

  const todosCount = conversations.filter(isOperational).length;
  const aguardandoCount = conversations.filter(
    (c) => isOperational(c) && c.waiting_human_response && isNotDoctor(c),
  ).length;
  const retornoCount = conversations.filter(
    (c) => isOperational(c) && isNotDoctor(c) && isReturnPending(c),
  ).length;
  const urgenteCount = conversations.filter(isUrgenteAggregate).length;
  const draCount = conversations.filter(
    (c) => isAssignedToDoctor(c.assigned_to ?? null) && isOperational(c),
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

  const activeTab =
    activeKpi === 'aguardando' ? 'Aguardando'
    : activeKpi === 'retorno' ? 'Retorno'
    : activeKpi === 'dra' ? 'Dra'
    : 'Todas';

  // Filtro local · KPI agregado (urgente) ou KPIs específicos (retorno, dra)
  // garantem que a lista visível bata com o count, indep. da tab que a
  // ConversationList já aplica.
  const filteredConversations =
    activeKpi === 'dra'
      ? conversations.filter(
          (c) =>
            isAssignedToDoctor(c.assigned_to ?? null) &&
            (c.status === 'active' || c.status === 'paused'),
        )
      : activeKpi === 'retorno'
      ? conversations.filter(
          (c) => isOperational(c) && isNotDoctor(c) && isReturnPending(c),
        )
      : activeKpi === 'urgente'
      ? conversations.filter(isUrgenteAggregate)
      : conversations;

  // Override defaults pra perfil sénior · onlyWhenHidden=false · idempotente
  // (não sobrescreve se user já mexeu nas prefs)
  useEffect(() => {
    ensureRoleDefaults('secretaria');
  }, []);

  // Default KPI por usuário · Mirian (DOCTOR_USER_ID) entra com KPI 'dra' já
  // ativo · demais usuários (Luciana etc) ficam no 'aguardando' default.
  // Aplicado uma vez quando `me` resolve (usuário pode trocar de KPI depois
  // sem ser sobrescrito).
  useEffect(() => {
    if (didApplyRoleKpi || !me) return;
    if (isDoctor(me)) setActiveKpi('dra');
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

        {/* ZONA CENTRAL · 5 KPIs CLICAVEIS numa linha · filas humanas reais
            ESCOPO: Todos (visão geral · sem arquivadas)
            FILA:   Aguardando · Retorno · Urgente · Dra
            Removidos Abertas/Resolvidas (Alden 2026-05-05). */}
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
                title: 'Todas as conversas operacionais (active + paused)',
                group: 'escopo' as const,
              },
              // ── Grupo FILA (colorido) ──
              {
                id: 'aguardando' as const,
                icon: Clock,
                label: 'Aguardando',
                value: aguardandoCount,
                color: 'warning',
                title: 'Paciente esperando resposta humana · fila pra Luciana cuidar',
                group: 'fila' as const,
              },
              {
                id: 'retorno' as const,
                icon: CircleDot,
                label: 'Retorno',
                value: retornoCount,
                color: 'accent',
                title:
                  'Promessa de retorno pendente · "vou verificar / te retorno" sem mensagem nova',
                group: 'fila' as const,
              },
              {
                id: 'urgente' as const,
                icon: AlertCircle,
                label: 'Urgente',
                value: urgenteCount,
                color: 'destructive',
                title:
                  'Alerta crítico em qualquer fila · Aguardando ≥7min · Retorno ≥7min · Dra ≥15min',
                group: 'fila' as const,
              },
              {
                id: 'dra' as const,
                icon: Stethoscope,
                label: 'Dra',
                value: draCount,
                color: 'accent',
                title: 'Conversas transferidas pra Dra Mirian (assigned_to)',
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
            // Guard · simplifiedTabs nao expoe sub-filtros, mas mantém sync.
            // Nova matriz de KPIs (Alden 2026-05-05): Todos · Aguardando ·
            // Retorno · Urgente · Dra (Abertas/Resolvidas removidos).
            if (tab === 'Aguardando') setActiveKpi('aguardando');
            else if (tab === 'Retorno') setActiveKpi('retorno');
            else if (tab === 'Urgentes') setActiveKpi('urgente');
            else if (tab === 'Dra') setActiveKpi('dra');
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
