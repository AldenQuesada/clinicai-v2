'use server'

/**
 * Server Actions · CRUD do banco de midias (wa_media_bank).
 * ADR-012 · WaMediaBankRepository.
 *
 * Upload usa Supabase Storage bucket 'media' · path: before-after/<funnel>/<filename>.
 * URL publica gerada via getPublicUrl. Caption + queixas + funnel gravados na row.
 */

import { revalidatePath } from 'next/cache'
import { loadServerReposContext } from '@/lib/repos'
import { KNOWN_PHOTO_TAGS, type PhotoTag } from '@clinicai/repositories'

const ALLOWED_FUNNELS = ['olheiras', 'fullface'] as const
type AllowedFunnel = (typeof ALLOWED_FUNNELS)[number]

/**
 * Categorias da foto · separadas do funil de venda. Permite subir fotos
 * institucionais (consulta, equipamento, ambiente) que a Lara invoca quando
 * lead pergunta 'como é a consulta?'.
 */
const ALLOWED_CATEGORIES = [
  'before_after', // antes/depois (default · resultados)
  'consulta',     // foto da consulta · ambiente da sala / equipe
  'anovator',     // Anovator A5 (composição corporal)
  'biometria',    // biometria facial
  'clinica',      // recepção, fachada, sala de espera
] as const
type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number]

function parseQueixas(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is PhotoTag => KNOWN_PHOTO_TAGS.includes(s as PhotoTag))
}

function parseFunnel(raw: string): AllowedFunnel | null {
  return ALLOWED_FUNNELS.includes(raw as AllowedFunnel) ? (raw as AllowedFunnel) : null
}

function sanitizeFilename(name: string): string {
  const lower = name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-')
  return lower.length > 80 ? lower.slice(-80) : lower
}

async function assertCanManage() {
  const { ctx, repos, supabase } = await loadServerReposContext()
  if (ctx.role && !['owner', 'admin'].includes(ctx.role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
  return { ctx, repos, supabase }
}

export interface UploadResult {
  ok: boolean
  error?: string
  url?: string
}

/**
 * Server Action de upload · retorna { ok, error } em vez de throw silencioso
 * (audit 2026-04-30 · drawer fechava antes do user ver erro). Cliente usa
 * useFormState/useTransition pra renderizar erro inline.
 */
export async function uploadMediaAction(
  _prev: UploadResult | null,
  formData: FormData,
): Promise<UploadResult> {
  try {
    const { ctx, repos, supabase } = await assertCanManage()

    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Arquivo obrigatorio' }
    }
    if (file.size > 5 * 1024 * 1024) {
      return { ok: false, error: 'Arquivo maior que 5MB · comprima antes' }
    }

    const categoryRaw = String(formData.get('category') || 'before_after').trim().toLowerCase()
    const category = ALLOWED_CATEGORIES.includes(categoryRaw as AllowedCategory)
      ? (categoryRaw as AllowedCategory)
      : 'before_after'

    const funnelRaw = String(formData.get('funnel') || '')
    const funnel = parseFunnel(funnelRaw)

    // Funil só é obrigatório pra category=before_after (resultados são por funil).
    // Outras categorias (consulta/anovator/biometria/clinica) são institucionais.
    if (category === 'before_after' && !funnel) {
      return { ok: false, error: 'Selecione o funil (olheiras ou fullface) pra antes/depois' }
    }

    const queixasRaw = String(formData.get('queixas') || '')
    const queixas = parseQueixas(queixasRaw)

    const caption = String(formData.get('caption') || '').trim() || null
    const phase = String(formData.get('phase') || '').trim() || null
    const sortOrder = Number(formData.get('sort_order') || 0)

    // Filename: usa nome do upload, sanitizado · prefixa timestamp pra evitar colisao
    const originalName = sanitizeFilename(file.name)
    const ts = Date.now()
    const filename = `${ts}-${originalName}`
    // Path: before-after/{funnel}/ pra resultados · {category}/ pras institucionais
    const storageFolder = category === 'before_after' && funnel
      ? `before-after/${funnel}`
      : category
    const storagePath = `${storageFolder}/${filename}`

    // Sobe pro Storage
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })
    if (uploadError) {
      console.error('[uploadMediaAction] storage upload error:', uploadError)
      return { ok: false, error: `Upload pro storage falhou: ${uploadError.message}` }
    }

    const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath)
    const publicUrl = urlData?.publicUrl
    if (!publicUrl) {
      await supabase.storage.from('media').remove([storagePath])
      return { ok: false, error: 'Storage nao retornou URL publica' }
    }

    const created = await repos.mediaBank.create(ctx.clinic_id, {
      filename,
      url: publicUrl,
      category,
      funnel,
      queixas,
      caption,
      phase,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      isActive: true,
    })

    if (!created) {
      // Insert no banco falhou silenciosamente · rollback storage
      console.error('[uploadMediaAction] mediaBank.create returned null · rollback storage')
      await supabase.storage.from('media').remove([storagePath])
      return {
        ok: false,
        error: 'Insert no banco falhou (RLS ou clinic_id mismatch) · contate suporte',
      }
    }

    revalidatePath('/midia')
    return { ok: true, url: publicUrl }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido'
    console.error('[uploadMediaAction] uncaught error:', e)
    return { ok: false, error: msg }
  }
}

export interface UpdateResult {
  ok: boolean
  error?: string
}

/**
 * Server Action de update · retorna { ok, error } pra useActionState capturar.
 * Bind: updateMediaAction.bind(null, mediaId).
 */
export async function updateMediaAction(
  id: string,
  _prev: UpdateResult | null,
  formData: FormData,
): Promise<UpdateResult> {
  try {
    const { ctx, repos } = await assertCanManage()
    if (!id) return { ok: false, error: 'id obrigatorio' }

    const caption = String(formData.get('caption') || '').trim() || null
    const queixas = parseQueixas(String(formData.get('queixas') || ''))
    const funnel = parseFunnel(String(formData.get('funnel') || ''))
    const phase = String(formData.get('phase') || '').trim() || null
    const sortOrderRaw = formData.get('sort_order')
    const sortOrder = sortOrderRaw === null ? undefined : Number(sortOrderRaw)
    const categoryRaw = String(formData.get('category') || '').trim().toLowerCase()
    const category = ALLOWED_CATEGORIES.includes(categoryRaw as AllowedCategory)
      ? (categoryRaw as AllowedCategory)
      : undefined

    await repos.mediaBank.update(ctx.clinic_id, id, {
      caption,
      queixas,
      funnel,
      phase,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : undefined,
      category,
    })

    revalidatePath('/midia')
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido'
    console.error('[updateMediaAction] error:', e)
    return { ok: false, error: msg }
  }
}

export async function toggleMediaActiveAction(id: string, isActive: boolean) {
  const { ctx, repos } = await assertCanManage()
  if (!id) throw new Error('id obrigatorio')

  await repos.mediaBank.toggleActive(ctx.clinic_id, id, isActive)
  revalidatePath('/midia')
}
