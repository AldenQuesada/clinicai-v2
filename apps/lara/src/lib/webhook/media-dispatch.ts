/**
 * Auto-dispatch de mídias ricas (fotos antes/depois) baseado em tag da IA.
 *
 * Tags suportadas:
 *   [ENVIAR_FOTO:olheiras|fullface]  → roleta de fotos do funil específico
 *   [ENVIAR_FOTO] / [FOTO:...]       → fallback legado · usa funnel atual ou heurística
 *
 * Roleta: lista arquivos do bucket Supabase Storage e sorteia 1 aleatório.
 * Funnel determina pasta: BUCKET_FUNIL_OLHEIRAS / BUCKET_FUNIL_FULLFACE (env).
 *
 * Retorna texto limpo + URL da foto (null se não detectou tag ou roleta vazia).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger, hashPhone } from '@clinicai/logger'

const log = createLogger({ app: 'lara' })

export interface MediaDispatchResult {
  textCleaned: string
  photoUrl: string | null
  photoName: string | null
  funnel: 'olheiras' | 'fullface' | null
}

interface ResolveOpts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  clinic_id: string
  phone: string
  aiResponse: string
  leadFunnel: string | null | undefined
}

/**
 * Detecta tag, sorteia foto, retorna URL pública. Caller decide se sendImage ou sendText.
 */
export async function resolveMediaDispatch(opts: ResolveOpts): Promise<MediaDispatchResult> {
  const { supabase, clinic_id, phone, aiResponse, leadFunnel } = opts

  const photoMatch = aiResponse.match(/\s*\[ENVIAR_FOTO:(olheiras|fullface)\]\s*/i)
  const legacyMatch = !photoMatch
    ? aiResponse.match(/\s*\[(?:ENVIAR_FOTO|FOTO:[^\]]+)\]\s*/i)
    : null
  const activeMatch = photoMatch || legacyMatch

  if (!activeMatch) {
    return { textCleaned: aiResponse, photoUrl: null, photoName: null, funnel: null }
  }

  const textCleaned = aiResponse.replace(activeMatch[0], '\n\n').trim()

  // Funnel: tag IA > banco > heurística no próprio texto
  let computedFunnel: 'olheiras' | 'fullface' = 'olheiras'
  if (photoMatch && photoMatch[1]) {
    computedFunnel = photoMatch[1].toLowerCase() as 'olheiras' | 'fullface'
  } else if (leadFunnel === 'olheiras' || leadFunnel === 'fullface') {
    computedFunnel = leadFunnel
  } else {
    computedFunnel = aiResponse.toLowerCase().includes('olheiras') ? 'olheiras' : 'fullface'
  }

  const basePath =
    computedFunnel === 'olheiras'
      ? process.env.BUCKET_FUNIL_OLHEIRAS || 'before-after/olheiras'
      : process.env.BUCKET_FUNIL_FULLFACE || 'before-after/fullface'

  // Roleta: lista bucket, filtra extensões válidas, sorteia
  let photoName = 'resultado.jpg' // fallback se roleta vazia
  try {
    const { data: files } = await supabase.storage.from('media').list(basePath)
    const validFiles = files?.filter((f) => f.name.match(/\.(jpg|jpeg|png)$/i)) || []
    if (validFiles.length > 0) {
      const idx = Math.floor(Math.random() * validFiles.length)
      photoName = validFiles[idx].name
    } else {
      log.warn({ clinic_id, base_path: basePath }, 'media.roleta.empty')
    }
  } catch (e) {
    log.warn({ clinic_id, err: (e as Error)?.message }, 'media.roleta.failed')
  }

  const { data: urlData } = supabase.storage
    .from('media')
    .getPublicUrl(`${basePath}/${photoName}`)

  if (!urlData?.publicUrl) {
    return { textCleaned, photoUrl: null, photoName: null, funnel: computedFunnel }
  }

  log.info(
    { clinic_id, phone_hash: hashPhone(phone), photo: photoName, funnel: computedFunnel },
    'media.dispatch',
  )

  return {
    textCleaned,
    photoUrl: urlData.publicUrl,
    photoName,
    funnel: computedFunnel,
  }
}
