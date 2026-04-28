/**
 * Helper que pega jsonb retornado por qualquer RPC CRM e converte chaves
 * snake → camel sem perder o discriminator `ok`. Usado pelos repositories
 * pra evitar `as` casts em cada caller.
 *
 * Convencao: TODAS as 9 RPCs CRM retornam `{ ok: boolean, ...payload }`.
 * Se a RPC retorna algo nao-objeto (raro · indica bug), devolve fail
 * sintetico `{ ok: false, error: 'rpc_returned_non_object' }`.
 */

function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRpcResult<T>(raw: any): T {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'rpc_returned_non_object' } as unknown as T
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(raw)) {
    out[snakeToCamelKey(k)] = v
  }
  return out as T
}
