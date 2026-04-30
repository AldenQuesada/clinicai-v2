import { usePauseStatus } from '../hooks/usePauseStatus';
import { Pause, Play, Clock, ChevronDown, Sunrise, Calendar as CalendarIcon } from 'lucide-react';
import { useState, useMemo } from 'react';

/**
 * Calcula minutos ate "amanha 09:00 BRT".
 * Se hoje for sexta/sabado/domingo, retorna minutos ate proxima segunda 09:00 BRT.
 * BRT = UTC-3 (sem horario de verao desde 2019).
 */
function minutesUntilNextWorkdayMorning(): { minutes: number; label: string } {
  const now = new Date();
  // Trabalhamos em horario local do navegador (BRT pra Maringa).
  const target = new Date(now);
  target.setHours(9, 0, 0, 0);

  // Comeca com "amanha"
  target.setDate(target.getDate() + 1);

  // Se cair em sabado (6) ou domingo (0), pula pra segunda.
  // Se HOJE for sexta (5), amanha e sabado -> pula 2 dias = segunda.
  // Se HOJE for sabado (6), amanha e domingo -> pula 1 dia = segunda.
  // Se HOJE for domingo (0), amanha e segunda -> nao pula.
  while (target.getDay() === 0 || target.getDay() === 6) {
    target.setDate(target.getDate() + 1);
  }

  const diffMs = target.getTime() - now.getTime();
  const minutes = Math.max(1, Math.ceil(diffMs / 60000));

  const isTomorrow = target.getDate() === new Date(now.getTime() + 86400000).getDate();
  const label = isTomorrow ? 'Amanhã 9h' : 'Segunda 9h';
  return { minutes, label };
}

