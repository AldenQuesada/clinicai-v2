/**
 * computeConversationTags · port das regras da clinic-dashboard legacy
 * (js/ui/inbox.ui.js:391-420). Retorna array de tags pra renderizar
 * na lista de conversas.
 *
 * Estética flipbook · Montserrat 8.5px square (DNA .badge-serious).
 */

import type { Conversation } from './useConversations';

export interface ConversationTag {
  /** Label exato uppercase · ex: "LARA", "VOCÊ", "FULL FACE" */
  label: string;
  /** Cor de bg em rgba (já com opacity) */
  bg: string;
  /** Cor do texto */
  color: string;
  /** Cor da border (rgba com opacity 0.3) */
  border: string;
  /** Ordem de prioridade · menor = aparece primeiro */
  order: number;
}

const T = (
  label: string,
  bg: string,
  color: string,
  border: string,
  order: number,
): ConversationTag => ({ label, bg, color, border, order });

/**
 * Computa lista de tags pra uma conversa · seguindo regras legacy.
 * Retorna ordenado por prioridade (urgente primeiro · interesse no fim).
 */
export function computeConversationTags(conv: Conversation): ConversationTag[] {
  const tags: ConversationTag[] = [];

  // 1. URGENTE · prioridade alta · vermelho
  if (conv.is_urgent) {
    tags.push(T('URGENTE', 'rgba(239,68,68,0.10)', '#FCA5A5', 'rgba(239,68,68,0.30)', 1));
  }

  // 2. QUER AGENDAR · custom flag em tags[]
  if (conv.tags?.includes('pronto_agendar')) {
    tags.push(T('QUER AGENDAR', 'rgba(245,158,11,0.15)', '#FCD34D', 'rgba(245,158,11,0.30)', 2));
  }

  // 3. PERGUNTOU PREÇO · custom flag em tags[]
  if (conv.tags?.includes('perguntou_preco')) {
    tags.push(T('PERGUNTOU PREÇO', 'rgba(96,165,250,0.12)', '#93C5FD', 'rgba(96,165,250,0.30)', 3));
  }

  // 4. LARA / VOCÊ · estado da conversa (mutuamente exclusivos)
  if (conv.ai_enabled) {
    tags.push(T('LARA', 'rgba(16,185,129,0.12)', '#6EE7B7', 'rgba(16,185,129,0.30)', 4));
  } else {
    tags.push(T('VOCÊ', 'rgba(167,139,250,0.15)', '#C4B5FD', 'rgba(167,139,250,0.30)', 4));
  }

  // 5. INTERESSE (funnel) · classifica o lead pelo funil
  const funnel = (conv.funnel || '').toLowerCase();
  if (funnel.includes('full')) {
    tags.push(T('FULL FACE', 'rgba(167,139,250,0.15)', '#C4B5FD', 'rgba(167,139,250,0.30)', 5));
  } else if (funnel.includes('procedimento')) {
    tags.push(T('PROCEDIMENTO', 'rgba(96,165,250,0.12)', '#93C5FD', 'rgba(96,165,250,0.30)', 5));
  } else if (funnel.includes('olheira')) {
    // Acrescimo · legacy nao tinha · quei,xas faciais aparecem so no painel de detalhe
    tags.push(T('OLHEIRAS', 'rgba(96,165,250,0.12)', '#93C5FD', 'rgba(96,165,250,0.30)', 5));
  }

  return tags.sort((a, b) => a.order - b.order);
}
