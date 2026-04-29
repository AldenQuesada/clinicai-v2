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

export async function uploadMediaAction(formData: FormData) {
  const { ctx, repos, supabase } = await assertCanManage()

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    throw new Error('Arquivo obrigatorio')
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Arquivo maior que 5MB · comprima antes')
  }

  const funnelRaw = String(formData.get('funnel') || '')
  const funnel = parseFunnel(funnelRaw)
  if (!funnel) throw new Error('Funnel obrigatorio (olheiras ou fullface)')

  const queixasRaw = String(formData.get('queixas') || '')
  const queixas = parseQueixas(queixasRaw)

  const caption = String(formData.get('caption') || '').trim() || null
  const phase = String(formData.get('phase') || '').trim() || null
  const sortOrder = Number(formData.get('sort_order') || 0)

  // Filename: usa nome do upload, sanitizado · prefixa timestamp pra evitar colisao
  const originalName = sanitizeFilename(file.name)
  const ts = Date.now()
  const filename = `${ts}-${originalName}`
  const storagePath = `before-after/${funnel}/${filename}`

  // Sobe pro Storage
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
  if (uploadError) {
    throw new Error(`Upload falhou: ${uploadError.message}`)
  }

  const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath)
  const publicUrl = urlData?.publicUrl
  if (!publicUrl) {
    // rollback
    await supabase.storage.from('media').remove([storagePath])
    throw new Error('Storage nao retornou URL publica')
  }

  await repos.mediaBank.create(ctx.clinic_id, {
    filename,
    url: publicUrl,
    funnel,
    queixas,
    caption,
    phase,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    isActive: true,
  })

  revalidatePath('/midia')
}

export async function updateMediaAction(id: string, formData: FormData) {
  const { ctx, repos } = await assertCanManage()
  if (!id) throw new Error('id obrigatorio')

  const caption = String(formData.get('caption') || '').trim() || null
  const queixas = parseQueixas(String(formData.get('queixas') || ''))
  const funnel = parseFunnel(String(formData.get('funnel') || ''))
  const phase = String(formData.get('phase') || '').trim() || null
  const sortOrderRaw = formData.get('sort_order')
  const sortOrder = sortOrderRaw === null ? undefined : Number(sortOrderRaw)

  await repos.mediaBank.update(ctx.clinic_id, id, {
    caption,
    queixas,
    funnel,
    phase,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : undefined,
  })

  revalidatePath('/midia')
}

export async function toggleMediaActiveAction(id: string, isActive: boolean) {
  const { ctx, repos } = await assertCanManage()
  if (!id) throw new Error('id obrigatorio')

  await repos.mediaBank.toggleActive(ctx.clinic_id, id, isActive)
  revalidatePath('/midia')
}