/** Formata Date como string "YYYY-MM-DDTHH:mm" para input datetime-local. */
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AgentPauseSection({ conversationId, onStatusChange }: { conversationId: string, onStatusChange?: () => void }) {
  const { pauseStatus, isLoading, pauseAgent, reactivateAgent } = usePauseStatus(conversationId);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Min do datetime-local: agora + 1 minuto
  const minDatetime = useMemo(() => {
    const d = new Date(Date.now() + 60000);
    return toDatetimeLocalValue(d);
  }, [customOpen]); // recalcula ao abrir

  const tomorrow9 = useMemo(() => minutesUntilNextWorkdayMorning(), [dropdownOpen]);

  const handleReactivate = async () => {
    console.log('[UI] Botão Reativar Assistente clicado');
    const ok = await reactivateAgent();
    console.log('[UI] Resultado da reativação:', ok);
    if (ok && onStatusChange) {
      onStatusChange();
    }
  };

  const handleCustomConfirm = async () => {
    if (!customValue) {
      setCustomError('Escolha um horário no futuro');
      return;
    }
    const selected = new Date(customValue);
    const now = new Date();
    if (isNaN(selected.getTime()) || selected.getTime() <= now.getTime()) {
      setCustomError('Escolha um horário no futuro');
      return;
    }
    const minutes = Math.ceil((selected.getTime() - now.getTime()) / 60000);
    setCustomError(null);
    await pauseAgent(minutes);
    setCustomOpen(false);
    setCustomValue('');
    setDropdownOpen(false);
  };

  const closeAll = () => {
    setDropdownOpen(false);
    setCustomOpen(false);
    setCustomError(null);
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
    <div className="border-b border-white/[0.06] p-4 bg-[hsl(var(--chat-panel-bg))] shrink-0 space-y-3">
      {/* Banner status quando pausada · âmbar com cronômetro */}
      {isPaused && (
        <div className="flex items-center justify-between bg-[hsl(var(--warning))]/10 px-3 py-2 rounded-md border border-[hsl(var(--warning))]/20">
          <span className="font-meta uppercase text-[10px] tracking-[0.18em] text-[hsl(var(--warning))] flex items-center gap-2">
            <Pause className="h-3 w-3" strokeWidth={2} /> Pausada
          </span>
          <div className="flex items-center gap-1.5 text-[12px] text-[hsl(var(--warning))] font-mono tabular-nums">
            <Clock className="h-3 w-3" strokeWidth={1.5} />
            {formatRemainingTime(remainingTime)}
          </div>
        </div>
      )}

      {/* BOTÃO PRIMÁRIO · cores LITERAIS pra evitar problema de token HSL */}
      {isPaused ? (
        <button
          type="button"
          onClick={handleReactivate}
          disabled={isLoading}
          style={{ background: '#10B981', color: '#FFFFFF' }}
          className="w-full flex items-center justify-center gap-2 hover:opacity-90 py-3 rounded-md text-sm font-semibold transition-opacity disabled:opacity-50 shadow-luxury-sm cursor-pointer"
        >
          <Play className="h-4 w-4" strokeWidth={2} />
          {isLoading ? 'Reativando...' : 'Reativar Lara'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => pauseAgent(30)}
          disabled={isLoading}
          style={{ background: '#C9A96E', color: '#1A1814' }}
          className="w-full flex items-center justify-center gap-2 hover:opacity-90 py-3 rounded-md text-sm font-semibold transition-opacity disabled:opacity-50 shadow-luxury-sm cursor-pointer"
        >
          <Pause className="h-4 w-4" strokeWidth={2} />
          {isLoading ? 'Pausando...' : 'Pausar Lara · 30 min'}
        </button>
      )}

      {/* AÇÃO SECUNDÁRIA · escolher tempo customizado (ou adicionar) */}
      <div className="flex items-center justify-between">
        <span className="font-meta uppercase text-[9px] tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
          {isPaused ? 'Adicionar tempo' : 'Outras durações'}
        </span>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (dropdownOpen) {
                closeAll();
              } else {
                setDropdownOpen(true);
              }
            }}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[10.5px] font-meta uppercase tracking-[0.12em] bg-white/[0.02] border border-white/[0.06] rounded-md text-[hsl(var(--muted-foreground))] hover:bg-white/[0.05] hover:text-[hsl(var(--foreground))] transition-colors cursor-pointer"
          >
            {isLoading ? '...' : 'Escolher'}
            <ChevronDown className="h-3 w-3" strokeWidth={1.5} />
          </button>

          {dropdownOpen && !customOpen && (
            <div className="absolute right-0 bottom-full mb-2 w-52 bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] rounded-md shadow-luxury-md overflow-hidden z-10">
              {/* Preset destacado · Amanha 9h (ou Segunda 9h se sex/sab/dom) */}
              <button
                onClick={() => {
                  pauseAgent(tomorrow9.minutes);
                  closeAll();
                }}
                className="w-full text-left px-4 py-2.5 text-xs text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 flex items-center gap-2 font-medium transition-colors"
              >
                <Sunrise className="h-3.5 w-3.5" />
                {tomorrow9.label}
              </button>

              {/* Divider categorial · separa snooze inteligente dos presets fixos */}
              <div className="h-px bg-[hsl(var(--chat-border))]" />

              {[15, 30, 60, 120, 1440].map((mins) => (
                <button
                  key={mins}
                  onClick={() => {
                    pauseAgent(mins);
                    closeAll();
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-[hsl(var(--foreground))] hover:bg-[hsl(var(--chat-bg))] transition-colors"
                >
                  {mins === 1440 ? '24 horas' : mins >= 60 ? `${mins/60} hora(s)` : `${mins} minutos`}
                </button>
              ))}

              {/* Divider · custom em categoria propria */}
              <div className="h-px bg-[hsl(var(--chat-border))]" />

              {/* Personalizar · abre datetime-local picker */}
              <button
                onClick={() => {
                  setCustomOpen(true);
                  setCustomError(null);
                  // pre-popula com agora + 1h
                  const initial = new Date(Date.now() + 60 * 60000);
                  setCustomValue(toDatetimeLocalValue(initial));
                }}
                className="w-full text-left px-4 py-2.5 text-xs text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 flex items-center gap-2 font-medium transition-colors"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                Personalizar...
              </button>
            </div>
          )}

          {dropdownOpen && customOpen && (
            <div className="absolute right-0 bottom-full mb-2 w-64 bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] rounded-md shadow-luxury-md p-3.5 z-10">
              <label className="block text-[10px] font-bold text-[hsl(var(--primary))] uppercase tracking-[1.2px] mb-2 flex items-center gap-1.5">
                <CalendarIcon className="h-3 w-3" />
                Pausar até
              </label>
              <input
                type="datetime-local"
                value={customValue}
                min={minDatetime}
                onChange={(e) => {
                  setCustomValue(e.target.value);
                  setCustomError(null);
                }}
                className="w-full px-2.5 py-2 text-xs bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] rounded-md text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] focus:ring-1 focus:ring-[hsl(var(--primary))]/30 transition-colors"
              />
              {customError && (
                <p className="text-[10px] text-[hsl(var(--danger))] mt-1.5 flex items-center gap-1">
                  <span className="inline-block w-1 h-1 rounded-full bg-[hsl(var(--danger))]" />
                  {customError}
                </p>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => {
                    setCustomOpen(false);
                    setCustomError(null);
                  }}
                  className="flex-1 px-2 py-1.5 text-[11px] bg-transparent border border-[hsl(var(--chat-border))] rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--foreground))]/30 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCustomConfirm}
                  disabled={isLoading}
                  className="flex-1 px-2 py-1.5 text-[11px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] rounded-md font-bold uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Botao 'Reativar Assistente' duplicado abaixo REMOVIDO · agora o
          botao primario no topo ja faz isso (evita 2 botoes mesma acao) */}
    </div>
  );
}
