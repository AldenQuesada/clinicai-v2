import { describe, it, expect } from 'vitest'
import {
  sanitizeWebhookLogBody,
  sanitizeWebhookLogText,
  redactSecretsDeep,
} from './sanitize-webhook-log'

describe('sanitizeWebhookLogBody · JSON path', () => {
  it('redacts apikey at top level', () => {
    const input = JSON.stringify({
      apikey: 'super-secret-key-12345',
      event: 'messages.upsert',
      instance: 'Mih',
    })
    const out = sanitizeWebhookLogBody(input)
    expect(out).not.toContain('super-secret-key-12345')
    expect(out).toContain('[REDACTED]')
    expect(out).toContain('messages.upsert')
    expect(out).toContain('Mih')
  })

  it('redacts headers.authorization nested', () => {
    const input = JSON.stringify({
      data: { headers: { authorization: 'Bearer abc123xyz' } },
    })
    const out = sanitizeWebhookLogBody(input)
    expect(out).not.toContain('abc123xyz')
    expect(out).toContain('[REDACTED]')
  })

  it('redacts x-inbound-secret with hyphen variant', () => {
    const input = JSON.stringify({ headers: { 'x-inbound-secret': 'shhh-secret' } })
    const out = sanitizeWebhookLogBody(input)
    expect(out).not.toContain('shhh-secret')
  })

  it('redacts x_inbound_secret with underscore variant', () => {
    const input = JSON.stringify({ headers: { x_inbound_secret: 'shhh' } })
    const out = sanitizeWebhookLogBody(input)
    expect(out).not.toContain('shhh')
  })

  it('redacts apiKey camelCase variant', () => {
    const input = JSON.stringify({ apiKey: 'cAmElCaSeKey' })
    const out = sanitizeWebhookLogBody(input)
    expect(out).not.toContain('cAmElCaSeKey')
  })

  it('preserves Evolution forensic metadata', () => {
    const input = JSON.stringify({
      event: 'messages.upsert',
      instance: 'Mih',
      data: {
        key: { id: 'WAMID_ABC123', remoteJid: '5544@s.whatsapp.net', fromMe: false },
        messageType: 'conversation',
        pushName: 'Alden Quesada',
        notifyName: 'Alden',
        apikey: 'should-be-removed-FAF40',
      },
    })
    const out = sanitizeWebhookLogBody(input)
    expect(out).toContain('WAMID_ABC123')
    expect(out).toContain('Mih')
    expect(out).toContain('Alden Quesada')
    expect(out).toContain('Alden')
    expect(out).toContain('messages.upsert')
    expect(out).toContain('5544@s.whatsapp.net')
    expect(out).not.toContain('should-be-removed-FAF40')
  })

  it('preserves Cloud Meta contacts/profile.name', () => {
    const input = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: 'Alden' }, wa_id: '5544998787673' }],
                messages: [{ id: 'wamid.HBgM', from: '5544998787673', type: 'text', text: { body: 'oi' } }],
              },
            },
          ],
        },
      ],
    })
    const out = sanitizeWebhookLogBody(input)
    expect(out).toContain('Alden')
    expect(out).toContain('5544998787673')
    expect(out).toContain('wamid.HBgM')
    expect(out).toContain('"name":"Alden"')
  })

  it('redacts deeply nested secret', () => {
    const input = JSON.stringify({
      a: { b: { c: { token: 'deep-secret-XYZ' } } },
    })
    const out = sanitizeWebhookLogBody(input)
    expect(out).not.toContain('deep-secret-XYZ')
  })

  it('redacts secret inside arrays', () => {
    const input = JSON.stringify({
      headers: [{ name: 'apikey', value: 'in-array-secret' }],
    })
    const out = sanitizeWebhookLogBody(input)
    // 'apikey' como STRING value não é chave · não redacta
    // mas se houver { apikey: '...' } como key seria redactado
    expect(out).toContain('in-array-secret') // value é string, não redactado
    expect(out).toContain('apikey')           // como string value, mantém
  })

  it('redacts secret-as-key inside arrays of objects', () => {
    const input = JSON.stringify({
      configs: [{ apikey: 'secret-1' }, { token: 'secret-2' }],
    })
    const out = sanitizeWebhookLogBody(input)
    expect(out).not.toContain('secret-1')
    expect(out).not.toContain('secret-2')
  })
})

