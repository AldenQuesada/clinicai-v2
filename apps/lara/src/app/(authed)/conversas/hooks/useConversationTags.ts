/**
 * computeConversationTags · pills do card de conversa.
 *
 * Modelo canônico (Alden 2026-05-05 · view wa_conversations_operational_view):
 *
 *   Pills de fila/operação derivam EXCLUSIVAMENTE da view:
 *     - URGENTE   ← conv.is_urgente OU conv.op_response_color ∈ {vermelho, critico}
 *     - DRA       ← conv.is_dra OU conv.operational_owner === 'mirian'
 *     - LARA      ← conv.is_lara (estado da IA · NÃO é dono operacional)
 *
 *   NÃO mostrar mais:
 *     - VOCÊ (forçado false na view)
 *     - MIRA (forçado false na view)
 *     - QUER AGENDAR (lia c.tags.includes('pronto_agendar') · zumbi)
 *     - PERGUNTOU PREÇO (idem · 'perguntou_preco')
 *     - SECRETARIA (canal · não é dono operacional aqui · default implícito)
 *
 *   Pills de funil (FULL FACE / PROCEDIMENTO / OLHEIRAS) mantidas · derivam
 *   de leads.funnel · ortogonal ao modelo de owner.
 *
 *   Prioridade visual: DRA tem precedência sobre LARA (uma conv atribuída à
 *   Mirian não mostra pill LARA mesmo se ai_enabled=true).
 *
 * Estética flipbook · Montserrat 8.5px square (DNA .badge-serious).
 */

import type { Conversation } from './useConversations';

export interface ConversationTag {
  /** Label exato uppercase · ex: "DRA", "URGENTE", "FULL FACE" */
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
 * Computa lista de pills pra uma conversa · usa view operacional como SoT.
 * Retorna ordenado por prioridade (urgente primeiro · funil no fim).
 */
export function computeConversationTags(conv: Conversation): ConversationTag[] {
  const tags: ConversationTag[] = [];

  // 1. URGENTE · pills · alerta crítico · vermelho
  // Prefere is_urgente da view · fallback OR no op_response_color (caso
  // is_urgente venha undefined em conv antiga).
  const isUrgente =
    conv.is_urgente === true ||
    (typeof conv.op_response_color === 'string' &&
      ['vermelho', 'critico'].includes(conv.op_response_color));
  if (isUrgente) {
    tags.push(T('URGENTE', 'rgba(239,68,68,0.10)', '#FCA5A5', 'rgba(239,68,68,0.30)', 1));
  }

  // 2. DRA · dono = Mirian · prioridade visual sobre LARA
  const isDra = conv.is_dra === true || conv.operational_owner === 'mirian';
  if (isDra) {
    tags.push(T('DRA', 'rgba(212,184,148,0.18)', '#D4B894', 'rgba(212,184,148,0.35)', 2));
  }

  // 3. LARA · estado da IA · só renderiza se NÃO for Dra (DRA tem precedência)
  // is_lara é boolean da view: ai_enabled E !assigned_to E inbox sdr
  if (!isDra && conv.is_lara === true) {
    tags.push(T('LARA', 'rgba(16,185,129,0.12)', '#6EE7B7', 'rgba(16,185,129,0.30)', 4));
  }

  // REMOVIDOS (Alden 2026-05-05 · modelo canônico · clean cards):
  //   - VOCÊ (não governa nada · view força is_voce=false)
  //   - MIRA (não é dono operacional · view força is_mira=false)
  //   - LUCIANA / SECRETARIA pill (default implícito · 107/108 convs · poluição
  //     visual)
  //   - QUER AGENDAR (c.tags.includes('pronto_agendar') · tag zumbi legacy)
  //   - PERGUNTOU PREÇO (c.tags.includes('perguntou_preco') · tag zumbi)
  //   - FULL FACE / PROCEDIMENTO / OLHEIRAS (pills de funnel · aparecem em
  //     quase todas as conversas → ruído visual). Funnel continua disponível
  //     no LeadInfoPanel (detalhe da conv) e no filtro avançado da topbar.
  //
  // Cards mostram só o que exige atenção: URGENTE, DRA, LARA + nada mais.

  return tags.sort((a, b) => a.order - b.order);
}
