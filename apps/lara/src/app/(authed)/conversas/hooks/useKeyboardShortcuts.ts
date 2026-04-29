import { useEffect, useMemo } from 'react';
import type { Conversation } from './useConversations';

export interface KeyboardShortcutsArgs {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  setSelectedConversation: (c: Conversation | null) => void;
  dispatchAction: (action: 'assume' | 'resolve' | 'archive' | 'transfer') => void;
  /**
   * Quando true, todos os atalhos sao desabilitados (ex: modal aberto).
   */
  disabled?: boolean;
}

export interface ShortcutHint {
  key: string;
  label: string;
}

/**
 * P-15 · Atalhos globais de teclado pra /conversas.
 * - j / k: navegar lista filtrada
 * - r: resolver conversa atual
 * - a: assumir conversa atual
 *
 * Ignora keydown se foco estiver em input/textarea/contenteditable
 * ou se `disabled` for true (modal aberto).
 */
export function useKeyboardShortcuts({
  conversations,
  selectedConversation,
  setSelectedConversation,
  dispatchAction,
  disabled = false,
}: KeyboardShortcutsArgs) {
  const shortcuts = useMemo<ShortcutHint[]>(
    () => [
      { key: 'j', label: 'próxima conversa' },
      { key: 'k', label: 'conversa anterior' },
      { key: 'r', label: 'resolver' },
      { key: 'a', label: 'assumir' },
    ],
    []
  );

  useEffect(() => {
    if (disabled) return;

    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      // tambem checa activeElement por seguranca
      const active = document.activeElement;
      if (active && active instanceof HTMLElement) {
        const aTag = active.tagName;
        if (aTag === 'INPUT' || aTag === 'TEXTAREA' || aTag === 'SELECT') return true;
        if (active.isContentEditable) return true;
      }
      return false;
    };

    const handler = (e: KeyboardEvent) => {
      // Ignora combinacoes de modificador (ctrl/cmd/alt/meta)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      const key = e.key.toLowerCase();
      if (!['j', 'k', 'r', 'a'].includes(key)) return;

      // Navegacao na lista
      if (key === 'j' || key === 'k') {
        if (conversations.length === 0) return;
        const currentIdx = selectedConversation
          ? conversations.findIndex((c) => c.conversation_id === selectedConversation.conversation_id)
          : -1;
        let nextIdx: number;
        if (key === 'j') {
          nextIdx = currentIdx < 0 ? 0 : Math.min(conversations.length - 1, currentIdx + 1);
        } else {
          nextIdx = currentIdx <= 0 ? 0 : currentIdx - 1;
        }
        if (nextIdx !== currentIdx) {
          e.preventDefault();
          setSelectedConversation(conversations[nextIdx]);
        }
        return;
      }

      // Acoes precisam de conversa selecionada
      if (!selectedConversation) return;

      if (key === 'r') {
        e.preventDefault();
        dispatchAction('resolve');
        return;
      }
      if (key === 'a') {
        e.preventDefault();
        dispatchAction('assume');
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [conversations, selectedConversation, setSelectedConversation, dispatchAction, disabled]);

  return { shortcuts };
}
