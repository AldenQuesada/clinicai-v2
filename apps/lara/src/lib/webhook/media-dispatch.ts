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
import { signOrPassthrough, SIGNED_URL_TTL_META } from '@clinicai/supabase'
const log = createLogger({ app: 'lara' })

export type PhotoTag =
  // Tags de queixa (resultados antes/depois · category=before_after)
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
  // Tags institucionais (category != before_after) · 2026-04-30
  | 'consulta'
  | 'anovator'
  | 'biometria'
  | 'clinica'

const KNOWN_TAGS: PhotoTag[] = [
  // Queixas antes/depois
  'geral', 'olheiras', 'sulcos', 'flacidez', 'contorno',
  'papada', 'textura', 'rugas', 'rejuvenescimento', 'fullface',
  'firmeza', 'manchas', 'mandibula', 'perfil', 'bigode_chines',
  // Institucionais (consulta · equipamento · ambiente)
  'consulta', 'anovator', 'biometria', 'clinica',
]

/** Tags institucionais · usam `category` em vez de `funnel` ao buscar no bank. */
const INSTITUTIONAL_TAGS = new Set<PhotoTag>(['consulta', 'anovator', 'biometria', 'clinica'])

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  clinic_id: string
  phone: string
  aiResponse: string
  leadFunnel: string | null | undefined
  /** Audit 2026-04-30 · evitar repetir foto na mesma conversa.
      Caller passa o conversation_id pra que possamos consultar wa_messages
      e excluir URLs/filenames ja enviados antes do shuffle. */
  conversationId?: string | null
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
 * Busca fotos institucionais por `category` · 2026-04-30.
 * Não usa o RPC wa_get_media (que filtra por funnel/queixa) porque categorias
 * institucionais (consulta/anovator/biometria/clinica) não têm queixa nem
 * funnel necessariamente. Query direta na tabela com filtro ativo.
 */
async function fetchFromBankByCategory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  clinicId: string,
  category: string,
): Promise<BankPhoto[]> {
  try {
    const { data, error } = await supabase
      .from('wa_media_bank')
      .select('id, url, filename, caption, queixas')
      .eq('clinic_id', clinicId)
      .eq('category', category)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) {
      log.warn({ err: error.message, category }, 'media.bank.category_query_error')
      return []
    }
    if (!Array.isArray(data)) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[])
      .filter((m) => !!m && typeof m.url === 'string')
      .map<BankPhoto>((m) => ({
        id: String(m.id),
        url: String(m.url),
        filename: typeof m.filename === 'string' ? m.filename : null,
        caption: typeof m.caption === 'string' ? m.caption : null,
        queixas: Array.isArray(m.queixas) ? (m.queixas as string[]) : null,
        funnel: null,
        phase: null,
      }))
  } catch (e) {
    log.warn({ err: (e as Error)?.message, category }, 'media.bank.category_exception')
    return []
  }
}

/**
 * Chama RPC wa_get_media(p_funnel, p_queixa, p_phase) · retorna lista de fotos
 * categorizadas com nomes/captions. Retorna [] em caso de erro ou bank vazio.
 */
