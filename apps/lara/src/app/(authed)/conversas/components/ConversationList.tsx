import { Filter, X, Calendar, Tag as TagIcon, Target } from 'lucide-react';
import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import type { Conversation } from '../hooks/useConversations';
import { computeConversationTags } from '../hooks/useConversationTags';
import { getConversationDisplayName, formatPhoneBR } from '../lib/displayName';
import { computeDoctorSla } from '../lib/doctorSla';
import { isAssignedToDoctor } from '@/lib/clinic-profiles';
import { PresenceAvatars } from './PresenceAvatars';
import type { PresenceUser } from '../hooks/usePresence';
import { format, isToday, isYesterday, isAfter, subDays } from 'date-fns';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  isLoading: boolean;
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onSelectConversation: (c: Conversation) => void;
  statusFilter: 'active' | 'archived' | 'resolved' | 'dra';
  onStatusFilterChange: (status: 'active' | 'archived' | 'resolved' | 'dra') => void;
  /** P-15 · hint opcional renderizado abaixo da lista (atalhos de teclado) */
  footerHint?: ReactNode;
  /** Polish 2026-04-30 · busca lifted pro topbar global */
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortOrder: 'newest' | 'oldest';
  /** Callback pra receber a contagem filtrada (pra exibir no topbar) */
  onFilteredCountChange?: (count: number) => void;
  /** showFilters lifted pra topbar (botao Filter mora ao lado da busca) */
  showFilters: boolean;
  onToggleFilters: () => void;
  /** Callback notificando se ha filtros avancados ativos · controla
      destaque do botao Filter na topbar (champagne quando ativo) */
  onAdvancedFiltersActiveChange?: (active: boolean) => void;
  /** activeTab lifted pra topbar (KPIs clicaveis filtram a lista) */
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  /** /secretaria · esconde linhas de tabs internas (substituidas por KPIs
      clicaveis na topbar central) e troca por mini-segmented Abertas/Resolvidas
      pra ver indice de resolucao. */
  simplifiedTabs?: boolean;
  /** Scope binario quando simplifiedTabs=true · controla statusFilter externo */
  statusScope?: 'open' | 'resolved';
  onStatusScopeChange?: (scope: 'open' | 'resolved') => void;
  /** Contagens pra renderizar no segmented (opcional) */
  scopeCounts?: { open: number; resolved: number };
  /** P-12 Fase 3 · atendentes online no inbox (presence) — não usados aqui agora
      mas mantidos pra compat futura se quisermos avatar dentro da sidebar */
  onlineUsers?: PresenceUser[];
  me?: string | null;
}

