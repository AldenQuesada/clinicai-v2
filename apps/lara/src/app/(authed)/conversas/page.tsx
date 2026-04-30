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
import { AlertCircle, Clock, MessageCircle, CheckCircle2 } from 'lucide-react';

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

  const [isLeadPanelExpanded, setIsLeadPanelExpanded] = useState(true);
  const [isNewConvOpen, setIsNewConvOpen] = useState(false);
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
  const { urgentes, aguardando, laraAtiva, resolvidosHoje } = insights;

  return (
    <div className="flex flex-col h-full w-full bg-[hsl(var(--chat-bg))]">
      {/* Barra de Insights (Top Bar) · KPIs distribuidos · ocupa largura toda */}
      <div className="h-16 border-b border-white/[0.06] bg-[hsl(var(--chat-panel-bg))] flex items-center px-8 shrink-0 z-10">
        <div className="flex items-center justify-between w-full max-w-[1100px] mx-auto">
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-md ${urgentes > 0 ? 'bg-[hsl(var(--danger))]/10 text-[hsl(var(--danger))]' : 'bg-white/[0.03] text-[hsl(var(--muted-foreground))]'}`}>
              <AlertCircle className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[9px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em]">Urgentes</p>
              <p className={`font-display text-2xl leading-none mt-0.5 tabular-nums ${urgentes > 0 ? 'text-[hsl(var(--danger))]' : 'text-[hsl(var(--foreground))]'}`}>{urgentes}</p>
            </div>
          </div>


          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-md bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]">
              <Clock className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[9px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em]">Aguardando você</p>
              <p className="font-display text-2xl leading-none mt-0.5 tabular-nums text-[hsl(var(--foreground))]">{aguardando}</p>
            </div>
          </div>


          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-md bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
              <MessageCircle className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[9px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em]">Lara ativa</p>
              <p className="font-display text-2xl leading-none mt-0.5 tabular-nums text-[hsl(var(--foreground))]">{laraAtiva}</p>
            </div>
          </div>


          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-md bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">
              <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[9px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em]">Resolvidos hoje</p>
              <p className="font-display text-2xl leading-none mt-0.5 tabular-nums text-[hsl(var(--foreground))]">{resolvidosHoje}</p>
            </div>
          </div>
        </div>
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
          onNewConversation={() => setIsNewConvOpen(true)}
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
