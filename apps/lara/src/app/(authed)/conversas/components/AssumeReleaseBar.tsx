/**
 * AssumeReleaseBar · barra de toggle ASSUMIR CONVERSA / DEVOLVER PARA LARA
 *
 * Substitui a linha curta "Lara ativa · pausa por 30min" por um controle bem
 * visível no header do chat. Toggle no MESMO LUGAR (mirror do legacy
 * clinic-dashboard inbox.ui.js:449-496):
 *  - Lara ativa  → botão CHAMPAGNE "Assumir conversa" + dropdown "Pausar por..."
 *  - Você assumiu → botão VERDE "Devolver para Lara" + tempo restante
 *
 * Reusa a API /api/conversations/:id/pause via usePauseStatus (mesmo backend
 * do AgentPauseSection do painel direito · ações ficam casadas).
 */

'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Play, ChevronDown, Sunrise, Calendar as CalendarIcon } from 'lucide-react';
import { usePauseStatus } from '../hooks/usePauseStatus';

interface AssumeReleaseBarProps {
  conversationId: string;
  aiEnabled: boolean;
  onStatusChange?: () => void;
}

/**
 * Minutos até "amanhã 09:00 BRT" pulando fim-de-semana (mirror do
 * AgentPauseSection.minutesUntilNextWorkdayMorning).
 */
