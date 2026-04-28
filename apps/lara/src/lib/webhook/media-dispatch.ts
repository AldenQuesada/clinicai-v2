/**
 * Auto-dispatch de mídias ricas (fotos antes/depois) baseado em tag da IA.
 *
 * Audit gap D1 (P2): paridade com Lara legacy n8n · 9 tags suportadas com
 * pastas distintas no bucket. Cada tag roleia 1 foto random da pasta dela.
 *
 * Tags suportadas (case-insensitive):
 *   [FOTO:geral]           → before-after/geral (overview da Dra.)
 *   [FOTO:olheiras]        → before-after/olheiras
 *   [FOTO:sulcos]          → before-after/sulcos (bigode chinês, marionete)
 *   [FOTO:flacidez]        → before-after/flacidez
 *   [FOTO:contorno]        → before-after/contorno (mandíbula)
 *   [FOTO:papada]          → before-after/papada
 *   [FOTO:textura]         → before-after/textura (poros, manchas)
 *   [FOTO:rugas]           → before-after/rugas
 *   [FOTO:rejuvenescimento]→ before-after/rejuvenescimento (geral fullface)
 *   [FOTO:fullface]        → before-after/fullface (back-compat)
 *   [ENVIAR_FOTO:olheiras|fullface] → back-compat formato antigo
 *
 * Override por env: BUCKET_FOTO_<TAG_UPPER> (ex: BUCKET_FOTO_OLHEIRAS).
 *
 * Fallback: se pasta vazia ou inválida, cai pra olheiras/fullface segundo
 * leadFunnel · se nem isso, fullface (geral).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger, hashPhone } from '@clinicai/logger'

const log = createLogger({ app: 'lara' })

export type PhotoTag =
  | 'geral'
  | 'olheiras'
  | 'sulcos'
  | 'flacidez'
  | 'contorno'
  | 'papada'
  | 'textura'
  | 'rugas'
  | 'rejuvenescimento'
  | 'fullface'

const KNOWN_TAGS: PhotoTag[] = [
  'geral', 'olheiras', 'sulcos', 'flacidez', 'contorno',
  'papada', 'textura', 'rugas', 'rejuvenescimento', 'fullface',
]

/** Pasta default no bucket 'media' por tag · pode override via env BUCKET_FOTO_<TAG_UPPER> */
const DEFAULT_PATHS: Record<PhotoTag, string> = {
  geral: 'before-after/geral',
  olheiras: 'before-after/olheiras',
  sulcos: 'before-after/sulcos',
  flacidez: 'before-after/flacidez',
  contorno: 'before-after/contorno',
  papada: 'before-after/papada',
  textura: 'before-after/textura',
  rugas: 'before-after/rugas',
  rejuvenescimento: 'before-after/rejuvenescimento',
  fullface: 'before-after/fullface',
}

export interface MediaDispatchResult {
  textCleaned: string
  photoUrl: string | null
  photoName: string | null
  /** tag detectada · null se nenhuma encontrada */
  tag: PhotoTag | null
  /** pasta resolvida (depois de fallback) */
  resolvedPath: string | null
}

interface ResolveOpts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  clinic_id: string
  phone: string
  aiResponse: string
  leadFunnel: string | null | undefined
}

function envOverride(tag: PhotoTag): string | null {
  const key = `BUCKET_FOTO_${tag.toUpperCase()}`
  return process.env[key] || null
}

