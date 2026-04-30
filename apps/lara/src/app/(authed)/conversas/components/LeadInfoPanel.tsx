import { Tag, ShieldAlert, ExternalLink, CalendarPlus, User, History } from 'lucide-react';
import type { Conversation } from '../hooks/useConversations';
import { computeConversationTags } from '../hooks/useConversationTags';
import { AgentPauseSection } from './AgentPauseSection';
import { AssignmentSection } from './AssignmentSection';
import { PipelineBar } from './PipelineBar';
import { TimelineSection } from './TimelineSection';
import { NextActions } from './NextActions';

const PAINEL_URL = process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br';

/**
 * LeadInfoPanel · painel direito do /conversas reorganizado em 3 zonas
 * (audit 2026-04-30 · Fase 1+2):
 *   ZONA AGIR (topo)      → status Lara · atribuído a · próxima ação IA
 *   ZONA ENTENDER (meio)  → funil + score + pipeline · queixas · tags filtradas
 *   ZONA HISTÓRICO (fim)  → timeline collapsável · atalhos · controle Lara full
 */

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
  responsavelLabel?: string;
  copilotActions?: NextActionItem[];
  copilotActionsLoading?: boolean;
  onPickAction?: (action: NextActionItem) => void;
}

/** Score badge · "Sem quiz" quando 0 (lead não fez), buckets coloridos quando >0 */
function LeadScoreBadge({ score }: { score: number | null | undefined }) {
  const safeScore = typeof score === 'number' && !isNaN(score) ? Math.max(0, Math.min(100, score)) : 0;

  // Score 0 = sem quiz · mostra label sutil em italic em vez de "Frio · 0"
  if (safeScore === 0) {
    return (
      <span className="font-display italic text-[11px] text-[hsl(var(--muted-foreground))] opacity-60">
        Sem quiz ainda
      </span>
    );
  }

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
      <span className="inline-block w-1 h-1 rounded-full" style={{ backgroundColor: color }} />
      {label}
      <span className="text-[hsl(var(--muted-foreground))] font-normal normal-case opacity-50">·</span>
      <span style={{ color }} className="tabular-nums">{safeScore}</span>
    </span>
  );
}

const SECTION_LABEL_STYLE = {
  fontFamily: 'Montserrat, sans-serif',
  fontSize: '8.5px',
  fontWeight: 500 as const,
  letterSpacing: '0.22em',
  textTransform: 'uppercase' as const,
  color: 'rgba(245, 240, 232, 0.45)',
};

