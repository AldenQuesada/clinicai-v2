/**
 * Auto-dispatch de mídias ricas (fotos antes/depois) baseado em tag da IA.
 *
 * Audit gap D1 (P2) · evolução: paridade COMPLETA com Lara legacy n8n via
 * RPC `wa_get_media(p_funnel, p_queixa, p_phase)` que retorna fotos categorizadas
 * de `wa_media_bank` (table populada com nomes/idades/queixas/captions reais).
 *
 * Tags suportadas (case-insensitive):
 *   [FOTO:geral|olheiras|sulcos|flacidez|contorno|papada|textura|rugas|
 *         rejuvenescimento|fullface|firmeza|manchas|mandibula|perfil|bigode_chines]
 *   [ENVIAR_FOTO:olheiras|fullface] → back-compat formato antigo
 *
 * Diferente da v1 (que listava bucket folder direto): agora usa wa_media_bank
 * que tem captions com nome+idade do paciente (ex: "Miriam Poppi, 52 anos ·
 * Resultado real Dra. Mirian de Paula"). Lara legacy mandava 2 fotos de pessoas
 * diferentes · esta versão também (audit gap D1 paridade total).
 *
 * Fallback chain:
 *   1. RPC wa_get_media(funnel=fullface, queixa=<tag>) · fotos categorizadas com captions
 *   2. RPC wa_get_media(funnel=fullface, queixa=null) · qualquer foto fullface
 *   3. Listagem direta do bucket (legacy fallback) · sem captions
 *   4. null · caller manda texto sem foto
 *
 * Compat com captions: cada foto retorna URL + caption · caller pode mandar
 * sendImage(url, caption) e paciente vê o nome+idade.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger, hashPhone } from '@clinicai/logger'
import type { Database } from '@clinicai/supabase'

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
  | 'firmeza'
  | 'manchas'
  | 'mandibula'
  | 'perfil'
  | 'bigode_chines'

const KNOWN_TAGS: PhotoTag[] = [
  'geral', 'olheiras', 'sulcos', 'flacidez', 'contorno',
  'papada', 'textura', 'rugas', 'rejuvenescimento', 'fullface',
  'firmeza', 'manchas', 'mandibula', 'perfil', 'bigode_chines',
]

/**
 * Foto retornada pelo bank · `caption` traz nome+idade do paciente
 * (ex: "Miriam Poppi, 52 anos · Resultado real Dra. Mirian de Paula").
 */
export interface BankPhoto {
  id: string
  url: string
  filename: string | null
  caption: string | null
  queixas: string[] | null
  funnel: string | null
  phase: string | null
}

export interface MediaDispatchResult {
  textCleaned: string
  /**
   * Fotos sortidas pra mandar · até 2 de pessoas diferentes (paridade legacy n8n).
   * Caller envia cada uma via sendImage(url, caption).
   */
  photos: BankPhoto[]
  /** tag detectada · null se nenhuma encontrada */
  tag: PhotoTag | null
  /** source · pra debug · 'rpc' = wa_get_media OK, 'bucket' = legacy fallback, 'none' = nada */
  source: 'rpc' | 'bucket' | 'none'

  // Back-compat fields · primeira foto direto pra caller que ainda usa photoUrl singular
  /** @deprecated · usar photos[0]?.url */
  photoUrl: string | null
  /** @deprecated · usar photos[0]?.filename */
  photoName: string | null
  /** @deprecated · não mais relevante (RPC retorna URLs absolutas) */
  resolvedPath: string | null
}

interface ResolveOpts {
  supabase: SupabaseClient<Database>
  clinic_id: string
  phone: string
  aiResponse: string
  leadFunnel: string | null | undefined
}

