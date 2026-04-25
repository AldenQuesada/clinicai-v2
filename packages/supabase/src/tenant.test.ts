/**
 * Testes de resolveClinicContext (Wave 3 · multi-tenant ADR-028).
 *
 * Cobre:
 *   - Retorna clinic_id do JWT app_metadata quando claim presente
 *   - Fallback RPC `_default_clinic_id()` quando claim ausente
 *   - Cache modular do fallback · 2a chamada NAO bate RPC
 *   - Warning console.warn 1x na primeira invocacao do fallback
 *   - Retorna null se user nao logado (auth.getUser sem user)
 *   - Role e propagada do app_metadata.app_role
 *
 * Mock: SupabaseClient com auth.getUser() + rpc() controlados.
 *
 * IMPORTANT: o cache do tenant.ts e module-level (let _cachedDefaultClinicId).
 * Pra resetar entre testes, usamos vi.resetModules() + dynamic import.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

interface MockSupabaseInput {
  user?: { id: string; app_metadata?: Record<string, unknown> } | null
  rpcResult?: { data: unknown; error: unknown }
}

function makeMockSupabase(input: MockSupabaseInput = {}) {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: input.user ?? null },
  })
  const rpc = vi.fn().mockResolvedValue(input.rpcResult ?? { data: null, error: null })
  return {
    client: { auth: { getUser }, rpc } as unknown as SupabaseClient,
    getUser,
    rpc,
  }
}

describe('resolveClinicContext', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Reseta module cache pra cada teste · cache modular nao vaza
    vi.resetModules()
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleWarnSpy.mockRestore()
  })

  it('retorna null quando user nao logado', async () => {
    const { resolveClinicContext } = await import('./tenant')
    const { client } = makeMockSupabase({ user: null })
    const ctx = await resolveClinicContext(client)
    expect(ctx).toBeNull()
  })

  it('retorna clinic_id do JWT app_metadata.clinic_id quando claim presente', async () => {
    const { resolveClinicContext } = await import('./tenant')
    const { client, rpc } = makeMockSupabase({
      user: {
        id: 'user-1',
        app_metadata: { clinic_id: 'clinic-from-jwt', app_role: 'admin' },
      },
    })
    const ctx = await resolveClinicContext(client)
    expect(ctx).toEqual({
      clinic_id: 'clinic-from-jwt',
      user_id: 'user-1',
      role: 'admin',
    })
    // RPC fallback NAO foi chamado
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fallback RPC _default_clinic_id() quando claim ausente', async () => {
    const { resolveClinicContext } = await import('./tenant')
    const { client, rpc } = makeMockSupabase({
      user: { id: 'user-2', app_metadata: {} },
      rpcResult: { data: 'clinic-default', error: null },
    })
    const ctx = await resolveClinicContext(client)
    expect(rpc).toHaveBeenCalledWith('_default_clinic_id')
    expect(ctx?.clinic_id).toBe('clinic-default')
    expect(ctx?.user_id).toBe('user-2')
  })

  it('cache do fallback · 2a chamada NAO bate RPC', async () => {
    const { resolveClinicContext } = await import('./tenant')
    const { client, rpc } = makeMockSupabase({
      user: { id: 'user-3', app_metadata: {} },
      rpcResult: { data: 'clinic-cached', error: null },
    })
    // Primeira chamada · seta cache
    await resolveClinicContext(client)
    expect(rpc).toHaveBeenCalledTimes(1)

    // Segunda chamada · usa cache, NAO chama RPC novamente
    await resolveClinicContext(client)
    expect(rpc).toHaveBeenCalledTimes(1) // ainda 1
  })

  it('warning console.warn UMA vez no primeiro fallback', async () => {
    const { resolveClinicContext } = await import('./tenant')
    const { client } = makeMockSupabase({
      user: { id: 'user-4', app_metadata: {} },
      rpcResult: { data: 'clinic-x', error: null },
    })

    await resolveClinicContext(client)
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1)
    expect(consoleWarnSpy.mock.calls[0][0]).toMatch(/sem clinic_id no JWT/)

    // Segunda chamada NAO emite novo warning
    await resolveClinicContext(client)
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1) // ainda 1
  })

  it('retorna null quando claim ausente E RPC retorna error', async () => {
    const { resolveClinicContext } = await import('./tenant')
    const { client } = makeMockSupabase({
      user: { id: 'user-5', app_metadata: {} },
      rpcResult: { data: null, error: { message: 'function _default_clinic_id() does not exist' } },
    })
    const ctx = await resolveClinicContext(client)
    expect(ctx).toBeNull()
  })

  it('retorna null quando claim ausente E RPC retorna null data', async () => {
    const { resolveClinicContext } = await import('./tenant')
    const { client } = makeMockSupabase({
      user: { id: 'user-6', app_metadata: {} },
      rpcResult: { data: null, error: null },
    })
    const ctx = await resolveClinicContext(client)
    expect(ctx).toBeNull()
  })

  it('propaga role do app_metadata.app_role', async () => {
    const { resolveClinicContext } = await import('./tenant')
    const roles = ['owner', 'admin', 'therapist', 'receptionist', 'viewer'] as const
    for (const role of roles) {
      const { client } = makeMockSupabase({
        user: {
          id: 'user-x',
          app_metadata: { clinic_id: 'c1', app_role: role },
        },
      })
      const ctx = await resolveClinicContext(client)
      expect(ctx?.role).toBe(role)
    }
  })
})

describe('requireClinicContext', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('throws quando context resolve null', async () => {
    const { requireClinicContext } = await import('./tenant')
    const { client } = makeMockSupabase({ user: null })
    await expect(requireClinicContext(client)).rejects.toThrow(/UNAUTHORIZED/)
  })

  it('retorna ctx quando resolve OK', async () => {
    const { requireClinicContext } = await import('./tenant')
    const { client } = makeMockSupabase({
      user: { id: 'u1', app_metadata: { clinic_id: 'c1' } },
    })
    const ctx = await requireClinicContext(client)
    expect(ctx.clinic_id).toBe('c1')
  })
})