export function LeadInfoPanel({
  selectedConversation,
  isExpanded,
  onToggleExpand,
  onStatusChange,
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
        <User className="w-4 h-4 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
      </div>
    );
  }

  if (!selectedConversation) {
    return (
      <div className="w-80 border-l border-white/[0.06] bg-[hsl(var(--chat-panel-bg))] flex items-center justify-center px-6">
        <p className="text-[12px] text-[hsl(var(--muted-foreground))] italic font-display text-center opacity-70 leading-relaxed">
          Selecione uma conversa pra ver o perfil do lead.
        </p>
      </div>
    );
  }

  const queixas = selectedConversation.queixas || [];
  // Tags semânticas derivadas (URGENTE/QUER AGENDAR/PERGUNTOU PREÇO/etc) ·
  // mais úteis que conv.tags brutas
  const semanticTags = computeConversationTags(selectedConversation).filter((t) =>
    ['URGENTE', 'QUER AGENDAR', 'PERGUNTOU PREÇO'].includes(t.label),
  );
  // Tags brutas adicionais (ex: vip, indicacao) que não são semânticas
  const otherTags = (selectedConversation.tags ?? []).filter(
    (t) => !['pronto_agendar', 'perguntou_preco', 'urgente'].includes(t.toLowerCase()),
  );
  const topAction = copilotActions[0] ?? null;

  return (
    <div className="w-80 border-l border-white/[0.06] flex flex-col bg-[hsl(var(--chat-panel-bg))] h-full">
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* ─── ZONA AGIR · status Lara · atribuído · próxima ação ─── */}
        <AgentPauseSection
          key={`pill-${selectedConversation.conversation_id}-${selectedConversation.ai_paused_until}`}
          conversationId={selectedConversation.conversation_id}
          onStatusChange={onStatusChange}
          mode="pill"
        />
        <AssignmentSection
          key={`assign-${selectedConversation.conversation_id}`}
          conversationId={selectedConversation.conversation_id}
          initialAssignedTo={selectedConversation.assigned_to ?? null}
          initialAssignedAt={selectedConversation.assigned_at ?? null}
          onChange={onStatusChange}
          compact
        />

        {/* Próxima ação IA · destacada no topo (acionável) */}
        {(topAction || copilotActionsLoading) && (
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <NextActions
              actions={topAction ? [topAction] : []}
              isLoading={copilotActionsLoading}
              onPick={(a) => onPickAction?.(a)}
            />
          </div>
        )}

        {/* ─── ZONA ENTENDER · pipeline + score + queixas + tags ─── */}
        <PipelineBar phase={selectedConversation.phase} funnel={selectedConversation.funnel} />

        <div className="px-5 py-4 space-y-4 border-b border-white/[0.06]">
          {/* Score linha única */}
          <div className="flex items-center justify-between">
            <span style={SECTION_LABEL_STYLE}>Score</span>
            <LeadScoreBadge score={selectedConversation.lead_score} />
          </div>

          {/* Queixas */}
          {queixas.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <ShieldAlert className="w-3 h-3 text-[hsl(var(--muted-foreground))] opacity-60" strokeWidth={1.5} />
                <span style={SECTION_LABEL_STYLE}>Queixas detectadas</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {queixas.map((q, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-[hsl(var(--accent))]/[0.10] text-[hsl(var(--accent))] text-[10.5px] rounded-full border border-[hsl(var(--accent))]/[0.18]"
                  >
                    {q}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags semânticas (URGENTE/QUER AGENDAR/etc) · só aparecem as relevantes */}
          {semanticTags.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Tag className="w-3 h-3 text-[hsl(var(--muted-foreground))] opacity-60" strokeWidth={1.5} />
                <span style={SECTION_LABEL_STYLE}>Sinais</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {semanticTags.map((tag) => (
                  <span
                    key={tag.label}
                    className="font-meta uppercase whitespace-nowrap"
                    style={{
                      fontSize: '8.5px',
                      letterSpacing: '0.12em',
                      fontWeight: 500,
                      padding: '2px 6px',
                      borderRadius: 2,
                      background: tag.bg,
                      color: tag.color,
                      border: `1px solid ${tag.border}`,
                      lineHeight: 1.2,
                    }}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags brutas adicionais · pequenas · só se houver */}
          {otherTags.length > 0 && (
            <div>
              <span style={{ ...SECTION_LABEL_STYLE, fontSize: '8px' }}>Tags do CRM</span>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {otherTags.slice(0, 6).map((tag, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-white/[0.02] text-[hsl(var(--muted-foreground))] text-[9.5px] rounded-full border border-white/[0.04]"
                  >
                    {tag}
                  </span>
                ))}
                {otherTags.length > 6 && (
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] opacity-60">+{otherTags.length - 6}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── ZONA HISTÓRICO · timeline + atalhos + controle pause completo ─── */}
        <div className="px-5 py-4 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <History className="w-3 h-3 text-[hsl(var(--muted-foreground))] opacity-60" strokeWidth={1.5} />
              <span style={SECTION_LABEL_STYLE}>Histórico</span>
            </div>
            <TimelineSection conversationId={selectedConversation.conversation_id} />
          </div>

          {/* Atalhos pro CRM legacy (médio prazo migra pra dentro do Lara v2) */}
          <div>
            <span style={SECTION_LABEL_STYLE}>Atalhos</span>
            <div className="space-y-1.5 mt-2">
              {selectedConversation.lead_id && (
                <a
                  href={`${PAINEL_URL}/index.html?page=leads&lead=${selectedConversation.lead_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[11.5px] bg-white/[0.02] border border-white/[0.04] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))]/40 hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/[0.04] transition-colors group"
                >
                  <span className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5" strokeWidth={1.5} />
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

        {/* Controle Lara FULL · pinned no fim (rodapé) · botão grande Pausar/Reativar
            + dropdown de tempo. ZONA AGIR já tem o status pill no topo · este aqui
            é a interação principal de pausar (+ adicionar tempo / personalizar). */}
        <AgentPauseSection
          key={`full-${selectedConversation.conversation_id}-${selectedConversation.ai_paused_until}`}
          conversationId={selectedConversation.conversation_id}
          onStatusChange={onStatusChange}
          mode="full"
        />
      </div>
    </div>
  );
}
