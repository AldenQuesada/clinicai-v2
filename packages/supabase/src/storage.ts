/**
 * Storage helpers · path canônico + signed URLs.
 *
 * Contrato (Fase 1 LGPD · 2026-05-04):
 *  - DB armazena PATH (não URL pública). Ex: media.media_url = '<clinic>/wa-cloud/<conv>/<uuid>.jpg'
 *  - API endpoints geram signed URL na resposta (TTL 1h pra UI, 24h pra outbound Meta).
 *  - Bucket `media` vai a privado em Fase 2 · path layout `<clinic_id>/<categoria>/<rest>`
 *    suporta RLS via `(storage.foldername(name))[1] = app_clinic_id()::text`.
 *
 * Backwards compat:
 *  - Legacy URL `https://<proj>.supabase.co/storage/v1/object/public/media/<path>` é
 *    detectada por `isLegacyPublicUrl` · helper `signOrPassthrough` retorna URL como-está
 *    pra rows antigas até a migration de backfill rodar. Após backfill, todas rows
 *    têm path · função sempre assina.
 *
 * Resiliência (audit 2026-05-05 · Bad Gateway sob burst):
 *  - `signMediaPath` faz 1 retry com backoff 250ms em erro transitório (502/503/504,
 *    Bad Gateway, timeout, fetch failed, network). NUNCA retry em 4xx (path errado,
 *    permissão, etc · não vão mudar com retry). Mantém return null final.
 *  - `signMediaBatch` usa `mapWithConcurrency(5)` em vez de `Promise.all` ilimitado ·
 *    evita thundering herd contra o edge worker do Storage. Ordem preservada.
 *  - NÃO usa service-role · NÃO faz fallback pra URL pública (bucket vai a privado em
 *    Fase 2). NÃO cacheia (deferido).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const MEDIA_BUCKET = 'media' as const

/** TTL padrão pra signed URLs em UI (1 hora · suficiente pra render + cache) */
export const SIGNED_URL_TTL_UI = 60 * 60

/** TTL pra outbound Meta (24h · Meta busca em segundos, margem ampla) */
export const SIGNED_URL_TTL_META = 24 * 60 * 60

/**
 * Builders canônicos de path · sempre prefixados com clinic_id.
 *
 * Layout final: `<clinic_id>/<categoria>/<resto>`
 * Categoria define o subdomínio funcional · ajuda debug + permite cleanup
 * scoped por categoria sem tocar resto.
 */
export const mediaPaths = {
  /** Inbound paciente via Cloud Meta API */
  cloudInbound: (clinicId: string, convId: string, uuid: string, ext: string) =>
    `${clinicId}/wa-cloud/${convId}/${uuid}.${ext}`,

  /**
   * Inbound paciente via Evolution (Mih/Mira).
   * convId pode ser null porque o download da mídia acontece ANTES de
   * resolveConversation (fluxo Evolution) · usa "pending" como placeholder
   * (cleanup periódico opcional · não impacta funcionamento).
   */
  evolutionInbound: (clinicId: string, convId: string | null, uuid: string, ext: string) =>
    `${clinicId}/wa-evolution/${convId ?? 'pending'}/${uuid}.${ext}`,

  /** Upload pelo atendente via UI (modal anexar) */
  upload: (clinicId: string, convId: string, uuid: string, ext: string) =>
    `${clinicId}/wa-uploads/${convId}/${uuid}.${ext}`,

  /** Biblioteca de mídia (mídia banco · before-after, institucional) */
  library: (clinicId: string, category: string, filename: string) =>
    `${clinicId}/library/${category}/${filename}`,

  /** Imagem anexada a broadcast (campanha) */
  broadcast: (clinicId: string, ts: number, safeName: string) =>
    `${clinicId}/broadcasts/${ts}-${safeName}`,
} as const

/**
 * Detecta se uma string é uma URL pública legacy do Supabase Storage.
 * Pre-Fase-1: ~9 call sites salvavam getPublicUrl().publicUrl em media_url.
 * Após backfill, esta função sempre retorna false.
 */
export function isLegacyPublicUrl(s: string | null | undefined): boolean {
  if (!s) return false
  return s.startsWith('http://') || s.startsWith('https://')
}

/**
 * Extrai path do bucket `media` de uma URL legacy.
 * `https://<proj>.supabase.co/storage/v1/object/public/media/wa-media/abc/file.jpg`
 *   → `wa-media/abc/file.jpg`
 *
 * Retorna null se URL não bate o padrão (URL externa, malformada, etc).
 */
export function extractPathFromLegacyUrl(url: string): string | null {
  const marker = '/storage/v1/object/public/media/'
  const idx = url.indexOf(marker)
  if (idx < 0) return null
  return url.slice(idx + marker.length)
}

/**
 * Fingerprint seguro do path pra logs · evita leakar clinic_id/conv_id no log.
 * Retorna comprimento + últimos 12 chars (sufixo cobre uuid+ext · útil pra
 * triagem sem expor folder root).
 */
function pathFingerprint(path: string): { path_length: number; path_tail: string } {
  return {
    path_length: path.length,
    path_tail: path.length > 12 ? path.slice(-12) : path,
  }
}

/**
 * Detecta se um erro do Supabase Storage é transitório (justifica 1 retry).
 * Conservador: só sinaliza retry pra padrões claros de falha de upstream/edge ·
 * 4xx (auth, path errado, etc) NÃO entram aqui · retry seria desperdício.
 */