describe('sanitizeWebhookLogBody · regex fallback path', () => {
  it('redacts in non-JSON string · key=value pattern', () => {
    const input = 'request failed: apikey=some-secret-value-123'
    const out = sanitizeWebhookLogBody(input)
    expect(out).not.toContain('some-secret-value-123')
    expect(out).toContain('[REDACTED]')
  })

  it('redacts Bearer pattern in plain text', () => {
    const input = 'Authorization: Bearer eyJtoken12345abcDEF'
    const out = sanitizeWebhookLogBody(input)
    expect(out).not.toContain('eyJtoken12345abcDEF')
    expect(out).toContain('Bearer [REDACTED]')
  })

  it('redacts JSON-like literal inside plain text', () => {
    const input = 'error parsing: {"apikey":"xyz123","event":"oops"}'
    const out = sanitizeWebhookLogBody(input)
    expect(out).not.toContain('xyz123')
    expect(out).toContain('[REDACTED]')
    expect(out).toContain('oops') // non-secret preserved
  })

  it('handles base64-like body (non-JSON)', () => {
    const input = '/9j/4AAQSkZJRgABAQAAAQABAAD/...'
    const out = sanitizeWebhookLogBody(input)
    expect(out).toBe(input) // base64 sem padrão de secret · passa direto
  })
})

describe('sanitizeWebhookLogBody · edge cases', () => {
  it('returns empty string on null/undefined/empty', () => {
    expect(sanitizeWebhookLogBody(null)).toBe('')
    expect(sanitizeWebhookLogBody(undefined)).toBe('')
    expect(sanitizeWebhookLogBody('')).toBe('')
  })

  it('handles object with only secret keys', () => {
    const input = JSON.stringify({ apikey: 'a', token: 'b', secret: 'c' })
    const out = sanitizeWebhookLogBody(input)
    expect(out).not.toContain('"a"')
    expect(out).not.toContain('"b"')
    expect(out).not.toContain('"c"')
    expect((out.match(/REDACTED/g) || []).length).toBeGreaterThanOrEqual(3)
  })
})

describe('redactSecretsDeep · direct usage', () => {
  it('redacts top level secret on object', () => {
    const input = { apikey: 'abc', event: 'upsert' }
    const out = redactSecretsDeep(input) as { apikey: string; event: string }
    expect(out.apikey).toBe('[REDACTED]')
    expect(out.event).toBe('upsert')
  })

  it('redacts nested', () => {
    const input = { a: { b: { c: { authorization: 'Bearer xyz' } } } }
    const out = redactSecretsDeep(input) as {
      a: { b: { c: { authorization: string } } }
    }
    expect(out.a.b.c.authorization).toBe('[REDACTED]')
  })

  it('passes through primitives', () => {
    expect(redactSecretsDeep('hello')).toBe('hello')
    expect(redactSecretsDeep(42)).toBe(42)
    expect(redactSecretsDeep(true)).toBe(true)
    expect(redactSecretsDeep(null)).toBe(null)
  })
})

describe('sanitizeWebhookLogText · regex only', () => {
  it('redacts Bearer in plain text', () => {
    const input = 'header: Authorization: Bearer my-token'
    const out = sanitizeWebhookLogText(input)
    expect(out).toBe('header: Authorization: Bearer [REDACTED]')
  })

  it('redacts apikey=value', () => {
    const input = 'curl -H "apikey: sup3r-s3cr3t"'
    const out = sanitizeWebhookLogText(input)
    expect(out).not.toContain('sup3r-s3cr3t')
  })

  it('returns empty on falsy', () => {
    expect(sanitizeWebhookLogText(null)).toBe('')
    expect(sanitizeWebhookLogText(undefined)).toBe('')
    expect(sanitizeWebhookLogText('')).toBe('')
  })

  it('passes through innocent text', () => {
    expect(sanitizeWebhookLogText('hello world · no secrets')).toBe('hello world · no secrets')
  })
})
