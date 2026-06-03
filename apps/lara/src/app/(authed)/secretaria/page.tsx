'use client';

/**
 * /secretaria · Mig 91 · Inbox dedicada da clinica (numero da secretaria).
 *
 * Difere de /conversas em:
 *   - useConversations({ inbox: 'secretaria' }) · so conversas de wa_numbers
 *     com inbox_role='secretaria' (inbound direto + handoffs).
 *   - LeadInfoPanel inboxRole='secretaria' · oculta AgentPauseSection,
 *     NextActions IA e botao Passar pra Secretaria (nao faz sentido aqui).
 *   - useCopilot (SmartReplies A · 2026-05-07) · 3 chips IA acima composer ·
 *     empilha com DoctorAnswerCard · cache server-side 10min · custo marginal.
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
import { ForwardModal } from '../conversas/components/ForwardModal';
import type { Message } from '../conversas/hooks/useMessages';
import { useConversations, updateTabTitle } from '../conversas/hooks/useConversations';
import { useMessages } from '../conversas/hooks/useMessages';
import { useClinicMembers } from '../conversas/hooks/useClinicMembers';
import { usePresence } from '../conversas/hooks/usePresence';
import { useKeyboardShortcuts } from '../conversas/hooks/useKeyboardShortcuts';
// SmartReplies A (2026-05-07) · expor sugestões IA também na secretaria ·
// reusa cache server-side (mig 85, 10min TTL) · zero endpoint novo · custo
// marginal porque secretaria troca conversa menos vezes que /conversas.
import { useCopilot } from '../conversas/hooks/useCopilot';
// Open from /logs (2026-05-08) · auto-seleciona conversa via
// ?conversationId=<uuid> · valida UUID · loadMore ate achar (cap 5).
import { useAutoSelectFromQuery } from '../conversas/hooks/useAutoSelectFromQuery';
// Patch SECRETARIA KPI A (2026-05-07) · counts reais via servidor pra topo
// da tela · resolve subestimação anterior (KPIs eram .filter().length em
// array paginado de 50 itens · auditoria 2026-05-07: 91 reais vs 50 mostrados).
import { useSecretariaKpis } from './hooks/useSecretariaKpis';
// P2 refactor (2026-06-03) · ações + KPI bar extraídos pra reduzir o page.tsx.
import { useSecretariaActions } from './hooks/useSecretariaActions';
import { SecretariaKpiBar, type KpiId } from './components/SecretariaKpiBar';
import { ALDEN_USER_ID, isDoctor } from '@/lib/clinic-profiles';
import {
  Search,
  RefreshCw,
  ArrowUpDown,
  Filter,
  CheckCircle,
  Archive,
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
    lastSseEventSeq,
  } = useConversations({ inbox: 'secretaria' });

  // Open from /logs (2026-05-08) · seleciona conversa via ?conversationId=<uuid>
  // ao montar a pagina · loadMore automatico ate achar (cap 5 paginas).
  // Side-effect-only · UI sem banner quando notFound (operadora ve /secretaria
  // normal · sem barulho · pode buscar manualmente).
  useAutoSelectFromQuery({
    conversations,
    selectedConversation,
    setSelectedConversation,
    hasMore,
    isLoadingMore,
    loadMore,
  });

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
  // 6 KPIs canônicos (KPI B 2026-05-07 · Onda 3 Alden 2026-05-08 ·
  // Mig 147 owner-normalization 2026-05-08 · view wa_conversations_operational_view):
  //   Todos | Secretaria | Mirian | Alden | Aguardando | Urgente
  // Default 'todos' pra Secretaria/outros · 'mirian' pra Mirian (effect abaixo).
  // KpiId 'secretaria' (mig 147 normalizou · luciana NAO eh mais alias).
  // KpiId vem de SecretariaKpiBar (não duplicar literal · P2 refactor).
  const [activeKpi, setActiveKpi] = useState<KpiId>('todos');
  const [didApplyRoleKpi, setDidApplyRoleKpi] = useState(false);
  // modalConfig + handleAction migraram pra useSecretariaActions (mais abaixo).

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
    // Mig 143 (2026-05-07) · quoted reply state · wired pra MessageArea
    // exibir botão Responder em /secretaria também (não só /conversas).
    replyTarget,
    setReplyTarget,
    // React A (2026-05-07) · reação emoji outbound
    reactToMessage,
  } = useMessages(selectedConversation?.conversation_id || null, { lastSseEventAtRef, lastSseEventSeq });

  // SmartReplies A (2026-05-07) · copilot IA também na secretaria · 3 chips
  // acima do composer (empilhado com DoctorAnswerCard, não substituído).
  // 1 fetch ao trocar conversa · cache server-side 10min em wa_conversations.
  // ai_copilot · zero token novo se conversa já tem cache fresco.
  // J3 opcao B (2026-05-08) · scope='smart_replies' · servidor gera apenas
  // smart_replies (summary + next_actions descartados pela UI da Secretaria,
  // que usa SecretariaSummary Haiku no header como fonte do TLDR). Cache full
  // do /conversas continua sendo lido (smart_replies do payload full sao
  // validos), mas /secretaria NAO escreve cache · evita poluir o jsonb.
  const {
    copilot: secretariaCopilot,
    isLoading: isSecretariaCopilotLoading,
    error: secretariaCopilotError,
    hasFetched: secretariaCopilotHasFetched,
    refresh: refreshSecretariaCopilot,
  } = useCopilot(selectedConversation?.conversation_id || null, {
    scope: 'smart_replies',
  });

  // Forward MVP A (2026-05-07) · msg-fonte do encaminhamento · null = modal fechado.
  const [forwardSourceMessage, setForwardSourceMessage] = useState<Message | null>(null);

  // Forward (2026-05-07) · POST direto pra conv destino · 3 modos: texto,
  // contato com payload, OU imagem via forward_from_message_id (Onda D1 ·
  // server resolve original). Backend valida tudo upstream.
  const handleForwardToConversation = async (
    targetConversationId: string,
    body: { content?: string; payload?: unknown; forward_from_message_id?: string },
  ): Promise<boolean> => {
    if (!body.content && !body.forward_from_message_id) return false;
    try {
      const res = await fetch(`/api/conversations/${targetConversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

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
  //   Secretaria: operational_owner === 'secretaria' (mig 147 · default bucket)
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

  // Mig 147 (2026-05-08) · bucket default da Secretaria · operational_owner
  // ='secretaria' direto. NUNCA mais via is_luciana/operational_owner='luciana'
  // · view normalizada (Luciana so eh owner se realmente atribuida).
  const isSecretariaConv = (c: typeof conversations[number]) =>
    c.operational_owner === 'secretaria';

  // Onda 3 (2026-05-06) · Alden via operational_owner='alden' (mig 146 ·
  // UUID na view). NUNCA por LIKE de nome. Fallback: assigned_to===ALDEN_ID
  // pra rows velhas que ainda nao tem operational_owner (cache pre-mig).
  const isAldenConv = (c: typeof conversations[number]) =>
    c.operational_owner === 'alden' || c.assigned_to === ALDEN_USER_ID;

  const isUrgenteConv = (c: typeof conversations[number]) =>
    c.is_urgente === true ||
    (typeof c.op_response_color === 'string' &&
      ['vermelho', 'critico'].includes(c.op_response_color));

  // Patch SECRETARIA KPI A (2026-05-07) · counts reais via /api/secretaria/
  // kpis · 5 COUNT(*) na wa_conversations_operational_view. Antes: contagem
  // local subestimava porque conversations vem paginado em PAGE_SIZE=50.
  const { kpis: serverKpis, hasFetched: kpisHasFetched, isError: kpisError } = useSecretariaKpis();

  // Fallback local · usado SO ate o primeiro fetch terminar (kpisHasFetched=
  // false) ou se endpoint quebrar de vez (mantem ultimo valor server e cai
  // pra contagem local nao-paginada quando primeiro tick falha).
  const todosLocal = conversations.filter(isOperational).length;
  const secretariaLocal = conversations.filter(
    (c) => isOperational(c) && isSecretariaConv(c),
  ).length;
  const mirianLocal = conversations.filter(
    (c) => isOperational(c) && isMirianConv(c),
  ).length;
  const aldenLocal = conversations.filter(
    (c) => isOperational(c) && isAldenConv(c),
  ).length;
  const aguardandoLocal = conversations.filter(
    (c) => isOperational(c) && c.is_aguardando === true,
  ).length;
  const urgenteLocal = conversations.filter(
    (c) => isOperational(c) && isUrgenteConv(c),
  ).length;

  const todosCount = kpisHasFetched ? serverKpis.total : todosLocal;
  const secretariaCount = kpisHasFetched ? serverKpis.secretaria : secretariaLocal;
  const mirianCount = kpisHasFetched ? serverKpis.mirian : mirianLocal;
  const aldenCount = kpisHasFetched ? serverKpis.alden : aldenLocal;
  const aguardandoCount = kpisHasFetched ? serverKpis.aguardando : aguardandoLocal;
  const urgenteCount = kpisHasFetched ? serverKpis.urgente : urgenteLocal;

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
    : activeKpi === 'alden' ? 'Alden'
    : activeKpi === 'secretaria' ? 'Secretaria'
    : 'Todas';

  // Filtro local · garante que lista visível bata com o count quando a tab
  // não é 1:1 (ex: 'mirian' usa tab 'Dra' que filtra por is_dra).
  const filteredConversations =
    activeKpi === 'mirian'
      ? conversations.filter((c) => isOperational(c) && isMirianConv(c))
      : activeKpi === 'secretaria'
      ? conversations.filter((c) => isOperational(c) && isSecretariaConv(c))
      : activeKpi === 'alden'
      ? conversations.filter((c) => isOperational(c) && isAldenConv(c))
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

  // P2 refactor (2026-06-03) · ações operacionais + modal extraídos pra
  // useSecretariaActions (encapsula handleAction, a validação de response do
  // Prompt 1 e o estado do modal · hook puro, sem JSX). page.tsx fica mais fino.
  const { modalConfig, setModalConfig, handleAction, isModalOpen } =
    useSecretariaActions({
      selectedConversation,
      setSelectedConversation,
      sendMessage,
    });
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

        {/* ZONA CENTRAL · 6 KPIs canônicos · extraído pra SecretariaKpiBar
            (P2 refactor 2026-06-03) · view operacional como SoT · labels,
            grupos, divisores e realce do Urgente preservados 1:1. A computação
            server/fallback-local dos counts fica aqui (usa os mesmos helpers
            de filtro da lista). kpisError mostra indicador discreto na barra. */}
        <SecretariaKpiBar
          activeKpi={activeKpi}
          setActiveKpi={setActiveKpi}
          counts={{
            todos: todosCount,
            secretaria: secretariaCount,
            mirian: mirianCount,
            alden: aldenCount,
            aguardando: aguardandoCount,
            urgente: urgenteCount,
          }}
          kpisError={kpisError}
        />

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
            else if (tab === 'Alden') setActiveKpi('alden');
            else if (tab === 'Secretaria') setActiveKpi('secretaria');
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
          copilotSummaryLoading={isSecretariaCopilotLoading}
          copilotSummaryError={secretariaCopilotError}
          copilotGeneratedAt=""
          copilotCached={false}
          copilotSmartReplies={secretariaCopilot?.smart_replies || []}
          onRefreshCopilot={() => refreshSecretariaCopilot(true)}
          copilotHasFetched={secretariaCopilotHasFetched}
          onSendInternalNote={sendInternalNote}
          replyTarget={replyTarget}
          onSetReplyTarget={setReplyTarget}
          onForwardMessage={setForwardSourceMessage}
          onReactMessage={reactToMessage}
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
          conversationId={selectedConversation.conversation_id ?? ''}
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

      {/* Forward MVP A · modal de encaminhar mensagem · só texto */}
      {forwardSourceMessage && (
        <ForwardModal
          message={forwardSourceMessage}
          conversations={conversations}
          sourceConversationId={selectedConversation?.conversation_id ?? null}
          onClose={() => setForwardSourceMessage(null)}
          onConfirmForward={handleForwardToConversation}
        />
      )}
    </div>
  );
}