function isTransientStorageError(error: unknown): { transient: boolean; reason: string } {
  if (!error) return { transient: false, reason: 'no_error' }
  const e = error as { message?: unknown; status?: unknown; statusCode?: unknown }
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : ''
  const status =
    typeof e.status === 'number'
      ? e.status
      : typeof e.statusCode === 'number'
        ? e.statusCode
        : 0

  if (status >= 500 && status < 600) return { transient: true, reason: `status_${status}` }
  if (msg.includes('bad gateway')) return { transient: true, reason: 'bad_gateway' }
  if (msg.includes('502')) return { transient: true, reason: '502' }
  if (msg.includes('503')) return { transient: true, reason: '503' }
  if (msg.includes('504')) return { transient: true, reason: '504' }
  if (msg.includes('gateway timeout')) return { transient: true, reason: 'gateway_timeout' }
  if (msg.includes('timeout')) return { transient: true, reason: 'timeout' }
  if (msg.includes('fetch failed')) return { transient: true, reason: 'fetch_failed' }
  if (msg.includes('network')) return { transient: true, reason: 'network' }
  return { transient: false, reason: msg.slice(0, 40) || 'unknown_non_transient' }
}

/**
 * Gera signed URL pra um path do bucket `media`.
 * Throws no caller se path malformado · graceful null se signed URL falha.
 *
 * Audit 2026-05-05: 1 retry com backoff 250ms em erro transitório (502/503/504,
 * Bad Gateway, timeout, fetch failed, network). Logs sem path completo (apenas
 * length + tail · evita leakar clinic_id/conv_id em logs persistentes).
 */
export async function signMediaPath(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any, any, any>,
  path: string,
  ttlSeconds: number = SIGNED_URL_TTL_UI,
): Promise<string | null> {
  if (!path) return null

  // Tentativa 1
  const first = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, ttlSeconds)
  if (!first.error && first.data?.signedUrl) {
    return first.data.signedUrl
  }

  const verdict = isTransientStorageError(first.error)
  const fp = pathFingerprint(path)

  // Erro não-transitório: falha imediata sem retry
  if (!verdict.transient) {
    // eslint-disable-next-line no-console
    console.warn('[signMediaPath] failed', {
      ...fp,
      ttlSeconds,
      err: (first.error?.message ?? '').slice(0, 120),
    })
    return null
  }

  // Erro transitório: 1 retry com backoff 250ms
  // eslint-disable-next-line no-console
  console.warn('[signMediaPath] retry_after_transient_error', {
    ...fp,
    ttlSeconds,
    reason: verdict.reason,
    attempt: 1,
  })
  await new Promise<void>((resolve) => setTimeout(resolve, 250))

  const second = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, ttlSeconds)
  if (!second.error && second.data?.signedUrl) {
    return second.data.signedUrl
  }

  // eslint-disable-next-line no-console
  console.warn('[signMediaPath] failed_after_retry', {
    ...fp,
    ttlSeconds,
    err: (second.error?.message ?? '').slice(0, 120),
  })
  return null
}

/**
 * Pra rows MIXED (path novo OU URL legacy):
 *  - URL legacy: retorna como-está (transitional · até backfill rodar)
 *  - Path novo: gera signed URL com TTL informado
 *  - null/empty: retorna null
 *
 * Use em API endpoints que servem messages/broadcasts pra UI.
 */
export async function signOrPassthrough(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any, any, any>,
  pathOrUrl: string | null | undefined,
  ttlSeconds: number = SIGNED_URL_TTL_UI,
): Promise<string | null> {
  if (!pathOrUrl) return null
  if (isLegacyPublicUrl(pathOrUrl)) return pathOrUrl
  return signMediaPath(supabase, pathOrUrl, ttlSeconds)
}

/**
 * Worker-pool pra mapear `items` com concorrência limitada · ordem preservada.
 * Sem dependência externa (sem p-limit / p-map). Se `fn` rejeitar pra um item,
 * o erro é logado e aquele slot vira `null`-ish · batch nunca é abortado.
 *
 * Audit 2026-05-05: substitui `Promise.all` direto em signMediaBatch · evita
 * burst contra Supabase Storage edge worker (causa principal de 502 Bad Gateway
 * em conversas com muitas mídias renderizadas de uma vez).
 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const total = items.length
  if (total === 0) return []
  const results = new Array<R>(total)
  let cursor = 0
  const workers = Math.max(1, Math.min(limit, total))

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor
      cursor += 1
      if (i >= total) return
      try {
        results[i] = await fn(items[i] as T, i)
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[mapWithConcurrency] item_failed', {
          index: i,
          err: (err as Error)?.message?.slice(0, 120),
        })
        // Defensivo · fn deveria retornar null em erro · este catch garante que
        // 1 falha não derruba os outros workers nem o batch inteiro.
        results[i] = null as unknown as R
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

/**
 * Versão batch pra listas de messages/broadcasts. Resolve com concorrência
 * limitada (default 5) · ordem preservada. Aceita objetos com campo `mediaUrl`
 * ou `media_url` · retorna cópia com o campo substituído pela signed URL
 * (ou pelo valor original se sign falhou · preserva path pra debug UI).
 */
export const SIGN_MEDIA_BATCH_DEFAULT_CONCURRENCY = 5

export async function signMediaBatch<T extends Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any, any, any>,
  items: T[],
  field: keyof T,
  ttlSeconds: number = SIGNED_URL_TTL_UI,
): Promise<T[]> {
  return mapWithConcurrency(items, SIGN_MEDIA_BATCH_DEFAULT_CONCURRENCY, async (item) => {
    const value = item[field]
    if (typeof value !== 'string' || !value) return item
    const signed = await signOrPassthrough(supabase, value, ttlSeconds)
    return { ...item, [field]: signed ?? value }
  })
}