function resolveTag(aiResponse: string, leadFunnel: string | null | undefined): {
  tag: PhotoTag | null
  matchText: string | null
} {
  // 1. [FOTO:<tag>] · 9 tags + fullface back-compat
  const fotoMatch = aiResponse.match(/\s*\[FOTO:([a-zA-ZçãáéíóúÇÃÁÉÍÓÚ]+)\]\s*/i)
  if (fotoMatch && fotoMatch[1]) {
    const raw = fotoMatch[1].toLowerCase()
    if (KNOWN_TAGS.includes(raw as PhotoTag)) {
      return { tag: raw as PhotoTag, matchText: fotoMatch[0] }
    }
    // Tag desconhecida · cai pra heurística
    log.warn({ tag: raw }, 'media.tag.unknown · fallback heuristic')
  }

  // 2. [ENVIAR_FOTO:olheiras|fullface] · formato legacy do código anterior
  const enviarMatch = aiResponse.match(/\s*\[ENVIAR_FOTO:(olheiras|fullface)\]\s*/i)
  if (enviarMatch && enviarMatch[1]) {
    return { tag: enviarMatch[1].toLowerCase() as PhotoTag, matchText: enviarMatch[0] }
  }

  // 3. [ENVIAR_FOTO] genérico ou tag desconhecida · usa leadFunnel ou fullface
  const genericMatch = aiResponse.match(/\s*\[ENVIAR_FOTO\]\s*/i)
  if (genericMatch) {
    const fallback: PhotoTag =
      leadFunnel === 'olheiras' ? 'olheiras' :
      leadFunnel === 'fullface' ? 'fullface' :
      aiResponse.toLowerCase().includes('olheiras') ? 'olheiras' : 'fullface'
    return { tag: fallback, matchText: genericMatch[0] }
  }

  return { tag: null, matchText: null }
}

/**
 * Detecta tag, sorteia foto, retorna URL pública. Caller decide se sendImage ou sendText.
 */
export async function resolveMediaDispatch(opts: ResolveOpts): Promise<MediaDispatchResult> {
  const { supabase, clinic_id, phone, aiResponse, leadFunnel } = opts

  const { tag, matchText } = resolveTag(aiResponse, leadFunnel)
  if (!tag || !matchText) {
    return { textCleaned: aiResponse, photoUrl: null, photoName: null, tag: null, resolvedPath: null }
  }

  const textCleaned = aiResponse.replace(matchText, '\n\n').trim()

  // Tenta pasta da tag · fallback pra fullface se pasta vazia/inválida
  const tryPath = envOverride(tag) || DEFAULT_PATHS[tag]
  let resolvedPath = tryPath
  let photoName: string | null = null

  try {
    const { data: files } = await supabase.storage.from('media').list(tryPath)
    const validFiles = files?.filter((f) => f.name.match(/\.(jpg|jpeg|png|webp)$/i)) || []
    if (validFiles.length > 0) {
      photoName = validFiles[Math.floor(Math.random() * validFiles.length)].name
    } else {
      // Fallback: pasta da tag vazia · usa fullface (mais rica) ou olheiras
      const fallbackPath = envOverride('fullface') || DEFAULT_PATHS.fullface
      log.warn({ clinic_id, tag, base_path: tryPath, fallback: fallbackPath }, 'media.roleta.empty · fallback')
      const { data: fbFiles } = await supabase.storage.from('media').list(fallbackPath)
      const fbValid = fbFiles?.filter((f) => f.name.match(/\.(jpg|jpeg|png|webp)$/i)) || []
      if (fbValid.length > 0) {
        photoName = fbValid[Math.floor(Math.random() * fbValid.length)].name
        resolvedPath = fallbackPath
      }
    }
  } catch (e) {
    log.warn({ clinic_id, tag, err: (e as Error)?.message }, 'media.roleta.failed')
  }

  if (!photoName) {
    return { textCleaned, photoUrl: null, photoName: null, tag, resolvedPath: null }
  }

  const { data: urlData } = supabase.storage
    .from('media')
    .getPublicUrl(`${resolvedPath}/${photoName}`)

  if (!urlData?.publicUrl) {
    return { textCleaned, photoUrl: null, photoName: null, tag, resolvedPath }
  }

  log.info(
    { clinic_id, phone_hash: hashPhone(phone), photo: photoName, tag, resolved_path: resolvedPath },
    'media.dispatch',
  )

  return {
    textCleaned,
    photoUrl: urlData.publicUrl,
    photoName,
    tag,
    resolvedPath,
  }
}
