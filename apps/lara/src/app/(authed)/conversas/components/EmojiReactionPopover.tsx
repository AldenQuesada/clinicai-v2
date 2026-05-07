'use client';

/**
 * EmojiReactionPopover · React A (2026-05-07).
 *
 * Popover compacto · 6 emojis padrão WhatsApp · sem dependência externa.
 * MVP A · click-outside fecha · current emoji destacado quando presente ·
 * botão remover quando há reação atual.
 *
 * Onda D futura troca os 6 fixos por emoji-mart picker completo.
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

interface EmojiReactionPopoverProps {
  /** Emoji corrente (string) · destaca botão correspondente. */
  currentReaction?: string | null;
  /** Click num emoji · caller envia POST + fecha popover. */
  onSelect: (emoji: string) => void;
  /** Click no botão remover · só renderiza quando currentReaction existe. */
  onRemove?: () => void;
  /** Click fora ou X · caller fecha o popover. */
  onClose: () => void;
}

export function EmojiReactionPopover({
  currentReaction,
  onSelect,
  onRemove,
  onClose,
}: EmojiReactionPopoverProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Click outside fecha · React A · padrão de popover do projeto.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Escape também fecha.
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Escolher emoji de reação"
      className="absolute z-30 mt-1 inline-flex items-center gap-0.5 rounded-full bg-[hsl(var(--chat-panel-bg))] border border-[hsl(var(--chat-border))] shadow-xl px-1.5 py-1"
      onClick={(e) => e.stopPropagation()}
    >
      {QUICK_EMOJIS.map((emoji) => {
        const isCurrent = currentReaction === emoji;
        return (
          <button
            key={emoji}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(emoji);
            }}
            title={`Reagir com ${emoji}`}
            aria-label={`Reagir com ${emoji}`}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-base hover:scale-125 transition-transform cursor-pointer ${
              isCurrent ? 'bg-[hsl(var(--primary))]/20 ring-1 ring-[hsl(var(--primary))]/40' : 'hover:bg-white/[0.08]'
            }`}
          >
            <span className="leading-none pointer-events-none">{emoji}</span>
          </button>
        );
      })}
      {currentReaction && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          title="Remover reação"
          aria-label="Remover reação"
          className="ml-1 inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-[hsl(var(--danger))]/[0.15] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--danger))] cursor-pointer"
        >
          <X className="w-3 h-3 pointer-events-none" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
