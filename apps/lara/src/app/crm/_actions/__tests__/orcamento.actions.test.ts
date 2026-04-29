/**
 * Testes pra orcamento.actions.ts · 6 actions cobrindo state machine + CRUD.
 *
 * Foco: validacao Zod + role gate + propagacao de erro do repo + tag invalidation.
 * NAO testa o repo em si (Camada 11a cobre).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mocks DEVEM estar antes do import dos actions
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
  markOrcamentoSentAction,
  markOrcamentoApprovedAction,
  markOrcamentoLostAction,
  addOrcamentoPaymentAction,
  softDeleteOrcamentoAction,
  ensureShareTokenAction,
  updateOrcamentoAction,
} from '../orcamento.actions'
import { applyContextMock } from './_mock-context'
import { updateTag } from 'next/cache'

const ORC_ID = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
})

// ── markOrcamentoLostAction ────────────────────────────────────────────────

describe('markOrcamentoLostAction', () => {
  it('rejects empty reason at Zod level (no DB hit)', async () => {
    const { repos } = await applyContextMock({
      orcamentos: { markLost: vi.fn() },
    })
    const r = await markOrcamentoLostAction({ orcamentoId: ORC_ID, reason: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_input')
    expect(repos.orcamentos!.markLost).not.toHaveBeenCalled()
  })

  it('happy path · invalidates orcamentos tag', async () => {
    const { repos } = await applyContextMock({
      orcamentos: {
        markLost: vi.fn().mockResolvedValue({ id: ORC_ID, status: 'lost' }),
      },
    })
    const r = await markOrcamentoLostAction({
      orcamentoId: ORC_ID,
      reason: 'preço',
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.orcamentoId).toBe(ORC_ID)
    expect(repos.orcamentos!.markLost).toHaveBeenCalledWith(ORC_ID, 'preço')
    expect(updateTag).toHaveBeenCalledWith('crm.orcamentos')
  })

  it('repo returns null → mark_lost_failed', async () => {
    await applyContextMock({
      orcamentos: { markLost: vi.fn().mockResolvedValue(null) },
    })
    const r = await markOrcamentoLostAction({
      orcamentoId: ORC_ID,
      reason: 'desistiu',
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('mark_lost_failed')
  })
})

// ── markOrcamentoApprovedAction ────────────────────────────────────────────

describe('markOrcamentoApprovedAction', () => {
  it('happy path · invalidates tag + returns orcamentoId', async () => {
    const { repos } = await applyContextMock({
      orcamentos: {
        markApproved: vi
          .fn()
          .mockResolvedValue({ id: ORC_ID, status: 'approved' }),
      },
    })
    const r = await markOrcamentoApprovedAction({ orcamentoId: ORC_ID })
    expect(r.ok).toBe(true)
    expect(repos.orcamentos!.markApproved).toHaveBeenCalledWith(ORC_ID)
    expect(updateTag).toHaveBeenCalledWith('crm.orcamentos')
  })

  it('invalid uuid → invalid_input', async () => {
    const r = await markOrcamentoApprovedAction({ orcamentoId: 'not-a-uuid' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_input')
  })
})

// ── markOrcamentoSentAction ────────────────────────────────────────────────

describe('markOrcamentoSentAction', () => {
  it('happy path', async () => {
    const { repos } = await applyContextMock({
      orcamentos: {
        markSent: vi.fn().mockResolvedValue({ id: ORC_ID, status: 'sent' }),
      },
    })
    const r = await markOrcamentoSentAction({ orcamentoId: ORC_ID })
    expect(r.ok).toBe(true)
    expect(repos.orcamentos!.markSent).toHaveBeenCalledWith(ORC_ID)
  })
})

// ── addOrcamentoPaymentAction ──────────────────────────────────────────────

describe('addOrcamentoPaymentAction', () => {
  it('rejects negative amount via Zod', async () => {
    const { repos } = await applyContextMock({
      orcamentos: { addPayment: vi.fn() },
    })
    const r = await addOrcamentoPaymentAction({
      orcamentoId: ORC_ID,
      payment: { amount: -10, method: 'pix' },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_input')
    expect(repos.orcamentos!.addPayment).not.toHaveBeenCalled()
  })

  it('happy path · returns paymentsCount', async () => {
    const { repos } = await applyContextMock({
      orcamentos: {
        addPayment: vi.fn().mockResolvedValue({
          id: ORC_ID,
          payments: [{ amount: 100 }, { amount: 50 }],
        }),
      },
    })
    const r = await addOrcamentoPaymentAction({
      orcamentoId: ORC_ID,
      payment: { amount: 50, method: 'pix' },
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.paymentsCount).toBe(2)
    expect(repos.orcamentos!.addPayment).toHaveBeenCalled()
  })
})

// ── softDeleteOrcamentoAction ──────────────────────────────────────────────

describe('softDeleteOrcamentoAction', () => {
  it('blocks role=receptionist via requireRole', async () => {
    const { repos } = await applyContextMock(
      { orcamentos: { softDelete: vi.fn() } },
      { role: 'receptionist' },
    )
    const r = await softDeleteOrcamentoAction({ orcamentoId: ORC_ID })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('forbidden')
    expect(repos.orcamentos!.softDelete).not.toHaveBeenCalled()
  })

  it('owner role passes · happy path', async () => {
    const { repos } = await applyContextMock(
      { orcamentos: { softDelete: vi.fn().mockResolvedValue(true) } },
      { role: 'owner' },
    )
    const r = await softDeleteOrcamentoAction({ orcamentoId: ORC_ID })
    expect(r.ok).toBe(true)
    expect(repos.orcamentos!.softDelete).toHaveBeenCalledWith(ORC_ID)
  })

  it('admin role passes', async () => {
    await applyContextMock(
      { orcamentos: { softDelete: vi.fn().mockResolvedValue(true) } },
      { role: 'admin' },
    )
    const r = await softDeleteOrcamentoAction({ orcamentoId: ORC_ID })
    expect(r.ok).toBe(true)
  })
})

// ── ensureShareTokenAction ─────────────────────────────────────────────────

describe('ensureShareTokenAction', () => {
  it('returns existing token · idempotente', async () => {
    const { repos } = await applyContextMock({
      orcamentos: {
        ensureShareToken: vi.fn().mockResolvedValue('existing-token-1234'),
      },
    })
    const r = await ensureShareTokenAction({ orcamentoId: ORC_ID })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.shareToken).toBe('existing-token-1234')
    expect(repos.orcamentos!.ensureShareToken).toHaveBeenCalledWith(ORC_ID)
  })

  it('repo returns null → ensure_share_token_failed', async () => {
    await applyContextMock({
      orcamentos: { ensureShareToken: vi.fn().mockResolvedValue(null) },
    })
    const r = await ensureShareTokenAction({ orcamentoId: ORC_ID })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('ensure_share_token_failed')
  })
})

// ── updateOrcamentoAction ──────────────────────────────────────────────────

describe('updateOrcamentoAction', () => {
  it('rejects discount negativo via Zod', async () => {
    const { repos } = await applyContextMock({
      orcamentos: { update: vi.fn() },
    })
    const r = await updateOrcamentoAction({
      orcamentoId: ORC_ID,
      discount: -5,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_input')
    expect(repos.orcamentos!.update).not.toHaveBeenCalled()
  })

  it('happy path com title só (sparse update)', async () => {
    const { repos } = await applyContextMock({
      orcamentos: {
        update: vi.fn().mockResolvedValue({ id: ORC_ID, title: 'novo' }),
      },
    })
    const r = await updateOrcamentoAction({
      orcamentoId: ORC_ID,
      title: 'novo',
    })
    expect(r.ok).toBe(true)
    expect(repos.orcamentos!.update).toHaveBeenCalledWith(ORC_ID, {
      title: 'novo',
    })
  })
})
