/**
 * Testes do OrcamentoRepository · regras criticas de Camada 11a.
 *
 * Foco em:
 *   - recomputeTotal: subtotal = sum(items.subtotal); total = max(0, subtotal-discount).
 *     Discount maior que subtotal NAO vira negativo (CHECK chk_orc_total_consistency
 *     exige total >= 0).
 *   - markLost: reason vazio retorna null (gate client-side antes do RPC ·
 *     evita roundtrip pra erro garantido).
 *   - getByShareTokenGlobal: token < 8 chars retorna null sem hit no DB
 *     (defesa contra brute force / token vazio).
 *   - ensureShareToken: idempotente · se ja tem token, retorna existente
 *     (NAO gera novo · evita revogacao acidental do link publico).
 */
import { describe, it, expect } from 'vitest'
import { OrcamentoRepository } from './orcamento.repository'
import { makeMockSupabase } from './__tests__/_mock-supabase'
import type { OrcamentoItem } from './types'

/**
 * Helper · monta um row de orcamento valido pro mapper · usado quando
 * o teste precisa de DTO de retorno coerente (getById dentro de
 * ensureShareToken etc).
 */
function makeOrcRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'orc-1',
    clinic_id: 'clinic-1',
    lead_id: 'lead-1',
    patient_id: null,
    number: null,
    title: null,
    notes: null,
    items: [],
    subtotal: 0,
    discount: 0,
    total: 0,
    status: 'draft',
    sent_at: null,
    viewed_at: null,
    approved_at: null,
    lost_at: null,
    lost_reason: null,
    valid_until: null,
    payments: [],
    share_token: null,
    created_by: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-29T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('OrcamentoRepository', () => {
  describe('recomputeTotal', () => {
    it('calcula corretamente com discount aplicado', () => {
      const { client } = makeMockSupabase()
      const repo = new OrcamentoRepository(client)
      const items: OrcamentoItem[] = [
        { name: 'Botox', qty: 1, unitPrice: 1000, subtotal: 1000 },
        { name: 'Preenchimento', qty: 2, unitPrice: 500, subtotal: 1000 },
      ]
      const out = repo.recomputeTotal(items, 200)
      expect(out.subtotal).toBe(2000)
      expect(out.total).toBe(1800)
    })

    it('items vazio + discount: total = max(0, 0 - discount) = 0', () => {
      // Edge case · UI nao deveria mandar mas guard impede total negativo
      // (CHECK chk_orc_total_consistency exigiria total >= 0 no DB).
      const { client } = makeMockSupabase()
      const repo = new OrcamentoRepository(client)
      const out = repo.recomputeTotal([], 50)
      expect(out.subtotal).toBe(0)
      expect(out.total).toBe(0)
    })
  })

  describe('markLost · reason obrigatorio (chk_orc_lost_consistency)', () => {
    it('rejeita reason vazio sem hit no DB · retorna null', async () => {
      const { client, from } = makeMockSupabase()
      const repo = new OrcamentoRepository(client)
      const result = await repo.markLost('orc-1', '')
      expect(result).toBeNull()
      expect(from).not.toHaveBeenCalled()
    })

    it('rejeita reason whitespace-only · retorna null', async () => {
      const { client, from } = makeMockSupabase()
      const repo = new OrcamentoRepository(client)
      const result = await repo.markLost('orc-1', '   ')
      expect(result).toBeNull()
      expect(from).not.toHaveBeenCalled()
    })
  })

  describe('getByShareTokenGlobal · gate de tamanho minimo', () => {
    it('retorna null se token < 8 chars (defesa anti-brute-force)', async () => {
      const { client, from } = makeMockSupabase()
      const repo = new OrcamentoRepository(client)
      const result = await repo.getByShareTokenGlobal('abc123')
      expect(result).toBeNull()
      expect(from).not.toHaveBeenCalled()
    })

    it('retorna null se token vazio', async () => {
      const { client, from } = makeMockSupabase()
      const repo = new OrcamentoRepository(client)
      const result = await repo.getByShareTokenGlobal('')
      expect(result).toBeNull()
      expect(from).not.toHaveBeenCalled()
    })
  })

  describe('ensureShareToken · idempotente', () => {
    it('retorna token existente sem regenerar (preserva URL publica)', async () => {
      // getById retorna row com share_token ja setado · UPDATE nao deve rodar.
      const existingToken = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
      const { client, fromCalls } = makeMockSupabase({
        defaultResult: {
          data: makeOrcRow({ share_token: existingToken }),
          error: null,
        },
      })
      const repo = new OrcamentoRepository(client)
      const token = await repo.ensureShareToken('orc-1')

      expect(token).toBe(existingToken)
      // Nenhum dos .from() builders deve ter chamado .update() · so leitura.
      const updates = fromCalls.flatMap((c) => c.fns.update.mock.calls)
      expect(updates).toHaveLength(0)
    })
  })
})