export function ConversationList({
  conversations,
  selectedConversation,
  isLoading,
  isLoadingMore = false,
  hasMore = false,
  onLoadMore,
  onSelectConversation,
  statusFilter,
  onStatusFilterChange,
  footerHint,
  searchQuery,
  sortOrder,
  onFilteredCountChange,
  showFilters,
  onToggleFilters,
  onAdvancedFiltersActiveChange,
  activeTab,
  onActiveTabChange,
  simplifiedTabs = false,
  statusScope = 'open',
  onStatusScopeChange,
  scopeCounts,
}: ConversationListProps) {
  
  // Estados dos Filtros Avançados
  const [filterFunnel, setFilterFunnel] = useState<string>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');

  // Tick a cada 30s pra atualizar badges de tempo de espera (Aguardando)
  // sem precisar de fetch · cliente só renderiza diff.
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const tabs = ['Todas', 'Aguardando', 'Dra', 'Urgentes', 'Lara Ativa'];

  // Extrair todas as tags únicas disponíveis nas conversas atuais para o filtro
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    conversations.forEach(c => {
      c.tags?.forEach(t => tags.add(t));
    });
    return Array.from(tags).sort();
  }, [conversations]);

  // Lógica de Filtragem e Ordenação
  const filteredConversations = useMemo(() => {
    let result = conversations.filter(conv => {
      // 1. Filtro de busca
      const q = searchQuery.toLowerCase();
      const nameStr = (conv.lead_name || '').toLowerCase();
      const phoneStr = (conv.phone || '').toLowerCase();
      const matchesSearch = nameStr.includes(q) || phoneStr.includes(q);
      if (!matchesSearch) return false;

      // 2. Filtro de aba (Apenas para conversas ativas)
      // Urgentes:   is_urgent (tag URGENTE detectada por palavras-chave no
      //             server · independente do SLA) · alinhado 1:1 com a tag
      //             visivel no painel direito.
      // Aguardando: SLA secretaria · waiting_human_response E !atribuída-à-Dra
      //             (transferidas saem da fila secretária · vão pra Dra).
      // Dra:        assigned_to = DOCTOR_USER_ID · fila da Mirian.
      // Lara Ativa: ai_enabled = true E !atribuída-à-Dra (Lara só conduz
      //             convs ainda na fila secretária).
      if (statusFilter === 'active') {
        const isDra = isAssignedToDoctor(conv.assigned_to ?? null);
        if (activeTab === 'Urgentes' && !conv.is_urgent) return false;
        if (activeTab === 'Aguardando' && (!conv.waiting_human_response || isDra)) return false;
        if (activeTab === 'Dra' && !isDra) return false;
        if (activeTab === 'Lara Ativa' && (!conv.ai_enabled || isDra)) return false;
      }

      // 3. Filtro por Funil
      if (filterFunnel !== 'all') {
        const f = (conv.funnel || '').toLowerCase();
        if (filterFunnel === 'olheiras' && !f.includes('olheira')) return false;
        if (filterFunnel === 'fullface' && !f.includes('full')) return false;
        if (filterFunnel === 'procedimentos' && !f.includes('procedimento')) return false;
      }

      // 4. Filtro por Tag SEMÂNTICA · usa computeConversationTags pra incluir
      //    tags derivadas (URGENTE, LARA, VOCÊ, FULL FACE, PROCEDIMENTO, OLHEIRAS,
      //    QUER AGENDAR, PERGUNTOU PREÇO) + tags do banco (conv.tags[])
      if (filterTag !== 'all') {
        const semanticTags = computeConversationTags(conv).map((t) => t.label);
        const rawTags = conv.tags ?? [];
        const allConvTags = [...semanticTags, ...rawTags];
        if (!allConvTags.includes(filterTag)) return false;
      }

      // 5. Filtro por Data · presets + DATA ESPECÍFICA (YYYY-MM-DD)
      if (filterDate !== 'all' && conv.last_message_at) {
        const msgDate = new Date(conv.last_message_at);
        if (filterDate === 'today' && !isToday(msgDate)) return false;
        else if (filterDate === 'yesterday' && !isYesterday(msgDate)) return false;
        else if (filterDate === 'week' && !isAfter(msgDate, subDays(new Date(), 7))) return false;
        else if (/^\d{4}-\d{2}-\d{2}$/.test(filterDate)) {
          // Data específica · compara YYYY-MM-DD do msgDate vs filterDate
          const y = msgDate.getFullYear();
          const m = String(msgDate.getMonth() + 1).padStart(2, '0');
          const d = String(msgDate.getDate()).padStart(2, '0');
          const msgYmd = `${y}-${m}-${d}`;
          if (msgYmd !== filterDate) return false;
        }
      }

      return true;
    });

    // Ordenação
    return result.sort((a, b) => {
      const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });
  }, [conversations, searchQuery, activeTab, statusFilter, filterFunnel, filterTag, filterDate, sortOrder]);

  const clearFilters = () => {
    setFilterFunnel('all');
    setFilterTag('all');
    setFilterDate('all');
    onActiveTabChange('Todas');
    // searchQuery vive no parent agora · clearFilters local nao limpa busca
  };

  const hasActiveAdvancedFilters = filterFunnel !== 'all' || filterTag !== 'all' || filterDate !== 'all';

  // Notifica parent da contagem filtrada (pra exibir badge "Conversas N" no topbar)
  useEffect(() => {
    onFilteredCountChange?.(filteredConversations.length);
  }, [filteredConversations.length, onFilteredCountChange]);

  // Notifica parent quando filtros avancados ficam ativos (pra destacar botao
  // Filter na topbar em champagne quando algum filtro tiver valor != 'all')
  useEffect(() => {
    onAdvancedFiltersActiveChange?.(hasActiveAdvancedFilters);
  }, [hasActiveAdvancedFilters, onAdvancedFiltersActiveChange]);

  // P-02: Scroll infinito · IntersectionObserver dispara onLoadMore quando
  // sentinel entra no viewport. rootMargin 200px adianta o trigger antes
  // de chegar no fim · UX sem "puxar" · sem dependencia externa.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  return (
    <div className="w-80 border-r border-white/[0.06] flex flex-col bg-[hsl(var(--chat-panel-bg))] relative">
      {/* Linha 1 (Conversas + count + sort + new + busca) MOVIDA pro topbar global
          em 2026-04-30 · libera ~120px verticais pra mais conversas visiveis */}

      {/* Linha 2 · tabs status · /conversas mantem 4 tabs · /secretaria
          (simplifiedTabs=true) oculta · 6 KPIs clicaveis na topbar central
          substituem (Todos/Abertas/Resolvidas + Aguardando/Urgente/Dra). */}
      {!simplifiedTabs && (
        <div className="px-3 pt-3 shrink-0">
          <div className="grid grid-cols-4 gap-1">
            {[
              { id: 'active', label: 'Abertas' },
              { id: 'dra', label: 'Dra. Mirian' },
              { id: 'resolved', label: 'Feitas' },
              { id: 'archived', label: 'Arquivadas' }
            ].map(s => (
              <button
                key={s.id}
                onClick={() => onStatusFilterChange(s.id as any)}
                title={s.label}
                className={`font-meta uppercase transition-colors whitespace-nowrap overflow-hidden text-ellipsis ${
                  statusFilter === s.id
                    ? 'text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                }`}
                style={{
                  fontSize: '8.5px',
                  letterSpacing: '0.15em',
                  fontWeight: 500,
                  padding: '4px 7px',
                  borderRadius: 2,
                  background: statusFilter === s.id ? 'rgba(201,169,110,0.15)' : 'transparent',
                  border: statusFilter === s.id
                    ? '1px solid rgba(201,169,110,0.3)'
                    : '1px solid transparent',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-3 pt-2.5 pb-3 border-b border-white/[0.06] shrink-0 flex flex-col gap-2.5">
        {/* Painel de Filtros Avançados (renderiza em cima quando aberto) */}
        {showFilters && (
          <div className="bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] rounded-lg p-3 space-y-3 shadow-luxury-md z-20 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Filtros</span>
              <button onClick={() => onToggleFilters()} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* Filtro por Funil */}
            <div className="space-y-1">
              <label className="text-[9px] text-[hsl(var(--muted-foreground))] flex items-center gap-1 uppercase font-bold">
                <Target className="h-3 w-3" /> Funil
              </label>
              <select
                value={filterFunnel}
                onChange={(e) => setFilterFunnel(e.target.value)}
                className="w-full bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-xs rounded px-2 py-1 outline-none text-[hsl(var(--foreground))]"
              >
                <option value="all">Todos os Funis</option>
                <option value="olheiras">Olheiras (Smooth Eyes)</option>
                <option value="fullface">Full Face (Lifting 5D)</option>
                <option value="procedimentos">Procedimentos Gerais</option>
              </select>
            </div>

            {/* Filtro por Tag SEMÂNTICA · derivadas do computeConversationTags
                + tags livres do banco · ordenadas por relevância */}
            <div className="space-y-1">
              <label className="text-[9px] text-[hsl(var(--muted-foreground))] flex items-center gap-1 uppercase font-bold">
                <TagIcon className="h-3 w-3" /> Tag
              </label>
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="w-full bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-xs rounded px-2 py-1 outline-none text-[hsl(var(--foreground))]"
              >
                <option value="all">Todas as tags</option>
                <optgroup label="Estado">
                  <option value="URGENTE">URGENTE</option>
                  <option value="QUER AGENDAR">QUER AGENDAR</option>
                  <option value="PERGUNTOU PREÇO">PERGUNTOU PREÇO</option>
                </optgroup>
                <optgroup label="Quem conduz">
                  <option value="LARA">LARA conduzindo</option>
                  <option value="VOCÊ">VOCÊ assumiu</option>
                </optgroup>
                <optgroup label="Funil">
                  <option value="FULL FACE">FULL FACE</option>
                  <option value="OLHEIRAS">OLHEIRAS</option>
                  <option value="PROCEDIMENTO">PROCEDIMENTO</option>
                </optgroup>
                {allTags.length > 0 && (
                  <optgroup label="Tags do CRM">
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

             {/* Filtro por Data · presets + datepicker pra dia específico */}
            <div className="space-y-1">
              <label className="text-[9px] text-[hsl(var(--muted-foreground))] flex items-center gap-1 uppercase font-bold">
                <Calendar className="h-3 w-3" /> Período
              </label>
              <select
                value={/^\d{4}-\d{2}-\d{2}$/.test(filterDate) ? 'specific' : filterDate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'specific') {
                    // Pre-popula com hoje no formato YYYY-MM-DD
                    const today = new Date();
                    const y = today.getFullYear();
                    const m = String(today.getMonth() + 1).padStart(2, '0');
                    const d = String(today.getDate()).padStart(2, '0');
                    setFilterDate(`${y}-${m}-${d}`);
                  } else {
                    setFilterDate(v);
                  }
                }}
                className="w-full bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-xs rounded px-2 py-1 outline-none text-[hsl(var(--foreground))]"
              >
                <option value="all">Qualquer data</option>
                <option value="today">Hoje</option>
                <option value="yesterday">Ontem</option>
                <option value="week">Últimos 7 dias</option>
                <option value="specific">Dia específico...</option>
              </select>
              {/* Datepicker visivel quando 'Dia específico' selecionado */}
              {/^\d{4}-\d{2}-\d{2}$/.test(filterDate) && (
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="w-full bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-xs rounded px-2 py-1 outline-none text-[hsl(var(--foreground))] mt-1"
                />
              )}
            </div>

            <button
              onClick={clearFilters}
              className="w-full py-1.5 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/5 transition-all border border-dashed border-[hsl(var(--chat-border))] rounded font-medium"
            >
              Limpar Filtros
            </button>
          </div>
        )}

        {/* Tabs de Filtro (Só aparecem nas Abertas) · mesma DNA das tabs status
            · Filter button mora na TOPBAR esquerda agora (junto com sort/new)
            · Em /secretaria (simplifiedTabs) os 3 KPIs clicaveis na topbar
            substituem essa linha · libera ~40px verticais. */}
        {statusFilter === 'active' && !showFilters && !simplifiedTabs && (
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => onActiveTabChange(tab)}
                title={tab}
                className={`font-meta uppercase flex-1 min-w-0 transition-colors whitespace-nowrap overflow-hidden text-ellipsis cursor-pointer ${
                  activeTab === tab
                    ? 'text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                }`}
                style={{
                  fontSize: '8.5px',
                  letterSpacing: '0.15em',
                  fontWeight: 500,
                  padding: '4px 7px',
                  borderRadius: 2,
                  background: activeTab === tab ? 'rgba(201,169,110,0.15)' : 'transparent',
                  border: activeTab === tab
                    ? '1px solid rgba(201,169,110,0.3)'
                    : '1px solid transparent',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading ? (
          <div className="p-10 text-center flex flex-col items-center gap-3">
             <div className="w-8 h-8 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
             <span className="text-xs text-[hsl(var(--muted-foreground))]">Carregando conversas...</span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-10 text-center text-[hsl(var(--muted-foreground))] text-sm">
            <Filter className="h-8 w-8 mx-auto mb-3 opacity-20" />
            Nenhuma conversa encontrada com esses filtros.
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isSelected = selectedConversation?.conversation_id === conv.conversation_id;
            return (
            <div
              key={conv.conversation_id}
              onClick={() => onSelectConversation(conv)}
              className={`group px-4 py-3.5 border-b border-white/[0.04] cursor-pointer transition-colors duration-150 relative ${
                isSelected
                  ? 'bg-[hsl(var(--primary))]/[0.05]'
                  : 'hover:bg-white/[0.025]'
              }`}
            >
              {/* Barrinha esquerda · sempre presente · selecionada gold sólido, hover gold soft, idle invisível */}
              <div
                className={`absolute left-0 top-3 bottom-3 w-[2px] rounded-r transition-all duration-150 ${
                  isSelected
                    ? 'bg-[hsl(var(--primary))]'
                    : 'bg-[hsl(var(--primary))]/0 group-hover:bg-[hsl(var(--primary))]/35'
                }`}
              />
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  {/* Avatar minimal · circulo translucido com inicial Cormorant */}
                  <div className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
                    <span className="font-display text-[13px] text-[hsl(var(--primary))]/80 italic leading-none">
                      {(() => {
                        const resolvedName = getConversationDisplayName(conv);
                        return resolvedName ? resolvedName.charAt(0).toUpperCase() : '·';
                      })()}
                    </span>
                  </div>
                  {conv.channel === 'cloud' && (
                    <div className="absolute -bottom-0.5 -right-0.5 bg-[hsl(var(--success))] rounded-full p-0.5 ring-2 ring-[hsl(var(--chat-panel-bg))]" title="WhatsApp Cloud API">
                      <div className="w-2.5 h-2.5 text-white flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-[13px] font-normal truncate text-[hsl(var(--foreground))]">{getConversationDisplayName(conv) || formatPhoneBR(conv.phone) || conv.phone}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Badge tempo de espera · single source of truth.
                          - Conv atribuída à Dra (assigned_to=DOCTOR_USER_ID):
                            mostra SLA Dra (timer desde assigned_at, prefixo
                            "Dra ⏱"). Computado client-side via doctorSla.ts
                            usando assigned_at como momento-zero.
                          - Conv NÃO atribuída à Dra: mostra SLA Secretária
                            (server-computed via computeSla, campos
                            response_color/should_pulse/pulse_behavior).
                          Para feedback visual mais vivo entre fetches (30s),
                          `nowTs` recalcula apenas o TEXTO. */}
                      {(() => {
                        const isDra = isAssignedToDoctor(conv.assigned_to ?? null);

                        // Cor map · compartilhado entre badge secretária e Dra
                        // (mesma escala). Vermelho usa --danger pq --destructive
                        // no @clinicai/ui é OKLCH e não funciona em hsl().
                        const colorByResponseColor: Record<
                          string,
                          { fg: string; bg: string }
                        > = {
                          verde: {
                            fg: 'hsl(var(--success))',
                            bg: 'hsl(var(--success) / 0.10)',
                          },
                          amarelo: {
                            fg: 'hsl(var(--warning))',
                            bg: 'hsl(var(--warning) / 0.12)',
                          },
                          vermelho: {
                            fg: 'hsl(var(--danger))',
                            bg: 'hsl(var(--danger) / 0.14)',
                          },
                          critico: {
                            fg: 'hsl(var(--danger))',
                            bg: 'hsl(var(--danger) / 0.22)',
                          },
                          atrasado_fixo: {
                            fg: 'hsl(var(--danger))',
                            bg: 'hsl(var(--danger) / 0.18)',
                          },
                          antigo_parado: {
                            fg: 'hsl(var(--muted-foreground))',
                            bg: 'rgba(255,255,255,0.04)',
                          },
                          respondido: { fg: '', bg: '' },
                        };

                        // ─── SLA Dra ─────────────────────────────────────
                        if (isDra) {
                          const draSla = computeDoctorSla({
                            assignedAt: conv.assigned_at ?? null,
                            now: new Date(nowTs),
                          });
                          if (!draSla.waitingDoctorResponse) return null;
                          const m = draSla.doctorMinutesWaiting ?? 0;
                          const hr = Math.floor(m / 60);
                          const day = Math.floor(hr / 24);
                          const text =
                            m < 1 ? 'agora' : day >= 1 ? `${day}d` : hr >= 1 ? `${hr}h` : `${m}m`;
                          const palette =
                            colorByResponseColor[draSla.doctorResponseColor] ??
                            colorByResponseColor.verde;
                          const pulseClass = draSla.doctorShouldPulse ? 'animate-pulse' : '';
                          const pulseStyle =
                            draSla.doctorPulseBehavior === 'forte'
                              ? { animationDuration: '1s' }
                              : draSla.doctorPulseBehavior === 'suave'
                              ? { animationDuration: '2.4s' }
                              : {};
                          return (
                            <span
                              title={`Dra esperando há ${text} · ${draSla.doctorResponseColor}`}
                              className={`tabular-nums font-meta uppercase ${pulseClass}`}
                              style={{
                                fontSize: '8.5px',
                                letterSpacing: '0.08em',
                                fontWeight: 600,
                                padding: '2px 5px',
                                borderRadius: 2,
                                background: palette.bg,
                                color: palette.fg,
                                lineHeight: 1.2,
                                ...pulseStyle,
                              }}
                            >
                              Dra ⏱ {text}
                            </span>
                          );
                        }

                        // ─── SLA Secretária ──────────────────────────────
                        if (!conv.waiting_human_response) return null;
                        const baseMinutes = (() => {
                          if (conv.last_patient_msg_at) {
                            const diffMs =
                              nowTs - new Date(conv.last_patient_msg_at).getTime();
                            return Math.max(0, Math.floor(diffMs / 60000));
                          }
                          return conv.minutes_waiting ?? 0;
                        })();
                        const diffHr = Math.floor(baseMinutes / 60);
                        const diffDay = Math.floor(diffHr / 24);
                        const text =
                          baseMinutes < 1
                            ? 'agora'
                            : diffDay >= 1
                            ? `${diffDay}d`
                            : diffHr >= 1
                            ? `${diffHr}h`
                            : `${baseMinutes}m`;
                        const palette =
                          colorByResponseColor[conv.response_color] ??
                          colorByResponseColor.verde;
                        const pulseClass = conv.should_pulse ? 'animate-pulse' : '';
                        const pulseStyle =
                          conv.pulse_behavior === 'forte'
                            ? { animationDuration: '1s' }
                            : conv.pulse_behavior === 'suave'
                            ? { animationDuration: '2.4s' }
                            : {};

                        return (
                          <span
                            title={`Paciente esperando ${text} · ${conv.response_color}`}
                            className={`tabular-nums font-meta uppercase ${pulseClass}`}
                            style={{
                              fontSize: '8.5px',
                              letterSpacing: '0.08em',
                              fontWeight: 600,
                              padding: '2px 5px',
                              borderRadius: 2,
                              background: palette.bg,
                              color: palette.fg,
                              lineHeight: 1.2,
                              ...pulseStyle,
                            }}
                          >
                            ⏱ {text}
                          </span>
                        );
                      })()}
                      <span className="text-[10.5px] text-[hsl(var(--muted-foreground))] tabular-nums font-mono opacity-70">
                        {conv.last_message_at ? format(new Date(conv.last_message_at), 'HH:mm') : ''}
                      </span>
                    </div>
                  </div>
                  {/* Sub-linha telefone · só renderiza quando há nome real
                      diferente do telefone (evita duplicar o título). */}
                  {(() => {
                    const resolvedName = getConversationDisplayName(conv);
                    const phoneFormatted = formatPhoneBR(conv.phone);
                    if (!resolvedName || !phoneFormatted || resolvedName === phoneFormatted) {
                      return null;
                    }
                    return (
                      <p className="text-[10.5px] text-[hsl(var(--muted-foreground))] tabular-nums font-mono opacity-60 truncate leading-tight mt-0.5">
                        {phoneFormatted}
                      </p>
                    );
                  })()}
                  <p className="text-[11.5px] text-[hsl(var(--muted-foreground))] truncate mt-0.5 leading-snug">{conv.last_message_text || 'Sem mensagens'}</p>

                  {/* Tags · regras port da legacy clinic-dashboard · estetica .badge-serious flipbook */}
                  {(() => {
                    const tagsToRender = computeConversationTags(conv);
                    if (tagsToRender.length === 0) return null;
                    return (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {tagsToRender.map((tag) => (
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
                    );
                  })()}

                  {/* Tags genericas do array conv.tags removidas · viraram derivadas em computeConversationTags */}
                </div>
              </div>
            </div>
            );
          })
        )}

        {/* P-02: Sentinel + indicador de loading infinite scroll */}
        {!isLoading && filteredConversations.length > 0 && (
          <>
            {hasMore && (
              <div ref={sentinelRef} className="h-1" aria-hidden="true" />
            )}
            {isLoadingMore && (
              <div className="p-4 text-center flex items-center justify-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                <div className="w-3 h-3 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full animate-spin" />
                Carregando mais...
              </div>
            )}
            {!hasMore && conversations.length >= 50 && (
              <div className="p-4 text-center text-[10px] text-[hsl(var(--muted-foreground))] uppercase tracking-wider opacity-60">
                · fim da lista ·
              </div>
            )}
          </>
        )}
      </div>

      {/* P-15 · footer hint dos atalhos · so renderiza se nao tem modal aberto */}
      {footerHint && (
        <div className="border-t border-white/[0.04] px-4 py-2 shrink-0 text-[9.5px] text-[hsl(var(--muted-foreground))] tracking-[0.05em] opacity-60">
          {footerHint}
        </div>
      )}
    </div>
  );
}
