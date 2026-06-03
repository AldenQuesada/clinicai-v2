/**
 * Testes do helper hasSelectedConversationChanged (P1 backlog /secretaria).
 *
 * Garante que mudanças OPERACIONAIS (assign/status/dono/filas/SLA) passam a
 * forçar o refresh do painel direito, sem re-renderizar à toa quando nada
 * relevante muda (preserva a intenção original do hasChanged).
 */

import { describe, it, expect } from 'vitest';
import { hasSelectedConversationChanged, type Conversation } from './useConversations';

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    conversation_id: 'c1',
    phone: '5544999990000',
    lead_name: 'Fulano',
    lead_id: 'l1',
    status: 'active',
    ai_enabled: true,
    ai_paused_until: null,
    last_message_text: 'oi',
    last_message_at: '2026-06-03T10:00:00Z',
    funnel: 'lead',
    phase: 'lead',
    lead_score: 0,
    tags: [],
    queixas: [],
    assigned_to: null,
    assigned_at: null,
    operational_owner: 'secretaria',
    operational_owner_label: 'Secretaria',
    is_assigned: false,
    assigned_to_name: null,
    assigned_to_role: null,
    is_dra: false,
    is_lara: false,
    is_secretaria: true,
    is_aguardando: false,
    is_urgente: false,
    op_response_color: 'none',
    response_color: 'respondido',
    waiting_human_response: false,
    minutes_waiting: null,
    last_patient_msg_at: null,
    last_human_reply_at: null,
    last_inbound_msg: null,
    last_human_msg: null,
    last_lara_msg: null,
    last_outbound_msg: null,
    minutes_since_last_inbound: null,
    ...overrides,
  } as unknown as Conversation;
}

describe('hasSelectedConversationChanged', () => {
  it('retorna false quando nada relevante mudou (não re-renderiza à toa)', () => {
    expect(hasSelectedConversationChanged(makeConv(), makeConv())).toBe(false);
  });

  it('detecta mudanças OPERACIONAIS que governam o painel direito', () => {
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ assigned_to: 'user-1' }))).toBe(true);
    expect(hasSelectedConversationChanged(makeConv({ status: 'active' }), makeConv({ status: 'resolved' }))).toBe(true);
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ operational_owner: 'mirian' }))).toBe(true);
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ is_assigned: true }))).toBe(true);
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ assigned_to_name: 'Dra. Mirian' }))).toBe(true);
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ is_dra: true }))).toBe(true);
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ is_aguardando: true }))).toBe(true);
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ is_urgente: true }))).toBe(true);
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ op_response_color: 'vermelho' }))).toBe(true);
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ minutes_since_last_inbound: 12 }))).toBe(true);
  });

  it('mantém a deteção original (mensagem / IA / tags / queixas)', () => {
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ last_message_text: 'nova msg' }))).toBe(true);
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ ai_enabled: false }))).toBe(true);
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ tags: ['urgente'] }))).toBe(true);
    expect(hasSelectedConversationChanged(makeConv(), makeConv({ queixas: ['dor'] }))).toBe(true);
  });

  it('ignora campos que NÃO governam o painel (evita re-render desnecessário)', () => {
    // lead_score não está na lista comparada → não deve forçar re-render
    expect(hasSelectedConversationChanged(makeConv({ lead_score: 1 }), makeConv({ lead_score: 99 }))).toBe(false);
  });
});
