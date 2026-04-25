import { UserCircle, Calendar, Tag, ShieldAlert, UserPlus, CheckCircle, Archive, Stethoscope, ExternalLink, CalendarPlus } from 'lucide-react';
import type { Conversation } from '../hooks/useConversations';
import { AgentPauseSection } from './AgentPauseSection';

// URL do painel CRM legacy (clinic-dashboard) · usado pra abrir lead/agenda em nova aba
const PAINEL_URL = process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br';

interface LeadInfoPanelProps {
  selectedConversation: Conversation | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAction?: (action: 'assume' | 'resolve' | 'archive' | 'transfer') => void;
  onStatusChange?: () => void;
}

export function LeadInfoPanel({
  selectedConversation,
  isExpanded,
  onToggleExpand,
  onAction,
  onStatusChange
}: LeadInfoPanelProps) {
  if (!isExpanded) {
    return (
      <div 
        onClick={onToggleExpand}
        className="w-14 border-l border-[hsl(var(--chat-border))] flex flex-col items-center py-4 cursor-pointer bg-[hsl(var(--chat-panel-bg))] hover:bg-[hsl(var(--chat-bg))] transition-colors"
      >
        <UserCircle className="w-6 h-6 text-gray-400" />
      </div>
    );
  }

  if (!selectedConversation) {
    return (
      <div className="w-80 border-l border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]">
        <div className="h-[72px] border-b border-[hsl(var(--chat-border))] flex items-center px-4 justify-between">
          <span className="text-sm font-medium">Detalhes</span>
          <button onClick={onToggleExpand} className="text-gray-400 hover:text-gray-200 cursor-pointer">×</button>
        </div>
      </div>
    );
  }

  const queixas = selectedConversation.queixas || [];

  return (
    <div className="w-80 border-l border-[hsl(var(--chat-border))] flex flex-col bg-[hsl(var(--chat-panel-bg))] h-full">
      <div className="h-[72px] border-b border-[hsl(var(--chat-border))] flex items-center px-4 justify-between shrink-0">
        <span className="text-sm font-medium">Perfil do Lead</span>
        <button onClick={onToggleExpand} className="text-gray-400 hover:text-gray-200 text-lg cursor-pointer">×</button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 flex flex-col items-center border-b border-[hsl(var(--chat-border))]">
          <UserCircle className="h-20 w-20 text-gray-400 mb-4" />
          <h3 className="font-semibold text-lg">{selectedConversation.lead_name}</h3>
          <p className="text-sm text-gray-400">{selectedConversation.phone}</p>
        </div>

        {/* Action Buttons Bar */}
        <div className="flex items-center justify-center gap-4 py-4 border-b border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))]">
          <button onClick={() => onAction?.('assume')} title="Assumir Conversa" className="p-2 rounded-full bg-[hsl(var(--chat-panel-bg))] text-gray-400 hover:text-white hover:bg-blue-600 transition-colors cursor-pointer">
            <UserPlus className="w-5 h-5" />
          </button>
          <button onClick={() => onAction?.('resolve')} title="Resolver" className="p-2 rounded-full bg-[hsl(var(--chat-panel-bg))] text-gray-400 hover:text-white hover:bg-green-600 transition-colors cursor-pointer">
            <CheckCircle className="w-5 h-5" />
          </button>
          <button onClick={() => onAction?.('archive')} title="Arquivar" className="p-2 rounded-full bg-[hsl(var(--chat-panel-bg))] text-gray-400 hover:text-white hover:bg-yellow-600 transition-colors cursor-pointer">
            <Archive className="w-5 h-5" />
          </button>
          <button onClick={() => onAction?.('transfer')} title="Transferir para Dra. Mirian" className="p-2 rounded-full bg-[hsl(var(--chat-panel-bg))] text-gray-400 hover:text-white hover:bg-purple-600 transition-colors cursor-pointer">
            <Stethoscope className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Tags / Pipeline Data */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3">
              <Calendar className="w-3 h-3" /> Etapa Atual
            </h4>
            <div className="bg-[hsl(var(--chat-bg))] rounded-lg p-3 text-sm border border-[hsl(var(--chat-border))]">
              <p><span className="text-gray-400">Fase:</span> {selectedConversation.phase || 'Neutro'}</p>
              <p className="mt-1">
                <span className="text-gray-400">Funil:</span> {
                  (() => {
                    const f = (selectedConversation.funnel || '').toLowerCase();
                    if (f.includes('olheira')) return 'Olheiras (Smooth Eyes)';
                    if (f.includes('full')) return 'Full Face (Lifting 5D)';
                    if (f.includes('procedimento')) return 'Procedimentos Gerais';
                    return selectedConversation.funnel || 'Geral';
                  })()
                }
              </p>
              <p className="mt-1"><span className="text-gray-400">Score Quiz:</span> {selectedConversation.lead_score} pts</p>
            </div>
          </div>

          {/* Tags Section */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3">
              <Tag className="w-3 h-3" /> Tags do Lead
            </h4>
            <div className="flex flex-wrap gap-2">
              {selectedConversation.tags && selectedConversation.tags.length > 0 ? (
                selectedConversation.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-1 bg-gray-500/10 text-gray-400 text-[10px] rounded border border-gray-500/20">
                    {tag}
                  </span>
                ))
              ) : (
                <p className="text-xs text-gray-500">Nenhuma tag atribuída.</p>
              )}
            </div>
          </div>

          <div>
             <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2 mb-3">
              <ShieldAlert className="w-3 h-3" /> Queixas Detectadas
            </h4>
            <div className="flex flex-wrap gap-2">
              {queixas.length > 0 ? queixas.map((q: string, i: number) => (
                <span key={i} className="px-2 py-1 bg-purple-500/10 text-purple-400 text-xs rounded-md border border-purple-500/20">
                  {q}
                </span>
              )) : (
                <p className="text-xs text-gray-500">Nenhuma queixa analisada ainda.</p>
              )}
            </div>
          </div>

          {/* Atalhos pro painel CRM legacy · abre em nova aba */}
          <div className="pt-2 border-t border-[hsl(var(--chat-border))] space-y-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Atalhos
            </h4>
            {selectedConversation.lead_id && (
              <a
                href={`${PAINEL_URL}/index.html?page=leads&lead=${selectedConversation.lead_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-xs bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] transition-colors group"
              >
                <span className="flex items-center gap-2">
                  <UserCircle className="w-4 h-4" />
                  Ver lead no CRM
                </span>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            )}
            <a
              href={`${PAINEL_URL}/index.html?page=agenda&phone=${selectedConversation.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between px-3 py-2 rounded-md text-xs bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))] transition-colors group"
            >
              <span className="flex items-center gap-2">
                <CalendarPlus className="w-4 h-4" />
                Abrir agenda
              </span>
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          </div>
        </div>
      </div>

      {/* Agent Pause Section at the bottom */}
      <AgentPauseSection 
        key={`${selectedConversation.conversation_id}-${selectedConversation.ai_paused_until}`}
        conversationId={selectedConversation.conversation_id} 
        onStatusChange={onStatusChange}
      />
    </div>
  );
}
