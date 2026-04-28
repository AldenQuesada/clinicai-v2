/**
 * uploadAsset · helper compartilhado pra subir arquivos no bucket
 * `flipbook-assets`. Devolve a URL pública e o path interno.
 *
 * Bucket é público (mig 0800-52) · 5MB max por arquivo. Validação de
 * MIME e tamanho fica no chamador (pra dar erro humano por painel).
 */
'use client'

import { createBrowserClient } from '@/lib/supabase/browser'

const BUCKET = 'flipbook-assets'

export interface UploadResult {
  url: string
  path: string
}

export async function uploadAsset(
  flipbookId: string,
  file: File,
  filename: string,
): Promise<UploadResult> {
  const supabase = createBrowserClient()
  const path = `${flipbookId}/${filename}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
      cacheControl: '3600',
    })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  // Cache-busting query param garante que update reflete no preview
  const url = `${data.publicUrl}?v=${Date.now()}`
  return { url, path }
}
