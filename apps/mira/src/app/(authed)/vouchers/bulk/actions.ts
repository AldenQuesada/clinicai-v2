'use server'

/**
 * Server Actions · /vouchers/bulk · admin emit lote (Mirian/Alden).
 *
 * Fluxo:
 *   1. validateBulkAction(formData) → preview { eligible[], blocked[] }
 *      sem enfileirar ainda · ?preview=1 carrega lista no Server Component.
 *   2. enqueueBulkAction(formData) → enfileira na queue + redirect pra /bulk/[batchId].
 *   3. cancelBatchAction(formData) → cancela items pending do batch.
 *
 * Restrito a owner/admin (mesmo padrao /partnerships).
 * Multi-tenant ADR-028 · clinic_id resolvido em loadMiraServerContext.
 *
 * Preview e armazenado em cookie temporario "mira_bulk_preview" (10min)
 * pra Server Component renderizar sem state cliente.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import type { DedupHit } from '@clinicai/repositories'
import { loadMiraServerContext } from '@/lib/server-context'
import { parseBulkList } from '@/lib/webhook/bulk-list-parser'

const PREVIEW_COOKIE = 'mira_bulk_preview'
const PREVIEW_TTL_SEC = 10 * 60

function assertCanManage(role: string | null | undefined) {
  if (role && !['owner', 'admin'].includes(role)) {
    throw new Error('Permissao insuficiente · apenas owner/admin')
  }
}

export interface BulkPreviewItem {
  name: string
  phone: string
  status: 'eligible' | 'blocked'
  /** Motivo do bloqueio · presente quando status='blocked' */
  blockReason?: string
  /** Detalhe do dedup hit · presente quando blocked por dedup */
  dedupKind?: DedupHit['kind']
  dedupSince?: string
  dedupName?: string | null
  dedupPartnership?: string | null
}

export interface BulkPreviewState {
  partnershipId: string
  partnershipName: string
  combo: string
  scheduledAt: string
  listText: string
  items: BulkPreviewItem[]
  eligibleCount: number
  blockedCount: number
  declaredCount?: number
  scheduleHint?: string
  /** Erro fatal de parse · "lista vazia", "parceria nao encontrada" etc */
  fatalError?: string
}

/**
 * Le preview do cookie · usado pelo Server Component pra renderizar
 * resultado da validacao na mesma page.
 */
export async function readBulkPreview(): Promise<BulkPreviewState | null> {
  const store = await cookies()
  const raw = store.get(PREVIEW_COOKIE)?.value
  if (!raw) return null
  try {
    return JSON.parse(raw) as BulkPreviewState
  } catch {
    return null
  }
}

/**
 * Limpa o cookie de preview · usado depois de enfileirar OU pelo botao
 * "Limpar" na UI.
 */
export async function clearBulkPreviewAction() {
  const store = await cookies()
  store.delete(PREVIEW_COOKIE)
  revalidatePath('/vouchers/bulk')
}

/**
 * Server Action · valida lista bulk · NAO enfileira.
 *
 * Roda parseBulkList + LeadRepository.findInAnySystem em paralelo pra
 * cada item · classifica em eligible/blocked. Persiste preview em cookie
 * temp (10min TTL) pra Server Component renderizar.
 */
