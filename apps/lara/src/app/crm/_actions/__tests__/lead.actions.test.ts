/**
 * Testes pra lead.actions.ts · foco em createOrcamentoFromLeadAction
 * (RPC orchestration · soft-delete leads + insert orcamentos atomico) +
 * markLeadLostAction (reason obrigatorio).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/repos', () => ({ loadServerReposContext: vi.fn() }))
vi.mock('next/cache', () => ({ updateTag: vi.fn() }))
vi.mock('@clinicai/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
  hashPhone: (p: string) => `hash:${p.slice(-4)}`,
}))

import {
  createOrcamentoFromLeadAction,
  markLeadLostAction,
  createLeadAction,
} from '../lead.actions'
import { applyContextMock } from './_mock-context'
import { updateTag } from 'next/cache'

const LEAD_ID = '22222222-2222-2222-2222-222222222222'
const ORC_ID = '33333333-3333-3333-3333-333333333333'

beforeEach(() => {
  vi.clearAllMocks()
})

// ── createOrcamentoFromLeadAction ──────────────────────────────────────────

describe('createOrcamentoFromLeadAction', () => {
  const validInput = {
    leadId: LEAD_ID,
    items: [{ name: 'Consulta', qty: 1, unitPrice: 200, subtotal: 200 }],
    subtotal: 200,
  }

  it('rejects items vazio via Zod', async () => {
    const { repos } = await applyContextMock({
      leads: { toOrcamento: vi.fn() },
    })
    const r = await createOrcamentoFromLeadAction({ ...validInput, items: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_input')
    expect(repos.leads!.toOrcamento).not.toHaveBeenCalled()
  })

  it('happy path · invalida tags leads + orcamentos', async () => {
    const { repos } = await applyContextMock({
      leads: {
        toOrcamento: vi.fn().mockResolvedValue({
          ok: true,
          orcamentoId: ORC_ID,
          total: 200,
        }),
      },
    })
    const r = await createOrcamentoFromLeadAction(validInput)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.orcamentoId).toBe(ORC_ID)
      expect(r.data.total).toBe(200)
    }
    expect(repos.leads!.toOrcamento).toHaveBeenCalledWith(validInput)
    expect(updateTag).toHaveBeenCalledWith('crm.leads')
    expect(updateTag).toHaveBeenCalledWith('crm.orcamentos')
  })

  it('RPC retorna {ok:false} → propaga error code', async () => {
    await applyContextMock({
      leads: {
        toOrcamento: vi.fn().mockResolvedValue({
          ok: false,
          error: 'lead_not_found',
        }),
      },
    })
    const r = await createOrcamentoFromLeadAction(validInput)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('lead_not_found')
    expect(updateTag).not.toHaveBeenCalled()
  })
})

// ── markLeadLostAction ─────────────────────────────────────────────────────

describe('markLeadLostAction', () => {
  it('rejects reason vazio (Zod min 2 chars)', async () => {
    const { repos } = await applyContextMock({
      leads: { markLost: vi.fn() },
    })
    const r = await markLeadLostAction({ leadId: LEAD_ID, reason: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_input')
    expect(repos.leads!.markLost).not.toHaveBeenCalled()
  })

  it('happy path · invalida leads tag', async () => {
    const { repos } = await applyContextMock({
      leads: {
        markLost: vi.fn().mockResolvedValue({ ok: true, leadId: LEAD_ID }),
      },
    })
    const r = await markLeadLostAction({ leadId: LEAD_ID, reason: 'preço' })
    expect(r.ok).toBe(true)
    expect(repos.leads!.markLost).toHaveBeenCalledWith(LEAD_ID, 'preço')
    expect(updateTag).toHaveBeenCalledWith('crm.leads')
  })
})

// ── createLeadAction ───────────────────────────────────────────────────────

describe('createLeadAction', () => {
  it('rejects telefone curto (Zod min 8)', async () => {
    const { repos } = await applyContextMock({
      leads: { createViaRpc: vi.fn() },
    })
    const r = await createLeadAction({ phone: '123' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_input')
    expect(repos.leads!.createViaRpc).not.toHaveBeenCalled()
  })

  it('happy path · returns existed flag', async () => {
    const { repos } = await applyContextMock({
      leads: {
        createViaRpc: vi.fn().mockResolvedValue({
          ok: true,
          leadId: LEAD_ID,
          existed: false,
          phase: 'lead',
        }),
      },
    })
    const r = await createLeadAction({ phone: '5544991622986', name: 'Joana' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.leadId).toBe(LEAD_ID)
      expect(r.data.existed).toBe(false)
    }
    expect(repos.leads!.createViaRpc).toHaveBeenCalled()
    expect(updateTag).toHaveBeenCalledWith('crm.leads')
  })
})
