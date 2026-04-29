/**
 * Testes do PatientRepository · regras criticas de Camada 11a.
 *
 * Foco em:
 *   - softDelete: retorna boolean baseado em `error` do supabase (ok ou
 *     fail) · UI usa pra decidir toast/redirect.
 *   - count: retorna 0 default sem throw quando count vem null
 *     (Supabase pode devolver null em head:true se RLS bloqueia ou
 *     tabela vazia · default seguro evita NaN downstream).
 *   - update: mapeia camelCase → snake_case do PG (UpdatePatientInput
 *     para colunas `address_json`, `assigned_to`, `birth_date`, etc).
 */
import { describe, it, expect } from 'vitest'
import { PatientRepository } from './patient.repository'
import { makeMockSupabase } from './__tests__/_mock-supabase'

describe('PatientRepository', () => {
  describe('softDelete · boolean baseado em error', () => {
    it('retorna true quando update sem erro', async () => {
      const { client } = makeMockSupabase({
        defaultResult: { data: null, error: null },
      })
      const repo = new PatientRepository(client)
      const ok = await repo.softDelete('patient-1')
      expect(ok).toBe(true)
    })

    it('retorna false quando supabase devolve error', async () => {
      const { client } = makeMockSupabase({
        defaultResult: { data: null, error: { message: 'rls_denied' } },
      })
      const repo = new PatientRepository(client)
      const ok = await repo.softDelete('patient-1')
      expect(ok).toBe(false)
    })
  })

  describe('count · 0 default sem throw', () => {
    it('retorna 0 quando count vem null (head:true sem rows)', async () => {
      const { client } = makeMockSupabase({
        defaultResult: { data: null, error: null, count: null },
      })
      const repo = new PatientRepository(client)
      const total = await repo.count('clinic-1')
      expect(total).toBe(0)
    })

    it('retorna count exato quando supabase devolve numero', async () => {
      const { client } = makeMockSupabase({
        defaultResult: { data: null, error: null, count: 42 },
      })
      const repo = new PatientRepository(client)
      const total = await repo.count('clinic-1')
      expect(total).toBe(42)
    })
  })

  describe('update · mapeia camelCase → snake_case', () => {
    it('traduz birthDate → birth_date, addressJson → address_json, assignedTo → assigned_to', async () => {
      const { client, fromCalls } = makeMockSupabase({
        // .single() resolve com row valido pro mapper nao quebrar
        defaultResult: {
          data: {
            id: 'p1',
            clinic_id: 'c1',
            name: 'Maria',
            phone: '5544991111111',
            email: null,
            cpf: null,
            rg: null,
            birth_date: '1990-01-01',
            sex: null,
            address_json: { street: 'Rua X' },
            status: 'active',
            assigned_to: 'user-1',
            notes: null,
            total_procedures: 0,
            total_revenue: 0,
            first_procedure_at: null,
            last_procedure_at: null,
            source_lead_phase_at: null,
            source_lead_meta: null,
            created_at: '2026-04-01T00:00:00Z',
            updated_at: '2026-04-29T00:00:00Z',
            deleted_at: null,
          },
          error: null,
        },
      })
      const repo = new PatientRepository(client)
      const dto = await repo.update('p1', {
        name: 'Maria',
        birthDate: '1990-01-01',
        addressJson: { street: 'Rua X' },
        assignedTo: 'user-1',
      })

      const call = fromCalls.find((c) => c.table === 'patients')
      expect(call).toBeDefined()
      // Verifica que o objeto passado pra .update() usa snake_case
      const updateArg = call!.fns.update.mock.calls[0]?.[0] as Record<string, unknown>
      expect(updateArg.name).toBe('Maria')
      expect(updateArg.birth_date).toBe('1990-01-01')
      expect(updateArg.address_json).toEqual({ street: 'Rua X' })
      expect(updateArg.assigned_to).toBe('user-1')
      // camelCase NAO vaza pro DB
      expect(updateArg.birthDate).toBeUndefined()
      expect(updateArg.addressJson).toBeUndefined()
      expect(updateArg.assignedTo).toBeUndefined()

      expect(dto?.id).toBe('p1')
    })
  })
})
