/**
 * Testes do intent classifier 2-tier.
 *
 * Cobre:
 *   - Tier 1 regex: matching de intents conhecidos (saudacao/help, voucher,
 *     bulk, approve/reject, query)
 *   - Tier 1 retorna null quando nao bate · forca fallback Tier 2
 *   - Tier 2 fallback: mock global.fetch retornando intent classificado
 *   - confidence baixa (<0.5) em Tier 2 forca intent='unknown'
 *   - sem ANTHROPIC_API_KEY · Tier 2 retorna unknown sem chamar fetch
 *
 * Mock pattern: vi.stubGlobal('fetch', ...) pra interceptar a chamada
 * Anthropic. Nunca hit em prod.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  classifyTier1,
  classifyTier2,
  classifyIntent,
} from './intent-classifier'

describe('classifyTier1 · regex matching', () => {
  it('classifica saudacao/help como admin.help', () => {
    const r = classifyTier1('oi', 'admin')
    expect(r?.intent).toBe('admin.help')
    expect(r?.tier).toBe(1)
    expect(r?.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('classifica "menu" como admin.help', () => {
    const r = classifyTier1('menu', 'admin')
    expect(r?.intent).toBe('admin.help')
  })

  it('classifica voucher single como partner.emit_voucher', () => {
    const r = classifyTier1('emite voucher pra Maria', 'partner')
    expect(r?.intent).toBe('partner.emit_voucher')
    expect(r?.tier).toBe(1)
  })

  it('classifica bulk (3 vouchers) como partner.bulk_emit_voucher', () => {
    const r = classifyTier1(
      'emite 3 vouchers: Maria 44991111111, Ana 44992222222, Bia 44993333333',
      'partner',
    )
    expect(r?.intent).toBe('partner.bulk_emit_voucher')
    expect(r?.tier).toBe(1)
  })

  it('classifica approve em admin', () => {
    const r = classifyTier1('aprova', 'admin')
    expect(r?.intent).toBe('admin.approve')
  })

  it('classifica reject em admin', () => {
    const r = classifyTier1('rejeita', 'admin')
    expect(r?.intent).toBe('admin.reject')
  })

  it('classifica query agenda como admin.query', () => {
    // "agenda" sozinho bate o regex /\b(agenda|hor[áa]rio|...)/
    const r = classifyTier1('como esta a agenda hoje', 'admin')
    expect(r?.intent).toBe('admin.query')
  })

  it('classifica saldo como admin.query', () => {
    const r = classifyTier1('saldo da Mirian', 'admin')
    expect(r?.intent).toBe('admin.query')
  })

  it('refer_lead reconhecido em partner', () => {
    const r = classifyTier1('tenho uma amiga interessada', 'partner')
    expect(r?.intent).toBe('partner.refer_lead')
  })

  it('feedback received reconhecido', () => {
    const r = classifyTier1('ela ja foi e adorou', 'partner')
    expect(r?.intent).toBe('partner.feedback_received')
  })

  it('retorna null quando nada bate · forca Tier 2', () => {
    const r = classifyTier1('texto totalmente aleatorio xyz123 sem intent claro', 'partner')
    expect(r).toBeNull()
  })

  it('strip prefixos "Mira," / "eu quero" antes de classificar', () => {
    const r = classifyTier1('Mira, quero emitir voucher pra Joana', 'partner')
    expect(r?.intent).toBe('partner.emit_voucher')
  })

  it('admin nao tem partner-only mas pode usar partner patterns como fallback', () => {
    // Em admin role, lista combina ADMIN_PATTERNS + PARTNER_PATTERNS
    const r = classifyTier1('emite voucher pra Joana', 'admin')
    expect(r?.intent).toBe('partner.emit_voucher')
  })
})

describe('classifyTier2 · fallback Anthropic Haiku', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.ANTHROPIC_API_KEY
  })

  it('retorna unknown sem ANTHROPIC_API_KEY', async () => {
    const r = await classifyTier2('msg sem api key', 'partner')
    expect(r.intent).toBe('unknown')
    expect(r.confidence).toBe(0)
    expect(r.tier).toBe(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('classifica via Haiku quando API key presente', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: '{"intent":"partner.refer_lead","confidence":0.85}' }],
      }),
    })
    const r = await classifyTier2('texto ambiguo', 'partner', 'fake-api-key')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect((opts as RequestInit).method).toBe('POST')
    expect(r.intent).toBe('partner.refer_lead')
    expect(r.confidence).toBe(0.85)
    expect(r.tier).toBe(2)
  })

  it('retorna unknown em http error 500', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 })
    const r = await classifyTier2('texto', 'partner', 'fake-api-key')
    expect(r.intent).toBe('unknown')
    expect(r.confidence).toBe(0)
  })

  it('retorna unknown quando JSON malformado', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: 'sem json aqui' }] }),
    })
    const r = await classifyTier2('texto', 'partner', 'fake-api-key')
    expect(r.intent).toBe('unknown')
  })
})

describe('classifyIntent · top-level (Tier 1 → Tier 2)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('Tier 1 hit nao chama Tier 2', async () => {
    const r = await classifyIntent('emite voucher pra Maria', 'partner')
    expect(r.tier).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Tier 1 miss escala pra Tier 2', async () => {
    // Tier 2 so chama fetch quando ANTHROPIC_API_KEY esta setada
    process.env.ANTHROPIC_API_KEY = 'fake-key'
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: '{"intent":"partner.other","confidence":0.7}' }],
      }),
    })
    const r = await classifyIntent('xyzzz texto sem regex match aaa bbb', 'partner')
    expect(r.tier).toBe(2)
    expect(fetchMock).toHaveBeenCalled()
    delete process.env.ANTHROPIC_API_KEY
  })

  it('Tier 2 com confidence < 0.5 vira unknown', async () => {
    process.env.ANTHROPIC_API_KEY = 'fake-key'
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: '{"intent":"partner.other","confidence":0.3}' }],
      }),
    })
    const r = await classifyIntent('xyzzz texto sem match aaa bbb', 'partner')
    expect(r.intent).toBe('unknown')
    expect(r.tier).toBe(2)
    delete process.env.ANTHROPIC_API_KEY
  })
})
