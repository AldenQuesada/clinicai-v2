/**
 * _mock-supabase · helper de teste compartilhado pelos repositories.
 *
 * Cria um SupabaseClient stub com fluent query builder · cada metodo
 * encadeavel retorna `this` ate maybeSingle()/single() ou await direto
 * (em queries sem .single()) resolverem com `{ data, error }`.
 *
 * Foco em regras de negocio · NAO valida o shape exato das chamadas SQL
 * (PostgREST). Helpers expoem mocks pra asserts seletivos quando o teste
 * precisa verificar argumentos especificos (ex.: `.in('phone', variants)`).
 */
import { vi, type Mock } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

export type MockResult = { data: unknown; error: unknown; count?: number | null }

export interface MockSupabaseOptions {
  /** Resultado padrao retornado pelos terminadores (.single/.maybeSingle/await) */
  defaultResult?: MockResult
  /** Override por tabela · pega prioridade sobre defaultResult */
  byTable?: Record<string, MockResult>
  /** Resultados de RPC indexados por nome */
  rpcResults?: Record<string, MockResult>
}

/**
 * Cria um builder mock fluente · todo metodo encadeavel registra o argumento
 * e retorna `this`. Os terminadores resolvem com o resultado configurado.
 *
 * Suporta `await builder` direto (sem .single/.maybeSingle) via `then` ·
 * usado por queries do tipo `.from(t).select().eq()` sem terminador explicito.
 */
interface MockBuilderHandle {
  builder: Record<string, unknown>
  fns: Record<string, Mock>
}

function makeBuilder(result: MockResult): MockBuilderHandle {
  const fns: Record<string, Mock> = {}

  // Terminadores resolvem · encadeaveis retornam o builder
  const chainable = [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'like',
    'ilike',
    'is',
    'in',
    'contains',
    'containedBy',
    'or',
    'not',
    'order',
    'limit',
    'range',
    'match',
    'filter',
  ]
  const terminals = ['single', 'maybeSingle']

  // Builder eh thenable · permite `await query` sem chamar single().
  const builder: Record<string, unknown> = {}
  for (const m of chainable) {
    fns[m] = vi.fn(() => builder)
    builder[m] = fns[m]
  }
  for (const m of terminals) {
    fns[m] = vi.fn(() => Promise.resolve(result))
    builder[m] = fns[m]
  }
  // Thenable: `await builder` resolve com result direto
  builder.then = (resolve: (v: MockResult) => unknown) => Promise.resolve(resolve(result))

  return { builder, fns }
}

export function makeMockSupabase(opts: MockSupabaseOptions = {}) {
  const defaultResult: MockResult = opts.defaultResult ?? { data: null, error: null }
  const byTable = opts.byTable ?? {}
  const rpcResults = opts.rpcResults ?? {}

  /**
   * Registro das chamadas `.from(table)` · cada chamada cria um builder
   * novo (state isolado entre queries dentro do mesmo teste).
   */
  const fromCalls: Array<{ table: string } & MockBuilderHandle> = []

  const from = vi.fn((table: string) => {
    const result = byTable[table] ?? defaultResult
    const { builder, fns } = makeBuilder(result)
    fromCalls.push({ table, builder, fns })
    return builder
  })

  const rpc = vi.fn((name: string) => {
    const r = rpcResults[name] ?? { data: null, error: null }
    return Promise.resolve(r)
  })

  return {
    client: { from, rpc } as unknown as SupabaseClient,
    from,
    rpc,
    fromCalls,
  }
}