function minutesUntilNextWorkdayMorning(): { minutes: number; label: string } {
  const now = new Date();
  const target = new Date(now);
  target.setHours(9, 0, 0, 0);
  target.setDate(target.getDate() + 1);
  while (target.getDay() === 0 || target.getDay() === 6) {
    target.setDate(target.getDate() + 1);
  }
  const diffMs = target.getTime() - now.getTime();
  const minutes = Math.max(1, Math.ceil(diffMs / 60000));
  const isTomorrow = target.getDate() === new Date(now.getTime() + 86400000).getDate();
  return { minutes, label: isTomorrow ? 'Amanhã 9h' : 'Segunda 9h' };
}

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRemaining(minutes: number): string {
  if (!minutes) return '00:00';
  const hrs = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const secs = Math.floor((minutes * 60) % 60);
  return `${hrs > 0 ? String(hrs).padStart(2, '0') + ':' : ''}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function AssumeReleaseBar({
  conversationId,
  aiEnabled,
  onStatusChange,
}: AssumeReleaseBarProps) {
  const { pauseStatus, isLoading, pauseAgent, reactivateAgent } = usePauseStatus(conversationId);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const minDatetime = useMemo(() => {
    const d = new Date(Date.now() + 60000);
    return toDatetimeLocalValue(d);
  }, [customOpen]);

  const tomorrow9 = useMemo(() => minutesUntilNextWorkdayMorning(), [dropdownOpen]);

  // Click-outside fecha dropdown
  useEffect(() => {
    if (!dropdownOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setCustomOpen(false);
        setCustomError(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [dropdownOpen]);

  const closeAll = () => {
    setDropdownOpen(false);
    setCustomOpen(false);
    setCustomError(null);
  };

  const handlePause = async (minutes: number) => {
    const ok = await pauseAgent(minutes);
    if (ok && onStatusChange) onStatusChange();
    closeAll();
  };

  const handleRelease = async () => {
    const ok = await reactivateAgent();
    if (ok && onStatusChange) onStatusChange();
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
    await handlePause(minutes);
    setCustomValue('');
  };

  // Estado: aiEnabled vem da prop (real-time via SSE), pauseStatus do hook
  const showAssume = aiEnabled;
  const remaining = pauseStatus.remainingTime;

  return (
    <div className="border-b border-white/[0.06] bg-[hsl(var(--chat-panel-bg))] shrink-0 px-5 py-2.5">
      <div className={`flex items-center gap-3 ${showAssume ? 'justify-between' : 'justify-end'}`}>
        {/* Lado esquerdo · status textual · so quando Lara ativa
            (quando voce assumiu, status vai pra dentro do botao a direita
            evitando duplicacao visual · proposta A da revisao UIX 2026-04-30) */}
        {showAssume && (
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] animate-pulse shrink-0" />
            <span className="font-meta text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--success))] shrink-0">Lara conduzindo</span>
            <span className="text-[11px] text-[hsl(var(--muted-foreground))] truncate opacity-70 hidden sm:inline">
              · enviar mensagem pausa por 30min
            </span>
          </div>
        )}

        {/* Lado direito · botão toggle + dropdown */}
        <div ref={containerRef} className="relative flex items-center gap-1.5 shrink-0">
          {showAssume ? (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setDropdownOpen((v) => !v)}
              className="font-meta inline-flex items-center gap-1.5 uppercase text-[10px] tracking-[0.16em] px-3 py-1.5 rounded-sm transition-colors disabled:opacity-50"
              style={{
                background: 'rgba(201,169,110,0.12)',
                color: '#C9A96E',
                border: '1px solid rgba(201,169,110,0.4)',
                fontWeight: 600,
                letterSpacing: '0.16em',
              }}
            >
              {isLoading ? '...' : 'Assumir conversa'}
              <ChevronDown className="w-3 h-3" strokeWidth={2} />
            </button>
          ) : (
            // Botao verde com cronometro EMBUTIDO · sem ilha de status separada
            // Estrutura: Play + 'Devolver para Lara' + separador + cronometro
            <button
              type="button"
              disabled={isLoading}
              onClick={handleRelease}
              className="font-meta inline-flex items-center gap-2 uppercase text-[10px] tracking-[0.16em] px-3.5 py-1.5 rounded-sm transition-colors disabled:opacity-50"
              style={{
                background: 'rgba(16,185,129,0.12)',
                color: '#6EE7B7',
                border: '1px solid rgba(16,185,129,0.4)',
                fontWeight: 600,
                letterSpacing: '0.16em',
              }}
            >
              <Play className="w-3 h-3" strokeWidth={2} />
              <span>{isLoading ? '...' : 'Devolver para Lara'}</span>
              {remaining > 0 && (
                <>
                  <span className="opacity-40 normal-case font-mono">·</span>
                  <span className="font-mono tabular-nums normal-case tracking-normal text-[11px] opacity-95">
                    {formatRemaining(remaining)}
                  </span>
                </>
              )}
            </button>
          )}

          {dropdownOpen && !customOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] rounded-md shadow-luxury-md overflow-hidden z-30">
              <div className="px-4 py-2 border-b border-white/[0.04]">
                <p className="font-meta uppercase text-[8.5px] tracking-[0.18em] text-[hsl(var(--muted-foreground))]">
                  Pausar Lara por...
                </p>
              </div>
              <button
                type="button"
                onClick={() => handlePause(tomorrow9.minutes)}
                className="w-full text-left px-4 py-2.5 text-xs text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 flex items-center gap-2 font-medium transition-colors"
              >
                <Sunrise className="h-3.5 w-3.5" strokeWidth={1.5} />
                {tomorrow9.label}
              </button>
              <div className="h-px bg-[hsl(var(--chat-border))]" />
              {[15, 30, 60, 120, 1440].map((mins) => (
                <button
                  type="button"
                  key={mins}
                  onClick={() => handlePause(mins)}
                  className="w-full text-left px-4 py-2 text-xs text-[hsl(var(--foreground))] hover:bg-white/[0.03] transition-colors"
                >
                  {mins === 1440 ? '24 horas' : mins >= 60 ? `${mins / 60} hora(s)` : `${mins} minutos`}
                </button>
              ))}
              <div className="h-px bg-[hsl(var(--chat-border))]" />
              <button
                type="button"
                onClick={() => {
                  setCustomOpen(true);
                  setCustomError(null);
                  const initial = new Date(Date.now() + 60 * 60000);
                  setCustomValue(toDatetimeLocalValue(initial));
                }}
                className="w-full text-left px-4 py-2.5 text-xs text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/10 flex items-center gap-2 font-medium transition-colors"
              >
                <CalendarIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                Personalizar...
              </button>
            </div>
          )}

          {dropdownOpen && customOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] rounded-md shadow-luxury-md p-3.5 z-30">
              <label className="font-meta uppercase block text-[9px] tracking-[0.18em] text-[hsl(var(--primary))] mb-2 flex items-center gap-1.5">
                <CalendarIcon className="h-3 w-3" strokeWidth={1.5} />
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
                  type="button"
                  onClick={() => {
                    setCustomOpen(false);
                    setCustomError(null);
                  }}
                  className="flex-1 px-2 py-1.5 text-[11px] bg-transparent border border-[hsl(var(--chat-border))] rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--foreground))]/30 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
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
    </div>
  );
}
