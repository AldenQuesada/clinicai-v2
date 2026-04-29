/**
 * Testes do LeadRepository · cobertura minima de regras de negocio
 * criticas (Camada 11a).
 *
 * Foco em:
 *   - markLost: reason obrigatorio (RPC delega o gate · CHECK constraint
 *     chk_leads_lost_consistency); aqui validamos que o wrapper repassa
 *     reason vazio pro RPC e devolve o erro padrao.
 *   - findByPhoneVariants: usa `.in('phone', variants)` (caller normaliza
 *     telefones via phoneVariants do utils antes de chamar).
 *   - phase transition validation: helper isPhaseTransitionAllowed
 *     espelhado da matriz canonica (mig 65).
 *
 * Mocks: SupabaseClient stub via __tests__/_mock-supabase.
 */
import { describe, it, expect } from 'vitest'
import { LeadRepository } from './lead.repository'
import { isPhaseTransitionAllowed } from './helpers/phase-transitions'
import { makeMockSupabase } from './__tests__/_mock-supabase'

describe('LeadRepository', () => {
  describe('markLost · reason obrigatorio (CHECK chk_leads_lost_consistency)', () => {
    it('repassa reason vazio · gate final fica no RPC (lead_lost retorna ok=false)', async () => {
      const { client, rpc } = makeMockSupabase({
        rpcResults: {
          lead_lost: {
            data: { ok: false, error: 'reason_required' },
            error: null,
          },
        },
      })
      const repo = new LeadRepository(client)
      const result = await repo.markLost('lead-1', '')

      expect(rpc).toHaveBeenCalledWith('lead_lost', {
        p_lead_id: 'lead-1',
        p_reason: '',
      })
      expect(result.ok).toBe(false)
      // shape do discriminated union: error: 'reason_required' vem da RPC
      expect((result as { ok: false; error: string }).error).toBe('reason_required')
    })

    it('happy path: reason valido + RPC ok=true', async () => {
      const { client } = makeMockSupabase({
        rpcResults: {
          lead_lost: {
            data: { ok: true, lead_id: 'lead-1' },
            error: null,
          },
        },
      })
      const repo = new LeadRepository(client)
      const result = await repo.markLost('lead-1', 'preco_alto')
      expect(result.ok).toBe(true)
    })
  })

  describe('findByPhoneVariants · usa variants normalizados pelo caller', () => {
    it('passa lista de variants direto pro `.in(phone, variants)`', async () => {
      const { client, fromCalls } = makeMockSupabase({
        defaultResult: { data: null, error: null },
      })
      const repo = new LeadRepository(client)

      const variants = ['5544991234567', '554491234567', '4491234567']
      await repo.findByPhoneVariants('clinic-1', variants)

      // Verifica que .in('phone', variants) foi chamado com a lista exata
      const leadCall = fromCalls.find((c) => c.table === 'leads')
      expect(leadCall).toBeDefined()
      expect(leadCall!.fns.in).toHaveBeenCalledWith('phone', variants)
      expect(leadCall!.fns.eq).toHaveBeenCalledWith('clinic_id', 'clinic-1')
    })

    it('retorna null quando variants vazio (short-circuit · sem hit no DB)', async () => {
      const { client, from } = makeMockSupabase()
      const repo = new LeadRepository(client)

      const result = await repo.findByPhoneVariants('clinic-1', [])

      expect(result).toBeNull()
      expect(from).not.toHaveBeenCalled()
    })
  })

  describe('isPhaseTransitionAllowed · matriz canonica (espelho mig 65)', () => {
    it('lead → agendado permitido; lead → paciente bloqueado', () => {
      expect(isPhaseTransitionAllowed('lead', 'agendado')).toBe(true)
      // paciente exige passar por compareceu primeiro
      expect(isPhaseTransitionAllowed('lead', 'paciente')).toBe(false)
    })

    it('paciente → lead bloqueado; perdido → lead permitido (recovery)', () => {
      expect(isPhaseTransitionAllowed('paciente', 'lead')).toBe(false)
      expect(isPhaseTransitionAllowed('perdido', 'lead')).toBe(true)
    })
  })
})
