import { usePauseStatus } from '../hooks/usePauseStatus';
import { Pause, Play, Clock, ChevronDown } from 'lucide-react';
import { useState } from 'react';

export function AgentPauseSection({ conversationId, onStatusChange }: { conversationId: string, onStatusChange?: () => void }) {
  const { pauseStatus, isLoading, pauseAgent, reactivateAgent } = usePauseStatus(conversationId);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleReactivate = async () => {
    console.log('[UI] Botão Reativar Assistente clicado');
    const ok = await reactivateAgent();
    console.log('[UI] Resultado da reativação:', ok);
    if (ok && onStatusChange) {
      onStatusChange();
    }
  };

  const { isPaused, remainingTime } = pauseStatus;

  const formatRemainingTime = (minutes: number) => {
    if (!minutes) return '00:00';
    const hrs = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const secs = Math.floor((minutes * 60) % 60);
    return `${hrs > 0 ? String(hrs).padStart(2, '0') + ':' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="border-t border-[hsl(var(--chat-border))] p-4 bg-[hsl(var(--chat-panel-bg))] shrink-0">
      {isPaused && (
        <div className="flex items-center justify-between mb-3 bg-orange-500/10 px-3 py-2 rounded-md border border-orange-500/20">
          <span className="text-sm text-orange-500 flex items-center gap-2 font-medium">
            <Pause className="h-4 w-4" /> Pausado
          </span>
          <div className="flex items-center gap-1.5 text-xs text-orange-500 font-mono">
            <Clock className="h-3 w-3" />
            {formatRemainingTime(remainingTime)}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400 font-medium">
          {isPaused ? 'Adicionar Tempo' : 'Pausar a Inteligência'}
        </span>
        
        <div className="relative">
          <button 
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] rounded-md hover:bg-[hsl(var(--chat-border))] transition-colors"
          >
            {isLoading ? '...' : '+ 30 min'}
            <ChevronDown className="h-3 w-3" />
          </button>
          
          {dropdownOpen && (
            <div className="absolute right-0 bottom-full mb-2 w-40 bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] rounded-md shadow-lg overflow-hidden z-10">
              {[15, 30, 60, 120, 1440].map((mins) => (
                <button
                  key={mins}
                  onClick={() => {
                    pauseAgent(mins);
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-xs hover:bg-[hsl(var(--chat-bg))] border-b border-[hsl(var(--chat-border))] last:border-0"
                >
                  {mins === 1440 ? '24 horas' : mins >= 60 ? `${mins/60} hora(s)` : `${mins} minutos`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isPaused && (
        <button 
          onClick={handleReactivate}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 mt-3 shadow-sm"
        >
          <Play className="h-4 w-4" />
          Reativar Assistente
        </button>
      )}
    </div>
  );
}