function resolveTag(aiResponse: string, leadFunnel: string | null | undefined): {
  tag: PhotoTag | null
  matchText: string | null
} {
  // 1. [FOTO:<tag>] · case-insensitive · suporta underscore (bigode_chines)
  const fotoMatch = aiResponse.match(/\s*\[FOTO:([a-zA-Z_çãáéíóúÇÃÁÉÍÓÚ]+)\]\s*/i)
  if (fotoMatch && fotoMatch[1]) {
    const raw = fotoMatch[1].toLowerCase()
    if (KNOWN_TAGS.includes(raw as PhotoTag)) {
      return { tag: raw as PhotoTag, matchText: fotoMatch[0] }
    }
    log.warn({ tag: raw }, 'media.tag.unknown · fallback heuristic')
  }

  // 2. [ENVIAR_FOTO:olheiras|fullface] · formato legacy
  const enviarMatch = aiResponse.match(/\s*\[ENVIAR_FOTO:(olheiras|fullface)\]\s*/i)
  if (enviarMatch && enviarMatch[1]) {
    return { tag: enviarMatch[1].toLowerCase() as PhotoTag, matchText: enviarMatch[0] }
  }

  // 3. [ENVIAR_FOTO] genérico
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
 * Pega 2 fotos de pessoas DIFERENTES baseado em filename pattern.
 * Lara legacy n8n usava `ba-XX-<nome>` · extraímos o nome (ou fallback no índice).
 */
function pickTwoFromDifferentPeople(photos: BankPhoto[]): BankPhoto[] {
  if (photos.length === 0) return []
  if (photos.length === 1) return [photos[0]]

  const shuffled = [...photos].sort(() => Math.random() - 0.5)
  const picked: BankPhoto[] = []
  const seenPersons = new Set<string>()

  function getPersonKey(p: BankPhoto): string {
    // Pattern: ba-XX-<nome>.jpg ou usa caption first word
    const fnMatch = (p.filename || '').match(/ba-\d+-([a-z]+)/i)
    if (fnMatch) return fnMatch[1].toLowerCase()
    // Caption pattern: "Nome Sobrenome, idade ..."
    const capMatch = (p.caption || '').match(/^([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)/)
    if (capMatch) return capMatch[1].toLowerCase()
    // Fallback: filename completo (cada foto vira "pessoa única")
    return (p.filename || p.id || '').toLowerCase()
  }

  for (const p of shuffled) {
    const key = getPersonKey(p)
    if (!seenPersons.has(key)) {
      picked.push(p)
      seenPersons.add(key)
      if (picked.length === 2) break
    }
  }
  // Se não consegui 2 pessoas distintas, completa com qualquer foto restante
  if (picked.length < 2) {
    for (const p of shuffled) {
      if (!picked.includes(p)) {
        picked.push(p)
        if (picked.length === 2) break
      }
    }
  }
  return picked
}

/**
 * Chama RPC wa_get_media(p_funnel, p_queixa, p_phase) · retorna lista de fotos
 * categorizadas com nomes/captions. Retorna [] em caso de erro ou bank vazio.
 */
async function fetchFromBank(
  supabase: SupabaseClient<Database>,
  funnel: string | null,
  queixa: string | null,
): Promise<BankPhoto[]> {
  try {
    const { data, error } = await supabase.rpc('wa_get_media', {
      p_funnel: funnel,
      p_queixa: queixa,
      p_phase: null,
    })
    if (error) {
      log.warn({ err: error.message, funnel, queixa }, 'media.bank.rpc_error')
      return []
    }
    if (!Array.isArray(data)) return []
    return data
      .filter((m): m is BankPhoto => !!m && typeof m === 'object' && typeof m.url === 'string')
      .map((m) => ({
        id: String(m.id),
        url: m.url,
        filename: m.filename ?? null,
        caption: m.caption ?? null,
        queixas: Array.isArray(m.queixas) ? m.queixas : null,
        funnel: m.funnel ?? null,
        phase: m.phase ?? null,
      }))
  } catch (e) {
    log.warn({ err: (e as Error)?.message }, 'media.bank.exception')
    return []
  }
}

/**
 * Fallback legacy · lista bucket direto. Sem captions reais (caller usa default).
 */
async function fallbackBucketList(
  supabase: SupabaseClient<Database>,
  basePath: string,
): Promise<BankPhoto[]> {
  try {
    const { data: files } = await supabase.storage.from('media').list(basePath)
    const validFiles = files?.filter((f) => f.name.match(/\.(jpg|jpeg|png|webp)$/i)) || []
    return validFiles.map((f) => {
      const { data: urlData } = supabase.storage.from('media').getPublicUrl(`${basePath}/${f.name}`)
      return {
        id: f.id || f.name,
        url: urlData?.publicUrl || '',
        filename: f.name,
        caption: 'Resultado real · Dra. Mirian de Paula',
        queixas: null,
        funnel: basePath.includes('olheiras') ? 'olheiras' : 'fullface',
        phase: null,
      }
    }).filter((p) => p.url)
  } catch (e) {
    log.warn({ err: (e as Error)?.message, base_path: basePath }, 'media.bucket.fallback_failed')
    return []
  }
}

/**
 * Detecta tag, busca fotos categorizadas em wa_media_bank, sorteia 2 de pessoas
 * diferentes. Caller envia cada foto via sendImage(photo.url, photo.caption).
 */
export async function resolveMediaDispatch(opts: ResolveOpts): Promise<MediaDispatchResult> {
  const { supabase, clinic_id, phone, aiResponse, leadFunnel } = opts

  const { tag, matchText } = resolveTag(aiResponse, leadFunnel)
  if (!tag || !matchText) {
    return {
      textCleaned: aiResponse, photos: [], tag: null, source: 'none',
      photoUrl: null, photoName: null, resolvedPath: null,
    }
  }

  const textCleaned = aiResponse.replace(matchText, '\n\n').trim()
  // Funnel: tag explícita ou leadFunnel · default fullface (cobre maioria das tags)
  const funnel =
    tag === 'olheiras' ? 'olheiras' :
    leadFunnel === 'olheiras' ? 'olheiras' :
    'fullface'

  // 1. Tenta RPC com queixa específica · paridade legacy
  let photos = await fetchFromBank(supabase, funnel, tag)
  let source: MediaDispatchResult['source'] = 'rpc'

  // 2. Sem fotos pra essa queixa · pega qualquer foto do funnel
  if (photos.length === 0) {
    photos = await fetchFromBank(supabase, funnel, null)
    if (photos.length > 0) {
      log.info({ tag, funnel, fallback: 'queixa_null' }, 'media.bank.queixa_fallback')
    }
  }

  // 3. Bank vazio · fallback bucket folder legacy (sem captions categorizadas)
  if (photos.length === 0) {
    const folder = funnel === 'olheiras' ? 'before-after/olheiras' : 'before-after/fullface'
    photos = await fallbackBucketList(supabase, folder)
    source = 'bucket'
    if (photos.length > 0) {
      log.info({ tag, folder }, 'media.bucket.legacy_fallback')
    }
  }

  // 4. Nada encontrado · sem foto
  if (photos.length === 0) {
    log.warn({ clinic_id, phone_hash: hashPhone(phone), tag }, 'media.empty · sem foto pra mandar')
    return {
      textCleaned, photos: [], tag, source: 'none',
      photoUrl: null, photoName: null, resolvedPath: null,
    }
  }

  // Pega até 2 fotos de pessoas distintas (paridade legacy n8n)
  const picked = pickTwoFromDifferentPeople(photos)

  log.info(
    {
      clinic_id, phone_hash: hashPhone(phone), tag, funnel,
      photo_count: picked.length, source,
      filenames: picked.map((p) => p.filename).filter(Boolean),
    },
    'media.dispatch',
  )

  // Back-compat: photoUrl/photoName apontam pra primeira foto (callers antigos)
  return {
    textCleaned, photos: picked, tag, source,
    photoUrl: picked[0]?.url ?? null,
    photoName: picked[0]?.filename ?? null,
    resolvedPath: null,
  }
}
