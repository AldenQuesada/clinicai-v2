'use client';

/**
 * QuickTemplatesDropdown · W-09 (SC-02 · Sprint C).
 *
 * Floating menu acima do textarea do MessageArea. Ate 8 templates renderizados;
 * scroll vertical alem disso. Navegacao 100% teclado:
 *   - ArrowUp/Down · move highlight
 *   - Enter        · pick highlighted
 *   - Escape       · close
 * Click tambem pega.
 *
 * Visual · cada row:
 *   slug em mono champagne   |  name em foreground (top)
 *                            |  body preview muted (80 chars · 1 linha)
 *
 * O componente NAO aplica substituicao de variaveis · apenas devolve o
 * QuickTemplate inteiro pro caller via onPick. Caller (MessageArea) faz
 * substituicao com o contexto (lead, clinica) e fill no textarea.
 */

import { useEffect, useRef } from 'react';
import type { QuickTemplate } from '../hooks/useQuickTemplates';

const MAX_VISIBLE = 8;
const PREVIEW_CHARS = 80;

interface QuickTemplatesDropdownProps {
  templates: QuickTemplate[];
  isLoading: boolean;
  highlightedIndex: number;
  onHighlight: (index: number) => void;
  onPick: (template: QuickTemplate) => void;
  onClose: () => void;
}

export function QuickTemplatesDropdown({
  templates,
  isLoading,
  highlightedIndex,
  onHighlight,
  onPick,
  onClose,
}: QuickTemplatesDropdownProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Scroll item destacado pra view (teclado · garante visibilidade)
  useEffect(() => {
    const el = itemRefs.current[highlightedIndex];
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [highlightedIndex]);

  // Click fora · fecha
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Templates rapidos"
      className="absolute bottom-full left-0 right-0 mb-2 mx-4 z-30 rounded-lg border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] shadow-xl overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-[hsl(var(--chat-border))] flex items-center justify-between bg-[hsl(var(--chat-bg))]">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Templates rápidos
        </span>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
          ↑↓ navegar · ⏎ inserir · esc fechar
        </span>
      </div>

      <div
        className="max-h-[320px] overflow-y-auto scrollbar-thin"
        style={{ maxHeight: `${MAX_VISIBLE * 64}px` }}
      >
        {isLoading ? (
          <div className="px-4 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
            Carregando templates...
          </div>
        ) : templates.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-[hsl(var(--muted-foreground))]">
            Nenhum template encontrado
          </div>
        ) : (
          templates.map((tpl, idx) => {
            const isActive = idx === highlightedIndex;
            const preview = (tpl.body || '').slice(0, PREVIEW_CHARS);
            const truncated = (tpl.body || '').length > PREVIEW_CHARS;
            return (
              <button
                key={tpl.id}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                type="button"
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => onHighlight(idx)}
                onClick={() => onPick(tpl)}
                className={`w-full text-left px-3 py-2 border-b border-[hsl(var(--chat-border))] last:border-b-0 transition-colors ${
                  isActive
                    ? 'bg-[hsl(var(--primary))]/10'
                    : 'hover:bg-[hsl(var(--chat-bg))]'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  {tpl.slug && (
                    <span className="text-[11px] font-mono text-[hsl(var(--accent))] shrink-0">
                      /{tpl.slug}
                    </span>
                  )}
                  <span className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
                    {tpl.name}
                  </span>
                </div>
                {preview && (
                  <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))] truncate">
                    {preview}
                    {truncated ? '...' : ''}
                  </p>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
