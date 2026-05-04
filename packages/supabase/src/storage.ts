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
 * Gera signed URL pra um path do bucket `media`.
 * Throws no caller se path malformado · graceful null se signed URL falha.
 */
export async function signMediaPath(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any, any, any>,
  path: string,
  ttlSeconds: number = SIGNED_URL_TTL_UI,
): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, ttlSeconds)
  if (error || !data?.signedUrl) {
    // eslint-disable-next-line no-console
    console.warn('[signMediaPath] failed', { path, err: error?.message })
    return null
  }
  return data.signedUrl
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
 * Versão batch pra listas de messages/broadcasts. Resolve em paralelo.
 * Aceita objetos com campo `mediaUrl` ou `media_url` · muta o item retornando cópia.
 */
export async function signMediaBatch<T extends Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any, any, any>,
  items: T[],
  field: keyof T,
  ttlSeconds: number = SIGNED_URL_TTL_UI,
): Promise<T[]> {
  return Promise.all(
    items.map(async (item) => {
      const value = item[field]
      if (typeof value !== 'string' || !value) return item
      const signed = await signOrPassthrough(supabase, value, ttlSeconds)
      return { ...item, [field]: signed ?? value }
    }),
  )
}
