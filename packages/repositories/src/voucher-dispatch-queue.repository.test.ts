/**
 * Testes do B2BVoucherDispatchQueueRepository · cobre a Wave 2 fix
 * (idempotency guards + circuit breaker · mig 800-08).
 *
 * Cobre:
 *   - enqueue() chama RPC b2b_dispatch_queue_enqueue com payload correto
 *   - pickPending() retorna PickedQueueItemDTO[] mapeado
 *   - complete() retorna { ok:true } em sucesso, { ok:false, currentStatus }
 *     quando RPC reporta nao em processing (zumbi guard)
 *   - markDedupHit() update direto na tabela (NAO via RPC) com WHERE
 *     status='processing' · idempotency manual
 *   - resetStuck() chama b2b_dispatch_queue_reset_stuck com threshold
 *   - cancelBatch() · happy path
 *
 * Mock: SupabaseClient com vi.fn() retornando { data, error } controlados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { B2BVoucherDispatchQueueRepository } from './voucher-dispatch-queue.repository'

/**
 * Cria um SupabaseClient mock com fluent query builder · cada metodo
 * encadeavel retorna `this` ate maybeSingle() resolver com data/error.
 */
function makeMockSupabase(overrides: {
  rpcResults?: Record<string, { data: unknown; error: unknown }>
  fromUpdateResult?: { data: unknown; error: unknown }
  fromSelectResult?: { data: unknown; error: unknown }
} = {}) {
  const rpcResults = overrides.rpcResults ?? {}
  const fromUpdateResult = overrides.fromUpdateResult ?? { data: null, error: null }
  const fromSelectResult = overrides.fromSelectResult ?? { data: null, error: null }

  const rpc = vi.fn((rpcName: string) => {
    const r = rpcResults[rpcName] ?? { data: null, error: null }
    return Promise.resolve(r)
  })

  const updateBuilder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(fromUpdateResult),
  }

  const selectBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(fromSelectResult),
  }

  // Strategy: from() retorna um proxy que decide builder baseado em qual
  // metodo for chamado primeiro (update vs select).
  const from = vi.fn(() => {
    return {
      update: (...args: unknown[]) => {
        updateBuilder.update(...args)
        return updateBuilder
      },
      select: (...args: unknown[]) => {
        selectBuilder.select(...args)
        return selectBuilder
      },
    }
  })

  return {
    client: { rpc, from } as unknown as SupabaseClient,
    rpc,
    from,
    updateBuilder,
    selectBuilder,
  }
}

