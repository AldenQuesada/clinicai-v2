import { UserCircle, Calendar, Tag, ShieldAlert, UserPlus, CheckCircle, Archive, Stethoscope, ExternalLink, CalendarPlus } from 'lucide-react';
import type { Conversation } from '../hooks/useConversations';
import { AgentPauseSection } from './AgentPauseSection';
import { PipelineBar } from './PipelineBar';
import { TimelineSection } from './TimelineSection';
import { NextActions } from './NextActions';

// URL do painel CRM legacy (clinic-dashboard) · usado pra abrir lead/agenda em nova aba
const PAINEL_URL = process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br';

/**
 * P-14 · Badge visual do score do quiz.
 * Buckets: 0-30 frio (gray), 31-60 morno (amber), 61-100 quente (champagne).
 * Render: pill com dot colorido + label uppercase + numero.
 */
function LeadScoreBadge({ score }: { score: number | null | undefined }) {
  const safeScore = typeof score === 'number' && !isNaN(score) ? Math.max(0, Math.min(100, score)) : 0;

  let color: string;
  let label: string;
  if (safeScore <= 30) {
    color = '#6B7280';
    label = 'Frio';
  } else if (safeScore <= 60) {
    color = '#F59E0B';
    label = 'Morno';
  } else {
    color = '#C9A96E';
    label = 'Quente';
  }

  return (
    <span
      title="Score do quiz · 0-30 frio · 31-60 morno · 61-100 quente"
      className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full text-[9.5px] font-semibold uppercase tracking-[0.15em] border"
      style={{
        color,
        borderColor: `${color}33`,
        backgroundColor: `${color}14`,
      }}
    >
      <span
        className="inline-block w-1 h-1 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
      <span className="text-[hsl(var(--muted-foreground))] font-normal normal-case opacity-50">·</span>
      <span style={{ color }} className="tabular-nums">{safeScore}</span>
    </span>
  );
}

interface NextActionItem {
  verb: string;
  target: string;
  rationale: string;
}

interface LeadInfoPanelProps {
  selectedConversation: Conversation | null;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onAction?: (action: 'assume' | 'resolve' | 'archive' | 'transfer') => void;
  onStatusChange?: () => void;
  /** P-08: nome dinamico da responsavel (ex: "Dra. Mirian", "a doutora") */
  responsavelLabel?: string;
  /** Sprint B · W-01: 3 acoes sugeridas pelo copiloto AI */
  copilotActions?: NextActionItem[];
  copilotActionsLoading?: boolean;
  onPickAction?: (action: NextActionItem) => void;
}

