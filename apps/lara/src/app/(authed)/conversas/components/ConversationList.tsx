import { Search, UserCircle, MessageSquarePlus, Filter, ArrowUpDown, X, Calendar, Tag as TagIcon, Target } from 'lucide-react';
import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import type { Conversation } from '../hooks/useConversations';
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
  onNewConversation?: () => void;
  /** P-15 · hint opcional renderizado abaixo da lista (atalhos de teclado) */
  footerHint?: ReactNode;
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
  onNewConversation,
  footerHint,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Todas');
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  
  // Estados dos Filtros Avançados
  const [filterFunnel, setFilterFunnel] = useState<string>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');

  const tabs = ['Todas', 'Urgentes', 'Aguardando', 'Lara Ativa'];

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
      if (statusFilter === 'active') {
        if (activeTab === 'Urgentes' && !conv.is_urgent) return false;
        if (activeTab === 'Aguardando' && (conv.ai_enabled || conv.is_urgent)) return false;
        if (activeTab === 'Lara Ativa' && !conv.ai_enabled) return false;
      }

      // 3. Filtro por Funil
      if (filterFunnel !== 'all') {
        const f = (conv.funnel || '').toLowerCase();
        if (filterFunnel === 'olheiras' && !f.includes('olheira')) return false;
        if (filterFunnel === 'fullface' && !f.includes('full')) return false;
        if (filterFunnel === 'procedimentos' && !f.includes('procedimento')) return false;
      }

      // 4. Filtro por Tag
      if (filterTag !== 'all' && !conv.tags?.includes(filterTag)) return false;

      // 5. Filtro por Data
      if (filterDate !== 'all' && conv.last_message_at) {
        const msgDate = new Date(conv.last_message_at);
        if (filterDate === 'today' && !isToday(msgDate)) return false;
        if (filterDate === 'yesterday' && !isYesterday(msgDate)) return false;
        if (filterDate === 'week' && !isAfter(msgDate, subDays(new Date(), 7))) return false;
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
    setSearchQuery('');
    setActiveTab('Todas');
  };

  const hasActiveAdvancedFilters = filterFunnel !== 'all' || filterTag !== 'all' || filterDate !== 'all';

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
      <div className="h-16 border-b border-white/[0.06] flex items-center px-5 justify-between shrink-0">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[17px] text-[hsl(var(--foreground))]">Conversas</span>
          <span className="text-[10.5px] text-[hsl(var(--muted-foreground))] tabular-nums opacity-70">{filteredConversations.length}</span>
        </div>
        <div className="flex items-center gap-1">
           <button
            onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
            className={`p-1.5 rounded-md transition-colors ${sortOrder === 'oldest' ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
            title="Inverter Ordem"
          >
            <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          {onNewConversation && (
            <button
              type="button"
              onClick={onNewConversation}
              title="Nova conversa manual"
              className="p-1.5 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 transition-colors"
            >
              <MessageSquarePlus className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      <div className="p-3 border-b border-white/[0.06] shrink-0 flex flex-col gap-2.5">
        {/* Abas de Status Principal · 4 labels que cabem em 320px */}
        <div className="grid grid-cols-4 gap-1">
          {[
            { id: 'active', label: 'Abertas' },
            { id: 'dra', label: 'Dra.' },
            { id: 'resolved', label: 'Feitas' },
            { id: 'archived', label: 'Arq.' }
          ].map(s => (
            <button
              key={s.id}
              onClick={() => onStatusFilterChange(s.id as any)}
              title={s.id === 'dra' ? 'Dra. Mirian' : s.id === 'resolved' ? 'Resolvidas' : s.id === 'archived' ? 'Arquivadas' : 'Abertas'}
              className={`px-2 py-1.5 text-[10px] font-semibold rounded-md transition-all ${
                statusFilter === s.id
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'bg-white/[0.02] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-white/[0.04]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" strokeWidth={1.5} />
            <input
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.02] border border-white/[0.04] rounded-md py-1.5 pl-8 pr-3 text-[12px] focus:outline-none focus:border-[hsl(var(--primary))]/40 focus:ring-1 focus:ring-[hsl(var(--primary))]/20 text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]/60 transition-colors"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded-md border transition-all ${
              showFilters || hasActiveAdvancedFilters
                ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                : 'bg-white/[0.02] border-white/[0.04] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-white/[0.04]'
            }`}
          >
            <Filter className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
        
        {/* Painel de Filtros Avançados */}
        {showFilters && (
          <div className="bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] rounded-lg p-3 space-y-3 shadow-luxury-md z-20 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-widest">Filtros</span>
              <button onClick={() => setShowFilters(false)} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
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

            {/* Filtro por Tag */}
            <div className="space-y-1">
              <label className="text-[9px] text-[hsl(var(--muted-foreground))] flex items-center gap-1 uppercase font-bold">
                <TagIcon className="h-3 w-3" /> Tag
              </label>
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="w-full bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-xs rounded px-2 py-1 outline-none text-[hsl(var(--foreground))]"
              >
                <option value="all">Todas as Tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>

             {/* Filtro por Data */}
            <div className="space-y-1">
              <label className="text-[9px] text-[hsl(var(--muted-foreground))] flex items-center gap-1 uppercase font-bold">
                <Calendar className="h-3 w-3" /> Período
              </label>
              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-xs rounded px-2 py-1 outline-none text-[hsl(var(--foreground))]"
              >
                <option value="all">Qualquer data</option>
                <option value="today">Hoje</option>
                <option value="yesterday">Ontem</option>
                <option value="week">Últimos 7 dias</option>
              </select>
            </div>

            <button
              onClick={clearFilters}
              className="w-full py-1.5 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/5 transition-all border border-dashed border-[hsl(var(--chat-border))] rounded font-medium"
            >
              Limpar Filtros
            </button>
          </div>
        )}

        {/* Tabs de Filtro (Só aparecem nas Abertas) */}
        {statusFilter === 'active' && !showFilters && (
          <div className="flex bg-white/[0.02] p-0.5 rounded-md border border-white/[0.04]">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 text-[10.5px] py-1.5 rounded-sm transition-colors cursor-pointer ${
                  activeTab === tab
                    ? 'bg-white/[0.05] text-[hsl(var(--foreground))] font-medium'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] font-normal'
                }`}
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
          filteredConversations.map((conv) => (
            <div
              key={conv.conversation_id}
              onClick={() => onSelectConversation(conv)}
              className={`px-4 py-3.5 border-b border-white/[0.04] cursor-pointer transition-all hover:bg-white/[0.02] relative ${
                selectedConversation?.conversation_id === conv.conversation_id ? 'bg-[hsl(var(--primary))]/[0.04]' : ''
              }`}
            >
              {selectedConversation?.conversation_id === conv.conversation_id && (
                <div className="absolute left-0 top-3 bottom-3 w-[2px] bg-[hsl(var(--primary))] rounded-r" />
              )}
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <UserCircle className="h-9 w-9 text-[hsl(var(--muted-foreground))]" strokeWidth={1.25} />
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
                    <p className="text-[13px] font-normal truncate text-[hsl(var(--foreground))]">{conv.lead_name}</p>
                    <span className="text-[10.5px] text-[hsl(var(--muted-foreground))] shrink-0 tabular-nums font-mono opacity-70">
                       {conv.last_message_at ? format(new Date(conv.last_message_at), 'HH:mm') : ''}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[hsl(var(--muted-foreground))] truncate mt-0.5 leading-snug">{conv.last_message_text || 'Sem mensagens'}</p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {conv.phase && (
                      <span className="inline-flex items-center text-[9px] uppercase tracking-[0.12em] bg-[hsl(var(--primary))]/[0.08] text-[hsl(var(--primary))] px-1.5 py-[2px] rounded-full font-medium leading-tight">
                        {conv.phase}
                      </span>
                    )}
                    {conv.is_urgent && (
                      <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] bg-[hsl(var(--danger))]/[0.10] text-[hsl(var(--danger))] px-1.5 py-[2px] rounded-full font-medium leading-tight">
                        <span className="inline-block w-1 h-1 rounded-full bg-[hsl(var(--danger))]" />
                        Urgente
                      </span>
                    )}
                  </div>

                  {conv.tags && conv.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {conv.tags.slice(0, 3).map((tag, i) => (
                        <span key={i} className="text-[9px] bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] px-1.5 py-0.5 rounded border border-[hsl(var(--chat-border))]">
                          {tag}
                        </span>
                      ))}
                      {conv.tags.length > 3 && <span className="text-[9px] text-[hsl(var(--muted-foreground))]">+{conv.tags.length - 3}</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
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
