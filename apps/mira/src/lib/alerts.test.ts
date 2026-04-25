/**
 * Testes do alert system (lib/alerts.ts) · F6 incidente 26 vouchers.
 *
 * Cobre:
 *   - alertSentry e no-op (Sentry desativado · re-adicionar quando criar conta)
 *   - alertSlack faz POST com payload JSON correto
 *   - alertSlack vira no-op sem SLACK_WEBHOOK_URL
 *   - alertSlack best-effort em http error · nao throws
 *   - alertCritical so dispara Slack enquanto Sentry esta noop
 *
 * Mocks:
 *   - vi.stubGlobal('fetch', ...) · intercepta POST pro Slack
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { alertSentry, alertSlack, alertCritical } from './alerts'

describe('alertSentry · noop enquanto Sentry desativado', () => {
  it('nao throws com Error', () => {
    expect(() => alertSentry(new Error('boom'), { clinic_id: 'c1' })).not.toThrow()
  })

  it('nao throws com unknown nao-Error', () => {
    expect(() => alertSentry('string error', { handler: 'h' })).not.toThrow()
  })

  it('retorna void mesmo com DSN setado (sem-op total)', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://fake@sentry.io/1'
    expect(alertSentry(new Error('boom'), {})).toBeUndefined()
    delete process.env.NEXT_PUBLIC_SENTRY_DSN
  })
})

describe('alertSlack', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SLACK_WEBHOOK_URL
  })

  it('no-op sem SLACK_WEBHOOK_URL', async () => {
    delete process.env.SLACK_WEBHOOK_URL
    await alertSlack('test message', 'warn', { clinic_id: 'c1' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POST payload JSON correto com severity error', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/fake'
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' })

    await alertSlack('queue travada', 'error', {
      clinic_id: 'c1',
      queue_id: 'q1',
      stuck_count: 5,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://hooks.slack.com/fake')
    expect((opts as RequestInit).method).toBe('POST')
    const body = JSON.parse((opts as RequestInit).body as string)
    expect(body.text).toContain('queue travada')
    expect(body.text).toContain('[mira/ERROR]')
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0].color).toBe('#cc0000') // vermelho pra error
    // 3 fields nao-undefined
    expect(body.attachments[0].fields).toHaveLength(3)
  })

  it('best-effort: nao throws em http error', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/fake'
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => 'oops' })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(alertSlack('test', 'warn', {})).resolves.toBeUndefined()
    consoleSpy.mockRestore()
  })

  it('best-effort: nao throws em network error', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/fake'
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(alertSlack('test', 'error', {})).resolves.toBeUndefined()
    consoleSpy.mockRestore()
  })

  it('limita fields a 10 (Slack constraint)', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/fake'
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' })

    const ctx: Record<string, unknown> = {}
    for (let i = 0; i < 20; i++) ctx[`k${i}`] = `v${i}`

    await alertSlack('lots of fields', 'info', ctx)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.attachments[0].fields.length).toBeLessThanOrEqual(10)
  })

  it('descarta fields undefined/null', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/fake'
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' })

    await alertSlack('test', 'info', {
      clinic_id: 'c1',
      missing: undefined,
      empty: null,
      ok: 'yes',
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.attachments[0].fields).toHaveLength(2) // clinic_id + ok
  })
})

describe('alertCritical · enquanto Sentry esta noop, so Slack dispara', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.SLACK_WEBHOOK_URL
  })

  it('dispara Slack quando webhook setado', async () => {
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/fake'
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' })

    await alertCritical('zumbi detectado', new Error('boom'), {
      clinic_id: 'c1',
      queue_id: 'q1',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.text).toContain('zumbi detectado')
    expect(body.text).toContain('[mira/ERROR]')
  })
})