export function LeadInfoPanel({
  selectedConversation,
  isExpanded,
  onToggleExpand,
  onAction,
  onStatusChange,
  responsavelLabel = 'a doutora',
  copilotActions = [],
  copilotActionsLoading = false,
  onPickAction,
}: LeadInfoPanelProps) {
  if (!isExpanded) {
    return (
      <div
        onClick={onToggleExpand}
        className="w-14 border-l border-[hsl(var(--chat-border))] flex flex-col items-center py-4 cursor-pointer bg-[hsl(var(--chat-panel-bg))] hover:bg-[hsl(var(--chat-bg))] transition-colors"
      >
        <UserCircle className="w-6 h-6 text-[hsl(var(--muted-foreground))]" />
      </div>
    );
  }

  if (!selectedConversation) {
    return (
      <div className="w-80 border-l border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]">
        <div className="h-[72px] border-b border-[hsl(var(--chat-border))] flex items-center px-4 justify-between">
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">Detalhes</span>
          <button onClick={onToggleExpand} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] cursor-pointer">×</button>
        </div>
      </div>
    );
  }

  const queixas = selectedConversation.queixas || [];

  return (
    <div className="w-80 border-l border-white/[0.06] flex flex-col bg-[hsl(var(--chat-panel-bg))] h-full">
      <div className="h-16 border-b border-white/[0.06] flex items-center px-5 justify-between shrink-0">
        <span className="font-display text-[16px] text-[hsl(var(--foreground))]">Perfil do <em className="text-[hsl(var(--primary))] not-italic font-display italic">lead</em></span>
        <button onClick={onToggleExpand} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] text-lg cursor-pointer leading-none w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.04]">×</button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-6 flex flex-col items-center border-b border-white/[0.06]">
          <UserCircle className="h-16 w-16 text-[hsl(var(--muted-foreground))] mb-3" strokeWidth={1.25} />
          <h3 className="font-display text-[19px] text-[hsl(var(--foreground))] leading-tight text-center">{selectedConversation.lead_name}</h3>
          <p className="text-[11px] text-[hsl(var(--muted-foreground))] tabular-nums font-mono opacity-70 mt-1">{selectedConversation.phone}</p>
        </div>

        {/* Action Buttons Bar · cores semanticas · linhas finas */}
        <div className="flex items-center justify-center gap-3 py-3.5 border-b border-white/[0.06] bg-white/[0.015]">
          <button onClick={() => onAction?.('assume')} title="Assumir Conversa" className="p-2 rounded-full bg-white/[0.03] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary-foreground))] hover:bg-[hsl(var(--primary))] transition-colors cursor-pointer">
            <UserPlus className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <button onClick={() => onAction?.('resolve')} title="Resolver" className="p-2 rounded-full bg-white/[0.03] text-[hsl(var(--muted-foreground))] hover:text-white hover:bg-[hsl(var(--success))] transition-colors cursor-pointer">
            <CheckCircle className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <button onClick={() => onAction?.('archive')} title="Arquivar" className="p-2 rounded-full bg-white/[0.03] text-[hsl(var(--muted-foreground))] hover:text-white hover:bg-[hsl(var(--warning))] transition-colors cursor-pointer">
            <Archive className="w-4 h-4" strokeWidth={1.5} />
          </button>
          <button onClick={() => onAction?.('transfer')} title={`Transferir para ${responsavelLabel}`} className="p-2 rounded-full bg-white/[0.03] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--accent-foreground))] hover:bg-[hsl(var(--accent))] transition-colors cursor-pointer">
            <Stethoscope className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* SA-06 · Pipeline visual da jornada (Quiz → Procedimento) */}
        <PipelineBar phase={selectedConversation.phase} />

        <div className="p-6 space-y-6">
          {/* Sprint B · W-01: Próxima ação sugerida pelo copiloto AI */}
          {(copilotActions.length > 0 || copilotActionsLoading) && (
            <NextActions
              actions={copilotActions}
              isLoading={copilotActionsLoading}
              onPick={(action) => onPickAction?.(action)}
            />
          )}

          {/* Tags / Pipeline Data */}
          <div>
            <h4 className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em] flex items-center gap-2 mb-3">
              <Calendar className="w-3 h-3" strokeWidth={1.5} /> Etapa atual
            </h4>
            <div className="bg-white/[0.02] rounded-lg p-3.5 text-[12px] border border-white/[0.04] text-[hsl(var(--foreground))] space-y-1.5">
              <p className="flex items-center gap-2"><span className="text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))] opacity-70">Fase</span> <span className="capitalize">{selectedConversation.phase || 'Neutro'}</span></p>
              <p className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))] opacity-70">Funil</span> <span>{
                  (() => {
                    const f = (selectedConversation.funnel || '').toLowerCase();
                    if (f.includes('olheira')) return 'Olheiras (Smooth Eyes)';
                    if (f.includes('full')) return 'Full Face (Lifting 5D)';
                    if (f.includes('procedimento')) return 'Procedimentos gerais';
                    return selectedConversation.funnel || 'Geral';
                  })()
                }</span>
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.15em] text-[hsl(var(--muted-foreground))] opacity-70">Score</span>
                <LeadScoreBadge score={selectedConversation.lead_score} />
              </div>
            </div>
          </div>

          {/* Tags Section */}
          <div>
            <h4 className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em] flex items-center gap-2 mb-3">
              <Tag className="w-3 h-3" strokeWidth={1.5} /> Tags
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {selectedConversation.tags && selectedConversation.tags.length > 0 ? (
                selectedConversation.tags.map((tag, i) => (
                  <span key={i} className="px-2 py-0.5 bg-white/[0.03] text-[hsl(var(--muted-foreground))] text-[10px] rounded-full border border-white/[0.04]">
                    {tag}
                  </span>
                ))
              ) : (
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] italic font-display opacity-70">Nenhuma tag atribuída.</p>
              )}
            </div>
          </div>

          <div>
             <h4 className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em] flex items-center gap-2 mb-3">
              <ShieldAlert className="w-3 h-3" strokeWidth={1.5} /> Queixas detectadas
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {queixas.length > 0 ? queixas.map((q: string, i: number) => (
                <span key={i} className="px-2 py-0.5 bg-[hsl(var(--accent))]/[0.10] text-[hsl(var(--accent))] text-[11px] rounded-full border border-[hsl(var(--accent))]/[0.18]">
                  {q}
                </span>
              )) : (
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] italic font-display opacity-70">Nenhuma queixa analisada ainda.</p>
              )}
            </div>
          </div>

          {/* SA-07 · Timeline de eventos (phase_history) */}
          <TimelineSection conversationId={selectedConversation.conversation_id} />

          {/* Atalhos pro painel CRM legacy · abre em nova aba */}
          <div className="pt-3 border-t border-white/[0.04] space-y-1.5">
            <h4 className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em] mb-3">
              Atalhos
            </h4>
            {selectedConversation.lead_id && (
              <a
                href={`${PAINEL_URL}/index.html?page=leads&lead=${selectedConversation.lead_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[11.5px] bg-white/[0.02] border border-white/[0.04] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))]/40 hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/[0.04] transition-colors group"
              >
                <span className="flex items-center gap-2">
                  <UserCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                  Ver lead no CRM
                </span>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
              </a>
            )}
            <a
              href={`${PAINEL_URL}/index.html?page=agenda&phone=${selectedConversation.phone}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[11.5px] bg-white/[0.02] border border-white/[0.04] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))]/40 hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/[0.04] transition-colors group"
            >
              <span className="flex items-center gap-2">
                <CalendarPlus className="w-3.5 h-3.5" strokeWidth={1.5} />
                Abrir agenda
              </span>
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
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
