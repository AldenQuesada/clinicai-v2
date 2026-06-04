/**
 * Testes do extractEvolutionMessage · foco em LID Layer-2 (2026-06-04).
 *
 * Cobre:
 *   - @lid SEM senderPn → ok:true, lidUnresolved=true, phone='', remoteJid setado
 *     (caller resolve via wa_contact_identities antes de resolveRole)
 *   - @lid COM senderPn → ok:true, phone normal, sem lidUnresolved
 *   - @s.whatsapp.net puro → ok:true, phone normal, sem lidUnresolved
 *   - fromMe / group / not-message-event → skip auditável
 *   - bad_phone_format (ex: phone curto sem ser @lid) → skip
 *
 * Regressão guard: lidUnresolved só aparece em LID sem senderPn · nunca em
 * outros caminhos (evita caller fazer lookup desnecessário).
 */
import { describe, it, expect } from 'vitest'
import { extractEvolutionMessage } from './evolution-extract'

const baseEnvelope = (data: Record<string, unknown>) => ({
  event: 'messages.upsert',
  instance: 'mira-mirian',
  data,
})

describe('extractEvolutionMessage · @lid sem senderPn (Mira LID Layer-2)', () => {
  it('marca lidUnresolved=true e devolve remoteJid quando @lid sem senderPn', () => {
    const r = extractEvolutionMessage(
      baseEnvelope({
        key: { id: 'WAID001', fromMe: false, remoteJid: '93716287086617@lid' },
        message: { conversation: 'Voucher Amanda Manfrinato\n44991756601' },
        messageType: 'conversation',
        pushName: 'Neuropsi Fátima Haupt',
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.msg.lidUnresolved).toBe(true)
    expect(r.msg.remoteJid).toBe('93716287086617@lid')
    expect(r.msg.phone).toBe('')
    expect(r.msg.messageId).toBe('WAID001')
    expect(r.msg.content).toContain('Amanda Manfrinato')
    expect(r.msg.pushName).toBe('Neuropsi Fátima Haupt')
  })

  it('preserva isAudio quando @lid sem senderPn vem com audioMessage', () => {
    const r = extractEvolutionMessage(
      baseEnvelope({
        key: { id: 'WAID002', fromMe: false, remoteJid: '93716287086617@lid' },
        message: { audioMessage: { mimetype: 'audio/ogg' } },
        messageType: 'audioMessage',
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.msg.lidUnresolved).toBe(true)
    expect(r.msg.isAudio).toBe(true)
    expect(r.msg.content).toBe('')
  })
})

describe('extractEvolutionMessage · @lid com senderPn (caminho normal)', () => {
  it('resolve phone via senderPn no key e NÃO marca lidUnresolved', () => {
    const r = extractEvolutionMessage(
      baseEnvelope({
        key: {
          id: 'WAID003',
          fromMe: false,
          remoteJid: '93716287086617@lid',
          senderPn: '5544999098861@s.whatsapp.net',
        },
        message: { conversation: 'ok' },
        messageType: 'conversation',
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.msg.phone).toBe('5544999098861')
    expect(r.msg.lidUnresolved).toBeUndefined()
    expect(r.msg.remoteJid).toBeUndefined()
  })

  it('aceita senderPn em data quando ausente em key', () => {
    const r = extractEvolutionMessage(
      baseEnvelope({
        key: { id: 'WAID004', fromMe: false, remoteJid: '93716287086617@lid' },
        senderPn: '5544999098861',
        message: { conversation: 'ok' },
        messageType: 'conversation',
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.msg.phone).toBe('5544999098861')
    expect(r.msg.lidUnresolved).toBeUndefined()
  })
})

describe('extractEvolutionMessage · caminhos não-LID (sem regressão)', () => {
  it('extrai phone direto de @s.whatsapp.net sem flag lidUnresolved', () => {
    const r = extractEvolutionMessage(
      baseEnvelope({
        key: { id: 'WAID005', fromMe: false, remoteJid: '5544999098861@s.whatsapp.net' },
        message: { conversation: 'oi' },
        messageType: 'conversation',
      }),
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.msg.phone).toBe('5544999098861')
    expect(r.msg.lidUnresolved).toBeUndefined()
    expect(r.msg.remoteJid).toBeUndefined()
  })

  it('skip outbound (fromMe=true)', () => {
    const r = extractEvolutionMessage(
      baseEnvelope({
        key: { id: 'WAID006', fromMe: true, remoteJid: '5544999098861@s.whatsapp.net' },
        message: { conversation: 'ack' },
        messageType: 'conversation',
      }),
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.skip).toBe('outbound')
  })

  it('skip grupo (@g.us)', () => {
    const r = extractEvolutionMessage(
      baseEnvelope({
        key: { id: 'WAID007', fromMe: false, remoteJid: '120363022650163701@g.us' },
        message: { conversation: 'oi galera' },
        messageType: 'conversation',
      }),
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.skip).toBe('group')
  })

  it('skip event ≠ messages.upsert', () => {
    const r = extractEvolutionMessage({ event: 'presence.update', data: {} })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.skip).toBe('not_message_event')
  })

  it('skip bad_phone_format quando @s.whatsapp.net traz phone curto', () => {
    const r = extractEvolutionMessage(
      baseEnvelope({
        key: { id: 'WAID008', fromMe: false, remoteJid: '12345@s.whatsapp.net' },
        message: { conversation: 'oi' },
        messageType: 'conversation',
      }),
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.skip).toBe('bad_phone_format')
  })
})
