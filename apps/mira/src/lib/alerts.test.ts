/**
 * Testes do alert system (lib/alerts.ts) · F6 incidente 26 vouchers.
 *
 * Cobre:
 *   - alertSentry chama Sentry.captureException com tags + extras corretos
 *   - alertSentry vira no-op sem NEXT_PUBLIC_SENTRY_DSN
 *   - alertSlack faz POST com payload JSON correto
 *   - alertSlack vira no-op sem SLACK_WEBHOOK_URL
 *   - alertSlack best-effort em http error · nao throws
 *   - alertCritical combina os dois
 *
 * Mocks:
 *   - vi.mock('@sentry/nextjs') · captura chamadas captureException + scope
 *   - vi.stubGlobal('fetch', ...) · intercepta POST pro Slack
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock Sentry · vi.mock e hoisted antes do import do modulo sob teste
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  withScope: vi.fn((cb: (scope: unknown) => void) => {
    const scope = {
      setTag: vi.fn(),
      setExtra: vi.fn(),
    }
    cb(scope)
    return scope
  }),
}))

import * as Sentry from '@sentry/nextjs'
import { alertSentry, alertSlack, alertCritical } from './alerts'

describe('alertSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN
  })

  it('no-op sem NEXT_PUBLIC_SENTRY_DSN', () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN
    alertSentry(new Error('boom'), { clinic_id: 'c1' })
    expect(Sentry.captureException).not.toHaveBeenCalled()
    expect(Sentry.withScope).not.toHaveBeenCalled()
  })

  it('chama withScope + captureException quando DSN setado', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://fake@sentry.io/1'
    const err = new Error('boom')
    alertSentry(err, { clinic_id: 'c1', queue_id: 'q1' })

    expect(Sentry.withScope).toHaveBeenCalledOnce()
    expect(Sentry.captureException).toHaveBeenCalledWith(err)
  })

  it('separa tags (clinic_id, handler, app) de extras (queue_id, etc)', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://fake@sentry.io/1'

    // Captura o scope passado · withScope mock executa callback com scope mock
    let capturedScope:
      | { setTag: ReturnType<typeof vi.fn>; setExtra: ReturnType<typeof vi.fn> }
      | null = null
    ;(Sentry.withScope as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (cb: (scope: unknown) => void) => {
        const scope = { setTag: vi.fn(), setExtra: vi.fn() }
        capturedScope = scope as typeof capturedScope
        cb(scope)
      },
    )

    alertSentry(new Error('boom'), {
      clinic_id: 'c1',
      handler: 'b2b-voucher-dispatch-worker',
      queue_id: 'q1',
      voucher_count: 5,
    })

    // app=mira default tag + clinic_id + handler · 3 tags
    expect(capturedScope!.setTag).toHaveBeenCalledWith('app', 'mira')
    expect(capturedScope!.setTag).toHaveBeenCalledWith('clinic_id', 'c1')
    expect(capturedScope!.setTag).toHaveBeenCalledWith(
      'handler',
      'b2b-voucher-dispatch-worker',
    )
    // queue_id e voucher_count viram extras (nao sao tag keys)
    expect(capturedScope!.setExtra).toHaveBeenCalledWith('queue_id', 'q1')
    expect(capturedScope!.setExtra).toHaveBeenCalledWith('voucher_count', 5)
  })

  it('aceita unknown nao-Error · wrap em Error(String(err))', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://fake@sentry.io/1'
    alertSentry('string error', { handler: 'h' })
    expect(Sentry.captureException).toHaveBeenCalled()
    const arg = (Sentry.captureException as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0]
    expect(arg).toBeInstanceOf(Error)
    expect((arg as Error).message).toBe('string error')
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

    // Console.error pode disparar · noop pra silenciar test output
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

describe('alertCritical · combina Sentry + Slack', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.NEXT_PUBLIC_SENTRY_DSN
    delete process.env.SLACK_WEBHOOK_URL
  })

  it('chama ambos canais quando ambas envs setadas', async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://fake@sentry.io/1'
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/fake'
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' })

    await alertCritical('zumbi detectado', new Error('boom'), {
      clinic_id: 'c1',
      queue_id: 'q1',
    })

    expect(Sentry.captureException).toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