describe('B2BVoucherDispatchQueueRepository', () => {
  describe('enqueue', () => {
    it('chama RPC b2b_dispatch_queue_enqueue com payload normalizado', async () => {
      const { client, rpc } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_enqueue: {
            data: {
              ok: true,
              batch_id: 'batch-1',
              count: 2,
              scheduled_at: '2026-04-25T10:00:00Z',
              items: [
                { ok: true, queue_id: 'q1', recipient_name: 'Maria' },
                { ok: true, queue_id: 'q2', recipient_name: 'Ana' },
              ],
            },
            error: null,
          },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.enqueue({
        partnershipId: 'p1',
        items: [
          { name: 'Maria', phone: '5544991111111' },
          { name: 'Ana', phone: '5544992222222' },
        ],
      })

      expect(rpc).toHaveBeenCalledWith('b2b_dispatch_queue_enqueue', expect.any(Object))
      const args = rpc.mock.calls[0][1] as { p_payload: Record<string, unknown> }
      expect(args.p_payload.partnership_id).toBe('p1')
      expect((args.p_payload.items as unknown[]).length).toBe(2)
      expect(result.ok).toBe(true)
      expect(result.batchId).toBe('batch-1')
      expect(result.count).toBe(2)
      expect(result.items).toHaveLength(2)
    })

    it('retorna ok=false sem partnership_id', async () => {
      const { client } = makeMockSupabase()
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.enqueue({ partnershipId: '', items: [{ name: 'x', phone: '5544991111111' }] })
      expect(result.ok).toBe(false)
      expect(result.error).toBe('partnership_id_required')
    })

    it('retorna ok=false com items vazios', async () => {
      const { client } = makeMockSupabase()
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.enqueue({ partnershipId: 'p1', items: [] })
      expect(result.ok).toBe(false)
      expect(result.error).toBe('items_required')
    })

    it('propaga error.message em RPC error', async () => {
      const { client } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_enqueue: { data: null, error: { message: 'pg_error: cap_exceeded' } },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.enqueue({
        partnershipId: 'p1',
        items: [{ name: 'Maria', phone: '5544991111111' }],
      })
      expect(result.ok).toBe(false)
      expect(result.error).toBe('pg_error: cap_exceeded')
    })
  })

  describe('pickPending', () => {
    it('retorna items mapeados em camelCase', async () => {
      const { client, rpc } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_pick: {
            data: {
              ok: true,
              items: [
                {
                  queue_id: 'q1',
                  clinic_id: 'c1',
                  partnership_id: 'p1',
                  recipient_name: 'Maria',
                  recipient_phone: '5544991111111',
                  attempts: 0,
                  batch_id: 'batch-1',
                  submitted_by: 'u1',
                },
              ],
            },
            error: null,
          },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const items = await repo.pickPending(5)
      expect(rpc).toHaveBeenCalledWith('b2b_dispatch_queue_pick', { p_limit: 5 })
      expect(items).toHaveLength(1)
      expect(items[0].queueId).toBe('q1')
      expect(items[0].recipientName).toBe('Maria')
    })

    it('retorna [] em RPC sem items', async () => {
      const { client } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_pick: { data: { ok: true, items: [] }, error: null },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const items = await repo.pickPending()
      expect(items).toEqual([])
    })

    it('throws em RPC error', async () => {
      const { client } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_pick: { data: null, error: { message: 'pg_error' } },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      await expect(repo.pickPending()).rejects.toThrow(/b2b_dispatch_queue_pick.failed/)
    })
  })

  describe('complete · idempotency guard (mig 800-08)', () => {
    it('happy path: ok=true em complete bem sucedido', async () => {
      const { client, rpc } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_complete: { data: { ok: true, updated: 1 }, error: null },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.complete('q1', 'voucher-id-1')
      expect(rpc).toHaveBeenCalledWith('b2b_dispatch_queue_complete', {
        p_queue_id: 'q1',
        p_voucher_id: 'voucher-id-1',
      })
      expect(result.ok).toBe(true)
      expect(result.updated).toBe(1)
    })

    it('zumbi guard: retorna currentStatus quando 0 rows affected', async () => {
      // Cenario: outro worker resetou o item · status virou pending mid-flight.
      // RPC retorna ok:false com error e current_status pra caller logar.
      const { client } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_complete: {
            data: {
              ok: false,
              error: 'not_in_processing_state',
              current_status: 'pending',
            },
            error: null,
          },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.complete('q1', 'voucher-id-1')
      expect(result.ok).toBe(false)
      expect(result.error).toBe('not_in_processing_state')
      expect(result.currentStatus).toBe('pending')
    })
  })

  describe('markDedupHit · update direto (NAO via RPC) com idempotency', () => {
    it('happy path: ok=true em update sucesso', async () => {
      const { client, updateBuilder } = makeMockSupabase({
        fromUpdateResult: { data: { id: 'q1', status: 'done' }, error: null },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.markDedupHit('q1', 'recent_voucher')
      expect(result.ok).toBe(true)
      // Verifica que update tem WHERE status='processing' (idempotency guard)
      expect(updateBuilder.eq).toHaveBeenCalledWith('id', 'q1')
      expect(updateBuilder.eq).toHaveBeenCalledWith('status', 'processing')
      const updateArg = updateBuilder.update.mock.calls[0][0] as { error_message: string }
      expect(updateArg.error_message).toBe('dedup_hit:recent_voucher')
    })

    it('idempotency hit: retorna currentStatus quando 0 rows affected', async () => {
      // Sequencia: update returns null (0 rows), depois select pra ler status.
      // Precisa de 2 calls em from: update, select.
      const { client } = makeMockSupabase({
        fromUpdateResult: { data: null, error: null },
        fromSelectResult: { data: { status: 'done' }, error: null },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.markDedupHit('q1', 'lead_match')
      expect(result.ok).toBe(false)
      expect(result.error).toBe('not_in_processing_state')
      expect(result.currentStatus).toBe('done')
    })
  })

  describe('resetStuck · circuit breaker (mig 800-08)', () => {
    it('chama RPC com p_threshold_minutes = 5 default', async () => {
      const { client, rpc } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_reset_stuck: {
            data: {
              ok: true,
              reset_count: 2,
              threshold_minutes: 5,
              items: [
                { queue_id: 'q1', attempts: 1, processing_started_at: '2026-04-25T09:00:00Z' },
                { queue_id: 'q2', attempts: 2, processing_started_at: '2026-04-25T09:01:00Z' },
              ],
            },
            error: null,
          },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.resetStuck()
      expect(rpc).toHaveBeenCalledWith('b2b_dispatch_queue_reset_stuck', {
        p_threshold_minutes: 5,
      })
      expect(result.ok).toBe(true)
      expect(result.resetCount).toBe(2)
      expect(result.items).toHaveLength(2)
      expect(result.items[0].queueId).toBe('q1')
    })

    it('aceita threshold customizado', async () => {
      const { client, rpc } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_reset_stuck: {
            data: { ok: true, reset_count: 0, threshold_minutes: 10, items: [] },
            error: null,
          },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      await repo.resetStuck(10)
      expect(rpc).toHaveBeenCalledWith('b2b_dispatch_queue_reset_stuck', {
        p_threshold_minutes: 10,
      })
    })

    it('retorna ok=false em RPC error', async () => {
      const { client } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_reset_stuck: { data: null, error: { message: 'pg_error' } },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.resetStuck()
      expect(result.ok).toBe(false)
      expect(result.resetCount).toBe(0)
      expect(result.error).toBe('pg_error')
    })
  })

  describe('cancelBatch', () => {
    it('happy path · chama RPC com batch_id', async () => {
      const { client, rpc } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_cancel_batch: { data: { ok: true, cancelled: 3 }, error: null },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.cancelBatch('batch-1')
      expect(rpc).toHaveBeenCalledWith('b2b_dispatch_queue_cancel_batch', { p_batch_id: 'batch-1' })
      expect(result.ok).toBe(true)
      expect(result.cancelled).toBe(3)
    })
  })

  describe('fail · idempotency guard', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('happy path: ok=true + newStatus=failed apos 3 attempts', async () => {
      const { client } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_fail: {
            data: { ok: true, new_status: 'failed', attempts: 3 },
            error: null,
          },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.fail('q1', 'rpc_timeout')
      expect(result.ok).toBe(true)
      expect(result.newStatus).toBe('failed')
      expect(result.attempts).toBe(3)
    })

    it('ainda retentavel: newStatus=pending em attempts<3', async () => {
      const { client } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_fail: {
            data: { ok: true, new_status: 'pending', attempts: 1 },
            error: null,
          },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.fail('q1', 'transient_error')
      expect(result.newStatus).toBe('pending')
      expect(result.attempts).toBe(1)
    })

    it('zumbi guard: ok=false quando race detectada', async () => {
      const { client } = makeMockSupabase({
        rpcResults: {
          b2b_dispatch_queue_fail: {
            data: {
              ok: false,
              error: 'race_status_changed_mid_fail',
              current_status: 'done',
            },
            error: null,
          },
        },
      })
      const repo = new B2BVoucherDispatchQueueRepository(client)
      const result = await repo.fail('q1', 'transient_error')
      expect(result.ok).toBe(false)
      expect(result.error).toBe('race_status_changed_mid_fail')
      expect(result.currentStatus).toBe('done')
    })
  })
})
