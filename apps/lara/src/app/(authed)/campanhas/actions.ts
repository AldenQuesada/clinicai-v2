'use server'

/**
 * Server Actions · /campanhas (broadcasts manuais).
 *
 * Wrappers em volta de BroadcastRepository · port 1:1 do clinic-dashboard
 * /js/services/broadcast.service.js + handlers de broadcast-events.ui.js.
 *
 * Permission gate via requireAction('notifications:broadcast') (admin/owner).
 * RLS no Postgres e a defesa final · gate aqui = feedback rapido.
 *
 * Audit fix do f17708e: ao salvar status de envio, SEMPRE usar resultado real
 * sendRes.ok ? 'sent' : 'failed' · nunca hardcodar 'sent'. Aqui isso fica nas
 * proprias RPCs (wa_broadcast_start enfileira · worker n8n marca o resultado
 * real linha-a-linha no wa_outbox).
 */

import { revalidatePath } from 'next/cache'
import { loadServerReposContext } from '@/lib/repos'
import { requireAction } from '@/lib/permissions'
import type {
  BroadcastUpsertInput,
  BroadcastTargetFilter,
} from '@clinicai/repositories'
import { hasAnyTarget, WHATSAPP_MAX_LENGTH } from './lib/filters'

const ROUTE = '/campanhas'

interface ActionResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

interface UpsertActionResult extends ActionResult<{ id: string; total_targets: number }> {}

// ── Validacao compartilhada ────────────────────────────────────────

function validateInput(input: BroadcastUpsertInput): string | null {
  const name = (input.name ?? '').trim()
  const content = (input.content ?? '').trim()
  if (!name) return 'Nome obrigatorio'
  if (!content) return 'Mensagem obrigatoria'
  if (content.length > WHATSAPP_MAX_LENGTH) {
    return `Mensagem passa do limite do WhatsApp (${WHATSAPP_MAX_LENGTH} caracteres). Atual: ${content.length}`
  }
  // Tag [queixa] precisa de queixa filtrada (espelha broadcast-events.ui.js linha 583)
  const filter = (input.target_filter ?? {}) as BroadcastTargetFilter
  const hasQueixaTag = /\[queixa\]/i.test(content) || /\{queixa\}/i.test(content)
  if (hasQueixaTag && !filter.queixa) {
    return 'Tag [queixa] precisa de exatamente 1 queixa filtrada na origem.'
  }
  const filterClean: BroadcastTargetFilter = { ...filter }
  Object.keys(filterClean).forEach((k) => {
    const v = (filterClean as Record<string, unknown>)[k]
    if (v == null || v === '') delete (filterClean as Record<string, unknown>)[k]
  })
  if (!hasAnyTarget(filterClean, input.selected_lead_ids ?? [])) {
    return 'Selecione pelo menos um filtro ou um lead manualmente'
  }
  return null
}

function sanitizeInput(input: BroadcastUpsertInput): BroadcastUpsertInput {
  const filter = (input.target_filter ?? {}) as Record<string, unknown>
  Object.keys(filter).forEach((k) => {
    if (filter[k] == null || filter[k] === '') delete filter[k]
  })
  return {
    name: (input.name ?? '').trim(),
    content: (input.content ?? '').trim(),
    media_url: input.media_url?.trim() || null,
    media_caption: input.media_caption?.trim() || null,
    media_position: input.media_position === 'below' ? 'below' : 'above',
    target_filter: filter as BroadcastTargetFilter,
    scheduled_at: input.scheduled_at || null,
    batch_size: input.batch_size ?? 10,
    batch_interval_min: input.batch_interval_min ?? 10,
    selected_lead_ids:
      input.selected_lead_ids && input.selected_lead_ids.length > 0
        ? input.selected_lead_ids
        : null,
  }
}

// ── Actions ────────────────────────────────────────────────────────

export async function createBroadcastAction(
  input: BroadcastUpsertInput,
): Promise<UpsertActionResult> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'notifications:broadcast')

  const sanitized = sanitizeInput(input)
  const validationErr = validateInput(sanitized)
  if (validationErr) return { ok: false, error: validationErr }

  const result = await repos.broadcasts.create(sanitized)
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error || 'Falha ao criar disparo' }
  }

  revalidatePath(ROUTE)
  return { ok: true, data: result.data }
}

export async function updateBroadcastAction(
  id: string,
  input: BroadcastUpsertInput,
): Promise<ActionResult> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'notifications:broadcast')

  if (!id) return { ok: false, error: 'id obrigatorio' }
  const sanitized = sanitizeInput(input)
  const validationErr = validateInput(sanitized)
  if (validationErr) return { ok: false, error: validationErr }

  const result = await repos.broadcasts.update(id, sanitized)
  if (!result.ok) {
    return { ok: false, error: result.error || 'Falha ao atualizar disparo' }
  }

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${id}`)
  return { ok: true }
}

export async function rescheduleBroadcastAction(
  id: string,
  input: BroadcastUpsertInput,
): Promise<ActionResult> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'notifications:broadcast')

  if (!id) return { ok: false, error: 'id obrigatorio' }
  const sanitized = sanitizeInput(input)
  const result = await repos.broadcasts.reschedule(id, sanitized)
  if (!result.ok) return { ok: false, error: result.error || 'Falha ao re-agendar' }

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${id}`)
  return { ok: true }
}