async function fetchFromBank(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
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
 *
 * Fase 1 LGPD (2026-05-04): retorna PATH (não URL) no campo `url`. Conversão
 * pra signed URL acontece num único pass no fim de resolveMediaDispatch.
 *
 * `basePath` deve já incluir clinic_id no prefixo (ex: `${clinic_id}/library/before-after/olheiras`).
 * Caller responsável pela montagem.
 */
async function fallbackBucketList(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  basePath: string,
): Promise<BankPhoto[]> {
  try {
    const { data: files } = await supabase.storage.from('media').list(basePath)
    const validFiles = files?.filter((f) => f.name.match(/\.(jpg|jpeg|png|webp)$/i)) || []
    return validFiles.map((f) => {
      // Fase 1: salva PATH no campo `url` · resolvido em signed URL no caller.
      const path = `${basePath}/${f.name}`
      return {
        id: f.id || f.name,
        url: path,
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
  const { supabase, clinic_id, phone, aiResponse, leadFunnel, conversationId } = opts

  const { tag, matchText } = resolveTag(aiResponse, leadFunnel)
  if (!tag || !matchText) {
    return {
      textCleaned: aiResponse, photos: [], tag: null, source: 'none',
      photoUrl: null, photoName: null, resolvedPath: null,
    }
  }

  const textCleaned = aiResponse.replace(matchText, '\n\n').trim()

  // Tag institucional (consulta/anovator/biometria/clinica)? Busca por
  // category direto na tabela · ignora funnel/queixa.
  const isInstitutional = INSTITUTIONAL_TAGS.has(tag)
  let photos: BankPhoto[] = []
  let source: MediaDispatchResult['source'] = 'rpc'

  if (isInstitutional) {
    photos = await fetchFromBankByCategory(supabase, clinic_id, tag)
    if (photos.length === 0) {
      // Fallback bucket pasta institucional (ex: <clinic>/library/consulta/*)
      // Fase 1 LGPD: prefix clinic_id pra alinhar com path canonical (mediaPaths.library)
      photos = await fallbackBucketList(supabase, `${clinic_id}/library/${tag}`)
      if (photos.length > 0) source = 'bucket'
    }
  } else {
    // Funnel: tag explícita ou leadFunnel · default fullface (cobre maioria das tags)
    const funnel =
      tag === 'olheiras' ? 'olheiras' :
      leadFunnel === 'olheiras' ? 'olheiras' :
      'fullface'

    // 1. Tenta RPC com queixa específica · paridade legacy
    photos = await fetchFromBank(supabase, funnel, tag)

    // 2. Sem fotos pra essa queixa · pega qualquer foto do funnel
    if (photos.length === 0) {
      photos = await fetchFromBank(supabase, funnel, null)
      if (photos.length > 0) {
        log.info({ tag, funnel, fallback: 'queixa_null' }, 'media.bank.queixa_fallback')
      }
    }

    // 3. Bank vazio · fallback bucket folder legacy (sem captions categorizadas)
    if (photos.length === 0) {
      // Fase 1 LGPD: prefix clinic_id pra alinhar com mediaPaths.library
      const folder = funnel === 'olheiras'
        ? `${clinic_id}/library/before-after/olheiras`
        : `${clinic_id}/library/before-after/fullface`
      photos = await fallbackBucketList(supabase, folder)
      source = 'bucket'
      if (photos.length > 0) {
        log.info({ tag, folder }, 'media.bucket.legacy_fallback')
      }
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

  // Audit 2026-04-30 · NUNCA enviar a mesma foto duas vezes na mesma
  // conversa. Antes do pick, busca historico de media_url ja enviadas
  // (outbound + content_type=image) e exclui do pool. Se zerar (todas
  // ja foram), libera o pool inteiro novamente (ultimo recurso · evita
  // ficar mudo). Caller que nao passar conversationId mantem comportamento
  // legacy (sem dedup) por compat.
  let alreadySent = new Set<string>()
  if (conversationId) {
    try {
      const { data: prev } = await supabase
        .from('wa_messages')
        .select('media_url')
        .eq('conversation_id', conversationId)
        .eq('direction', 'outbound')
        .eq('content_type', 'image')
        .not('media_url', 'is', null)
      if (Array.isArray(prev)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        alreadySent = new Set((prev as any[]).map((r) => r.media_url).filter(Boolean))
      }
    } catch (e) {
      log.warn({ err: (e as Error)?.message, conversationId }, 'media.history.fetch_failed')
    }
  }

  const photosFresh = alreadySent.size > 0
    ? photos.filter((p) => !alreadySent.has(p.url))
    : photos

  // Se todas foram excluidas (ja mandou todas na mesma conversa),
  // reusa o pool inteiro · melhor mandar repetida do que ficar sem foto
  const photosToUse = photosFresh.length > 0 ? photosFresh : photos
  if (photosFresh.length === 0 && alreadySent.size > 0) {
    log.info(
      { clinic_id, phone_hash: hashPhone(phone), tag, total_sent_before: alreadySent.size },
      'media.dedup.exhausted_pool',
    )
  }

  // Pega até 2 fotos de pessoas distintas (paridade legacy n8n)
  const pickedRaw = pickTwoFromDifferentPeople(photosToUse)

  // Fase 1 LGPD: photos podem ter `url` = PATH (novo) ou URL legacy.
  // Caller chama wa.sendImage(photo.url, caption) · Meta precisa baixar.
  // Assina path com TTL 24h (margem ampla · Meta busca em segundos).
  const picked = await Promise.all(
    pickedRaw.map(async (p) => ({
      ...p,
      url: (await signOrPassthrough(supabase, p.url, SIGNED_URL_TTL_META)) ?? p.url,
    })),
  )

  log.info(
    {
      clinic_id, phone_hash: hashPhone(phone), tag,
      institutional: isInstitutional,
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
