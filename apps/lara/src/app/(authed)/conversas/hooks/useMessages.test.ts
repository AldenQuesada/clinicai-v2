/**
 * Testes do helper messagesFingerprint (real-time refresh · 2026-06-03).
 *
 * Garante que o silent fetch passa a detectar mudanças que NÃO alteram a
 * CONTAGEM de mensagens — reaction, delivery status, content — que o guard
 * antigo por `count` ignorava (caso Arildo: mensagem/reação persistida no DB
 * não aparecia na conversa aberta até trocar de conversa / recarregar).
 *
 * Nota: a parte A do patch (refetch da conversa aberta no evento SSE) é
 * efeito de hook · o repo não tem @testing-library/react/jsdom, então a
 * cobertura unitária fica no helper puro de fingerprint (mesma estratégia do
 * useConversations.test.ts). A fiação SSE→useMessages é validada por
 * typecheck + revisão.
 */

import { describe, it, expect } from 'vitest';
import { messagesFingerprint, type Message } from './useMessages';

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    content: 'Oii, Arildo ✨',
    sender: 'assistant',
    createdAt: '2026-06-03T14:58:02Z',
    type: 'text',
    mediaUrl: null,
    isManual: true,
    deliveryStatus: 'sent',
    providerMsgId: 'A58DBE5BB59883F8EF714C45BA302C9F',
    replyToProviderMsgId: null,
    reaction: null,
    failed: false,
    ...overrides,
  };
}

describe('messagesFingerprint', () => {
  it('é estável quando nada muda (mesma lista → mesmo fingerprint)', () => {
    const a = [makeMsg({ id: 'm1' }), makeMsg({ id: 'm2', content: 'ok' })];
    const b = [makeMsg({ id: 'm1' }), makeMsg({ id: 'm2', content: 'ok' })];
    expect(messagesFingerprint(a)).toBe(messagesFingerprint(b));
  });

  it('muda quando a REAÇÃO muda, mesmo com a contagem igual', () => {
    const before = [makeMsg({ id: 'm1', reaction: null })];
    const after = [makeMsg({ id: 'm1', reaction: '👍' })];
    expect(before.length).toBe(after.length); // count idêntico
    expect(messagesFingerprint(before)).not.toBe(messagesFingerprint(after));
  });

  it('muda quando o DELIVERY STATUS muda, mesmo com a contagem igual', () => {
    const before = [makeMsg({ id: 'm1', deliveryStatus: 'sent' })];
    const after = [makeMsg({ id: 'm1', deliveryStatus: 'read' })];
    expect(before.length).toBe(after.length);
    expect(messagesFingerprint(before)).not.toBe(messagesFingerprint(after));
  });

  it('muda quando o CONTENT é editado, mesmo com a contagem igual', () => {
    const before = [makeMsg({ id: 'm1', content: 'Oi' })];
    const after = [makeMsg({ id: 'm1', content: 'Oi ☺️' })];
    expect(messagesFingerprint(before)).not.toBe(messagesFingerprint(after));
  });

  it('muda quando ENTRA mensagem nova (contagem sobe)', () => {
    const before = [makeMsg({ id: 'm1' })];
    const after = [makeMsg({ id: 'm1' }), makeMsg({ id: 'm2', content: 'nova' })];
    expect(after.length).toBeGreaterThan(before.length); // notificação/scroll
    expect(messagesFingerprint(before)).not.toBe(messagesFingerprint(after));
  });

  it('distingue campos adjacentes (sem colisão por separador)', () => {
    // "ab"+"c" vs "a"+"bc" não podem colidir — separadores control-char.
    const x = [makeMsg({ id: 'm1', content: 'ab', type: 'ctext' })];
    const y = [makeMsg({ id: 'm1', content: 'a', type: 'bctext' })];
    expect(messagesFingerprint(x)).not.toBe(messagesFingerprint(y));
  });

  it('lista vazia → fingerprint vazio (estável)', () => {
    expect(messagesFingerprint([])).toBe('');
  });
});
