/**
 * Testes do B2BVoucherRepository.issueWithDedup · cobre Wave 1 fix
 * (race dedup transactional + retry · mig 800-12 / 2026-04-25 incidente).
 *
 * Cobre:
 *   - Sucesso na 1a tentativa nao tem retry
 *   - Retry em SQLSTATE 40001 (serialization_failure) com backoff 100/300/700ms
 *   - Retry tambem casa regex "could not serialize" e "serialization_failure"
 *     no message (supabase-js wrap variability)
 *   - Apos 3 falhas seguidas, retorna ok=false sem throw
 *   - Outros erros (nao serialization) NAO retentam
 *   - dedup_hit do RPC propaga em result.dedupHit (kind/id/since)
 *
 * Mock: Supabase rpc() controlado · vi.useFakeTimers pra acelerar setTimeout
 * dos backoffs sem esperar tempo real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { B2BVoucherRepository } from './b2b-voucher.repository'

function makeMockSupabase(rpcImpl: ReturnType<typeof vi.fn>) {
  return {
    rpc: rpcImpl,
    from: vi.fn(),
  } as unknown as SupabaseClient
}

describe('B2BVoucherRepository.issueWithDedup · retry policy', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sucesso na 1a tentativa · zero retries', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: {
        ok: true,
        id: 'v1',
        token: 'ABC12345',
        valid_until: '2026-05-25T00:00:00Z',
      },
      error: null,
    })
    const repo = new B2BVoucherRepository(makeMockSupabase(rpc))
    const result = await repo.issueWithDedup({
      partnershipId: 'p1',
      recipientName: 'Maria',
      recipientPhone: '5544991111111',
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    expect(result.id).toBe('v1')
    expect(result.token).toBe('ABC12345')
    expect(result.retries).toBe(0)
  })

  it('retry em SQLSTATE 40001 · sucesso na 2a tentativa', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: '40001', message: 'serialization_failure' },
      })
      .mockResolvedValueOnce({
        data: { ok: true, id: 'v1', token: 'XYZ', valid_until: '2026-05-25' },
        error: null,
      })
    const repo = new B2BVoucherRepository(makeMockSupabase(rpc))

    const promise = repo.issueWithDedup({
      partnershipId: 'p1',
      recipientPhone: '5544991111111',
    })
    // Avanca timers · backoff 100ms entre attempt 0 e 1
    await vi.advanceTimersByTimeAsync(100)
    const result = await promise

    expect(rpc).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
    expect(result.retries).toBe(1)
  })

  it('retry detecta regex "could not serialize" no message', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: {
          message:
            'could not serialize access due to concurrent update on b2b_vouchers',
        },
      })
      .mockResolvedValueOnce({
        data: { ok: true, id: 'v1', token: 'AAA', valid_until: '2026-05-25' },
        error: null,
      })
    const repo = new B2BVoucherRepository(makeMockSupabase(rpc))
    const promise = repo.issueWithDedup({
      partnershipId: 'p1',
      recipientPhone: '5544991111111',
    })
    await vi.advanceTimersByTimeAsync(100)
    const result = await promise
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
  })

  it('apos 3 falhas seguidas, retorna ok=false sem throw', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '40001', message: 'serialization_failure' },
    })
    const repo = new B2BVoucherRepository(makeMockSupabase(rpc))

    const promise = repo.issueWithDedup({
      partnershipId: 'p1',
      recipientPhone: '5544991111111',
    })
    // Avanca todos os backoffs (100 + 300 = 400ms · 700ms NAO acontece pois
    // ultimo attempt nao tem sleep · `attempt < BACKOFFS_MS.length - 1`)
    await vi.advanceTimersByTimeAsync(100 + 300)
    const result = await promise

    expect(rpc).toHaveBeenCalledTimes(3)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/serialization/)
    // retries em ultima falha = 2 (foi a tentativa onde retornou)
    expect(result.retries).toBe(2)
  })

  it('outros erros NAO retentam · ok=false na 1a tentativa', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    })
    const repo = new B2BVoucherRepository(makeMockSupabase(rpc))
    const result = await repo.issueWithDedup({
      partnershipId: 'p1',
      recipientPhone: '5544991111111',
    })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/duplicate key/)
    expect(result.retries).toBe(0)
  })

  it('dedup_hit do RPC propaga em result.dedupHit', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: {
        ok: true,
        dedup_hit: {
          kind: 'recent_voucher',
          id: 'v-existing',
          name: 'Maria',
          phone: '5544991111111',
          since: '2026-04-25T09:00:00Z',
          partnership_name: 'Yasmim',
        },
      },
      error: null,
    })
    const repo = new B2BVoucherRepository(makeMockSupabase(rpc))
    const result = await repo.issueWithDedup({
      partnershipId: 'p1',
      recipientName: 'Maria',
      recipientPhone: '5544991111111',
    })
    expect(result.ok).toBe(true)
    expect(result.dedupHit).toBeDefined()
    expect(result.dedupHit?.kind).toBe('recent_voucher')
    expect(result.dedupHit?.id).toBe('v-existing')
    expect(result.dedupHit?.partnershipName).toBe('Yasmim')
  })

  it('inclui phone_variants no payload do RPC quando recipientPhone presente', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: { ok: true, id: 'v1', token: 'TOK1', valid_until: '2026-05-25' },
      error: null,
    })
    const repo = new B2BVoucherRepository(makeMockSupabase(rpc))
    await repo.issueWithDedup({
      partnershipId: 'p1',
      recipientPhone: '5544991111111',
    })

    const args = rpc.mock.calls[0][1] as { p_payload: Record<string, unknown> }
    expect(args.p_payload.recipient_phone).toBe('5544991111111')
    expect(Array.isArray(args.p_payload.phone_variants)).toBe(true)
    expect((args.p_payload.phone_variants as string[]).length).toBeGreaterThan(0)
  })

  it('NAO inclui phone_variants quando recipientPhone ausente', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({
      data: { ok: true, id: 'v1', token: 'TOK1', valid_until: '2026-05-25' },
      error: null,
    })
    const repo = new B2BVoucherRepository(makeMockSupabase(rpc))
    await repo.issueWithDedup({
      partnershipId: 'p1',
      recipientName: 'Anonima',
    })
    const args = rpc.mock.calls[0][1] as { p_payload: Record<string, unknown> }
    expect(args.p_payload.recipient_phone).toBeUndefined()
    expect(args.p_payload.phone_variants).toBeUndefined()
  })
})
