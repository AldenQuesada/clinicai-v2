/**
 * _mock-context · helper compartilhado pelos testes de Server Actions.
 *
 * Stub minimalista do `loadServerReposContext` (auth + clinic + repos) ·
 * cada repo tem so os metodos que actions reais chamam, com vi.fn() pra
 * controlar return value por teste.
 *
 * Uso tipico:
 *
 *   import { vi } from 'vitest'
 *   import { makeMockContext, applyContextMock } from './_mock-context'
 *
 *   vi.mock('@/lib/repos', () => ({ loadServerReposContext: vi.fn() }))
 *   vi.mock('next/cache', () => ({ updateTag: vi.fn() }))
 *
 *   describe('action X', () => {
 *     it('happy path', async () => {
 *       const { ctx } = applyContextMock({ orcamentos: { markSent: vi.fn().mockResolvedValue({ id: 'o1' }) } })
 *       const r = await actionX({ orcamentoId: 'o1' })
 *       expect(r.ok).toBe(true)
 *       expect(ctx.repos.orcamentos.markSent).toHaveBeenCalledWith('o1')
 *     })
 *   })
 */
import { vi, type Mock } from 'vitest'

export interface MockClinicContext {
  clinic_id: string
  user_id: string
  role: string | null
}

export interface MockRepos {
  orcamentos?: Record<string, Mock>
  appointments?: Record<string, Mock>
  patients?: Record<string, Mock>
  leads?: Record<string, Mock>
  phaseHistory?: Record<string, Mock>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: Record<string, Mock> | undefined
}

export interface MockReposContext {
  ctx: MockClinicContext
  repos: MockRepos
  supabase: { rpc: Mock; from: Mock }
}

/**
 * Cria contexto stub · ctx.role default 'owner', clinic_id fixo de teste.
 * Customizar via opts: e.g. `{ ctx: { role: 'receptionist' } }`.
 */
export function makeMockContext(opts: {
  ctx?: Partial<MockClinicContext>
  repos?: MockRepos
} = {}): MockReposContext {
  return {
    ctx: {
      clinic_id: '00000000-0000-0000-0000-000000000001',
      user_id: '00000000-0000-0000-0000-000000000010',
      role: 'owner',
      ...opts.ctx,
    },
    repos: opts.repos ?? {},
    supabase: { rpc: vi.fn(), from: vi.fn() },
  }
}

/**
 * Helper que monta o contexto E aplica o mock em loadServerReposContext.
 * Retorna o contexto pra asserts no teste.
 *
 * IMPORTANTE: o teste deve ter `vi.mock('@/lib/repos', ...)` no topo do
 * arquivo · esta funcao apenas configura o return value do mock.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyContextMock(repos: MockRepos = {}, ctxOverride: Partial<MockClinicContext> = {}): Promise<MockReposContext> {
  const context = makeMockContext({ repos, ctx: ctxOverride })
  // Lazy import pra resolver o mock declarado no arquivo de teste
  const mod = await import('@/lib/repos')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(mod.loadServerReposContext as unknown as Mock).mockResolvedValue(context as any)
  return context
}
