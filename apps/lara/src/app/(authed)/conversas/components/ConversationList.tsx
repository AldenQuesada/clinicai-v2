import { Search, UserCircle, MessageSquarePlus, Filter, ArrowUpDown, X, Calendar, Tag as TagIcon, Target } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Conversation } from '../hooks/useConversations';
import { format, isToday, isYesterday, isAfter, subDays } from 'date-fns';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  isLoading: boolean;
  onSelectConversation: (c: Conversation) => void;
  statusFilter: 'active' | 'archived' | 'resolved' | 'dra';
  onStatusFilterChange: (status: 'active' | 'archived' | 'resolved' | 'dra') => void;
}

export function ConversationList({
  conversations,
  selectedConversation,
  isLoading,
  onSelectConversation,
  statusFilter,
  onStatusFilterChange
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

  return (
    <div className="w-80 border-r border-[hsl(var(--chat-border))] flex flex-col bg-[hsl(var(--chat-panel-bg))] relative">
      <div className="h-[72px] border-b border-[hsl(var(--chat-border))] flex items-center px-4 justify-between shrink-0">
        <span className="text-sm font-medium text-[hsl(var(--foreground))]">Conversas ({filteredConversations.length})</span>
        <div className="flex items-center gap-2">
           <button
            onClick={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
            className={`p-1.5 rounded-md transition-colors ${sortOrder === 'oldest' ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
            title="Inverter Ordem"
          >
            <ArrowUpDown className="h-4 w-4" />
          </button>
          <MessageSquarePlus className="h-5 w-5 text-[hsl(var(--muted-foreground))] cursor-pointer hover:text-[hsl(var(--foreground))] transition-colors" />
        </div>
      </div>
      
      <div className="p-3 border-b border-[hsl(var(--chat-border))] shrink-0 flex flex-col gap-3">
        {/* Abas de Status Principal */}
        <div className="flex gap-1 mb-1 overflow-x-auto pb-1 custom-scrollbar">
          {[
            { id: 'active', label: 'Abertas' },
            { id: 'dra', label: 'Dra. Mirian' },
            { id: 'resolved', label: 'Resolvidas' },
            { id: 'archived', label: 'Arquivadas' }
          ].map(s => (
            <button
              key={s.id}
              onClick={() => onStatusFilterChange(s.id as any)}
              className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all whitespace-nowrap ${
                statusFilter === s.id
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-luxury-sm'
                  : 'bg-[hsl(var(--chat-bg))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <input
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] rounded-md py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))] text-[hsl(var(--foreground))]"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-md border transition-all ${
              showFilters || hasActiveAdvancedFilters
                ? 'bg-[hsl(var(--primary))] border-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                : 'bg-[hsl(var(--chat-bg))] border-[hsl(var(--chat-border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            <Filter className="h-4 w-4" />
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
          <div className="flex bg-[hsl(var(--chat-bg))] p-1 rounded-md">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 text-[11px] font-medium py-1.5 rounded-sm transition-colors cursor-pointer ${
                  activeTab === tab
                    ? 'bg-[hsl(var(--chat-panel-bg))] text-[hsl(var(--foreground))] shadow-sm'
                    : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
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
              className={`p-4 border-b border-[hsl(var(--chat-border))] cursor-pointer transition-colors hover:bg-[hsl(var(--chat-bg))] ${
                selectedConversation?.conversation_id === conv.conversation_id ? 'bg-[hsl(var(--chat-bg))] border-l-2 border-l-[hsl(var(--primary))]' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <UserCircle className="h-10 w-10 text-[hsl(var(--muted-foreground))]" />
                  {conv.channel === 'cloud' && (
                    <div className="absolute -bottom-0.5 -right-0.5 bg-[hsl(var(--success))] rounded-full p-0.5 border-2 border-[hsl(var(--chat-panel-bg))] shadow-md" title="WhatsApp Cloud API">
                      <div className="w-3 h-3 text-white flex items-center justify-center">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-medium truncate text-[hsl(var(--foreground))]">{conv.lead_name}</p>
                    <span className="text-xs text-[hsl(var(--muted-foreground))] shrink-0 ml-2">
                       {conv.last_message_at ? format(new Date(conv.last_message_at), 'HH:mm') : ''}
                    </span>
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] truncate mt-0.5">{conv.last_message_text || 'Sem mensagens'}</p>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {conv.phase && (
                      <div className="text-[10px] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] px-2 py-0.5 rounded-full inline-block">
                        {conv.phase}
                      </div>
                    )}
                    {conv.is_urgent && (
                      <div className="text-[10px] bg-[hsl(var(--danger))]/10 text-[hsl(var(--danger))] px-2 py-0.5 rounded-full inline-block">
                        Urgente
                      </div>
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
      </div>
    </div>
  );
}