export async function startBroadcastAction(
  id: string,
): Promise<
  ActionResult<{ enqueued: number; estimated_minutes: number; scheduled_for?: string | null }>
> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'notifications:broadcast')

  if (!id) return { ok: false, error: 'id obrigatorio' }
  const result = await repos.broadcasts.start(id)
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error || 'Falha ao iniciar disparo' }
  }

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${id}`)
  return { ok: true, data: result.data }
}

export async function cancelBroadcastAction(
  id: string,
): Promise<ActionResult<{ removed_from_outbox: number }>> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'notifications:broadcast')

  if (!id) return { ok: false, error: 'id obrigatorio' }
  const result = await repos.broadcasts.cancel(id)
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error || 'Falha ao cancelar disparo' }
  }

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${id}`)
  return { ok: true, data: result.data }
}

export async function deleteBroadcastAction(id: string): Promise<ActionResult> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'notifications:broadcast')

  if (!id) return { ok: false, error: 'id obrigatorio' }
  const result = await repos.broadcasts.remove(id)
  if (!result.ok) return { ok: false, error: result.error || 'Falha ao remover disparo' }

  revalidatePath(ROUTE)
  return { ok: true }
}

/**
 * Cria + inicia em sequencia (botao "Enviar agora").
 *
 * NAO usar pra agendamento futuro · use createBroadcastAction (status=draft).
 */
export async function createAndStartBroadcastAction(
  input: BroadcastUpsertInput,
): Promise<
  ActionResult<{
    id: string
    total_targets: number
    enqueued: number
    estimated_minutes: number
    scheduled_for?: string | null
  }>
> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'notifications:broadcast')

  const sanitized = sanitizeInput(input)
  const validationErr = validateInput(sanitized)
  if (validationErr) return { ok: false, error: validationErr }

  const created = await repos.broadcasts.create(sanitized)
  if (!created.ok || !created.data) {
    return { ok: false, error: created.error || 'Falha ao criar disparo' }
  }

  const started = await repos.broadcasts.start(created.data.id)
  if (!started.ok || !started.data) {
    // Audit fix f17708e · nao deletar nem reportar como ok se start falhou
    return {
      ok: false,
      error:
        (started.error || 'Falha ao iniciar disparo') +
        ` · disparo criado (id ${created.data.id}) mas nao enfileirado · use a tela de detalhes pra iniciar manualmente`,
    }
  }

  revalidatePath(ROUTE)
  revalidatePath(`${ROUTE}/${created.data.id}`)
  return {
    ok: true,
    data: {
      id: created.data.id,
      total_targets: created.data.total_targets,
      enqueued: started.data.enqueued,
      estimated_minutes: started.data.estimated_minutes,
      scheduled_for: started.data.scheduled_for,
    },
  }
}

/**
 * Carrega leads de um segmento (pra detalhes).
 * Action porque RLS exige auth + clinic_id e nao queremos expor a query no client.
 */
export async function loadBroadcastLeadsAction(
  id: string,
  segment: string,
): Promise<ActionResult<Array<{ id: string; name: string | null; phone: string | null }>>> {
  const { ctx, repos } = await loadServerReposContext()
  requireAction(ctx.role, 'notifications:broadcast')

  if (!id) return { ok: false, error: 'id obrigatorio' }
  const allowed = ['all', 'sent', 'failed', 'delivered', 'read', 'responded', 'no_response']
  const seg = (allowed.includes(segment) ? segment : 'all') as
    | 'all'
    | 'sent'
    | 'failed'
    | 'delivered'
    | 'read'
    | 'responded'
    | 'no_response'

  const result = await repos.broadcasts.leads(id, seg)
  if (!result.ok) {
    return { ok: false, error: result.error || 'Falha ao carregar leads' }
  }
  return {
    ok: true,
    data: (result.data ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
    })),
  }
}

/** Upload de imagem direto pro bucket `media` · espelho do bcMediaUploadBtn. */
export async function uploadBroadcastMediaAction(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  const { ctx, supabase } = await loadServerReposContext()
  requireAction(ctx.role, 'notifications:broadcast')

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Arquivo obrigatorio' }
  }
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: 'Selecione um arquivo de imagem' }
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: 'Arquivo maior que 5MB · comprima antes' }
  }

  const ts = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `broadcasts/${ts}-${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(path, arrayBuffer, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    })
  if (uploadError) {
    return { ok: false, error: `Upload falhou: ${uploadError.message}` }
  }

  const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)
  if (!urlData?.publicUrl) {
    await supabase.storage.from('media').remove([path])
    return { ok: false, error: 'Storage nao retornou URL publica' }
  }

  return { ok: true, data: { url: urlData.publicUrl } }
}