export async function validateBulkAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const partnershipId = String(formData.get('partnership_id') || '').trim()
  const combo = String(formData.get('combo') || '').trim()
  const listText = String(formData.get('list_text') || '')
  const scheduledAtRaw = String(formData.get('scheduled_at') || '').trim()

  // Converte datetime-local pra ISO · sem TZ assume local browser/server
  let scheduledAt = ''
  if (scheduledAtRaw) {
    try {
      const d = new Date(scheduledAtRaw)
      if (!isNaN(d.getTime())) scheduledAt = d.toISOString()
    } catch {
      // ignore · sera default = agora no enqueue
    }
  }
  if (!scheduledAt) scheduledAt = new Date().toISOString()

  if (!partnershipId) {
    await persistPreview({
      partnershipId: '',
      partnershipName: '',
      combo,
      scheduledAt,
      listText,
      items: [],
      eligibleCount: 0,
      blockedCount: 0,
      fatalError: 'Selecione uma parceria',
    })
    revalidatePath('/vouchers/bulk')
    return
  }

  const partnership = await repos.b2bPartnerships.getById(partnershipId)
  if (!partnership || partnership.clinicId !== ctx.clinic_id) {
    await persistPreview({
      partnershipId,
      partnershipName: '',
      combo,
      scheduledAt,
      listText,
      items: [],
      eligibleCount: 0,
      blockedCount: 0,
      fatalError: 'Parceria nao encontrada nesta clinica',
    })
    revalidatePath('/vouchers/bulk')
    return
  }

  const parsed = parseBulkList(listText)
  if (parsed.items.length === 0) {
    await persistPreview({
      partnershipId,
      partnershipName: partnership.name,
      combo: combo || partnership.voucherCombo || '',
      scheduledAt,
      listText,
      items: [],
      eligibleCount: 0,
      blockedCount: 0,
      declaredCount: parsed.declaredCount,
      scheduleHint: parsed.scheduleHint,
      fatalError: 'Nenhum item valido na lista · cole 1 por linha (Nome telefone)',
    })
    revalidatePath('/vouchers/bulk')
    return
  }

  // Dedup paralelo · 1 query por item · cap em 100 items pra nao explodir conexoes
  const cappedItems = parsed.items.slice(0, 100)
  const dedupResults = await Promise.all(
    cappedItems.map((it) =>
      repos.leads.findInAnySystem(ctx.clinic_id, it.phone, it.name).catch(() => null),
    ),
  )

  const items: BulkPreviewItem[] = cappedItems.map((it, idx) => {
    const hit = dedupResults[idx]
    if (!hit) {
      return { name: it.name, phone: it.phone, status: 'eligible' }
    }
    return {
      name: it.name,
      phone: it.phone,
      status: 'blocked',
      blockReason: dedupReason(hit.kind),
      dedupKind: hit.kind,
      dedupSince: hit.since,
      dedupName: hit.name,
      dedupPartnership: hit.partnershipName ?? null,
    }
  })

  const eligibleCount = items.filter((i) => i.status === 'eligible').length
  const blockedCount = items.length - eligibleCount

  await persistPreview({
    partnershipId,
    partnershipName: partnership.name,
    combo: combo || partnership.voucherCombo || '',
    scheduledAt,
    listText,
    items,
    eligibleCount,
    blockedCount,
    declaredCount: parsed.declaredCount,
    scheduleHint: parsed.scheduleHint,
  })
  revalidatePath('/vouchers/bulk')
}

/**
 * Server Action · confirma + enfileira eligible items na queue.
 * Le preview do cookie · enqueue via repository · redirect pra batch page.
 */
export async function enqueueBulkAction() {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const preview = await readBulkPreview()
  if (!preview) {
    throw new Error('Preview expirado · valide a lista novamente')
  }
  if (!preview.partnershipId) {
    throw new Error('Parceria nao selecionada')
  }
  const eligible = preview.items.filter((i) => i.status === 'eligible')
  if (eligible.length === 0) {
    throw new Error('Nenhum item elegivel pra enfileirar')
  }

  const submittedBy = `admin_user:${ctx.user_id || 'unknown'}`
  const result = await repos.voucherQueue.enqueue({
    partnershipId: preview.partnershipId,
    items: eligible.map((i) => ({
      name: i.name,
      phone: i.phone,
      combo: preview.combo || undefined,
    })),
    scheduledAt: preview.scheduledAt,
    submittedBy,
  })

  if (!result.ok || !result.batchId) {
    throw new Error(result.error || 'Erro ao enfileirar · tente novamente')
  }

  // Limpa preview e vai pra batch page
  const store = await cookies()
  store.delete(PREVIEW_COOKIE)
  revalidatePath('/vouchers/bulk')
  redirect(`/vouchers/bulk/${result.batchId}`)
}

/**
 * Server Action · cancela todos items pending do batch.
 * Chamada pelo botao "Cancelar batch" em /vouchers/bulk/[batchId].
 */
export async function cancelBatchAction(formData: FormData) {
  const { ctx, repos } = await loadMiraServerContext()
  assertCanManage(ctx.role)

  const batchId = String(formData.get('batch_id') || '').trim()
  if (!batchId) throw new Error('batch_id obrigatorio')

  // Sanity · busca itens pra confirmar que sao da clinica do user
  const items = await repos.voucherQueue.listByBatch(batchId)
  if (items.length === 0) throw new Error('Batch nao encontrado')
  if (items[0].clinicId !== ctx.clinic_id) {
    throw new Error('Batch de outra clinica · acesso negado')
  }

  const result = await repos.voucherQueue.cancelBatch(batchId)
  if (!result.ok) throw new Error(result.error || 'Erro ao cancelar batch')

  revalidatePath(`/vouchers/bulk/${batchId}`)
  revalidatePath('/vouchers/bulk')
}

// ── Helpers internos ───────────────────────────────────────────────────────

async function persistPreview(state: BulkPreviewState) {
  const store = await cookies()
  store.set(PREVIEW_COOKIE, JSON.stringify(state), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/vouchers/bulk',
    maxAge: PREVIEW_TTL_SEC,
  })
}

function dedupReason(kind: DedupHit['kind']): string {
  switch (kind) {
    case 'patient':
      return 'Ja e paciente'
    case 'lead':
      return 'Ja esta no funil como lead'
    case 'voucher_recipient':
      return 'Ja recebeu voucher antes'
    case 'partner_referral':
      return 'Ja foi indicada via outra parceria'
    default:
      return 'Bloqueada por dedup'
  }
}
