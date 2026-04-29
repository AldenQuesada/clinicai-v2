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
    sendStatus,
    messagesEndRef,
  } = useMessages(selectedConversation?.conversation_id || null, { lastSseEventAtRef });

  // P-03/P-04: insights globais do clinic · independente do filtro ativo.
  // Substitui calculos filter() do array (que zeravam ao trocar de aba).
  const { insights, refresh: refreshInsights } = useInsights();

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
      setModalConfig({
        isOpen: true,
        title: 'Transferir para Dra. Mirian',
        description: 'Deseja transferir este lead para a Dra. Mirian? A inteligência artificial será pausada e o paciente será avisado automaticamente.',
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

          await sendMessage('Entendi! Vou encaminhar sua conversa para a Dra. Mirian. Ela vai entrar em contato com você em breve!');
          
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

  // P-03/P-04: KPIs vem do useInsights global · nao calculados do array filtrado
  const { urgentes, aguardando, laraAtiva, resolvidosHoje } = insights;

  return (
    <div className="flex flex-col h-full w-full bg-[hsl(var(--chat-bg))]">
      {/* Barra de Insights (Top Bar) */}
      <div className="h-16 border-b border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] flex items-center px-6 gap-8 shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${urgentes > 0 ? 'bg-[hsl(var(--danger))]/10 text-[hsl(var(--danger))]' : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Urgentes</p>
            <p className={`text-lg font-bold leading-none mt-0.5 ${urgentes > 0 ? 'text-[hsl(var(--danger))]' : 'text-[hsl(var(--foreground))]'}`}>{urgentes}</p>
          </div>
        </div>

        <div className="w-px h-8 bg-[hsl(var(--chat-border))]"></div>

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Aguardando Você</p>
            <p className="text-lg font-bold leading-none mt-0.5 text-[hsl(var(--foreground))]">{aguardando}</p>
          </div>
        </div>

        <div className="w-px h-8 bg-[hsl(var(--chat-border))]"></div>

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Lara Ativa</p>
            <p className="text-lg font-bold leading-none mt-0.5 text-[hsl(var(--foreground))]">{laraAtiva}</p>
          </div>
        </div>

        <div className="w-px h-8 bg-[hsl(var(--chat-border))]"></div>

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Resolvidos Hoje</p>
            <p className="text-lg font-bold leading-none mt-0.5 text-[hsl(var(--foreground))]">{resolvidosHoje}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
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
        />

        {/* 2. Coluna Central: Chat */}
        <MessageArea
          selectedConversation={selectedConversation}
          messages={messages}
          isLoadingMessages={isLoadingMessages}
          newMessage={newMessage}
          onNewMessageChange={setNewMessage}
          onSendMessage={handleSendMessage}
          sendStatus={sendStatus}
          messagesEndRef={messagesEndRef}
        />

        {/* 3. Coluna Direita: Informacoes e Controle de Pausa */}
        <LeadInfoPanel
          selectedConversation={selectedConversation}
          isExpanded={isLeadPanelExpanded}
          onToggleExpand={() => setIsLeadPanelExpanded(!isLeadPanelExpanded)}
          onAction={handleAction}
          onStatusChange={refreshAll}
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
