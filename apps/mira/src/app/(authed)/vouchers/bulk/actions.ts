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
  /** 'now' = dispatch imediato (worker no proximo tick) · 'schedule' = futuro */
  dispatchWhen: 'now' | 'schedule'
  /**
   * True se o user pediu schedule mas a hora era passado/<5min · server
   * floored em now+5min. UI mostra warning "ajustamos pra X".
   */
  scheduleWasFloored?: boolean
  listText: string
  items: BulkPreviewItem[]
  eligibleCount: number
  blockedCount: number
  declaredCount?: number
  scheduleHint?: string
  /** Erro fatal de parse · "lista vazia", "parceria nao encontrada" etc */
  fatalError?: string
  /**
   * Aviso não-fatal exibido no preview · ex: cap de 100 atingido, lista truncada.
   * Não bloqueia confirmação · UI renderiza acima do preview.
   */
  warning?: string
  /** Total de items parseados antes do cap (pra mostrar X/100 no warning) */
  parsedCountBeforeCap?: number
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
  const dispatchWhenRaw = String(formData.get('dispatch_when') || 'now').trim()
  const scheduledAtRaw = String(formData.get('scheduled_at') || '').trim()

  // dispatch_when = 'now' | 'schedule' (radio) · default 'now' por seguranca
  const dispatchWhen: 'now' | 'schedule' =
    dispatchWhenRaw === 'schedule' ? 'schedule' : 'now'

  // Resolve scheduled_at:
  //   - 'now'      → ISO de agora · worker pega no proximo tick (1min)
  //   - 'schedule' → parse datetime-local · floor em now+5min se passado/proximo
  //
  // Timezone: input datetime-local nao tem TZ · new Date() interpreta como
  // hora LOCAL do servidor. Em prod, container Easypanel roda em UTC, mas
  // browser BR envia "2026-04-26T15:30" pensando BRT. Pra evitar drift de 3h
  // pra frente, reinterpretamos a string como BRT (UTC-3) na conversao.
  let scheduledAt = ''
  let scheduleWasFloored = false
  if (dispatchWhen === 'schedule' && scheduledAtRaw) {
    const isoFromBR = brtInputToIso(scheduledAtRaw)
    if (isoFromBR) {
      const t = new Date(isoFromBR).getTime()
      const minMs = Date.now() + 5 * 60_000
      if (t < minMs) {
        // User digitou no passado ou nos proximos 5min · floor em min seguro
        scheduledAt = new Date(minMs).toISOString()
        scheduleWasFloored = true
      } else {
        scheduledAt = isoFromBR
      }
    }
  }
  if (!scheduledAt) {
    // 'now' OU schedule invalido · enfileira pra dispatch imediato
    scheduledAt = new Date().toISOString()
  }

  if (!partnershipId) {
    await persistPreview({
      partnershipId: '',
      partnershipName: '',
      combo,
      scheduledAt,
      dispatchWhen,
      scheduleWasFloored,
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
      dispatchWhen,
      scheduleWasFloored,
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
      dispatchWhen,
      scheduleWasFloored,
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

  // Dedup paralelo · 1 query por item · cap em 100 items pra nao explodir conexoes.
  // Se a lista colada excede o cap, reportamos warning visivel no preview pra
  // operador saber que items 101+ foram descartados (audit 2026-05-05 · antes
  // o slice era silencioso · risco de perder beneficiarias sem aviso).
  const BULK_CAP = 100
  const totalParsed = parsed.items.length
  const cappedItems = parsed.items.slice(0, BULK_CAP)
  const capWarning =
    totalParsed > BULK_CAP
      ? `Foram encontrados ${totalParsed} contatos, mas o limite por lote é ${BULK_CAP}. ` +
        `Apenas os ${BULK_CAP} primeiros serão processados · cole os demais em um novo lote depois.`
      : undefined
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
    dispatchWhen,
    scheduleWasFloored,
    listText,
    items,
    eligibleCount,
    blockedCount,
    declaredCount: parsed.declaredCount,
    scheduleHint: parsed.scheduleHint,
    warning: capWarning,
    parsedCountBeforeCap: totalParsed,
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

/**
 * Converte string datetime-local "YYYY-MM-DDTHH:mm" assumindo fuso BRT
 * (America/Sao_Paulo · UTC-3, sem DST atualmente) pra ISO UTC.
 *
 * Por que: input datetime-local HTML5 nao envia TZ · new Date(s) interpreta
 * como hora LOCAL do server. Em prod, Easypanel container roda UTC mas
 * admin BR digita pensando BRT. Sem essa conversao, "26/04 15:30 BRT" virava
 * "26/04 15:30 UTC" = "26/04 12:30 BRT" · dispatch 3h antes do esperado.
 *
 * Se UTC-3 mudar (DST volta, mudanca de fuso), trocar por Intl.DateTimeFormat
 * com timeZone='America/Sao_Paulo'. Por agora, BR esta fixo em UTC-3.
 */
function brtInputToIso(input: string): string | null {
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  // Constroi em UTC adicionando +3h ao instante BRT
  const utc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h) + 3,
    Number(mi),
    Number(s ?? '0'),
  )
  if (isNaN(utc)) return null
  return new Date(utc).toISOString()
}

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
